# =============================================================================
# backend/auth.py
# -----------------------------------------------------------------------------
# O QUE É: o módulo de SEGURANÇA do sistema.
# PARA QUE SERVE:
#   1. Transformar senhas em "hash" (nunca guardamos a senha em texto puro).
#   2. Criar e conferir o TOKEN de sessão (um "crachá" assinado digitalmente).
#   3. Oferecer os decoradores @login_required e @perfil_requerido, que
#      protegem as rotas da API.
# CONVERSA COM: backend/database.py (tabela "sessoes") e todos os routes_*.py,
#               que usam os decoradores daqui.
#
# COMO FUNCIONA O TOKEN (bem resumido):
#   token = <dados em base64> . <assinatura HMAC>
#   - Os "dados" dizem quem é o usuário (id, nome, perfil) e quando expira.
#   - A "assinatura" é calculada com uma CHAVE SECRETA que só o servidor sabe.
#   - Se alguém alterar os dados, a assinatura não bate e o token é recusado.
#   - Como o token carrega os dados do usuário, o login continua valendo mesmo
#     se o banco simulado em /tmp for apagado pela Vercel.
# =============================================================================

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from datetime import datetime
from functools import wraps

from flask import g, jsonify, request

from backend import database

# Chave secreta usada para assinar os tokens.
# Em produção, defina a variável de ambiente SECRET_KEY na Vercel!
# O valor padrão abaixo serve APENAS para desenvolvimento.
CHAVE_SECRETA = os.environ.get("SECRET_KEY", "chave-de-desenvolvimento-troque-em-producao")

# Quantas vezes o algoritmo de hash é repetido. Quanto maior, mais difícil
# descobrir a senha por "força bruta" (tentando milhões de senhas).
ITERACOES_HASH = 100_000

# Tempo de validade do token: 7 dias (em segundos).
VALIDADE_TOKEN = 7 * 24 * 60 * 60


# -----------------------------------------------------------------------------
# SENHAS
# -----------------------------------------------------------------------------

def gerar_hash_senha(senha):
    """Transforma a senha em um hash seguro usando PBKDF2 + salt.

    O "salt" é um valor aleatório diferente para cada usuário. Assim, duas
    pessoas com a mesma senha terão hashes diferentes.
    Formato guardado: "pbkdf2_sha256$iteracoes$salt$hash"
    """
    salt = secrets.token_hex(16)
    resultado = hashlib.pbkdf2_hmac(
        "sha256", senha.encode("utf-8"), salt.encode("utf-8"), ITERACOES_HASH
    )
    return f"pbkdf2_sha256${ITERACOES_HASH}${salt}${resultado.hex()}"


def verificar_senha(senha, hash_salvo):
    """Confere se a senha digitada corresponde ao hash guardado no banco.

    Refazemos o cálculo com o MESMO salt e comparamos os resultados.
    """
    try:
        _algoritmo, iteracoes, salt, hash_esperado = hash_salvo.split("$")
    except (ValueError, AttributeError):
        return False
    resultado = hashlib.pbkdf2_hmac(
        "sha256", senha.encode("utf-8"), salt.encode("utf-8"), int(iteracoes)
    )
    # compare_digest compara em tempo constante (evita ataques de tempo).
    return hmac.compare_digest(resultado.hex(), hash_esperado)


# -----------------------------------------------------------------------------
# TOKEN
# -----------------------------------------------------------------------------

def _assinar(texto):
    """Calcula a assinatura HMAC-SHA256 de um texto usando a chave secreta."""
    return hmac.new(CHAVE_SECRETA.encode("utf-8"), texto.encode("utf-8"), hashlib.sha256).hexdigest()


