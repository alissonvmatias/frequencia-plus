# =============================================================================
# backend/routes_chamada.py
# -----------------------------------------------------------------------------
# O QUE É: as rotas da CHAMADA (lista de presença) e das JUSTIFICATIVAS.
# PARA QUE SERVE:
#   GET  /api/chamadas?turma=ID&data=AAAA-MM-DD -> alunos da turma com o status
#                                                  já marcado naquele dia
#   GET  /api/chamadas[?turma=ID]                -> histórico de chamadas
#   POST /api/chamadas                           -> salva (cria ou substitui)
#   GET  /api/justificativas                     -> lista justificativas
#   POST /api/justificativas                     -> aluno envia justificativa
#   PUT  /api/justificativas/<id>                -> coordenação aprova/recusa
# CONVERSA COM: backend/database.py, backend/auth.py, routes_dashboard.py e,
#               no front, public/js/pages/chamada.js e justificativas.js.
# =============================================================================

from datetime import date, datetime

from flask import Blueprint, g, jsonify, request

from backend import database
from backend.auth import login_required, perfil_requerido
from backend.routes_dashboard import alunos_visiveis, nome_da_turma, turmas_visiveis

bp_chamada = Blueprint("chamada", __name__)

STATUS_CHAMADA = ["presente", "falta"]


def converter_data(texto):
    """Converte "AAAA-MM-DD" em data. Devolve None se o formato estiver errado."""
    try:
        return datetime.strptime(texto or "", "%Y-%m-%d").date()
    except ValueError:
        return None


def turma_permitida(dados, turma_id):
    """Devolve a turma se o usuário logado puder vê-la; senão, None."""
    for turma in turmas_visiveis(dados, g.usuario):
        if turma["id"] == turma_id:
            return turma
    return None


# -----------------------------------------------------------------------------
# CHAMADAS
# -----------------------------------------------------------------------------

def _chamada_do_dia(dados, turma, dia):
    """Monta a lista de alunos da turma com o status marcado naquele dia."""
    chamada = next((c for c in dados["chamadas"] if c["turma_id"] == turma["id"] and c["data"] == dia), None)
    marcados = {r["aluno_id"]: r["status"] for r in chamada["registros"]} if chamada else {}
    alunos = sorted([a for a in dados["alunos"] if a.get("turma_id") == turma["id"]], key=lambda a: a["nome"].lower())
    return {
        "turma": {"id": turma["id"], "nome": turma["nome"]},
        "data": dia,
        "existente": chamada is not None,
        "alunos": [
            {"id": a["id"], "nome": a["nome"], "matricula": a["matricula"], "status": marcados.get(a["id"])}
            for a in alunos
        ],
    }


def _historico(dados, turma_id=None):
    """Lista as chamadas já feitas (mais recentes primeiro), com totais."""
    ids_visiveis = {t["id"] for t in turmas_visiveis(dados, g.usuario)}
    historico = []
    for chamada in dados["chamadas"]:
        if chamada["turma_id"] not in ids_visiveis:
            continue
        if turma_id and chamada["turma_id"] != turma_id:
            continue
        presentes = sum(1 for r in chamada["registros"] if r["status"] == "presente")
        historico.append({
            "id": chamada["id"],
            "turma_id": chamada["turma_id"],
            "turma_nome": nome_da_turma(dados, chamada["turma_id"]),
            "data": chamada["data"],
            "presentes": presentes,
            "faltas": len(chamada["registros"]) - presentes,
            "total": len(chamada["registros"]),
        })
    historico.sort(key=lambda c: (c["data"], c["turma_nome"]), reverse=True)
    return historico


@bp_chamada.get("/api/chamadas")
@login_required
@perfil_requerido("professor", "coordenacao")
def listar_chamadas():
    """Com turma E data: devolve a chamada do dia. Sem data: devolve o histórico."""
    dados = database.ler()
    turma_texto = request.args.get("turma")
    dia = request.args.get("data")

    turma_id = None
    if turma_texto:
        try:
            turma_id = int(turma_texto)
        except ValueError:
            return jsonify({"erro": "Turma inválida."}), 400
        if not turma_permitida(dados, turma_id):
            return jsonify({"erro": "Turma não encontrada."}), 404

    if turma_id and dia:
        if not converter_data(dia):
            return jsonify({"erro": "Data inválida. Use o formato AAAA-MM-DD."}), 400
        return jsonify(_chamada_do_dia(dados, turma_permitida(dados, turma_id), dia))

    return jsonify(_historico(dados, turma_id))


