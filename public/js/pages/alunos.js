/* =============================================================================
   public/js/pages/alunos.js
   -----------------------------------------------------------------------------
   O QUE É: a tela de ALUNOS (CRUD: listar, criar, editar, excluir).
   PARA QUE SERVE:
     - Todos (professor e coordenação) veem a lista com busca e filtro por turma.
     - Só a coordenação vê os botões Novo aluno, Editar e Excluir.
     - Clicar numa linha abre um modal com os detalhes e a faixa de aulas.
   CONVERSA COM: api.js (/api/alunos e /api/turmas), ui.js e dashboard.js
                 (que reaproveita abrirDetalheAluno). No servidor:
                 backend/routes_alunos.py.
   ============================================================================= */

import * as api from "../api.js";
import {
  $, $$, abrirModal, badge, barraProgresso, confirmar, escapar, estadoVazio, faixaAulas,
  formatarPercentual, lerFormulario, mostrarAviso, mostrarErros, mostrarToast, emailValido,
} from "../ui.js";

// Dados da tela, guardados enquanto ela está aberta.
let alunos = [];
let turmas = [];
let podeEditar = false;

/** Busca alunos e turmas e desenha a tela. */
export async function renderizar(container, contexto) {
  podeEditar = contexto.usuario.perfil === "coordenacao";
  [alunos, turmas] = await Promise.all([api.listarAlunos(), api.listarTurmas()]);
  if (!contexto.aindaAtual()) return;

  const turmaInicial = contexto.parametros.get("turma") || "";
  container.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>Alunos</h1><p>${podeEditar ? "Cadastre e gerencie os alunos da escola" : "Alunos das suas turmas"}</p></div>
      ${podeEditar ? '<button id="botao-novo-aluno" class="botao botao-primario" type="button">+ Novo aluno</button>' : ""}
    </div>
    <section class="card">
      <div class="filtros">
        <div class="campo">
          <label for="busca-aluno">Buscar</label>
          <input id="busca-aluno" type="search" placeholder="Nome ou matrícula">
        </div>
        <div class="campo">
          <label for="filtro-turma">Turma</label>
          <select id="filtro-turma">
            <option value="">Todas as turmas</option>
            ${turmas.map((t) => `<option value="${t.id}" ${String(t.id) === turmaInicial ? "selected" : ""}>${escapar(t.nome)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div id="lista-alunos"></div>
    </section>`;

  $("#busca-aluno", container).addEventListener("input", () => desenharTabela(container));
  $("#filtro-turma", container).addEventListener("change", () => desenharTabela(container));
  $("#botao-novo-aluno", container)?.addEventListener("click", () => abrirFormulario(container));
  desenharTabela(container);
}

/** Aplica a busca e o filtro e desenha a tabela de alunos. */
function desenharTabela(container) {
  const termo = $("#busca-aluno", container).value.trim().toLowerCase();
  const turma = $("#filtro-turma", container).value;
  const filtrados = alunos.filter((a) => {
    const combinaTexto = !termo || a.nome.toLowerCase().includes(termo) || a.matricula.toLowerCase().includes(termo);
    const combinaTurma = !turma || String(a.turma_id) === turma;
    return combinaTexto && combinaTurma;
  });

  const area = $("#lista-alunos", container);
  if (!filtrados.length) {
    area.innerHTML = estadoVazio("Nenhum registro", "Nenhum aluno encontrado com esses filtros.");
    return;
  }

  const linhas = filtrados
    .map((a) => `
      <tr class="clicavel" data-id="${a.id}">
        <td><span class="nome-principal">${escapar(a.nome)}</span><span class="texto-pequeno">${escapar(a.email || "sem e-mail")}</span></td>
        <td>${escapar(a.matricula)}</td>
        <td>${escapar(a.turma_nome)}</td>
        <td>${barraProgresso(a.percentual, a.classificacao)}</td>
        <td>${badge(a.classificacao)}</td>
        ${podeEditar ? `<td class="acoes">
          <button class="botao-link" type="button" data-acao="editar" data-id="${a.id}">Editar</button>
          <button class="botao-link perigo" type="button" data-acao="excluir" data-id="${a.id}">Excluir</button>
        </td>` : ""}
      </tr>`)
    .join("");

  area.innerHTML = `
    <div class="tabela-container">
      <table class="tabela">
        <thead><tr><th>Nome</th><th>Matrícula</th><th>Turma</th><th>Frequência</th><th>Status</th>${podeEditar ? '<th class="acoes">Ações</th>' : ""}</tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`;

  for (const linha of $$("tr.clicavel", area)) {
    linha.addEventListener("click", () => abrirDetalheAluno(Number(linha.dataset.id)));
  }
  for (const botao of $$("[data-acao]", area)) {
    botao.addEventListener("click", (evento) => {
      evento.stopPropagation(); // não abre o detalhe ao clicar no botão
      const aluno = alunos.find((a) => a.id === Number(botao.dataset.id));
      if (botao.dataset.acao === "editar") abrirFormulario(container, aluno);
      else excluirAluno(container, aluno);
    });
  }
}

/** Recarrega a lista do servidor e redesenha a tabela. */
async function recarregar(container) {
  alunos = await api.listarAlunos();
  desenharTabela(container);
}

/** Abre o modal de cadastro (aluno vazio) ou de edição (aluno preenchido). */
function abrirFormulario(container, aluno = null) {
  const opcoesTurma = turmas
    .map((t) => `<option value="${t.id}" ${aluno && aluno.turma_id === t.id ? "selected" : ""}>${escapar(t.nome)}</option>`)
    .join("");

  abrirModal({
    titulo: aluno ? "Editar aluno" : "Novo aluno",
    conteudo: `
      <form class="formulario" novalidate>
        <div class="aviso-formulario" hidden></div>
        <div class="campo">
          <label for="aluno-nome">Nome</label>
          <input id="aluno-nome" name="nome" value="${escapar(aluno?.nome)}">
          <small class="mensagem-erro" data-erro="nome"></small>
        </div>
        <div class="linha-campos">
          <div class="campo">
            <label for="aluno-matricula">Matrícula</label>
            <input id="aluno-matricula" name="matricula" value="${escapar(aluno?.matricula)}">
            <small class="mensagem-erro" data-erro="matricula"></small>
          </div>
          <div class="campo">
            <label for="aluno-turma">Turma</label>
            <select id="aluno-turma" name="turma_id"><option value="">Sem turma</option>${opcoesTurma}</select>
          </div>
        </div>
        <div class="campo">
          <label for="aluno-email">E-mail (opcional)</label>
          <input id="aluno-email" name="email" type="email" value="${escapar(aluno?.email)}">
          <small class="mensagem-erro" data-erro="email"></small>
        </div>
      </form>`,
    botoes: [
      { texto: "Cancelar" },
      { texto: "Salvar", classe: "botao-primario", acao: (corpo) => salvarAluno(container, corpo, aluno) },
    ],
  });
}

/** Valida e envia o formulário do aluno. Devolve false para manter o modal aberto. */
async function salvarAluno(container, corpo, aluno) {
  const formulario = $("form", corpo);
  const dados = lerFormulario(formulario);
  const erros = {};
  if (!dados.nome.trim()) erros.nome = "Informe o nome.";
  if (!dados.matricula.trim()) erros.matricula = "Informe a matrícula.";
  if (dados.email.trim() && !emailValido(dados.email.trim())) erros.email = "E-mail inválido.";
  if (Object.keys(erros).length) {
    mostrarErros(formulario, erros);
    return false;
  }

  const envio = { ...dados, turma_id: dados.turma_id ? Number(dados.turma_id) : null };
  try {
    if (aluno) await api.editarAluno(aluno.id, envio);
    else await api.criarAluno(envio);
  } catch (erro) {
    mostrarAviso(formulario, erro.message);
    return false;
  }
  mostrarToast(aluno ? "Aluno atualizado." : "Aluno cadastrado.", "sucesso");
  await recarregar(container);
  return true;
}

/** Pede confirmação e exclui o aluno. */
async function excluirAluno(container, aluno) {
  const ok = await confirmar({
    titulo: "Excluir aluno",
    mensagem: `Tem certeza que deseja excluir "${aluno.nome}"? As presenças e justificativas dele também serão apagadas.`,
    textoConfirmar: "Excluir",
    perigo: true,
  });
  if (!ok) return;
  try {
    await api.excluirAluno(aluno.id);
    mostrarToast("Aluno excluído.", "sucesso");
    await recarregar(container);
  } catch (erro) {
    mostrarToast(erro.message, "erro");
  }
}

/**
 * Abre um modal com os detalhes do aluno: percentual, contagens e a faixa de
 * aulas. Exportada porque o painel (dashboard.js) também usa.
 */
export async function abrirDetalheAluno(id) {
  let aluno;
  try {
    aluno = await api.buscarAluno(id);
  } catch (erro) {
    mostrarToast(erro.message, "erro");
    return;
  }
  abrirModal({
    titulo: aluno.nome,
    conteudo: `
      <div class="pilha">
        <p>${escapar(aluno.turma_nome)} · Matrícula ${escapar(aluno.matricula)}</p>
        <div>${badge(aluno.classificacao)}</div>
        ${barraProgresso(aluno.percentual, aluno.classificacao)}
        <p>Frequência <strong>${escapar(formatarPercentual(aluno.percentual))}</strong> ·
           ${aluno.presencas} presenças · ${aluno.faltas} faltas · ${aluno.justificadas} justificadas
           (${aluno.total_aulas} aulas)</p>
        ${faixaAulas(aluno.aulas)}
      </div>`,
    botoes: [{ texto: "Fechar", classe: "botao-primario" }],
  });
}
