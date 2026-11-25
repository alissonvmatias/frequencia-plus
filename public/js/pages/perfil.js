/* =============================================================================
   public/js/pages/perfil.js
   -----------------------------------------------------------------------------
   O QUE É: a tela "MEU PERFIL".
   PARA QUE SERVE: mostrar os dados da conta, editar o nome, sair do sistema
                   (logout) e excluir a própria conta (com modal de confirmação).
   CONVERSA COM: api.js (/api/auth/me), state.js (atualiza/limpa a sessão),
                 ui.js e main.js (que entrega as funções sair e
                 atualizarTopbar dentro do "contexto").
                 No servidor: backend/routes_auth.py.
   ============================================================================= */

import * as api from "../api.js";
import { atualizarUsuario, estado, limparSessao } from "../state.js";
import { $, badge, confirmar, escapar, formatarData, inicial, lerFormulario, limparErros, mostrarAviso, mostrarErros, mostrarToast, ROTULOS } from "../ui.js";

/** Desenha a tela de perfil e liga os botões. */
export async function renderizar(container, contexto) {
  const { usuario } = await api.buscarEu();
  if (!contexto.aindaAtual()) return;

  container.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>Meu perfil</h1><p>Seus dados de acesso</p></div></div>
    <div class="pilha" style="max-width: 720px">
      <section class="card">
        <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap">
          <span id="perfil-avatar" class="avatar grande">${escapar(inicial(usuario.nome))}</span>
          <div>
            <h2 id="perfil-nome">${escapar(usuario.nome)}</h2>
            <p>${escapar(usuario.email)}</p>
            <div style="margin-top: 0.4rem">${badge("info", ROTULOS[usuario.perfil])}</div>
          </div>
        </div>
        ${usuario.criado_em ? `<p style="margin-top: 1rem; font-size: 0.85rem">Conta criada em ${escapar(formatarData(usuario.criado_em))}</p>` : ""}
      </section>

      <section class="card">
        <div class="card-cabecalho"><h2>Editar nome</h2></div>
        <form id="form-perfil" class="formulario" novalidate>
          <div class="aviso-formulario" hidden></div>
          <div class="campo">
            <label for="perfil-campo-nome">Nome</label>
            <input id="perfil-campo-nome" name="nome" value="${escapar(usuario.nome)}" autocomplete="name">
            <small class="mensagem-erro" data-erro="nome"></small>
          </div>
          <div><button class="botao botao-primario" type="submit">Salvar alterações</button></div>
        </form>
      </section>

      <section class="card">
        <div class="card-cabecalho">
          <div><h2>Sessão</h2><p>Sair deste navegador</p></div>
          <button id="perfil-sair" class="botao botao-secundario" type="button">Sair do sistema</button>
        </div>
      </section>

      <section class="card zona-perigo">
        <div class="card-cabecalho">
          <div><h2>Excluir conta</h2><p>Apaga sua conta de acesso. Esta ação não pode ser desfeita.</p></div>
          <button id="perfil-excluir" class="botao botao-perigo" type="button">Excluir minha conta</button>
        </div>
      </section>
    </div>`;

  $("#form-perfil", container).addEventListener("submit", (evento) => salvarNome(evento, container, contexto));
  $("#perfil-sair", container).addEventListener("click", contexto.sair);
  $("#perfil-excluir", container).addEventListener("click", () => excluirConta(contexto));
}

/** Valida e salva o novo nome; atualiza a topbar e o estado global. */
async function salvarNome(evento, container, contexto) {
  evento.preventDefault();
  const formulario = evento.target;
  const nome = lerFormulario(formulario).nome.trim();
  if (nome.length < 3) return mostrarErros(formulario, { nome: "O nome precisa ter pelo menos 3 letras." });

  limparErros(formulario);
  try {
    const resposta = await api.atualizarPerfil(nome);
    atualizarUsuario({ ...estado.usuario, ...resposta.usuario });
    contexto.atualizarTopbar();
    $("#perfil-nome", container).textContent = resposta.usuario.nome;
    $("#perfil-avatar", container).textContent = inicial(resposta.usuario.nome);
    mostrarToast("Nome atualizado.", "sucesso");
  } catch (erro) {
    mostrarAviso(formulario, erro.message);
  }
}

/** Pede confirmação no modal e, se confirmado, exclui a conta e volta ao login. */
async function excluirConta(contexto) {
  const ok = await confirmar({
    titulo: "Excluir conta",
    mensagem: "Tem certeza? Sua conta será apagada e você sairá do sistema. Esta ação não pode ser desfeita.",
    textoConfirmar: "Sim, excluir",
    perigo: true,
  });
  if (!ok) return;
  try {
    await api.excluirConta();
  } catch (erro) {
    mostrarToast(erro.message, "erro");
    return;
  }
  limparSessao();
  mostrarToast("Conta excluída.", "sucesso");
  contexto.irParaLogin(); // volta para a tela de login
}