@bp_chamada.post("/api/chamadas")
@login_required
@perfil_requerido("professor", "coordenacao")
def salvar_chamada():
    """Salva a chamada de uma turma em um dia.

    Se já existir chamada para a mesma turma e data, ela é SUBSTITUÍDA
    (assim o professor pode corrigir uma chamada).
    Corpo esperado: {"turma_id": 1, "data": "2026-11-25",
                     "registros": [{"aluno_id": 1, "status": "presente"}, ...]}
    """
    corpo = request.get_json(silent=True) or {}
    dados = database.ler()

    turma_id = corpo.get("turma_id")
    turma = turma_permitida(dados, turma_id) if isinstance(turma_id, int) else None
    if not turma:
        return jsonify({"erro": "Escolha uma turma válida."}), 400

    dia = converter_data(corpo.get("data"))
    if not dia:
        return jsonify({"erro": "Data inválida. Use o formato AAAA-MM-DD."}), 400
    if dia > date.today():
        return jsonify({"erro": "Não é possível registrar chamada em uma data futura."}), 400

    ids_da_turma = {a["id"] for a in dados["alunos"] if a.get("turma_id") == turma_id}
    if not ids_da_turma:
        return jsonify({"erro": "Esta turma não tem alunos."}), 400

    registros = []
    for registro in corpo.get("registros") or []:
        if registro.get("aluno_id") not in ids_da_turma:
            return jsonify({"erro": "Há um aluno que não pertence a esta turma."}), 400
        if registro.get("status") not in STATUS_CHAMADA:
            return jsonify({"erro": "Marque Presente ou Falta para todos os alunos."}), 400
        registros.append({"aluno_id": registro["aluno_id"], "status": registro["status"]})

    if {r["aluno_id"] for r in registros} != ids_da_turma:
        return jsonify({"erro": "Marque Presente ou Falta para todos os alunos."}), 400

    novo = {
        "turma_id": turma_id,
        "data": dia.isoformat(),
        "professor_id": g.usuario["uid"],
        "registros": registros,
        "atualizada_em": datetime.now().isoformat(timespec="seconds"),
    }
    existente = database.buscar_um("chamadas", turma_id=turma_id, data=dia.isoformat())
    if existente:
        chamada = database.atualizar("chamadas", existente["id"], novo)
        return jsonify({"mensagem": "Chamada atualizada.", "chamada": chamada})
    chamada = database.inserir("chamadas", novo)
    return jsonify({"mensagem": "Chamada salva.", "chamada": chamada}), 201


# -----------------------------------------------------------------------------
# JUSTIFICATIVAS
# -----------------------------------------------------------------------------

def justificativa_com_nomes(dados, justificativa):
    """Acrescenta o nome do aluno e da turma na justificativa (para exibir)."""
    aluno = next((a for a in dados["alunos"] if a["id"] == justificativa["aluno_id"]), None)
    resultado = dict(justificativa)
    resultado["aluno_nome"] = aluno["nome"] if aluno else "Aluno removido"
    resultado["turma_nome"] = nome_da_turma(dados, aluno.get("turma_id")) if aluno else "-"
    return resultado


@bp_chamada.get("/api/justificativas")
@login_required
def listar_justificativas():
    """Lista justificativas: o aluno vê as dele; professor as de suas turmas; coordenação, todas."""
    dados = database.ler()
    if g.usuario["perfil"] == "aluno":
        ids_permitidos = {g.usuario.get("aluno_id")}
    else:
        ids_permitidos = {a["id"] for a in alunos_visiveis(dados, g.usuario)}

    lista = [justificativa_com_nomes(dados, j) for j in dados["justificativas"] if j["aluno_id"] in ids_permitidos]

    filtro_status = request.args.get("status")
    if filtro_status:
        lista = [j for j in lista if j["status"] == filtro_status]

    lista.sort(key=lambda j: j.get("criada_em") or "", reverse=True)
    return jsonify(lista)


@bp_chamada.post("/api/justificativas")
@login_required
@perfil_requerido("aluno")
def enviar_justificativa():
    """O aluno envia uma justificativa para uma falta em uma data."""
    corpo = request.get_json(silent=True) or {}
    aluno_id = g.usuario.get("aluno_id")
    dia = corpo.get("data") or ""
    motivo = (corpo.get("motivo") or "").strip()

    if not aluno_id:
        return jsonify({"erro": "Sua conta não está vinculada a um aluno."}), 400
    if not converter_data(dia):
        return jsonify({"erro": "Escolha a data da falta."}), 400
    if len(motivo) < 5:
        return jsonify({"erro": "Descreva o motivo (pelo menos 5 caracteres)."}), 400

    # Confere se o aluno realmente faltou nesse dia.
    teve_falta = any(
        c["data"] == dia and any(r["aluno_id"] == aluno_id and r["status"] == "falta" for r in c["registros"])
        for c in database.buscar("chamadas")
    )
    if not teve_falta:
        return jsonify({"erro": "Não há falta registrada para você nesta data."}), 400

    # Não pode haver outra justificativa pendente ou aprovada para o mesmo dia.
    for j in database.buscar("justificativas", aluno_id=aluno_id, data=dia):
        if j["status"] in ("pendente", "aprovada"):
            return jsonify({"erro": "Você já enviou uma justificativa para esta data."}), 409

    nova = database.inserir("justificativas", {
        "aluno_id": aluno_id,
        "data": dia,
        "motivo": motivo,
        "status": "pendente",
        "resposta": "",
        "criada_em": datetime.now().isoformat(timespec="seconds"),
    })
    return jsonify(nova), 201


@bp_chamada.put("/api/justificativas/<int:id_justificativa>")
@login_required
@perfil_requerido("coordenacao")
def analisar_justificativa(id_justificativa):
    """A coordenação aprova ou recusa uma justificativa pendente."""
    corpo = request.get_json(silent=True) or {}
    novo_status = corpo.get("status")
    if novo_status not in ("aprovada", "recusada"):
        return jsonify({"erro": "Status deve ser 'aprovada' ou 'recusada'."}), 400

    justificativa = database.buscar_por_id("justificativas", id_justificativa)
    if not justificativa:
        return jsonify({"erro": "Justificativa não encontrada."}), 404
    if justificativa["status"] != "pendente":
        return jsonify({"erro": "Esta justificativa já foi analisada."}), 409

    atualizada = database.atualizar("justificativas", id_justificativa, {
        "status": novo_status,
        "resposta": (corpo.get("resposta") or "").strip(),
        "analisada_em": datetime.now().isoformat(timespec="seconds"),
    })
    return jsonify(atualizada)
