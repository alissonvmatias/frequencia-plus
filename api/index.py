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
