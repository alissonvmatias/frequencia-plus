# =============================================================================
# backend/routes_dashboard.py
# -----------------------------------------------------------------------------
# O QUE É: a rota do PAINEL (GET /api/dashboard) e as FUNÇÕES DE CÁLCULO de
#          frequência usadas pelo sistema inteiro.
# PARA QUE SERVE:
#   - Calcular percentual de presença, faltas e status (OK/Atenção/Risco).
#   - Montar os dados do painel: 4 métricas, gráfico por turma, alertas e
#     tabela de alunos (coordenação e professor) ou a frequência pessoal (aluno).
# CONVERSA COM: backend/database.py (lê os dados), backend/auth.py (proteção),
#               routes_alunos.py e routes_turmas.py (que reutilizam os cálculos)
#               e, no front, public/js/pages/dashboard.js.
#
# REGRA DE NEGÓCIO:
#   frequência (%) = (presenças + faltas justificadas) / total de aulas * 100
#   - abaixo de 75%  -> "risco"   (vermelho)
#   - de 75% a 84,9% -> "atencao" (âmbar)
#   - 85% ou mais    -> "ok"      (verde)
# =============================================================================

from datetime import date

from flask import Blueprint, g, jsonify

from backend import database
from backend.auth import login_required

bp_dashboard = Blueprint("dashboard", __name__)

LIMITE_RISCO = 75     # abaixo disso o aluno está em risco
LIMITE_ATENCAO = 85   # abaixo disso (e acima do risco) pede atenção


# -----------------------------------------------------------------------------
# FUNÇÕES DE CÁLCULO (reutilizadas por outras rotas)
# -----------------------------------------------------------------------------

def classificar(percentual):
    """Recebe um percentual e devolve "ok", "atencao", "risco" ou "sem_dados"."""
    if percentual is None:
        return "sem_dados"
    if percentual < LIMITE_RISCO:
        return "risco"
    if percentual < LIMITE_ATENCAO:
        return "atencao"
    return "ok"


def pct_texto(percentual):
    """Formata um percentual no padrão brasileiro: 87.5 -> "87,5%"."""
    return f"{str(percentual).replace('.', ',')}%"


def calcular_percentual(presencas, total):
    """Calcula presencas/total em %, com 1 casa decimal. Sem aulas -> None."""
    if total == 0:
        return None
    return round(presencas * 100 / total, 1)


def datas_justificadas(dados, aluno_id):
    """Devolve o conjunto de datas em que o aluno teve justificativa APROVADA."""
    return {
        j["data"] for j in dados["justificativas"]
        if j["aluno_id"] == aluno_id and j["status"] == "aprovada"
    }


def aulas_do_aluno(dados, aluno_id):
    """Lista todas as aulas do aluno, em ordem de data, com o status de cada uma.

    Status possível: "presente", "falta" ou "justificada" (falta com
    justificativa aprovada pela coordenação).
    """
    justificadas = datas_justificadas(dados, aluno_id)
    aulas = []
    for chamada in sorted(dados["chamadas"], key=lambda c: c["data"]):
        for registro in chamada["registros"]:
            if registro["aluno_id"] != aluno_id:
                continue
            status = registro["status"]
            if status == "falta" and chamada["data"] in justificadas:
                status = "justificada"
            aulas.append({"data": chamada["data"], "turma_id": chamada["turma_id"], "status": status})
    return aulas


def resumo_do_aluno(dados, aluno_id):
    """Conta presenças, faltas e justificadas do aluno e calcula o percentual."""
    aulas = aulas_do_aluno(dados, aluno_id)
    presencas = sum(1 for a in aulas if a["status"] == "presente")
    faltas = sum(1 for a in aulas if a["status"] == "falta")
    justificadas = sum(1 for a in aulas if a["status"] == "justificada")
    percentual = calcular_percentual(presencas + justificadas, len(aulas))
    return {
        "total_aulas": len(aulas),
        "presencas": presencas,
        "faltas": faltas,
        "justificadas": justificadas,
        "percentual": percentual,
        "classificacao": classificar(percentual),
    }


def nome_da_turma(dados, turma_id):
    """Devolve o nome de uma turma pelo ID (ou "Sem turma")."""
    for turma in dados["turmas"]:
        if turma["id"] == turma_id:
            return turma["nome"]
    return "Sem turma"


