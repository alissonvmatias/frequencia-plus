/* =============================================================================
   public/js/pages/login.js
   -----------------------------------------------------------------------------
   O QUE É: a tela de LOGIN e de CRIAR CONTA.
   PARA QUE SERVE: desenha o card de login com duas abas (Entrar / Criar conta),
                   valida os campos antes de enviar (campos vazios, e-mail
                   inválido, senha curta) e mostra as contas de demonstração.
                   Quando dá certo, chama a função aoEntrar() do main.js.
   CONVERSA COM: api.js (login e registro), ui.js (validação e escapar) e
                 main.js (que passa a função aoEntrar).
   ============================================================================= */

import * as api from "../api.js";
import { $, $$, emailValido, lerFormulario, limparErros, mostrarAviso, mostrarErros } from "../ui.js";

// Contas que já vêm no seed.json (senha de todas: 123456).
const CONTAS_DEMO = [
  { email: "professor@demo.com", perfil: "Professor" },
  { email: "aluno@demo.com", perfil: "Aluno" },
  { email: "coordenacao@demo.com", perfil: "Coordenação" },
];

/** Desenha a tela de login dentro do container e liga os eventos. */
export function renderizar(container, aoEntrar) {
  container.innerHTML = `
    <section class="card-login">
      <div class="login-marca">
        <span class="logo">F+</span>
        <h1>Frequência+</h1>
        <p>Controle de frequência escolar</p>
      </div>

      <div class="abas" role="tablist">
        <button class="aba ativa" type="button" data-aba="entrar" role="tab">Entrar</button>
        <button class="aba" type="button" data-aba="criar" role="tab">Criar conta</button>
      </div>

      <!-- Formulário de LOGIN -->
      <form id="form-login" class="formulario" novalidate>
        <div class="aviso-formulario" hidden></div>
        <div class="campo">
          <label for="login-email">E-mail</label>
          <input id="login-email" name="email" type="email" autocomplete="username" placeholder="voce@escola.com">
          <small class="mensagem-erro" data-erro="email"></small>
        </div>
        <div class="campo">
          <label for="login-senha">Senha</label>
          <input id="login-senha" name="senha" type="password" autocomplete="current-password" placeholder="Sua senha">
          <small class="mensagem-erro" data-erro="senha"></small>
        </div>
        <button class="botao botao-primario botao-bloco" type="submit">Entrar</button>
      </form>

      <!-- Formulário de CRIAR CONTA -->
      <form id="form-registro" class="formulario" novalidate hidden>
        <div class="aviso-formulario" hidden></div>
        <div class="campo">
          <label for="reg-nome">Nome completo</label>
          <input id="reg-nome" name="nome" type="text" autocomplete="name" placeholder="Seu nome">
          <small class="mensagem-erro" data-erro="nome"></small>
        </div>
        <div class="campo">
          <label for="reg-email">E-mail</label>
          <input id="reg-email" name="email" type="email" autocomplete="email" placeholder="voce@escola.com">
          <small class="mensagem-erro" data-erro="email"></small>
        </div>
        <div class="campo">
          <label for="reg-senha">Senha</label>
          <input id="reg-senha" name="senha" type="password" autocomplete="new-password" placeholder="Mínimo de 6 caracteres">
          <small class="mensagem-erro" data-erro="senha"></small>
        </div>
        <div class="campo">
          <label for="reg-perfil">Perfil</label>
          <select id="reg-perfil" name="perfil">
            <option value="">Selecione...</option>
            <option value="professor">Professor</option>
            <option value="aluno">Aluno</option>
            <option value="coordenacao">Coordenação</option>
          </select>
          <small class="mensagem-erro" data-erro="perfil"></small>
        </div>
        <button class="botao botao-primario botao-bloco" type="submit">Criar conta</button>
      </form>

      <!-- Contas de demonstração -->
      <div class="demo-contas">
        <h3>Contas de demonstração (senha: 123456)</h3>
        <ul>
          ${CONTAS_DEMO.map((c) => `
            <li><button type="button" data-demo="${c.email}">
              <span>${c.email}</span><small>${c.perfil}</small>
            </button></li>`).join("")}
        </ul>
      </div>
    </section>`;

  ligarAbas(container);
  ligarLogin(container, aoEntrar);
  ligarRegistro(container, aoEntrar);
  ligarContasDemo(container);
}

