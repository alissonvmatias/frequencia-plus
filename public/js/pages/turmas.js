/* =============================================================================
   public/js/pages/turmas.js
   -----------------------------------------------------------------------------
   O QUE É: a tela de TURMAS (CRUD: listar, criar, editar, excluir).
   PARA QUE SERVE:
     - Professor vê só as turmas dele (sem botões de edição).
     - Coordenação vê todas e pode criar, editar e excluir.
     - Clicar em uma turma abre a lista de alunos já filtrada por ela.
   CONVERSA COM: api.js (/api/turmas), ui.js e, no servidor,
                 backend/routes_turmas.py.
   ============================================================================= */

import * as api from "../api.js";
import { $, $$, abrirModal, badge, barraProgresso, confirmar, escapar, estadoVazio, lerFormulario, mostrarAviso, mostrarErros, mostrarToast } from "../ui.js";

let turmas = [];
let professores = [];
let podeEditar = false;

/** Busca as turmas (e os professores, se for coordenação) e desenha a tela. */
export async function renderizar(container, contexto) {
  podeEditar = contexto.usuario.perfil === "coordenacao";
  turmas = await api.listarTurmas();
  professores = podeEditar ? await api.listarProfessores() : [];
  if (!contexto.aindaAtual()) return;

  container.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>${podeEditar ? "Turmas" : "Minhas turmas"}</h1><p>Clique em uma turma para ver os alunos</p></div>
      ${podeEditar ? '<button id="botao-nova-turma" class="botao botao-primario" type="button">+ Nova turma</button>' : ""}
    </div>
    <section class="card"><div id="lista-turmas"></div></section>`;

  $("#botao-nova-turma", container)?.addEventListener("click", () => abrirFormulario(container));
  desenharTabela(container);
}

/** Desenha a tabela de turmas. */
function desenharTabela(container) {
  const area = $("#lista-turmas", container);
  if (!turmas.length) {
    area.innerHTML = estadoVazio("Nenhum registro", podeEditar ? "Cadastre a primeira turma." : "Você ainda não tem turmas atribuídas.");
    return;
  }
  const linhas = turmas
    .map((t) => `
      <tr class="clicavel" data-id="${t.id}">
        <td><span class="nome-principal">${escapar(t.nome)}</span><span class="texto-pequeno">${t.total_chamadas} chamada(s) registrada(s)</span></td>
        <td>${escapar(t.turno)}</td>
        <td>${escapar(t.professor_nome)}</td>
        <td>${t.total_alunos}</td>
        <td>${barraProgresso(t.percentual, t.classificacao)}</td>
        <td>${badge(t.classificacao)}</td>
        ${podeEditar ? `<td class="acoes">
          <button class="botao-link" type="button" data-acao="editar" data-id="${t.id}">Editar</button>
          <button class="botao-link perigo" type="button" data-acao="excluir" data-id="${t.id}">Excluir</button>
        </td>` : ""}
      </tr>`)
    .join("");

  area.innerHTML = `
    <div class="tabela-container">
      <table class="tabela">
        <thead><tr><th>Turma</th><th>Turno</th><th>Professor</th><th>Alunos</th><th>Frequência</th><th>Status</th>${podeEditar ? '<th class="acoes">Ações</th>' : ""}</tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`;

  for (const linha of $$("tr.clicavel", area)) {
    linha.addEventListener("click", () => { location.hash = `#/alunos?turma=${linha.dataset.id}`; });
  }
  for (const botao of $$("[data-acao]", area)) {
    botao.addEventListener("click", (evento) => {
      evento.stopPropagation();
      const turma = turmas.find((t) => t.id === Number(botao.dataset.id));
      if (botao.dataset.acao === "editar") abrirFormulario(container, turma);
      else excluirTurma(container, turma);
    });
  }
}

/** Abre o modal para criar (turma vazia) ou editar uma turma. */
function abrirFormulario(container, turma = null) {
  const turnos = ["Manhã", "Tarde", "Noite"]
    .map((t) => `<option ${turma?.turno === t ? "selected" : ""}>${t}</option>`)
    .join("");
  const opcoesProfessor = professores
    .map((p) => `<option value="${p.id}" ${turma?.professor_id === p.id ? "selected" : ""}>${escapar(p.nome)}</option>`)
    .join("");

  abrirModal({
    titulo: turma ? "Editar turma" : "Nova turma",
    conteudo: `
      <form class="formulario" novalidate>
        <div class="aviso-formulario" hidden></div>
        <div class="campo">
          <label for="turma-nome">Nome da turma</label>
          <input id="turma-nome" name="nome" placeholder="Ex.: 1º Ano A" value="${escapar(turma?.nome)}">
          <small class="mensagem-erro" data-erro="nome"></small>
        </div>
        <div class="linha-campos">
          <div class="campo">
            <label for="turma-turno">Turno</label>
            <select id="turma-turno" name="turno">${turnos}</select>
          </div>
          <div class="campo">
            <label for="turma-professor">Professor</label>
            <select id="turma-professor" name="professor_id"><option value="">Sem professor</option>${opcoesProfessor}</select>
          </div>
        </div>
      </form>`,
    botoes: [
      { texto: "Cancelar" },
      { texto: "Salvar", classe: "botao-primario", acao: (corpo) => salvarTurma(container, corpo, turma) },
    ],
  });
}

/** Valida e envia a turma. Devolve false para manter o modal aberto se der erro. */
async function salvarTurma(container, corpo, turma) {
  const formulario = $("form", corpo);
  const dados = lerFormulario(formulario);
  if (!dados.nome.trim()) {
    mostrarErros(formulario, { nome: "Informe o nome da turma." });
    return false;
  }
  const envio = { ...dados, nome: dados.nome.trim(), professor_id: dados.professor_id ? Number(dados.professor_id) : null };
  try {
    if (turma) await api.editarTurma(turma.id, envio);
    else await api.criarTurma(envio);
  } catch (erro) {
    mostrarAviso(formulario, erro.message);
    return false;
  }
  mostrarToast(turma ? "Turma atualizada." : "Turma criada.", "sucesso");
  turmas = await api.listarTurmas();
  desenharTabela(container);
  return true;
}

/** Pede confirmação e exclui a turma (o servidor recusa se houver alunos). */
async function excluirTurma(container, turma) {
  const ok = await confirmar({
    titulo: "Excluir turma",
    mensagem: `Excluir a turma "${turma.nome}"? As chamadas dela também serão apagadas.`,
    textoConfirmar: "Excluir",
    perigo: true,
  });
  if (!ok) return;
  try {
    await api.excluirTurma(turma.id);
    mostrarToast("Turma excluída.", "sucesso");
    turmas = await api.listarTurmas();
    desenharTabela(container);
  } catch (erro) {
    mostrarToast(erro.message, "erro");
  }
}
