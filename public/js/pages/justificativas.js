/* =============================================================================
   public/js/pages/justificativas.js
   -----------------------------------------------------------------------------
   O QUE É: a tela de JUSTIFICATIVAS de falta.
   PARA QUE SERVE:
     - Aluno: escolhe uma falta, escreve o motivo e envia. Vê o status das
       justificativas enviadas (pendente, aprovada, recusada).
     - Coordenação: vê as justificativas em abas e APROVA ou RECUSA.
     - Professor: só consulta as justificativas dos alunos das suas turmas.
   CONVERSA COM: api.js (/api/justificativas e /api/dashboard), ui.js e, no
                 servidor, backend/routes_chamada.py.
   ============================================================================= */

import * as api from "../api.js";
import { $, $$, abrirModal, badge, escapar, estadoVazio, formatarData, lerFormulario, mostrarAviso, mostrarErros, mostrarToast } from "../ui.js";

let justificativas = [];
let filtroAtual = "pendente";

/** Decide qual versão da tela mostrar conforme o perfil. */
export async function renderizar(container, contexto) {
  if (contexto.usuario.perfil === "aluno") return renderizarAluno(container, contexto);
  return renderizarEquipe(container, contexto);
}

// ---------------------------------------------------------------------------
// VERSÃO DO ALUNO
// ---------------------------------------------------------------------------

