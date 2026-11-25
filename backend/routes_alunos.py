# =============================================================================
# backend/routes_alunos.py
# -----------------------------------------------------------------------------
# O QUE É: as rotas do CRUD de ALUNOS (Criar, Ler, Atualizar, Excluir).
# PARA QUE SERVE:
#   GET    /api/alunos          -> lista alunos (filtro opcional ?turma=ID)
#   GET    /api/alunos/<id>     -> detalhes de um aluno (com a faixa de aulas)
#   POST   /api/alunos          -> cria aluno           (só coordenação)
#   PUT    /api/alunos/<id>     -> edita aluno          (só coordenação)
#   DELETE /api/alunos/<id>     -> exclui aluno         (só coordenação)
# CONVERSA COM: backend/database.py, backend/auth.py, routes_dashboard.py
#               (cálculos de frequência) e public/js/pages/alunos.js.
# =============================================================================

from flask import Blueprint, g, jsonify, request

from backend import database
from backend.auth import login_required, perfil_requerido
from backend.routes_dashboard import aluno_com_frequencia, alunos_visiveis, aulas_do_aluno
from backend.routes_auth import REGEX_EMAIL

bp_alunos = Blueprint("alunos", __name__, url_prefix="/api/alunos")


def validar_aluno(corpo, id_atual=None):
    """Confere os campos do aluno. Devolve (dados_limpos, erro).

    id_atual é o ID do aluno que está sendo editado (para não acusar a
    matrícula dele mesmo como "duplicada").
    """
    nome = (corpo.get("nome") or "").strip()
    matricula = (corpo.get("matricula") or "").strip()
    email = (corpo.get("email") or "").strip().lower()
    turma_id = corpo.get("turma_id")

    if not nome or not matricula:
        return None, "Nome e matrícula são obrigatórios."
    if email and not REGEX_EMAIL.match(email):
        return None, "Digite um e-mail válido (ou deixe em branco)."

    if turma_id in ("", None):
        turma_id = None
    else:
        try:
            turma_id = int(turma_id)
        except (TypeError, ValueError):
            return None, "Turma inválida."
        if not database.buscar_por_id("turmas", turma_id):
            return None, "A turma escolhida não existe."

    for outro in database.buscar("alunos", matricula=matricula):
        if outro["id"] != id_atual:
            return None, "Já existe um aluno com esta matrícula."

    return {"nome": nome, "matricula": matricula, "email": email, "turma_id": turma_id}, None


@bp_alunos.get("")
@login_required
def listar():
    """Lista os alunos que o usuário pode ver, já com a frequência calculada."""
    dados = database.ler()
    alunos = alunos_visiveis(dados, g.usuario)

    filtro_turma = request.args.get("turma")
    if filtro_turma:
        alunos = [a for a in alunos if str(a.get("turma_id")) == filtro_turma]

    resultado = [aluno_com_frequencia(dados, a) for a in alunos]
    resultado.sort(key=lambda a: a["nome"].lower())
    return jsonify(resultado)


@bp_alunos.get("/<int:id_aluno>")
@login_required
def detalhar(id_aluno):
    """Mostra um aluno com o resumo de frequência e a lista de aulas."""
    dados = database.ler()
    permitidos = {a["id"] for a in alunos_visiveis(dados, g.usuario)}
    if g.usuario["perfil"] == "aluno":
        permitidos = {g.usuario.get("aluno_id")}
    aluno = next((a for a in dados["alunos"] if a["id"] == id_aluno), None)
    if not aluno or id_aluno not in permitidos:
        return jsonify({"erro": "Aluno não encontrado."}), 404

    resultado = aluno_com_frequencia(dados, aluno)
    resultado["aulas"] = aulas_do_aluno(dados, id_aluno)
    return jsonify(resultado)


@bp_alunos.post("")
@login_required
@perfil_requerido("coordenacao")
def criar():
    """Cadastra um novo aluno."""
    dados_limpos, erro = validar_aluno(request.get_json(silent=True) or {})
    if erro:
        return jsonify({"erro": erro}), 400
    aluno = database.inserir("alunos", dados_limpos)

    # Se já existe uma conta de aluno com este e-mail, ligamos as duas.
    if aluno["email"]:
        conta = database.buscar_um("usuarios", email=aluno["email"], perfil="aluno")
        if conta and not conta.get("aluno_id"):
            database.atualizar("usuarios", conta["id"], {"aluno_id": aluno["id"]})
    return jsonify(aluno), 201


@bp_alunos.put("/<int:id_aluno>")
@login_required
@perfil_requerido("coordenacao")
def editar(id_aluno):
    """Altera os dados de um aluno existente."""
    if not database.buscar_por_id("alunos", id_aluno):
        return jsonify({"erro": "Aluno não encontrado."}), 404
    dados_limpos, erro = validar_aluno(request.get_json(silent=True) or {}, id_atual=id_aluno)
    if erro:
        return jsonify({"erro": erro}), 400
    return jsonify(database.atualizar("alunos", id_aluno, dados_limpos))


@bp_alunos.delete("/<int:id_aluno>")
@login_required
@perfil_requerido("coordenacao")
def excluir(id_aluno):
    """Exclui o aluno e tudo que depende dele (exclusão em cascata)."""
    if not database.buscar_por_id("alunos", id_aluno):
        return jsonify({"erro": "Aluno não encontrado."}), 404

    # 1. Justificativas do aluno.
    database.excluir_onde("justificativas", aluno_id=id_aluno)
    # 2. Registros do aluno dentro das chamadas.
    for chamada in database.buscar("chamadas"):
        registros = [r for r in chamada["registros"] if r["aluno_id"] != id_aluno]
        if len(registros) != len(chamada["registros"]):
            database.atualizar("chamadas", chamada["id"], {"registros": registros})
    # 3. Conta de usuário ligada a ele perde o vínculo.
    for conta in database.buscar("usuarios", aluno_id=id_aluno):
        database.atualizar("usuarios", conta["id"], {"aluno_id": None})
    # 4. Por fim, o próprio aluno.
    database.excluir("alunos", id_aluno)
    return jsonify({"mensagem": "Aluno excluído."})
