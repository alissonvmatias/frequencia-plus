# =============================================================================
# api/index.py
# -----------------------------------------------------------------------------
# O QUE É: o PONTO DE ENTRADA da API. É este arquivo que a Vercel executa
#          como "função serverless" sempre que chega uma requisição /api/...
# PARA QUE SERVE:
#   1. Criar o aplicativo Flask (a variável "app", que a Vercel procura).
#   2. Registrar todas as rotas (blueprints) da pasta backend/.
#   3. Padronizar as respostas de erro no formato {"erro": "mensagem"}.
#   4. Rodando LOCALMENTE, também entrega os arquivos da pasta public/
#      (na Vercel quem entrega public/ é a própria Vercel, não o Flask).
# CONVERSA COM: todos os arquivos backend/routes_*.py, vercel.json e public/.
# =============================================================================

import os
import sys

# A Vercel roda este arquivo de dentro da pasta "api/". Para o Python achar a
# pasta "backend/" (que está um nível acima), colocamos a raiz do projeto no
# caminho de busca de módulos (sys.path).
PASTA_RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PASTA_RAIZ not in sys.path:
    sys.path.insert(0, PASTA_RAIZ)

from flask import Flask, jsonify, request, send_from_directory  # noqa: E402

from backend.database import preparar_banco  # noqa: E402
from backend.routes_alunos import bp_alunos  # noqa: E402
from backend.routes_auth import bp_auth  # noqa: E402
from backend.routes_chamada import bp_chamada  # noqa: E402
from backend.routes_dashboard import bp_dashboard  # noqa: E402
from backend.routes_turmas import bp_turmas  # noqa: E402

PASTA_PUBLIC = os.path.join(PASTA_RAIZ, "public")

# static_folder=None: nós mesmos decidimos como servir os arquivos estáticos.
app = Flask(__name__, static_folder=None)
app.json.ensure_ascii = False  # permite acentos no JSON sem códigos ã


class RestaurarCaminhoVercel:
    """
    Corrige o caminho da requisição quando ela chega pela Vercel.

    Por que existe: o vercel.json manda TODA requisição /api/... para este
    arquivo. Dependendo da configuração, a Vercel entrega ao Flask o caminho
    do ARQUIVO (/api/index.py) em vez do caminho que o navegador pediu
    (ex.: /api/auth/login). Aí o Flask não acha a rota certa e responde
    405 "Método não permitido" — foi exatamente esse o erro no deploy.

    Como resolve: o vercel.json passa o caminho original no parâmetro
    "__rota" (ex.: ?__rota=/api/auth/login). Se o caminho recebido for o do
    arquivo, trocamos pelo original antes de o Flask escolher a rota.
    Rodando localmente nada muda, pois o caminho já vem certo.
    """

    def __init__(self, app_wsgi):
        """Guarda o aplicativo original que vai receber a requisição corrigida."""
        self.app_wsgi = app_wsgi

    def __call__(self, ambiente, iniciar_resposta):
        """Executado a cada requisição: ajusta o caminho e repassa ao Flask."""
        from urllib.parse import parse_qsl, urlencode

        parametros = parse_qsl(ambiente.get("QUERY_STRING", ""), keep_blank_values=True)
        rota_original = next((valor for chave, valor in parametros if chave == "__rota"), None)

        if rota_original and ambiente.get("PATH_INFO", "") in ("/api/index", "/api/index.py"):
            ambiente["PATH_INFO"] = rota_original

        # Remove o "__rota" para o resto do código nem perceber que ele existiu.
        ambiente["QUERY_STRING"] = urlencode([(c, v) for c, v in parametros if c != "__rota"])
        return self.app_wsgi(ambiente, iniciar_resposta)


app.wsgi_app = RestaurarCaminhoVercel(app.wsgi_app)

# Registra cada grupo de rotas no aplicativo.
for blueprint in (bp_auth, bp_alunos, bp_turmas, bp_chamada, bp_dashboard):
    app.register_blueprint(blueprint)

# Copia o seed para /tmp logo na inicialização (se ainda não existir).
preparar_banco()


# -----------------------------------------------------------------------------
# ERROS PADRONIZADOS
# -----------------------------------------------------------------------------

@app.errorhandler(404)
def nao_encontrado(_erro):
    """Rota inexistente: responde JSON na API, ou a página inicial fora dela."""
    if request.path.startswith("/api/"):
        return jsonify({"erro": "Rota não encontrada."}), 404
    return send_from_directory(PASTA_PUBLIC, "index.html")


@app.errorhandler(405)
def metodo_nao_permitido(_erro):
    """Método HTTP errado (ex.: GET em uma rota que só aceita POST)."""
    return jsonify({"erro": "Método não permitido nesta rota."}), 405


@app.errorhandler(500)
def erro_interno(_erro):
    """Qualquer erro inesperado no servidor."""
    return jsonify({"erro": "Erro interno no servidor. Tente novamente."}), 500


# -----------------------------------------------------------------------------
# ARQUIVOS ESTÁTICOS (somente para rodar localmente)
# -----------------------------------------------------------------------------

@app.get("/")
def pagina_inicial():
    """Entrega o index.html (localmente; na Vercel a CDN faz isso)."""
    return send_from_directory(PASTA_PUBLIC, "index.html")


@app.get("/<path:caminho>")
def arquivos_publicos(caminho):
    """Entrega CSS, JS e outros arquivos da pasta public/ (localmente)."""
    if caminho.startswith("api/"):
        return jsonify({"erro": "Rota não encontrada."}), 404
    return send_from_directory(PASTA_PUBLIC, caminho)


# Permite rodar também com: python api/index.py
if __name__ == "__main__":
    app.run(debug=True, port=5000)
