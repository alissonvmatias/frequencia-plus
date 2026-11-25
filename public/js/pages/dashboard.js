/* =============================================================================
   public/js/pages/dashboard.js
   -----------------------------------------------------------------------------
   O QUE É: a tela do PAINEL (a primeira depois do login).
   PARA QUE SERVE:
     - Coordenação e Professor: 4 cards de métricas, gráfico de barras por
       turma (feito só com HTML/CSS), lista de alertas e tabela de alunos.
     - Aluno: o próprio percentual, presenças, faltas, faixa de aulas e alertas.
   CONVERSA COM: api.js (GET /api/dashboard), ui.js (componentes) e alunos.js
                 (reaproveita o modal de detalhes do aluno).
                 No servidor: backend/routes_dashboard.py.
   ============================================================================= */

import * as api from "../api.js";
import { $$, badge, barraProgresso, escapar, estadoVazio, faixaAulas, formatarPercentual, listaAlertas } from "../ui.js";
import { abrirDetalheAluno } from "./alunos.js";

/** Busca os dados do painel e desenha a versão certa para o perfil. */
export async function renderizar(container, contexto) {
  const dados = await api.buscarPainel();
  if (!contexto.aindaAtual()) return;
  if (dados.perfil === "aluno") renderizarAluno(container, dados);
  else renderizarGeral(container, dados);
}

/** Devolve o HTML de um card de métrica. */
function cardMetrica(rotulo, valor, detalhe, cor = "") {
  return `
    <div class="card card-metrica ${cor}">
      <span class="rotulo">${escapar(rotulo)}</span>
      <span class="valor">${escapar(valor)}</span>
      <span class="detalhe">${escapar(detalhe)}</span>
    </div>`;
}

/**
 * Desenha o gráfico de barras só com HTML e CSS.
 * A altura de cada barra é o próprio percentual (ex.: 80% de altura).
 * Barras abaixo do limite (75%) ganham a classe "risco" (vermelho).
 */
function graficoBarras(itens, limite) {
  if (!itens.length) return estadoVazio("Nenhuma turma para mostrar");
  const colunas = itens
    .map((item) => {
      const altura = item.percentual ?? 0;
      const emRisco = item.percentual !== null && item.percentual < limite;
      return `
        <div class="grafico-coluna" title="${escapar(item.turma)}: ${escapar(formatarPercentual(item.percentual))}">
          <div class="grafico-barra ${emRisco ? "risco" : ""}" style="height: ${altura}%">
            <span class="grafico-valor">${escapar(formatarPercentual(item.percentual))}</span>
          </div>
        </div>`;
    })
    .join("");
  const rotulos = itens.map((item) => `<span>${escapar(item.turma)}</span>`).join("");
  return `
    <div class="grafico">
      <div class="grafico-area">
        <div class="grafico-limite" style="bottom: ${limite}%"><span>mínimo ${limite}%</span></div>
        ${colunas}
      </div>
      <div class="grafico-rotulos">${rotulos}</div>
    </div>`;
}

/** Devolve o HTML da tabela de alunos com barra de progresso e status. */
function tabelaAlunos(alunos) {
  if (!alunos.length) return estadoVazio("Nenhum aluno cadastrado");
  const linhas = alunos
    .map((a) => `
      <tr class="clicavel" data-id="${a.id}">
        <td><span class="nome-principal">${escapar(a.nome)}</span><span class="texto-pequeno">Matrícula ${escapar(a.matricula)}</span></td>
        <td>${escapar(a.turma_nome)}</td>
        <td>${barraProgresso(a.percentual, a.classificacao)}</td>
        <td>${a.faltas}</td>
        <td>${badge(a.classificacao)}</td>
      </tr>`)
    .join("");
  return `
    <div class="tabela-container">
      <table class="tabela">
        <thead><tr><th>Aluno</th><th>Turma</th><th>Frequência</th><th>Faltas</th><th>Status</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`;
}

/** Painel da coordenação e do professor. */
function renderizarGeral(container, dados) {
  const m = dados.metricas;
  const titulo = dados.perfil === "coordenacao" ? "Painel geral" : "Painel do professor";
  const subtitulo = dados.perfil === "coordenacao" ? "Visão geral da frequência da escola" : "Resumo das suas turmas";
  const corMedia = m.frequencia_media === null ? "" : m.frequencia_media < 75 ? "risco" : m.frequencia_media < 85 ? "atencao" : "ok";

  container.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>${titulo}</h1><p>${subtitulo}</p></div>
    </div>
    <div class="pilha">
      <section class="grade-metricas">
        ${cardMetrica("Total de alunos", m.total_alunos, "alunos acompanhados")}
        ${cardMetrica("Frequência média", formatarPercentual(m.frequencia_media), "média entre os alunos", corMedia)}
        ${cardMetrica("Faltas no mês", m.faltas_mes, `referência ${m.mes_referencia}`, "atencao")}
        ${cardMetrica("Alunos em risco", m.alunos_risco, `abaixo de ${dados.limite_risco}%`, m.alunos_risco ? "risco" : "ok")}
      </section>

      <section class="grade-2">
        <div class="card">
          <div class="card-cabecalho"><div><h2>Frequência por turma</h2><p>Barras vermelhas estão abaixo do mínimo</p></div></div>
          ${graficoBarras(dados.grafico, dados.limite_risco)}
        </div>
        <div class="card">
          <div class="card-cabecalho"><h2>Alertas</h2></div>
          ${listaAlertas(dados.alertas)}
        </div>
      </section>

      <section class="card">
        <div class="card-cabecalho"><div><h2>Alunos</h2><p>Clique em um aluno para ver as aulas dele</p></div></div>
        ${tabelaAlunos(dados.alunos)}
      </section>
    </div>`;

  for (const linha of $$("tr.clicavel", container)) {
    linha.addEventListener("click", () => abrirDetalheAluno(Number(linha.dataset.id)));
  }
}

/** Painel pessoal do aluno. */
function renderizarAluno(container, dados) {
  if (!dados.aluno) {
    container.innerHTML = `
      <div class="cabecalho-pagina"><div><h1>Minha frequência</h1></div></div>
      <div class="card">${listaAlertas(dados.alertas)}</div>`;
    return;
  }
  const a = dados.aluno;
  container.innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>Minha frequência</h1><p>${escapar(a.turma_nome)} · Matrícula ${escapar(a.matricula)}</p></div>
      <a class="botao botao-primario" href="#/justificativas">Justificar uma falta</a>
    </div>
    <div class="pilha">
      <section class="grade-metricas">
        ${cardMetrica("Frequência", formatarPercentual(a.percentual), `mínimo exigido: ${dados.limite_risco}%`, a.classificacao)}
        ${cardMetrica("Presenças", a.presencas, `de ${a.total_aulas} aulas`, "ok")}
        ${cardMetrica("Faltas", a.faltas, "sem justificativa", a.faltas ? "risco" : "ok")}
        ${cardMetrica("Justificadas", a.justificadas, "aprovadas pela coordenação", "atencao")}
      </section>

      <section class="grade-2">
        <div class="card">
          <div class="card-cabecalho">
            <div><h2>Minhas aulas</h2><p>Cada quadrado é uma aula (passe o mouse para ver a data)</p></div>
            ${badge(a.classificacao)}
          </div>
          ${barraProgresso(a.percentual, a.classificacao)}
          <div style="margin-top: 1rem">${faixaAulas(dados.aulas)}</div>
        </div>
        <div class="card">
          <div class="card-cabecalho"><h2>Alertas</h2></div>
          ${listaAlertas(dados.alertas)}
        </div>
      </section>
    </div>`;
}
