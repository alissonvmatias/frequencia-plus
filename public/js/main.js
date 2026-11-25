/* =============================================================================
   public/js/main.js
   -----------------------------------------------------------------------------
   O QUE É: o ARQUIVO PRINCIPAL do front-end (o primeiro a rodar).
   PARA QUE SERVE:
     1. Ver se já existe alguém logado (sessão salva) e decidir qual tela
        mostrar: login ou sistema.
     2. Montar o menu lateral (e o menu inferior do celular) conforme o perfil.
     3. Funcionar como ROTEADOR: olha o endereço depois do "#" (ex.: #/alunos)
        e chama a página certa para desenhar o conteúdo.
   CONVERSA COM: state.js, api.js, ui.js e todas as páginas em js/pages/.
   ============================================================================= */

import * as api from "./api.js";
import { carregarSessao, estado, estaLogado, limparSessao, salvarSessao } from "./state.js";
import { $, escapar, inicial, mostrarToast, prepararModal, ROTULOS, carregando, estadoVazio } from "./ui.js";

import * as paginaLogin from "./pages/login.js";
import * as paginaPainel from "./pages/dashboard.js";
import * as paginaChamada from "./pages/chamada.js";
import * as paginaAlunos from "./pages/alunos.js";
import * as paginaTurmas from "./pages/turmas.js";
import * as paginaJustificativas from "./pages/justificativas.js";
import * as paginaPerfil from "./pages/perfil.js";

// Ícones simples em SVG (traço), usados no menu.
const ICONES = {
  painel: '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>',
  chamada: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
  alunos: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  turmas: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  justificativas: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>',
  perfil: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
};

// Qual página cada rota abre.
const PAGINAS = {
  painel: paginaPainel,
  chamada: paginaChamada,
  alunos: paginaAlunos,
  turmas: paginaTurmas,
  justificativas: paginaJustificativas,
  perfil: paginaPerfil,
};

// Menu de cada perfil: só aparecem (e só abrem) as rotas listadas aqui.
const MENUS = {
  professor: [
    { rota: "painel", texto: "Painel" },
    { rota: "chamada", texto: "Chamada" },
    { rota: "turmas", texto: "Minhas turmas" },
    { rota: "alunos", texto: "Alunos" },
    { rota: "justificativas", texto: "Justificativas" },
    { rota: "perfil", texto: "Meu perfil" },
  ],
  aluno: [
    { rota: "painel", texto: "Minha frequência" },
    { rota: "justificativas", texto: "Justificativas" },
    { rota: "perfil", texto: "Meu perfil" },
  ],
  coordenacao: [
    { rota: "painel", texto: "Painel geral" },
    { rota: "turmas", texto: "Turmas" },
    { rota: "alunos", texto: "Alunos" },
    { rota: "justificativas", texto: "Justificativas" },
    { rota: "chamada", texto: "Chamadas" },
    { rota: "perfil", texto: "Meu perfil" },
  ],
};

