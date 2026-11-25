/* =============================================================================
   public/js/api.js
   -----------------------------------------------------------------------------
   O QUE É: o ÚNICO lugar do front-end que conversa com o servidor (fetch).
   PARA QUE SERVE: cada função aqui chama uma rota da API Python. Assim, as
                   páginas não precisam saber detalhes de URL, headers ou JSON:
                   elas só chamam, por exemplo, api.salvarChamada(dados).
                   Também trata o erro 401: se a sessão expirou, avisa o
                   main.js para voltar à tela de login.
   CONVERSA COM: state.js (token), main.js (evento "sessao-expirada") e
                 todas as páginas em js/pages/. Do lado do servidor, com
                 api/index.py e backend/routes_*.py.
   ============================================================================= */

import { estado, limparSessao } from "./state.js";

/**
 * Função central que faz a requisição HTTP.
 * - metodo: "GET", "POST", "PUT" ou "DELETE"
 * - caminho: parte da URL depois de /api (ex.: "/alunos")
 * - corpo: objeto que será enviado como JSON (opcional)
 * Devolve os dados da resposta, ou lança um erro com a mensagem do servidor.
 */
async function requisicao(metodo, caminho, corpo) {
  const opcoes = {
    method: metodo,
    headers: { "Content-Type": "application/json" },
  };

  // Se há alguém logado, enviamos o token no header Authorization.
  if (estado.token) {
    opcoes.headers.Authorization = `Bearer ${estado.token}`;
  }
  if (corpo !== undefined) {
    opcoes.body = JSON.stringify(corpo);
  }

  let resposta;
  try {
    resposta = await fetch(`/api${caminho}`, opcoes);
  } catch {
    throw new Error("Não foi possível falar com o servidor. Verifique sua conexão.");
  }

  // Tentamos ler o JSON da resposta (pode não haver corpo).
  let dados = null;
  try {
    dados = await resposta.json();
  } catch {
    dados = null;
  }

  // 401 com token = sessão inválida/expirada: limpamos e avisamos o main.js.
  if (resposta.status === 401 && estado.token) {
    limparSessao();
    window.dispatchEvent(new CustomEvent("sessao-expirada", { detail: dados?.erro }));
  }

  if (!resposta.ok) {
    throw new Error(dados?.erro || `Erro ${resposta.status} ao falar com o servidor.`);
  }
  return dados;
}

/** Monta uma "query string" (?a=1&b=2) ignorando valores vazios. */
function montarQuery(parametros) {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== null && valor !== "") busca.set(chave, valor);
  }
  const texto = busca.toString();
  return texto ? `?${texto}` : "";
}

// Cada função abaixo é um "atalho" para uma rota da API.
// O comentário ao lado diz qual rota ela chama e o que faz.

// ---------------- AUTENTICAÇÃO E PERFIL ----------------
export const registrar = (dados) => requisicao("POST", "/auth/registro", dados);        // cria conta
export const login = (email, senha) => requisicao("POST", "/auth/login", { email, senha }); // entra
export const logout = () => requisicao("POST", "/auth/logout");                         // sai
export const buscarEu = () => requisicao("GET", "/auth/me");                            // quem sou eu
export const atualizarPerfil = (nome) => requisicao("PUT", "/auth/me", { nome });       // edita nome
export const excluirConta = () => requisicao("DELETE", "/auth/me");                     // apaga conta

// ---------------- PAINEL ----------------
export const buscarPainel = () => requisicao("GET", "/dashboard");                      // dados do painel

// ---------------- ALUNOS ----------------
export const listarAlunos = (turma) => requisicao("GET", `/alunos${montarQuery({ turma })}`); // lista
export const buscarAluno = (id) => requisicao("GET", `/alunos/${id}`);                  // detalhe
export const criarAluno = (dados) => requisicao("POST", "/alunos", dados);              // cria
export const editarAluno = (id, dados) => requisicao("PUT", `/alunos/${id}`, dados);    // edita
export const excluirAluno = (id) => requisicao("DELETE", `/alunos/${id}`);              // exclui

// ---------------- TURMAS ----------------
export const listarTurmas = () => requisicao("GET", "/turmas");                         // lista
export const listarProfessores = () => requisicao("GET", "/turmas/professores");        // professores
export const criarTurma = (dados) => requisicao("POST", "/turmas", dados);              // cria
export const editarTurma = (id, dados) => requisicao("PUT", `/turmas/${id}`, dados);    // edita
export const excluirTurma = (id) => requisicao("DELETE", `/turmas/${id}`);              // exclui

// ---------------- CHAMADAS ----------------
// buscarChamada: alunos da turma com o status marcado naquele dia
export const buscarChamada = (turma, data) => requisicao("GET", `/chamadas${montarQuery({ turma, data })}`);
// listarHistorico: chamadas já feitas (de uma turma ou de todas)
export const listarHistorico = (turma) => requisicao("GET", `/chamadas${montarQuery({ turma })}`);
// salvarChamada: grava (ou substitui) a chamada do dia
export const salvarChamada = (dados) => requisicao("POST", "/chamadas", dados);

// ---------------- JUSTIFICATIVAS ----------------
export const listarJustificativas = () => requisicao("GET", "/justificativas");         // lista
export const enviarJustificativa = (dados) => requisicao("POST", "/justificativas", dados); // aluno envia
// analisarJustificativa: coordenação aprova ou recusa
export const analisarJustificativa = (id, status, resposta) =>
  requisicao("PUT", `/justificativas/${id}`, { status, resposta });
