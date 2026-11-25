# =============================================================================
# backend/routes_auth.py
# -----------------------------------------------------------------------------
# O QUE É: as rotas de AUTENTICAÇÃO e de PERFIL do usuário.
# PARA QUE SERVE:
#   POST   /api/auth/registro  -> criar conta
#   POST   /api/auth/login     -> entrar com e-mail e senha
#   POST   /api/auth/logout    -> sair (encerra a sessão)
#   GET    /api/auth/me        -> dados do usuário logado
#   PUT    /api/auth/me        -> editar o próprio nome
#   DELETE /api/auth/me        -> excluir a própria conta
# CONVERSA COM: backend/auth.py (hash e token), backend/database.py (tabela
#               "usuarios") e, no front, public/js/pages/login.js e perfil.js.
# =============================================================================

import re
from datetime import datetime

from flask import Blueprint, g, jsonify, request

from backend import database
from backend.auth import (criar_token, encerrar_sessao, gerar_hash_senha,
                          login_required, verificar_senha)

bp_auth = Blueprint("auth", __name__, url_prefix="/api/auth")

# Perfis aceitos pelo sistema.
PERFIS_VALIDOS = ["professor", "aluno", "coordenacao"]

# Expressão regular simples para conferir o formato de um e-mail: algo@algo.algo
REGEX_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def usuario_publico(usuario):
    """Devolve os dados do usuário SEM o hash da senha (nunca enviamos o hash)."""
    return {
        "id": usuario["id"],
        "nome": usuario["nome"],
        "email": usuario["email"],
        "perfil": usuario["perfil"],
        "aluno_id": usuario.get("aluno_id"),
        "criado_em": usuario.get("criado_em"),
    }


def validar_registro(corpo):
    """Confere os campos do formulário de cadastro. Devolve a mensagem de erro ou None."""
    nome = (corpo.get("nome") or "").strip()
    email = (corpo.get("email") or "").strip().lower()
    senha = corpo.get("senha") or ""
    perfil = corpo.get("perfil") or ""

    if not nome or not email or not senha or not perfil:
        return "Preencha todos os campos."
    if len(nome) < 3:
        return "O nome precisa ter pelo menos 3 letras."
    if not REGEX_EMAIL.match(email):
        return "Digite um e-mail válido."
    if len(senha) < 6:
        return "A senha precisa ter no mínimo 6 caracteres."
    if perfil not in PERFIS_VALIDOS:
        return "Perfil inválido."
    if database.buscar_um("usuarios", email=email):
        return "Este e-mail já está cadastrado."
    return None


@bp_auth.post("/registro")
def registrar():
    """Cria uma nova conta e já devolve um token (o usuário entra direto)."""
    corpo = request.get_json(silent=True) or {}
    erro = validar_registro(corpo)
    if erro:
        status = 409 if erro == "Este e-mail já está cadastrado." else 400
        return jsonify({"erro": erro}), status

    email = corpo["email"].strip().lower()

    # Se for aluno, tentamos ligar a conta a um aluno já cadastrado pela
    # coordenação com o mesmo e-mail. Se não existir, criamos um aluno novo
    # (sem turma), para ele já aparecer no sistema.
    aluno_id = None
    if corpo["perfil"] == "aluno":
        aluno = database.buscar_um("alunos", email=email)
        if not aluno:
            aluno = database.inserir("alunos", {
                "nome": corpo["nome"].strip(),
                "matricula": f"NOVO-{int(datetime.now().timestamp())}",
                "email": email,
                "turma_id": None,
            })
        aluno_id = aluno["id"]

    usuario = database.inserir("usuarios", {
        "nome": corpo["nome"].strip(),
        "email": email,
        "senha_hash": gerar_hash_senha(corpo["senha"]),
        "perfil": corpo["perfil"],
        "aluno_id": aluno_id,
        "criado_em": datetime.now().isoformat(timespec="seconds"),
    })
    return jsonify({"token": criar_token(usuario), "usuario": usuario_publico(usuario)}), 201


@bp_auth.post("/login")
def login():
    """Confere e-mail e senha. Se estiver certo, devolve um token novo."""
    corpo = request.get_json(silent=True) or {}
    email = (corpo.get("email") or "").strip().lower()
    senha = corpo.get("senha") or ""

    if not email or not senha:
        return jsonify({"erro": "Informe e-mail e senha."}), 400

    usuario = database.buscar_um("usuarios", email=email)
    # Mesma mensagem nos dois casos, para não revelar quais e-mails existem.
    if not usuario or not verificar_senha(senha, usuario["senha_hash"]):
        return jsonify({"erro": "E-mail ou senha incorretos."}), 401

    return jsonify({"token": criar_token(usuario), "usuario": usuario_publico(usuario)})


@bp_auth.post("/logout")
@login_required
def logout():
    """Encerra a sessão atual: o token deixa de valer."""
    encerrar_sessao(g.usuario["sid"])
    return jsonify({"mensagem": "Você saiu do sistema."})


@bp_auth.get("/me")
@login_required
def quem_sou_eu():
    """Devolve os dados do usuário logado.

    Se o banco simulado foi reiniciado e a conta sumiu, usamos os dados que
    estão dentro do próprio token (por isso o login não se perde).
    """
    usuario = database.buscar_por_id("usuarios", g.usuario["uid"])
    if usuario:
        return jsonify({"usuario": usuario_publico(usuario)})
    return jsonify({"usuario": {
        "id": g.usuario["uid"], "nome": g.usuario["nome"], "email": g.usuario["email"],
        "perfil": g.usuario["perfil"], "aluno_id": g.usuario.get("aluno_id"), "criado_em": None,
    }})


@bp_auth.put("/me")
@login_required
def editar_perfil():
    """Altera o nome do usuário logado."""
    corpo = request.get_json(silent=True) or {}
    nome = (corpo.get("nome") or "").strip()
    if len(nome) < 3:
        return jsonify({"erro": "O nome precisa ter pelo menos 3 letras."}), 400

    usuario = database.atualizar("usuarios", g.usuario["uid"], {"nome": nome})
    if not usuario:
        return jsonify({"erro": "Conta não encontrada (o banco de demonstração pode ter sido reiniciado)."}), 404
    return jsonify({"usuario": usuario_publico(usuario)})


@bp_auth.delete("/me")
@login_required
def excluir_conta():
    """Exclui a conta do usuário logado e encerra todas as sessões dele.

    Observação: o cadastro do ALUNO (matrícula, chamadas) continua existindo,
    pois é um dado da escola. Só a CONTA de acesso é apagada.
    """
    uid = g.usuario["uid"]
    encerrar_sessao(g.usuario["sid"])
    for sessao in database.buscar("sessoes", usuario_id=uid):
        database.atualizar("sessoes", sessao["id"], {"encerrada": True})
    # Turmas do professor excluído ficam sem professor responsável.
    for turma in database.buscar("turmas", professor_id=uid):
        database.atualizar("turmas", turma["id"], {"professor_id": None})
    database.excluir("usuarios", uid)
    return jsonify({"mensagem": "Conta excluída com sucesso."})
