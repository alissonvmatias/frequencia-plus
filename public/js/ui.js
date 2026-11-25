/* =============================================================================
   public/js/ui.js
   -----------------------------------------------------------------------------
   O QUE É: a "caixa de ferramentas" visual do front-end.
   PARA QUE SERVE: funções pequenas reutilizadas por todas as páginas:
     - escapar(): protege contra XSS (código malicioso digitado pelo usuário)
     - mostrarToast(): aviso no canto inferior da tela
     - abrirModal() / confirmar(): janelas por cima da tela
     - badge(), barraProgresso(), estadoVazio(): pedaços de HTML prontos
     - formatarData(), formatarPercentual(), dataHoje(): formatação
     - mostrarErros(), limparErros(): mensagens de validação nos formulários
   CONVERSA COM: index.html (#modal-fundo, #toasts), components.css e
                 todas as páginas em js/pages/.
   ============================================================================= */

// Textos amigáveis para os códigos que vêm da API.
export const ROTULOS = {
  ok: "OK",
  atencao: "Atenção",
  risco: "Risco",
  sem_dados: "Sem aulas",
  presente: "Presente",
  falta: "Falta",
  justificada: "Justificada",
  pendente: "Pendente",
  aprovada: "Aprovada",
  recusada: "Recusada",
  professor: "Professor",
  aluno: "Aluno",
  coordenacao: "Coordenação",
};

/**
 * Troca caracteres especiais do HTML por versões "inofensivas".
 * SEMPRE use antes de colocar um dado do usuário dentro de innerHTML.
 * Ex.: escapar("<script>") -> "&lt;script&gt;" (aparece como texto, não roda)
 */
