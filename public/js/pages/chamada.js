/* =============================================================================
   public/js/pages/chamada.js
   -----------------------------------------------------------------------------
   O QUE É: a tela da CHAMADA (lista de presença).
   PARA QUE SERVE: duas abas:
     1. "Fazer chamada": escolher turma e data, marcar Presente/Falta para
        cada aluno (botões segmentados) e salvar.
     2. "Histórico": lista das chamadas já feitas. Clicar em uma delas abre
        a chamada para conferir ou corrigir.
   CONVERSA COM: api.js (/api/turmas e /api/chamadas), ui.js e, no servidor,
                 backend/routes_chamada.py.

   FLUXO DO BOTÃO "SALVAR CHAMADA":
     salvar() -> api.salvarChamada() -> POST /api/chamadas
     -> routes_chamada.py (valida) -> database.py (grava no JSON)
   ============================================================================= */

import * as api from "../api.js";
import { $, $$, barraProgresso, dataHoje, escapar, estadoVazio, formatarData, mostrarToast } from "../ui.js";

let turmas = [];
let marcacoes = {};      // { aluno_id: "presente" | "falta" } da chamada aberta
let chamadaAtual = null; // dados vindos do servidor (turma, data, alunos)

/** Desenha a tela com as abas e carrega as turmas do usuário. */
export async function renderizar(container, contexto) {
  turmas = await api.listarTurmas();
  if (!contexto.aindaAtual()) return;
  chamadaAtual = null;
  marcacoes = {};

  if (!turmas.length) {
    container.innerHTML = `
      <div class="cabecalho-pagina"><div><h1>Chamada</h1></div></div>
      ${estadoVazio("Nenhuma turma disponível", "Peça à coordenação para atribuir uma turma a você.")}`;
    return;
  }

  const opcoes = turmas.map((t) => `<option value="${t.id}">${escapar(t.nome)} · ${escapar(t.turno)}</option>`).join("");
  container.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>Chamada</h1><p>Registre a presença dos alunos</p></div>
    </div>
    <div class="abas" role="tablist">
      <button class="aba ativa" type="button" data-aba="fazer">Fazer chamada</button>
      <button class="aba" type="button" data-aba="historico">Histórico</button>
    </div>

    <section id="aba-fazer" class="card">
      <div class="filtros">
        <div class="campo">
          <label for="chamada-turma">Turma</label>
          <select id="chamada-turma">${opcoes}</select>
        </div>
        <div class="campo">
          <label for="chamada-data">Data</label>
          <input id="chamada-data" type="date" value="${dataHoje()}" max="${dataHoje()}">
        </div>
      </div>
      <div id="area-chamada"></div>
    </section>

    <section id="aba-historico" class="card" hidden>
      <div class="filtros">
        <div class="campo">
          <label for="historico-turma">Turma</label>
          <select id="historico-turma"><option value="">Todas</option>${opcoes}</select>
        </div>
      </div>
      <div id="area-historico"></div>
    </section>`;

  for (const aba of $$(".aba", container)) {
    aba.addEventListener("click", () => trocarAba(container, aba.dataset.aba));
  }
  $("#chamada-turma", container).addEventListener("change", () => carregarChamada(container));
  $("#chamada-data", container).addEventListener("change", () => carregarChamada(container));
  $("#historico-turma", container).addEventListener("change", () => carregarHistorico(container));

  await carregarChamada(container);
}

/** Mostra a aba escolhida e esconde a outra. */
function trocarAba(container, nome) {
  for (const aba of $$(".aba", container)) aba.classList.toggle("ativa", aba.dataset.aba === nome);
  $("#aba-fazer", container).hidden = nome !== "fazer";
  $("#aba-historico", container).hidden = nome !== "historico";
  if (nome === "historico") carregarHistorico(container);
}

/** Busca no servidor os alunos da turma e o que já foi marcado naquela data. */
async function carregarChamada(container) {
  const area = $("#area-chamada", container);
  const turma = $("#chamada-turma", container).value;
  const data = $("#chamada-data", container).value;
  if (!data) {
    area.innerHTML = estadoVazio("Escolha uma data");
    return;
  }
  area.innerHTML = '<div class="carregando">Carregando alunos...</div>';
  try {
    chamadaAtual = await api.buscarChamada(turma, data);
  } catch (erro) {
    area.innerHTML = estadoVazio("Não foi possível carregar", erro.message);
    return;
  }
  // Chamada nova: todos começam como "presente" (o professor só marca as faltas).
  marcacoes = {};
  for (const aluno of chamadaAtual.alunos) marcacoes[aluno.id] = aluno.status || "presente";
  desenharChamada(container);
}

/** Desenha a lista de alunos com os botões Presente / Falta. */
function desenharChamada(container) {
  const area = $("#area-chamada", container);
  if (!chamadaAtual.alunos.length) {
    area.innerHTML = estadoVazio("Nenhum aluno nesta turma");
    return;
  }

  const linhas = chamadaAtual.alunos
    .map((aluno) => {
      const status = marcacoes[aluno.id];
      return `
        <tr>
          <td><span class="nome-principal">${escapar(aluno.nome)}</span><span class="texto-pequeno">Matrícula ${escapar(aluno.matricula)}</span></td>
          <td class="acoes">
            <div class="segmentado" role="group" aria-label="Presença de ${escapar(aluno.nome)}">
              <button type="button" class="presente ${status === "presente" ? "ativo" : ""}" data-aluno="${aluno.id}" data-status="presente" aria-pressed="${status === "presente"}">Presente</button>
              <button type="button" class="falta ${status === "falta" ? "ativo" : ""}" data-aluno="${aluno.id}" data-status="falta" aria-pressed="${status === "falta"}">Falta</button>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  area.innerHTML = `
    <p style="margin-bottom: 0.75rem">
      ${chamadaAtual.existente
        ? `Chamada de <strong>${escapar(formatarData(chamadaAtual.data))}</strong> já registrada. Você pode corrigir e salvar de novo.`
        : "Chamada nova: todos começam como <strong>Presente</strong>. Marque apenas quem faltou."}
    </p>
    <div class="tabela-container">
      <table class="tabela">
        <thead><tr><th>Aluno</th><th class="acoes">Presença</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
    <div class="barra-acoes">
      <span id="resumo-chamada"></span>
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap">
        <button id="botao-todos-presentes" class="botao botao-secundario" type="button">Marcar todos presentes</button>
        <button id="botao-salvar-chamada" class="botao botao-primario" type="button">Salvar chamada</button>
      </div>
    </div>`;

  for (const botao of $$("[data-aluno]", area)) {
    botao.addEventListener("click", () => {
      marcacoes[botao.dataset.aluno] = botao.dataset.status;
      desenharChamada(container);
    });
  }
  $("#botao-todos-presentes", area).addEventListener("click", () => {
    for (const id of Object.keys(marcacoes)) marcacoes[id] = "presente";
    desenharChamada(container);
  });
  $("#botao-salvar-chamada", area).addEventListener("click", () => salvar(container));
  atualizarResumo(container);
}