/** Faz as abas "Entrar" e "Criar conta" trocarem o formulário visível. */
function ligarAbas(container) {
  for (const aba of $$(".aba", container)) {
    aba.addEventListener("click", () => {
      for (const outra of $$(".aba", container)) outra.classList.toggle("ativa", outra === aba);
      $("#form-login", container).hidden = aba.dataset.aba !== "entrar";
      $("#form-registro", container).hidden = aba.dataset.aba !== "criar";
    });
  }
}

/** Clicar numa conta demo preenche e-mail e senha automaticamente. */
function ligarContasDemo(container) {
  for (const botao of $$("[data-demo]", container)) {
    botao.addEventListener("click", () => {
      $('.aba[data-aba="entrar"]', container).click();
      $("#login-email", container).value = botao.dataset.demo;
      $("#login-senha", container).value = "123456";
      $("#form-login button[type=submit]", container).focus();
    });
  }
}

/** Valida e envia o formulário de login. */
function ligarLogin(container, aoEntrar) {
  const formulario = $("#form-login", container);
  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault(); // impede o navegador de recarregar a página
    const dados = lerFormulario(formulario);
    const erros = {};
    if (!dados.email.trim()) erros.email = "Informe o e-mail.";
    else if (!emailValido(dados.email.trim())) erros.email = "Digite um e-mail válido.";
    if (!dados.senha) erros.senha = "Informe a senha.";
    if (Object.keys(erros).length) return mostrarErros(formulario, erros);

    limparErros(formulario);
    const botao = $("button[type=submit]", formulario);
    botao.disabled = true;
    botao.textContent = "Entrando...";
    try {
      const resposta = await api.login(dados.email.trim(), dados.senha);
      aoEntrar(resposta.token, resposta.usuario);
    } catch (erro) {
      mostrarAviso(formulario, erro.message);
      botao.disabled = false;
      botao.textContent = "Entrar";
    }
  });
}

/** Confere os campos do cadastro e devolve um objeto com os erros encontrados. */
function validarRegistro(dados) {
  const erros = {};
  if (!dados.nome.trim()) erros.nome = "Informe seu nome.";
  else if (dados.nome.trim().length < 3) erros.nome = "O nome precisa ter pelo menos 3 letras.";
  if (!dados.email.trim()) erros.email = "Informe o e-mail.";
  else if (!emailValido(dados.email.trim())) erros.email = "Digite um e-mail válido.";
  if (!dados.senha) erros.senha = "Crie uma senha.";
  else if (dados.senha.length < 6) erros.senha = "A senha precisa ter no mínimo 6 caracteres.";
  if (!dados.perfil) erros.perfil = "Escolha um perfil.";
  return erros;
}

/** Valida e envia o formulário de criar conta. */
function ligarRegistro(container, aoEntrar) {
  const formulario = $("#form-registro", container);
  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const dados = lerFormulario(formulario);
    const erros = validarRegistro(dados);
    if (Object.keys(erros).length) return mostrarErros(formulario, erros);

    limparErros(formulario);
    const botao = $("button[type=submit]", formulario);
    botao.disabled = true;
    botao.textContent = "Criando...";
    try {
      const resposta = await api.registrar({ ...dados, nome: dados.nome.trim(), email: dados.email.trim() });
      aoEntrar(resposta.token, resposta.usuario);
    } catch (erro) {
      // "E-mail já cadastrado" aparece embaixo do campo de e-mail.
      if (erro.message.includes("e-mail")) mostrarErros(formulario, { email: erro.message });
      else mostrarAviso(formulario, erro.message);
      botao.disabled = false;
      botao.textContent = "Criar conta";
    }
  });
}
