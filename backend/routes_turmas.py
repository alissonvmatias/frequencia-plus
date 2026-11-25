# =============================================================================
# backend/routes_turmas.py
# -----------------------------------------------------------------------------
# O QUE É: as rotas do CRUD de TURMAS.
# PARA QUE SERVE:
#   GET    /api/turmas              -> lista turmas que o usuário pode ver
#   GET    /api/turmas/professores  -> lista professores (para o formulário)
#   POST   /api/turmas              -> cria turma   (só coordenação)
#   PUT    /api/turmas/<id>         -> edita turma  (só coordenação)
#   DELETE /api/turmas/<id>         -> exclui turma (só coordenação)
# CONVERSA COM: backend/database.py, backend/auth.py, routes_dashboard.py
#               e public/js/pages/turmas.js (e chamada.js, que lista turmas).
# =============================================================================

from flask import Blueprint, g, jsonify, request

from backend import database
from backend.auth import login_required, perfil_requerido
from backend.routes_dashboard import classificar, frequencia_da_turma, turmas_visiveis

bp_turmas = Blueprint("turmas", __name__, url_prefix="/api/turmas")

TURNOS_VALIDOS = ["Manhã", "Tarde", "Noite"]


def turma_com_detalhes(dados, turma):
    """Junta a turma com: nome do professor, quantidade de alunos e frequência."""
    professor = next((u for u in dados["usuarios"] if u["id"] == turma.get("professor_id")), None)
    percentual = frequencia_da_turma(dados, turma["id"])
    resultado = dict(turma)
    resultado["professor_nome"] = professor["nome"] if professor else "Sem professor"
    resultado["total_alunos"] = sum(1 for a in dados["alunos"] if a.get("turma_id") == turma["id"])
    resultado["total_chamadas"] = sum(1 for c in dados["chamadas"] if c["turma_id"] == turma["id"])
    resultado["percentual"] = percentual
    resultado["classificacao"] = classificar(percentual)
    return resultado


def validar_turma(corpo, id_atual=None):
    """Confere os campos da turma. Devolve (dados_limpos, erro)."""
    nome = (corpo.get("nome") or "").strip()
    turno = corpo.get("turno") or ""
    professor_id = corpo.get("professor_id")

    if not nome:
        return None, "O nome da turma é obrigatório."
    if turno not in TURNOS_VALIDOS:
        return None, "Escolha um turno: Manhã, Tarde ou Noite."

    if professor_id in ("", None):
        professor_id = None
    else:
        try:
            professor_id = int(professor_id)
        except (TypeError, ValueError):
            return None, "Professor inválido."
        if not database.buscar_um("usuarios", id=professor_id, perfil="professor"):
            return None, "O professor escolhido não existe."

    for outra in database.buscar("turmas"):
        if outra["nome"].lower() == nome.lower() and outra["id"] != id_atual:
            return None, "Já existe uma turma com este nome."

    return {"nome": nome, "turno": turno, "professor_id": professor_id}, None


@bp_turmas.get("")
@login_required
def listar():
    """Lista as turmas visíveis ao usuário, com detalhes."""
    dados = database.ler()
    turmas = [turma_com_detalhes(dados, t) for t in turmas_visiveis(dados, g.usuario)]
    turmas.sort(key=lambda t: t["nome"])
    return jsonify(turmas)


@bp_turmas.get("/professores")
@login_required
@perfil_requerido("coordenacao")
def listar_professores():
    """Lista os usuários com perfil professor (para escolher na turma)."""
    professores = database.buscar("usuarios", perfil="professor")
    return jsonify([{"id": p["id"], "nome": p["nome"]} for p in professores])


@bp_turmas.post("")
@login_required
@perfil_requerido("coordenacao")
def criar():
    """Cria uma nova turma."""
    dados_limpos, erro = validar_turma(request.get_json(silent=True) or {})
    if erro:
        return jsonify({"erro": erro}), 400
    return jsonify(database.inserir("turmas", dados_limpos)), 201


@bp_turmas.put("/<int:id_turma>")
@login_required
@perfil_requerido("coordenacao")
def editar(id_turma):
    """Altera uma turma existente."""
    if not database.buscar_por_id("turmas", id_turma):
        return jsonify({"erro": "Turma não encontrada."}), 404
    dados_limpos, erro = validar_turma(request.get_json(silent=True) or {}, id_atual=id_turma)
    if erro:
        return jsonify({"erro": erro}), 400
    return jsonify(database.atualizar("turmas", id_turma, dados_limpos))


@bp_turmas.delete("/<int:id_turma>")
@login_required
@perfil_requerido("coordenacao")
def excluir(id_turma):
    """Exclui a turma e as chamadas dela.

    Por segurança, NÃO deixamos excluir uma turma que ainda tem alunos:
    a coordenação precisa mover ou excluir os alunos antes.
    """
    if not database.buscar_por_id("turmas", id_turma):
        return jsonify({"erro": "Turma não encontrada."}), 404
    if database.buscar("alunos", turma_id=id_turma):
        return jsonify({"erro": "Esta turma ainda tem alunos. Mova ou exclua os alunos antes."}), 409
    database.excluir_onde("chamadas", turma_id=id_turma)
    database.excluir("turmas", id_turma)
    return jsonify({"mensagem": "Turma excluída."})