def aluno_com_frequencia(dados, aluno):
    """Junta os dados do aluno com o nome da turma e o resumo de frequência."""
    resultado = dict(aluno)
    resultado["turma_nome"] = nome_da_turma(dados, aluno.get("turma_id"))
    resultado.update(resumo_do_aluno(dados, aluno["id"]))
    return resultado


def turmas_visiveis(dados, usuario):
    """Devolve as turmas que o usuário pode ver.

    - coordenação: todas
    - professor: só as turmas em que ele é o professor responsável
    - aluno: só a turma dele
    """
    if usuario["perfil"] == "coordenacao":
        return list(dados["turmas"])
    if usuario["perfil"] == "professor":
        return [t for t in dados["turmas"] if t.get("professor_id") == usuario["uid"]]
    aluno = next((a for a in dados["alunos"] if a["id"] == usuario.get("aluno_id")), None)
    if not aluno:
        return []
    return [t for t in dados["turmas"] if t["id"] == aluno.get("turma_id")]


def alunos_visiveis(dados, usuario):
    """Devolve os alunos que o usuário pode ver (coordenação vê todos)."""
    if usuario["perfil"] == "coordenacao":
        return list(dados["alunos"])
    ids_turmas = {t["id"] for t in turmas_visiveis(dados, usuario)}
    return [a for a in dados["alunos"] if a.get("turma_id") in ids_turmas]


def frequencia_da_turma(dados, turma_id):
    """Calcula o percentual de presença da turma somando todas as chamadas dela."""
    total = 0
    presencas = 0
    for chamada in dados["chamadas"]:
        if chamada["turma_id"] != turma_id:
            continue
        for registro in chamada["registros"]:
            total += 1
            status = registro["status"]
            justificada = chamada["data"] in datas_justificadas(dados, registro["aluno_id"])
            if status == "presente" or (status == "falta" and justificada):
                presencas += 1
    return calcular_percentual(presencas, total)


# -----------------------------------------------------------------------------
# PEÇAS DO PAINEL DA COORDENAÇÃO / PROFESSOR
# -----------------------------------------------------------------------------

def _faltas_no_mes(dados, ids_turmas):
    """Conta as faltas do mês atual nas turmas informadas.

    Se ainda não houve aula neste mês, usa o mês mais recente que teve aula
    (assim o painel de demonstração nunca fica zerado sem motivo).
    Devolve (quantidade, "MM/AAAA").
    """
    chamadas = [c for c in dados["chamadas"] if c["turma_id"] in ids_turmas]
    mes = date.today().strftime("%Y-%m")
    if chamadas and not any(c["data"].startswith(mes) for c in chamadas):
        mes = max(c["data"] for c in chamadas)[:7]
    faltas = 0
    for chamada in chamadas:
        if chamada["data"].startswith(mes):
            faltas += sum(1 for r in chamada["registros"] if r["status"] == "falta")
    ano, numero_mes = mes.split("-")
    return faltas, f"{numero_mes}/{ano}"


def _montar_alertas(dados, alunos, turmas, usuario):
    """Gera a lista de alertas do painel (risco, atenção, informação, ok)."""
    alertas = []
    for aluno in alunos:
        if aluno["classificacao"] == "risco":
            alertas.append({
                "tipo": "risco",
                "titulo": f"{aluno['nome']} em risco",
                "mensagem": f"Frequência de {pct_texto(aluno['percentual'])} ({aluno['turma_nome']}), abaixo de {LIMITE_RISCO}%.",
            })
    for aluno in alunos:
        if aluno["classificacao"] == "atencao":
            alertas.append({
                "tipo": "atencao",
                "titulo": f"{aluno['nome']} precisa de atenção",
                "mensagem": f"Frequência de {pct_texto(aluno['percentual'])} ({aluno['turma_nome']}).",
            })

    ids_alunos = {a["id"] for a in alunos}
    pendentes = [j for j in dados["justificativas"] if j["status"] == "pendente" and j["aluno_id"] in ids_alunos]
    if pendentes:
        alertas.append({
            "tipo": "info",
            "titulo": "Justificativas pendentes",
            "mensagem": f"Há {len(pendentes)} justificativa(s) aguardando análise da coordenação.",
        })

    hoje = date.today().isoformat()
    if usuario["perfil"] == "professor" and date.today().weekday() < 5:
        for turma in turmas:
            ja_fez = any(c["turma_id"] == turma["id"] and c["data"] == hoje for c in dados["chamadas"])
            if not ja_fez:
                alertas.append({
                    "tipo": "info",
                    "titulo": f"Chamada de hoje: {turma['nome']}",
                    "mensagem": "A chamada de hoje ainda não foi registrada.",
                })

    if not any(a["tipo"] == "risco" for a in alertas):
        alertas.append({
            "tipo": "ok",
            "titulo": "Nenhum aluno em risco",
            "mensagem": f"Todos os alunos estão com frequência igual ou acima de {LIMITE_RISCO}%.",
        })
    return alertas