def criar_token(usuario):
    """Cria um token assinado para o usuário e registra a sessão no banco.

    Devolve o texto do token, que o front-end guarda e envia em toda requisição.
    """
    id_sessao = secrets.token_hex(8)  # identificador único desta sessão
    dados = {
        "uid": usuario["id"],
        "nome": usuario["nome"],
        "email": usuario["email"],
        "perfil": usuario["perfil"],
        "aluno_id": usuario.get("aluno_id"),
        "sid": id_sessao,
        "exp": int(time.time()) + VALIDADE_TOKEN,
    }
    texto = base64.urlsafe_b64encode(json.dumps(dados).encode("utf-8")).decode("utf-8")
    database.inserir("sessoes", {
        "sid": id_sessao,
        "usuario_id": usuario["id"],
        "criada_em": datetime.now().isoformat(timespec="seconds"),
        "encerrada": False,
    })
    return f"{texto}.{_assinar(texto)}"


def ler_token(token):
    """Confere o token e devolve os dados de dentro dele, ou None se inválido.

    O token é recusado se: estiver mal formatado, a assinatura não bater,
    estiver expirado ou a sessão tiver sido encerrada (logout).
    """
    try:
        texto, assinatura = token.split(".")
    except (ValueError, AttributeError):
        return None

    if not hmac.compare_digest(_assinar(texto), assinatura):
        return None  # alguém mexeu no token, ou foi assinado com outra chave

    try:
        dados = json.loads(base64.urlsafe_b64decode(texto.encode("utf-8")))
    except (ValueError, json.JSONDecodeError):
        return None

    if dados.get("exp", 0) < time.time():
        return None  # token expirado

    # Se a sessão existe no banco e foi encerrada (logout), recusamos.
    # Se NÃO existe (o /tmp foi apagado), aceitamos, pois a assinatura é válida.
    sessao = database.buscar_um("sessoes", sid=dados.get("sid"))
    if sessao and sessao.get("encerrada"):
        return None

    return dados


def encerrar_sessao(id_sessao):
    """Marca a sessão como encerrada (usado no logout e ao excluir a conta)."""
    sessao = database.buscar_um("sessoes", sid=id_sessao)
    if sessao:
        database.atualizar("sessoes", sessao["id"], {"encerrada": True})
    else:
        # A sessão sumiu (banco reiniciado): registramos como encerrada.
        database.inserir("sessoes", {"sid": id_sessao, "usuario_id": None, "encerrada": True})


# -----------------------------------------------------------------------------
# DECORADORES (protegem as rotas)
# -----------------------------------------------------------------------------

def login_required(funcao):
    """Decorador: só deixa a rota rodar se o usuário estiver logado.

    Lê o header "Authorization: Bearer <token>". Se o token for válido, guarda
    os dados do usuário em g.usuario (g = "variável global da requisição").
    Caso contrário, responde 401 (não autorizado).
    """
    @wraps(funcao)
    def protegida(*args, **kwargs):
        cabecalho = request.headers.get("Authorization", "")
        if not cabecalho.startswith("Bearer "):
            return jsonify({"erro": "Você precisa estar logado."}), 401

        dados = ler_token(cabecalho[len("Bearer "):])
        if dados is None:
            return jsonify({"erro": "Sessão inválida ou expirada. Faça login novamente."}), 401

        # Se o usuário ainda existe no banco, usamos o nome mais atualizado.
        usuario_banco = database.buscar_por_id("usuarios", dados["uid"])
        if usuario_banco:
            dados["nome"] = usuario_banco["nome"]
            dados["aluno_id"] = usuario_banco.get("aluno_id")

        g.usuario = dados
        return funcao(*args, **kwargs)

    return protegida


def perfil_requerido(*perfis):
    """Decorador: só deixa a rota rodar para os perfis informados.

    Exemplo: @perfil_requerido("coordenacao") -> só a coordenação acessa.
    Deve ser usado ABAIXO de @login_required. Responde 403 (proibido) se o
    perfil não tiver permissão.
    """
    def decorador(funcao):
        @wraps(funcao)
        def verificada(*args, **kwargs):
            if g.usuario["perfil"] not in perfis:
                return jsonify({"erro": "Seu perfil não tem permissão para esta ação."}), 403
            return funcao(*args, **kwargs)
        return verificada
    return decorador
