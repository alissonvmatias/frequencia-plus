/* =============================================================================
   public/js/state.js
   -----------------------------------------------------------------------------
   O QUE É: o ESTADO GLOBAL do front-end (quem está logado e qual o token).
   PARA QUE SERVE: guardar o usuário e o token em memória e também no
                   localStorage do navegador. O localStorage não apaga quando
                   a página recarrega, por isso o login continua valendo.
   CONVERSA COM: api.js (lê o token para enviar ao servidor), main.js e as
                 páginas (lêem o usuário logado).
   ============================================================================= */

// Nome da "gaveta" no localStorage onde guardamos a sessão.
const CHAVE_SESSAO = "frequencia_plus_sessao";

// O estado em si: começa vazio (ninguém logado).
export const estado = {
  token: null,
  usuario: null,
};

/** Lê a sessão salva no localStorage (se existir) e coloca no estado. */
export function carregarSessao() {
  try {
    const texto = localStorage.getItem(CHAVE_SESSAO);
    if (!texto) return;
    const salvo = JSON.parse(texto);
    estado.token = salvo.token;
    estado.usuario = salvo.usuario;
  } catch {
    limparSessao(); // se o conteúdo estiver estragado, descartamos
  }
}

/** Guarda o token e o usuário depois de um login ou cadastro bem-sucedido. */
export function salvarSessao(token, usuario) {
  estado.token = token;
  estado.usuario = usuario;
  localStorage.setItem(CHAVE_SESSAO, JSON.stringify({ token, usuario }));
}

/** Atualiza só os dados do usuário (ex.: depois de editar o nome). */
export function atualizarUsuario(usuario) {
  salvarSessao(estado.token, usuario);
}

/** Apaga a sessão (logout, conta excluída ou token expirado). */
export function limparSessao() {
  estado.token = null;
  estado.usuario = null;
  localStorage.removeItem(CHAVE_SESSAO);
}

/** Diz se há alguém logado (true ou false). */
export function estaLogado() {
  return Boolean(estado.token && estado.usuario);
}