export function escapar(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Atalho para document.querySelector (pega o primeiro elemento que combina). */
export function $(seletor, raiz = document) {
  return raiz.querySelector(seletor);
}

/** Atalho para document.querySelectorAll (pega todos, como lista normal). */
export function $$(seletor, raiz = document) {
  return [...raiz.querySelectorAll(seletor)];
}

// ---------------------------------------------------------------------------
// TOAST
// ---------------------------------------------------------------------------

/**
 * Mostra um aviso rápido no canto inferior que some sozinho.
 * tipo: "sucesso", "erro" ou "info".
 */
export function mostrarToast(mensagem, tipo = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${tipo}`;
  toast.textContent = mensagem; // textContent já é seguro contra XSS
  $("#toasts").appendChild(toast);

  setTimeout(() => {
    toast.classList.add("saindo");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ---------------------------------------------------------------------------
// MODAL
// ---------------------------------------------------------------------------

let aoFecharModal = null; // função chamada quando o modal fecha

/** Fecha o modal que estiver aberto. */
export function fecharModal() {
  $("#modal-fundo").hidden = true;
  $("#modal-corpo").innerHTML = "";
  $("#modal-acoes").innerHTML = "";
  if (aoFecharModal) {
    const funcao = aoFecharModal;
    aoFecharModal = null;
    funcao();
  }
}

/**
 * Abre um modal.
 * - titulo: texto do título
 * - conteudo: HTML do corpo (lembre de usar escapar() nos dados!)
 * - botoes: lista de { texto, classe, acao }. A função "acao" recebe o
 *   elemento do corpo do modal e pode ser assíncrona. Se ela devolver
 *   false, o modal continua aberto (útil quando há erro de validação).
 * - aoFechar: função opcional chamada quando o modal fecha.
 */
export function abrirModal({ titulo, conteudo, botoes = [], aoFechar = null }) {
  $("#modal-titulo").textContent = titulo;
  $("#modal-corpo").innerHTML = conteudo;
  const areaAcoes = $("#modal-acoes");
  areaAcoes.innerHTML = "";

  for (const botao of botoes) {
    const elemento = document.createElement("button");
    elemento.type = "button";
    elemento.className = `botao ${botao.classe || "botao-secundario"}`;
    elemento.textContent = botao.texto;
    elemento.addEventListener("click", async () => {
      elemento.disabled = true;
      try {
        const resultado = botao.acao ? await botao.acao($("#modal-corpo")) : true;
        if (resultado !== false) fecharModal();
      } finally {
        elemento.disabled = false;
      }
    });
    areaAcoes.appendChild(elemento);
  }

  aoFecharModal = aoFechar;
  $("#modal-fundo").hidden = false;
  // Coloca o cursor no primeiro campo do formulário, se houver.
  const primeiroCampo = $("#modal-corpo input, #modal-corpo select, #modal-corpo textarea");
  (primeiroCampo || areaAcoes.lastElementChild)?.focus();
}

/**
 * Abre um modal de confirmação e espera a resposta do usuário.
 * Devolve uma Promise que resolve com true (confirmou) ou false (cancelou).
 * Uso: if (await confirmar({ titulo, mensagem })) { ... }
 */
export function confirmar({ titulo, mensagem, textoConfirmar = "Confirmar", perigo = false }) {
  return new Promise((resolver) => {
    let respondeu = false;
    abrirModal({
      titulo,
      conteudo: `<p>${escapar(mensagem)}</p>`,
      botoes: [
        { texto: "Cancelar", classe: "botao-secundario" },
        {
          texto: textoConfirmar,
          classe: perigo ? "botao-perigo" : "botao-primario",
          acao: () => { respondeu = true; resolver(true); },
        },
      ],
      aoFechar: () => { if (!respondeu) resolver(false); },
    });
  });
}

/** Liga os eventos que fecham o modal: clicar fora dele ou apertar Esc. */
export function prepararModal() {
  $("#modal-fundo").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-fundo") fecharModal();
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && !$("#modal-fundo").hidden) fecharModal();
  });
}

// ---------------------------------------------------------------------------
// PEDAÇOS DE HTML PRONTOS
// ---------------------------------------------------------------------------

/** Devolve o HTML de um badge colorido com bolinha. Ex.: badge("risco"). */
export function badge(codigo, texto) {
  return `<span class="badge ${escapar(codigo)}">${escapar(texto || ROTULOS[codigo] || codigo)}</span>`;
}

/** Devolve o HTML de uma barra de progresso de frequência. */
export function barraProgresso(percentual, classificacao) {
  const largura = percentual === null || percentual === undefined ? 0 : Math.min(100, percentual);
  return `
    <div class="progresso" title="${escapar(formatarPercentual(percentual))}">
      <div class="progresso-trilho">
        <div class="progresso-barra ${escapar(classificacao)}" style="width: ${largura}%"></div>
      </div>
      <span class="progresso-valor">${escapar(formatarPercentual(percentual))}</span>
    </div>`;
}

/** Devolve o HTML do "estado vazio" (quando não há registros para mostrar). */
export function estadoVazio(titulo = "Nenhum registro", texto = "") {
  return `<div class="estado-vazio"><strong>${escapar(titulo)}</strong>${texto ? `<p>${escapar(texto)}</p>` : ""}</div>`;
}

/** Devolve o HTML da faixa de quadradinhos coloridos (uma aula = um quadrado). */
export function faixaAulas(aulas) {
  if (!aulas.length) return estadoVazio("Nenhuma aula registrada ainda");
  const quadrados = aulas
    .map((aula) => {
      const dica = `${formatarData(aula.data)}: ${ROTULOS[aula.status]}`;
      return `<span class="aula ${escapar(aula.status)}" title="${escapar(dica)}" aria-label="${escapar(dica)}"></span>`;
    })
    .join("");
  return `
    <div class="faixa-aulas">${quadrados}</div>
    <div class="legenda">
      <span><i style="background: var(--ok)"></i> Presente</span>
      <span><i style="background: var(--risco)"></i> Falta</span>
      <span><i style="background: var(--atencao)"></i> Justificada</span>
    </div>`;
}

/** Devolve o HTML da lista de alertas do painel. */
export function listaAlertas(alertas) {
  if (!alertas.length) return estadoVazio("Nenhum alerta");
  const itens = alertas
    .map((a) => `<li class="alerta ${escapar(a.tipo)}"><div><strong>${escapar(a.titulo)}</strong><p>${escapar(a.mensagem)}</p></div></li>`)
    .join("");
  return `<ul class="lista-alertas">${itens}</ul>`;
}

/** Devolve o texto "Carregando..." enquanto a API responde. */
export function carregando(texto = "Carregando...") {
  return `<div class="carregando">${escapar(texto)}</div>`;
}

// ---------------------------------------------------------------------------
// FORMATAÇÃO
// ---------------------------------------------------------------------------

/** Converte "2026-11-25" em "25/11/2026". */
export function formatarData(iso) {
  if (!iso) return "-";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Converte 87.5 em "87,5%" (ou "–" se não houver valor). */
export function formatarPercentual(valor) {
  if (valor === null || valor === undefined) return "–";
  return `${String(valor).replace(".", ",")}%`;
}

/** Devolve a data de hoje no formato "AAAA-MM-DD" (horário local). */
export function dataHoje() {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

/** Pega a primeira letra do nome, para o avatar. */
export function inicial(nome) {
  return (nome || "?").trim().charAt(0).toUpperCase();
}

// ---------------------------------------------------------------------------
// ERROS DE FORMULÁRIO
// ---------------------------------------------------------------------------

/**
 * Mostra as mensagens de erro embaixo de cada campo.
 * erros é um objeto { nomeDoCampo: "mensagem" }.
 * Cada campo precisa ter, logo abaixo, um <small data-erro="nomeDoCampo">.
 */
export function mostrarErros(formulario, erros) {
  limparErros(formulario);
  for (const [campo, mensagem] of Object.entries(erros)) {
    const local = formulario.querySelector(`[data-erro="${campo}"]`);
    if (local) {
      local.textContent = mensagem;
      local.closest(".campo")?.classList.add("com-erro");
    }
  }
}

/** Apaga todas as mensagens de erro do formulário. */
export function limparErros(formulario) {
  for (const local of formulario.querySelectorAll("[data-erro]")) local.textContent = "";
  for (const campo of formulario.querySelectorAll(".com-erro")) campo.classList.remove("com-erro");
  const aviso = formulario.querySelector(".aviso-formulario");
  if (aviso) aviso.hidden = true;
}

/** Mostra uma mensagem geral (vinda do servidor) no topo do formulário. */
export function mostrarAviso(formulario, mensagem) {
  const aviso = formulario.querySelector(".aviso-formulario");
  if (aviso) {
    aviso.textContent = mensagem;
    aviso.hidden = false;
  } else {
    mostrarToast(mensagem, "erro");
  }
}

/** Confere o formato de um e-mail (algo@algo.algo). */
export function emailValido(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

/** Lê os campos de um <form> e devolve um objeto { nome: valor }. */
export function lerFormulario(formulario) {
  return Object.fromEntries(new FormData(formulario).entries());
}