/** Devolve o HTML de um ícone do menu. */
function icone(nome) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome]}</svg>`;
}

/** Lê a rota atual do endereço. Ex.: "#/alunos?turma=2" -> "alunos". */
function rotaAtual() {
  const semHash = location.hash.replace(/^#\/?/, "");
  return semHash.split("?")[0] || "painel";
}

// ---------------------------------------------------------------------------
// TROCA DE TELAS
// ---------------------------------------------------------------------------

/** Mostra a tela de login e esconde o sistema. */
function mostrarLogin() {
  $("#tela-app").hidden = true;
  $("#tela-login").hidden = false;
  paginaLogin.renderizar($("#tela-login"), entrarNoSistema);
}

/** Chamado pelo login.js quando o login ou cadastro dá certo. */
function entrarNoSistema(token, usuario) {
  salvarSessao(token, usuario);
  mostrarToast(`Bem-vindo(a), ${usuario.nome.split(" ")[0]}!`, "sucesso");
  // replaceState troca o endereço sem disparar o evento "hashchange".
  history.replaceState(null, "", "#/painel");
  mostrarSistema();
}

/** Mostra a área logada: topbar, menus e a página da rota atual. */
function mostrarSistema() {
  $("#tela-login").hidden = true;
  $("#tela-login").innerHTML = "";
  $("#tela-app").hidden = false;
  atualizarTopbar();
  montarMenus();
  renderizarRota();
}

/** Escreve o nome, o perfil e a inicial do usuário na barra superior. */
function atualizarTopbar() {
  const usuario = estado.usuario;
  $("#topbar-nome").textContent = usuario.nome;
  $("#topbar-perfil").textContent = ROTULOS[usuario.perfil];
  $("#topbar-avatar").textContent = inicial(usuario.nome);
}

/** Monta a sidebar e o menu inferior com os itens do perfil logado. */
function montarMenus() {
  const itens = MENUS[estado.usuario.perfil] || [];
  const links = itens
    .map((item) => `<a class="menu-item" href="#/${item.rota}" data-rota="${item.rota}">${icone(item.rota)}<span>${escapar(item.texto)}</span></a>`)
    .join("");
  $("#sidebar").innerHTML = `<div class="sidebar-titulo">Menu · ${escapar(ROTULOS[estado.usuario.perfil])}</div>${links}`;
  $("#nav-inferior").innerHTML = links;
}

/** Destaca no menu o item da página aberta. */
function marcarMenuAtivo(rota) {
  for (const link of document.querySelectorAll(".menu-item")) {
    link.classList.toggle("ativo", link.dataset.rota === rota);
  }
}

// Contador para ignorar respostas antigas quando o usuário troca de página rápido.
let numeroDaRenderizacao = 0;

/** O ROTEADOR: descobre a página da rota atual e manda ela se desenhar. */
async function renderizarRota() {
  if (!estaLogado()) return mostrarLogin();

  const rota = rotaAtual();
  const permitida = (MENUS[estado.usuario.perfil] || []).some((item) => item.rota === rota);
  if (!permitida) {
    location.hash = "#/painel";
    return;
  }

  marcarMenuAtivo(rota);
  const conteudo = $("#conteudo");
  conteudo.innerHTML = carregando();
  const minhaVez = ++numeroDaRenderizacao;

  // Informações que as páginas podem precisar.
  const contexto = {
    usuario: estado.usuario,
    parametros: new URLSearchParams(location.hash.split("?")[1] || ""),
    atualizarTopbar,
    sair,
    irParaLogin: () => {
      history.replaceState(null, "", "#/login");
      mostrarLogin();
    },
    aindaAtual: () => minhaVez === numeroDaRenderizacao,
  };

  try {
    await PAGINAS[rota].renderizar(conteudo, contexto);
    if (minhaVez === numeroDaRenderizacao) conteudo.focus({ preventScroll: true });
  } catch (erro) {
    if (minhaVez === numeroDaRenderizacao && estaLogado()) {
      conteudo.innerHTML = estadoVazio("Não foi possível carregar esta tela", erro.message);
    }
  }
}

/** Faz logout: avisa o servidor, apaga a sessão local e volta ao login. */
async function sair() {
  try {
    await api.logout();
  } catch {
    // mesmo se o servidor falhar, saímos localmente
  }
  limparSessao();
  history.replaceState(null, "", "#/login");
  mostrarToast("Você saiu do sistema.");
  mostrarLogin();
}

// ---------------------------------------------------------------------------
// INICIALIZAÇÃO
// ---------------------------------------------------------------------------

/** Primeira função a rodar quando a página abre. */
async function iniciar() {
  prepararModal();
  carregarSessao();

  $("#botao-sair").addEventListener("click", sair);
  window.addEventListener("hashchange", () => {
    if (estaLogado()) renderizarRota();
  });

  // Se o api.js receber 401, a sessão acabou: voltamos ao login.
  window.addEventListener("sessao-expirada", (evento) => {
    mostrarToast(evento.detail || "Sua sessão expirou. Entre novamente.", "erro");
    mostrarLogin();
  });

  if (!estaLogado()) return mostrarLogin();

  // Já estava logado: confirmamos com o servidor e atualizamos os dados.
  try {
    const resposta = await api.buscarEu();
    salvarSessao(estado.token, resposta.usuario);
    if (rotaAtual() === "login") history.replaceState(null, "", "#/painel");
    mostrarSistema();
  } catch {
    if (!estaLogado()) mostrarLogin(); // token inválido (401 já tratado)
    else mostrarSistema(); // servidor fora do ar: mostramos o que temos
  }
}

iniciar();