def _painel_geral(dados, usuario):
    """Monta o painel da coordenação ou do professor."""
    turmas = turmas_visiveis(dados, usuario)
    ids_turmas = {t["id"] for t in turmas}
    alunos = [aluno_com_frequencia(dados, a) for a in alunos_visiveis(dados, usuario)]

    com_dados = [a["percentual"] for a in alunos if a["percentual"] is not None]
    media = round(sum(com_dados) / len(com_dados), 1) if com_dados else None
    faltas, mes = _faltas_no_mes(dados, ids_turmas)
    em_risco = sum(1 for a in alunos if a["classificacao"] == "risco")

    grafico = []
    for turma in sorted(turmas, key=lambda t: t["nome"]):
        percentual = frequencia_da_turma(dados, turma["id"])
        grafico.append({
            "turma_id": turma["id"],
            "turma": turma["nome"],
            "percentual": percentual,
            "classificacao": classificar(percentual),
        })

    # Alunos com menor frequência aparecem primeiro na tabela.
    alunos.sort(key=lambda a: (a["percentual"] is None, a["percentual"] or 0))

    return {
        "perfil": usuario["perfil"],
        "metricas": {
            "total_alunos": len(alunos),
            "frequencia_media": media,
            "faltas_mes": faltas,
            "mes_referencia": mes,
            "alunos_risco": em_risco,
        },
        "grafico": grafico,
        "alertas": _montar_alertas(dados, alunos, turmas, usuario),
        "alunos": alunos,
        "limite_risco": LIMITE_RISCO,
    }


def _painel_aluno(dados, usuario):
    """Monta o painel pessoal do aluno: resumo, faixa de aulas e alertas."""
    aluno = next((a for a in dados["alunos"] if a["id"] == usuario.get("aluno_id")), None)
    if not aluno:
        return {
            "perfil": "aluno",
            "aluno": None,
            "aulas": [],
            "alertas": [{
                "tipo": "info",
                "titulo": "Matrícula não vinculada",
                "mensagem": "Sua conta ainda não está ligada a um aluno. Peça à coordenação para cadastrar você com o mesmo e-mail.",
            }],
        }

    info = aluno_com_frequencia(dados, aluno)
    alertas = []
    if info["classificacao"] == "risco":
        alertas.append({"tipo": "risco", "titulo": "Frequência em risco",
                        "mensagem": f"Sua frequência é {pct_texto(info['percentual'])}. O mínimo exigido é {LIMITE_RISCO}%."})
    elif info["classificacao"] == "atencao":
        alertas.append({"tipo": "atencao", "titulo": "Atenção à frequência",
                        "mensagem": f"Sua frequência é {pct_texto(info['percentual'])}. Evite novas faltas."})
    pendentes = [j for j in dados["justificativas"] if j["aluno_id"] == aluno["id"] and j["status"] == "pendente"]
    if pendentes:
        alertas.append({"tipo": "info", "titulo": "Justificativas em análise",
                        "mensagem": f"Você tem {len(pendentes)} justificativa(s) aguardando a coordenação."})
    if info["faltas"] > 0:
        alertas.append({"tipo": "info", "titulo": "Faltas sem justificativa",
                        "mensagem": f"Você tem {info['faltas']} falta(s) que ainda podem ser justificadas."})
    if not alertas:
        alertas.append({"tipo": "ok", "titulo": "Tudo certo!", "mensagem": "Sua frequência está ótima. Continue assim."})

    return {"perfil": "aluno", "aluno": info, "aulas": aulas_do_aluno(dados, aluno["id"]),
            "alertas": alertas, "limite_risco": LIMITE_RISCO}


# -----------------------------------------------------------------------------
# ROTA
# -----------------------------------------------------------------------------

@bp_dashboard.get("/api/dashboard")
@login_required
def painel():
    """GET /api/dashboard -> devolve os dados do painel conforme o perfil."""
    dados = database.ler()  # lemos o banco UMA vez e reutilizamos nos cálculos
    if g.usuario["perfil"] == "aluno":
        return jsonify(_painel_aluno(dados, g.usuario))
    return jsonify(_painel_geral(dados, g.usuario))