/** Tela do aluno: formulário de envio + lista das justificativas dele. */
async function renderizarAluno(container, contexto) {
  const [painel, lista] = await Promise.all([api.buscarPainel(), api.listarJustificativas()]);
  if (!contexto.aindaAtual()) return;
  justificativas = lista;

  // Faltas que ainda podem ser justificadas: status "falta" e sem
  // justificativa pendente ou aprovada para a mesma data.
  const datasBloqueadas = new Set(lista.filter((j) => j.status !== "recusada").map((j) => j.data));
  const faltas = (painel.aulas || []).filter((a) => a.status === "falta" && !datasBloqueadas.has(a.data));

  container.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>Justificativas</h1><p>Envie o motivo de uma falta para a coordenação analisar</p></div>
    </div>
    <div class="grade-2">
      <section class="card">
        <div class="card-cabecalho"><h2>Minhas justificativas</h2></div>
        <div id="lista-justificativas"></div>
      </section>
      <section class="card">
        <div class="card-cabecalho"><h2>Nova justificativa</h2></div>
        ${faltas.length ? `
          <form id="form-justificativa" class="formulario" novalidate>
            <div class="aviso-formulario" hidden></div>
            <div class="campo">
              <label for="just-data">Falta do dia</label>
              <select id="just-data" name="data">
                <option value="">Selecione...</option>
                ${faltas.map((f) => `<option value="${escapar(f.data)}">${escapar(formatarData(f.data))}</option>`).join("")}
              </select>
              <small class="mensagem-erro" data-erro="data"></small>
            </div>
            <div class="campo">
              <label for="just-motivo">Motivo</label>
              <textarea id="just-motivo" name="motivo" placeholder="Ex.: consulta médica, com atestado"></textarea>
              <small class="mensagem-erro" data-erro="motivo"></small>
            </div>
            <button class="botao botao-primario" type="submit">Enviar justificativa</button>
          </form>`
        : estadoVazio("Nenhuma falta para justificar", "Todas as suas faltas já foram justificadas (ou você não tem faltas).")}
      </section>
    </div>`;

  desenharListaAluno(container);
  $("#form-justificativa", container)?.addEventListener("submit", (evento) => enviar(evento, container, contexto));
}

/** Desenha a tabela com as justificativas do aluno. */
function desenharListaAluno(container) {
  const area = $("#lista-justificativas", container);
  if (!justificativas.length) {
    area.innerHTML = estadoVazio("Nenhum registro", "Você ainda não enviou justificativas.");
    return;
  }
  area.innerHTML = `
    <div class="tabela-container">
      <table class="tabela">
        <thead><tr><th>Data</th><th>Motivo</th><th>Status</th></tr></thead>
        <tbody>
          ${justificativas.map((j) => `
            <tr>
              <td>${escapar(formatarData(j.data))}</td>
              <td>${escapar(j.motivo)}${j.resposta ? `<span class="texto-pequeno">Resposta: ${escapar(j.resposta)}</span>` : ""}</td>
              <td>${badge(j.status)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

/** Valida e envia a justificativa do aluno. */
async function enviar(evento, container, contexto) {
  evento.preventDefault();
  const formulario = evento.target;
  const dados = lerFormulario(formulario);
  const erros = {};
  if (!dados.data) erros.data = "Escolha a falta.";
  if (dados.motivo.trim().length < 5) erros.motivo = "Descreva o motivo (pelo menos 5 caracteres).";
  if (Object.keys(erros).length) return mostrarErros(formulario, erros);

  try {
    await api.enviarJustificativa({ data: dados.data, motivo: dados.motivo.trim() });
  } catch (erro) {
    mostrarAviso(formulario, erro.message);
    return;
  }
  mostrarToast("Justificativa enviada! Aguarde a análise da coordenação.", "sucesso");
  await renderizarAluno(container, contexto);
}

// ---------------------------------------------------------------------------
// VERSÃO DA COORDENAÇÃO E DO PROFESSOR
// ---------------------------------------------------------------------------

/** Tela da equipe: abas por status e, para a coordenação, botões de análise. */
async function renderizarEquipe(container, contexto) {
  justificativas = await api.listarJustificativas();
  if (!contexto.aindaAtual()) return;
  const podeAnalisar = contexto.usuario.perfil === "coordenacao";

  container.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>Justificativas</h1><p>${podeAnalisar ? "Analise as justificativas enviadas pelos alunos" : "Justificativas dos alunos das suas turmas"}</p></div>
    </div>
    <div class="abas" id="abas-justificativas"></div>
    <section class="card"><div id="lista-justificativas"></div></section>`;

  desenharEquipe(container, podeAnalisar);
}

/** Desenha as abas (com contador) e a tabela filtrada. */
function desenharEquipe(container, podeAnalisar) {
  const abas = [
    { id: "pendente", texto: "Pendentes" },
    { id: "aprovada", texto: "Aprovadas" },
    { id: "recusada", texto: "Recusadas" },
    { id: "todas", texto: "Todas" },
  ];
  const pendentes = justificativas.filter((j) => j.status === "pendente").length;
  $("#abas-justificativas", container).innerHTML = abas
    .map((a) => `<button class="aba ${a.id === filtroAtual ? "ativa" : ""}" type="button" data-filtro="${a.id}">
        ${a.texto}${a.id === "pendente" && pendentes ? `<span class="contador">${pendentes}</span>` : ""}</button>`)
    .join("");
  for (const aba of $$("[data-filtro]", container)) {
    aba.addEventListener("click", () => { filtroAtual = aba.dataset.filtro; desenharEquipe(container, podeAnalisar); });
  }

  const lista = filtroAtual === "todas" ? justificativas : justificativas.filter((j) => j.status === filtroAtual);
  const area = $("#lista-justificativas", container);
  if (!lista.length) {
    area.innerHTML = estadoVazio("Nenhum registro", "Não há justificativas nesta aba.");
    return;
  }

  area.innerHTML = `
    <div class="tabela-container">
      <table class="tabela">
        <thead><tr><th>Aluno</th><th>Falta</th><th>Motivo</th><th>Enviada em</th><th>Status</th>${podeAnalisar ? '<th class="acoes">Ações</th>' : ""}</tr></thead>
        <tbody>
          ${lista.map((j) => `
            <tr>
              <td><span class="nome-principal">${escapar(j.aluno_nome)}</span><span class="texto-pequeno">${escapar(j.turma_nome)}</span></td>
              <td>${escapar(formatarData(j.data))}</td>
              <td>${escapar(j.motivo)}${j.resposta ? `<span class="texto-pequeno">Resposta: ${escapar(j.resposta)}</span>` : ""}</td>
              <td>${escapar(formatarData(j.criada_em))}</td>
              <td>${badge(j.status)}</td>
              ${podeAnalisar ? `<td class="acoes">${j.status === "pendente" ? `
                <button class="botao botao-sucesso botao-pequeno" type="button" data-analisar="aprovada" data-id="${j.id}">Aprovar</button>
                <button class="botao botao-perigo botao-pequeno" type="button" data-analisar="recusada" data-id="${j.id}">Recusar</button>` : "—"}</td>` : ""}
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  for (const botao of $$("[data-analisar]", area)) {
    botao.addEventListener("click", () => {
      const justificativa = justificativas.find((j) => j.id === Number(botao.dataset.id));
      abrirAnalise(container, justificativa, botao.dataset.analisar);
    });
  }
}

/** Abre o modal para aprovar/recusar, com um campo de resposta opcional. */
function abrirAnalise(container, justificativa, status) {
  const aprovar = status === "aprovada";
  abrirModal({
    titulo: aprovar ? "Aprovar justificativa" : "Recusar justificativa",
    conteudo: `
      <form class="formulario" novalidate>
        <div class="aviso-formulario" hidden></div>
        <p><strong>${escapar(justificativa.aluno_nome)}</strong> · falta em ${escapar(formatarData(justificativa.data))}</p>
        <p>"${escapar(justificativa.motivo)}"</p>
        <div class="campo">
          <label for="resposta">Resposta ao aluno (opcional)</label>
          <textarea id="resposta" name="resposta" placeholder="${aprovar ? "Ex.: atestado conferido" : "Ex.: motivo não aceito pelo regimento"}"></textarea>
        </div>
      </form>`,
    botoes: [
      { texto: "Cancelar" },
      {
        texto: aprovar ? "Aprovar" : "Recusar",
        classe: aprovar ? "botao-sucesso" : "botao-perigo",
        acao: async (corpo) => {
          const formulario = $("form", corpo);
          try {
            await api.analisarJustificativa(justificativa.id, status, lerFormulario(formulario).resposta);
          } catch (erro) {
            mostrarAviso(formulario, erro.message);
            return false;
          }
          mostrarToast(aprovar ? "Justificativa aprovada." : "Justificativa recusada.", "sucesso");
          justificativas = await api.listarJustificativas();
          desenharEquipe(container, true);
          return true;
        },
      },
    ],
  });
}