/** Mostra "X presentes · Y faltas" abaixo da lista. */
function atualizarResumo(container) {
  const valores = Object.values(marcacoes);
  const presentes = valores.filter((v) => v === "presente").length;
  $("#resumo-chamada", container).innerHTML =
    `<strong>${presentes}</strong> presentes · <strong>${valores.length - presentes}</strong> faltas`;
}

/** Envia a chamada para o servidor salvar. */
async function salvar(container) {
  const botao = $("#botao-salvar-chamada", container);
  botao.disabled = true;
  botao.textContent = "Salvando...";
  try {
    const resposta = await api.salvarChamada({
      turma_id: chamadaAtual.turma.id,
      data: chamadaAtual.data,
      registros: Object.entries(marcacoes).map(([alunoId, status]) => ({ aluno_id: Number(alunoId), status })),
    });
    mostrarToast(resposta.mensagem, "sucesso");
    chamadaAtual.existente = true;
    desenharChamada(container);
  } catch (erro) {
    mostrarToast(erro.message, "erro");
    botao.disabled = false;
    botao.textContent = "Salvar chamada";
  }
}

/** Busca e desenha o histórico de chamadas. */
async function carregarHistorico(container) {
  const area = $("#area-historico", container);
  area.innerHTML = '<div class="carregando">Carregando histórico...</div>';
  let historico;
  try {
    historico = await api.listarHistorico($("#historico-turma", container).value);
  } catch (erro) {
    area.innerHTML = estadoVazio("Não foi possível carregar", erro.message);
    return;
  }
  if (!historico.length) {
    area.innerHTML = estadoVazio("Nenhum registro", "Nenhuma chamada feita ainda.");
    return;
  }

  const linhas = historico
    .map((c) => {
      const pct = c.total ? Math.round((c.presentes * 1000) / c.total) / 10 : null;
      const cls = pct === null ? "" : pct < 75 ? "risco" : pct < 85 ? "atencao" : "ok";
      return `
        <tr class="clicavel" data-turma="${c.turma_id}" data-data="${escapar(c.data)}">
          <td>${escapar(formatarData(c.data))}</td>
          <td>${escapar(c.turma_nome)}</td>
          <td>${c.presentes}</td>
          <td>${c.faltas}</td>
          <td>${barraProgresso(pct, cls)}</td>
        </tr>`;
    })
    .join("");

  area.innerHTML = `
    <div class="tabela-container">
      <table class="tabela">
        <thead><tr><th>Data</th><th>Turma</th><th>Presentes</th><th>Faltas</th><th>Presença</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`;

  // Clicar em uma chamada do histórico abre ela na aba "Fazer chamada".
  for (const linha of $$("tr.clicavel", area)) {
    linha.addEventListener("click", () => {
      $("#chamada-turma", container).value = linha.dataset.turma;
      $("#chamada-data", container).value = linha.dataset.data;
      trocarAba(container, "fazer");
      carregarChamada(container);
    });
  }
}
