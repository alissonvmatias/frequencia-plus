# =============================================================================
# backend/database.py
# -----------------------------------------------------------------------------
# O QUE É: o nosso "banco de dados SIMULADO". Em vez de PostgreSQL ou MongoDB,
#          os dados ficam guardados em UM arquivo JSON.
# PARA QUE SERVE: oferecer funções simples, parecidas com as de um banco de
#                 verdade: ler(), salvar(), inserir(), buscar(), atualizar(),
#                 excluir(). Cada "tabela" é uma lista dentro do JSON:
#                 usuarios, turmas, alunos, chamadas, justificativas, sessoes.
# CONVERSA COM: data/seed.json (dados iniciais) e com TODOS os arquivos
#               routes_*.py e auth.py, que chamam as funções daqui.
#
# ⚠ LIMITAÇÃO IMPORTANTE (seja honesto na apresentação!):
#   - Na Vercel, a pasta do projeto é SOMENTE LEITURA. Só a pasta /tmp aceita
#     gravação, e ela é TEMPORÁRIA: quando a função "dorme" (fica sem acesso
#     por alguns minutos) ou é reiniciada, o /tmp é apagado.
#   - Por isso, ao iniciar, copiamos data/seed.json para /tmp e passamos a ler
#     e gravar sempre lá. Se o /tmp for apagado, os dados voltam ao seed.
#   - Isso é aceitável para um projeto ACADÊMICO. Em produção real, trocaríamos
#     este arquivo por um banco de verdade (PostgreSQL, MongoDB, etc.).
#
# 💡 ONDE TROCAR POR UM BANCO REAL: SOMENTE ESTE ARQUIVO. As rotas só usam as
#    funções ler/salvar/inserir/buscar/buscar_por_id/atualizar/excluir. Se você
#    reescrever essas funções usando SQL, o resto do sistema continua igual.
# =============================================================================

import json
import os
import shutil
import tempfile
import threading

# Pasta raiz do projeto (um nível acima desta pasta "backend").
PASTA_RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Caminho do arquivo com os dados iniciais (vem junto com o repositório).
CAMINHO_SEED = os.path.join(PASTA_RAIZ, "data", "seed.json")

# Caminho do arquivo onde os dados são lidos e gravados de verdade.
# - Na Vercel (Linux), tempfile.gettempdir() devolve "/tmp".
# - No Windows, devolve a pasta temporária do usuário (pois "/tmp" não existe).
# - Se a variável de ambiente DB_PATH existir, ela tem prioridade.
CAMINHO_BANCO = os.environ.get("DB_PATH") or os.path.join(
    tempfile.gettempdir(), "frequencia_db.json"
)

# Nomes das "tabelas" que o banco conhece.
TABELAS = ["usuarios", "turmas", "alunos", "chamadas", "justificativas", "sessoes"]

# Trava (lock) para impedir que duas requisições gravem o arquivo ao mesmo tempo.
# RLock = "lock reentrante": a mesma função pode pegar a trava mais de uma vez
# sem travar a si mesma (por exemplo, inserir() chama ler() e salvar()).
_trava = threading.RLock()


def preparar_banco():
    """Garante que o arquivo do banco exista.

    Se o arquivo em /tmp ainda não existe (primeira vez, ou depois que a Vercel
    apagou o /tmp), copiamos o seed.json para lá.
    """
    with _trava:
        if not os.path.exists(CAMINHO_BANCO):
            shutil.copyfile(CAMINHO_SEED, CAMINHO_BANCO)


def ler():
    """Lê o arquivo JSON inteiro e devolve um dicionário com todas as tabelas."""
    with _trava:
        preparar_banco()
        with open(CAMINHO_BANCO, "r", encoding="utf-8") as arquivo:
            dados = json.load(arquivo)
        # Se faltar alguma tabela no arquivo, criamos uma lista vazia para ela.
        for tabela in TABELAS:
            dados.setdefault(tabela, [])
        return dados


def salvar(dados):
    """Grava o dicionário inteiro de volta no arquivo JSON.

    Gravamos primeiro em um arquivo temporário e depois renomeamos. Assim, se
    algo der errado no meio da gravação, o arquivo original não fica corrompido.
    """
    with _trava:
        caminho_temporario = CAMINHO_BANCO + ".tmp"
        with open(caminho_temporario, "w", encoding="utf-8") as arquivo:
            json.dump(dados, arquivo, ensure_ascii=False, indent=2)
        os.replace(caminho_temporario, CAMINHO_BANCO)


def _proximo_id(lista):
    """Calcula o próximo ID numérico de uma tabela (maior ID + 1)."""
    if not lista:
        return 1
    return max(item["id"] for item in lista) + 1


def _combina(registro, filtros):
    """Diz se um registro tem TODOS os valores pedidos nos filtros.

    Exemplo: _combina({"id": 1, "turma_id": 2}, {"turma_id": 2}) -> True
    """
    for campo, valor in filtros.items():
        if registro.get(campo) != valor:
            return False
    return True


def inserir(tabela, registro):
    """Adiciona um novo registro na tabela, gera um ID e devolve o registro salvo."""
    with _trava:
        dados = ler()
        novo = dict(registro)  # cópia, para não alterar o dicionário original
        novo["id"] = _proximo_id(dados[tabela])
        dados[tabela].append(novo)
        salvar(dados)
        return novo


def buscar(tabela, **filtros):
    """Devolve a lista de registros da tabela que combinam com os filtros.

    Exemplos:
        buscar("alunos")                -> todos os alunos
        buscar("alunos", turma_id=2)    -> só os alunos da turma 2
    """
    dados = ler()
    return [item for item in dados[tabela] if _combina(item, filtros)]


def buscar_um(tabela, **filtros):
    """Devolve o PRIMEIRO registro que combina com os filtros, ou None."""
    resultado = buscar(tabela, **filtros)
    return resultado[0] if resultado else None


def buscar_por_id(tabela, id_registro):
    """Atalho para buscar um registro pelo ID. Devolve None se não achar."""
    return buscar_um(tabela, id=id_registro)


def atualizar(tabela, id_registro, novos_dados):
    """Altera os campos de um registro existente.

    Devolve o registro atualizado, ou None se o ID não existir.
    O campo "id" nunca é alterado.
    """
    with _trava:
        dados = ler()
        for item in dados[tabela]:
            if item["id"] == id_registro:
                for campo, valor in novos_dados.items():
                    if campo != "id":
                        item[campo] = valor
                salvar(dados)
                return item
        return None


def excluir(tabela, id_registro):
    """Remove um registro pelo ID. Devolve True se removeu, False se não achou."""
    with _trava:
        dados = ler()
        antes = len(dados[tabela])
        dados[tabela] = [item for item in dados[tabela] if item["id"] != id_registro]
        if len(dados[tabela]) == antes:
            return False
        salvar(dados)
        return True


def excluir_onde(tabela, **filtros):
    """Remove TODOS os registros que combinam com os filtros.

    Usado para "exclusão em cascata" (ex.: apagar as justificativas de um aluno
    que foi excluído). Devolve quantos registros foram removidos.
    """
    with _trava:
        dados = ler()
        antes = len(dados[tabela])
        dados[tabela] = [item for item in dados[tabela] if not _combina(item, filtros)]
        removidos = antes - len(dados[tabela])
        if removidos:
            salvar(dados)
        return removidos
