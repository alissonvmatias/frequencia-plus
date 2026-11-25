# Frequência+ 📋

Sistema web de **controle de frequência escolar**, feito como projeto acadêmico.
Professores fazem a chamada, alunos acompanham a própria frequência e a coordenação
enxerga tudo em um painel com métricas, gráfico e alertas.

> **Contas de demonstração** (já vêm prontas, senha `123456`):
> `professor@demo.com` · `aluno@demo.com` · `coordenacao@demo.com`

---

## 1. O que é e quais problemas resolve

| Problema na escola | Como o Frequência+ resolve |
|---|---|
| Chamada em papel se perde e dá trabalho somar | Chamada digital com botões **Presente/Falta**, salva na hora |
| O aluno só descobre que está reprovado por falta no fim do semestre | Painel do aluno com **percentual**, faixa de aulas e **alertas** |
| A coordenação não sabe quem está em risco | Painel com **alunos em risco (< 75%)**, gráfico por turma e alertas |
| Atestados e justificativas chegam por papel/WhatsApp | O aluno **envia a justificativa** no sistema; a coordenação **aprova ou recusa** |

### Perfis

| Perfil | O que pode fazer |
|---|---|
| **Professor** | Ver suas turmas e alunos, fazer e corrigir chamadas, ver histórico e justificativas |
| **Aluno** | Ver sua frequência, faltas, faixa de aulas, alertas; enviar justificativas |
| **Coordenação** | Painel geral, CRUD de turmas e alunos, aprovar/recusar justificativas, ver chamadas |

### Regra de frequência

```
frequência = (presenças + faltas justificadas) / total de aulas × 100
  < 75%        → Risco   (vermelho)
  75% a 84,9%  → Atenção (âmbar)
  ≥ 85%        → OK      (verde)
```

---

## 2. Tecnologias e por que cada uma

| Tecnologia | Onde | Por que foi escolhida |
|---|---|---|
| **HTML5 + CSS3** | `public/` | Base de qualquer site; sem framework, dá para explicar cada linha |
| **JavaScript puro (módulos ES)** | `public/js/` | `import`/`export` organizam o código em arquivos sem precisar de build (Webpack/Vite) |
| **Variáveis CSS + `prefers-color-scheme`** | `variables.css` | Tema claro/escuro automático trocando só as variáveis |
| **Python 3 + Flask** | `api/`, `backend/` | Flask é pequeno e didático: uma função = uma rota |
| **JSON como banco simulado** | `backend/database.py` | Dispensa instalar banco; dá para abrir o arquivo e ver os dados |
| **hashlib.pbkdf2_hmac + salt** | `backend/auth.py` | Biblioteca padrão do Python; senhas nunca ficam em texto puro |
| **Token assinado com HMAC** | `backend/auth.py` | Login sem depender do banco (que pode ser apagado na Vercel) |
| **Vercel** | `vercel.json` | Hospeda o front (estático) e a API Python (serverless) de graça, com deploy pelo GitHub |

---

## 3. Estrutura de pastas

```
frequencia-plus/
├── README.md                  # este arquivo
├── vercel.json                # configuração de deploy
├── requirements.txt           # dependências Python (Flask)
├── .gitignore
├── api/
│   └── index.py               # entrada da API (Flask app exportado como `app`)
├── backend/
│   ├── __init__.py
│   ├── database.py            # banco simulado (JSON)
│   ├── auth.py                # hash de senha, token, decorador @login_required
│   ├── routes_auth.py         # /api/auth/* (registro, login, logout, excluir conta)
│   ├── routes_alunos.py       # CRUD de alunos
│   ├── routes_turmas.py       # CRUD de turmas
│   ├── routes_chamada.py      # chamada e justificativas
│   └── routes_dashboard.py    # métricas, gráfico, alertas (+ cálculos de frequência)
├── data/
│   └── seed.json              # dados iniciais
└── public/
    ├── index.html             # página única (SPA simples)
    ├── css/  variables.css · base.css · components.css · layout.css
    └── js/
        ├── main.js  api.js  state.js  ui.js
        └── pages/ login.js · dashboard.js · chamada.js · alunos.js
                   turmas.js · justificativas.js · perfil.js
```

### Pasta/arquivo → o que faz → quem usa

| Pasta/arquivo | O que faz | Quem usa |
|---|---|---|
| `vercel.json` | Diz à Vercel: `public/` é o site, `/api/*` vai para o Python | Vercel |
| `api/index.py` | Cria o Flask, registra as rotas, padroniza erros JSON | Vercel / `flask run` |
| `backend/database.py` | `ler`, `salvar`, `inserir`, `buscar`, `atualizar`, `excluir` no JSON | Todas as rotas e `auth.py` |
| `backend/auth.py` | Hash de senha, criação/conferência do token, `@login_required`, `@perfil_requerido` | Todas as rotas |
| `backend/routes_auth.py` | Registro, login, logout, perfil, excluir conta | `login.js`, `perfil.js` |
| `backend/routes_alunos.py` | CRUD de alunos | `alunos.js`, `dashboard.js` |
| `backend/routes_turmas.py` | CRUD de turmas + lista de professores | `turmas.js`, `chamada.js`, `alunos.js` |
| `backend/routes_chamada.py` | Chamadas (buscar, histórico, salvar) e justificativas | `chamada.js`, `justificativas.js` |
| `backend/routes_dashboard.py` | Painel + funções de cálculo de frequência | `dashboard.js` e as outras rotas |
| `data/seed.json` | Dados de exemplo (3 turmas, 15 alunos, 36 chamadas, 3 contas) | `database.py` |
| `public/index.html` | Esqueleto da página (login, topbar, sidebar, modal, toast) | Navegador |
| `public/css/*.css` | Cores/tema, reset, componentes, layout e responsivo | `index.html` |
| `public/js/main.js` | Inicia o app, monta menus por perfil, roteador `#/rota` | Navegador |
| `public/js/api.js` | Único lugar com `fetch`; trata 401 | Todas as páginas |
| `public/js/state.js` | Usuário logado + token no `localStorage` | `api.js`, `main.js`, `perfil.js` |
| `public/js/ui.js` | `escapar()`, toast, modal, badges, barras, formatação | Todas as páginas |
| `public/js/pages/*.js` | Uma tela por arquivo | `main.js` (roteador) |

---

## 4. Fluxo de uma requisição: "Salvar chamada"

```
[Professor clica em "Salvar chamada"]
        │
        ▼
public/js/pages/chamada.js  → função salvar() monta {turma_id, data, registros}
        │
        ▼
public/js/api.js            → salvarChamada() faz fetch POST /api/chamadas
                              com o header Authorization: Bearer <token>
        │  (internet)
        ▼
vercel.json                 → reescreve /api/chamadas para a função api/index.py
        │
        ▼
api/index.py (Flask)        → encontra a rota no blueprint de chamadas
        │
        ▼
backend/auth.py             → @login_required confere o token (assinatura, validade, logout)
                              @perfil_requerido("professor", "coordenacao")
        │
        ▼
backend/routes_chamada.py   → salvar_chamada() valida turma, data (não futura),
                              e se todos os alunos foram marcados
        │
        ▼
backend/database.py         → inserir() ou atualizar() na tabela "chamadas"
        │
        ▼
/tmp/frequencia_db.json     → arquivo gravado (com trava threading.Lock)
        │
        ▼
Resposta {"mensagem": "Chamada salva."} → api.js → chamada.js → toast verde ✅
```

Erros seguem o mesmo caminho de volta, sempre no formato `{"erro": "mensagem"}`
com o status HTTP certo (400 dados inválidos, 401 sem login, 403 sem permissão,
404 não encontrado, 409 conflito/duplicado).

### Endpoints da API

| Método | Rota | Quem | O que faz |
|---|---|---|---|
| POST | `/api/auth/registro` | público | Cria conta e já devolve token |
| POST | `/api/auth/login` | público | Entra com e-mail e senha |
| POST | `/api/auth/logout` | logado | Encerra a sessão |
| GET / PUT / DELETE | `/api/auth/me` | logado | Ver / editar nome / excluir conta |
| GET / POST | `/api/alunos` | GET todos; POST coordenação | Lista (filtro `?turma=`) / cria |
| GET / PUT / DELETE | `/api/alunos/<id>` | GET todos; resto coordenação | Detalhe / edita / exclui |
| GET / POST | `/api/turmas` | GET todos; POST coordenação | Lista / cria |
| PUT / DELETE | `/api/turmas/<id>` | coordenação | Edita / exclui |
| GET | `/api/turmas/professores` | coordenação | Professores para o formulário |
| GET | `/api/chamadas?turma=&data=` | professor, coordenação | Chamada do dia ou histórico |
| POST | `/api/chamadas` | professor, coordenação | Salva (ou corrige) a chamada |
| GET / POST | `/api/justificativas` | GET todos; POST aluno | Lista / envia |
| PUT | `/api/justificativas/<id>` | coordenação | Aprova ou recusa |
| GET | `/api/dashboard` | logado | Painel conforme o perfil |

---

## 5. Como rodar localmente

Pré-requisito: **Python 3.10+**.

```bash
pip install -r requirements.txt
flask --app api/index run
```

Abra **http://localhost:5000**. Localmente o próprio Flask entrega os arquivos de `public/`.

Alternativas:

- `python api/index.py` (modo debug, recarrega ao salvar)
- `vercel dev` (simula a Vercel; precisa da [Vercel CLI](https://vercel.com/docs/cli))

O banco local fica na pasta temporária do sistema (`/tmp/frequencia_db.json` no Linux/Mac,
`%TEMP%\frequencia_db.json` no Windows). **Para voltar aos dados iniciais, apague esse arquivo**
e reinicie o servidor. Também é possível escolher o caminho com a variável `DB_PATH`.

---

## 6. Publicar na Vercel (passo a passo)

1. Suba o projeto para um repositório no **GitHub**.
2. Entre em **vercel.com** → *Add New…* → **Project** → **Import** o repositório.
3. Em *Framework Preset* deixe **Other**. Não precisa de build command.
   (O `vercel.json` já define `public` como saída e a rota `/api/*` para o Python.)
4. Em **Environment Variables**, crie `SECRET_KEY` com um texto longo e aleatório.
   Ex.: gere com `python -c "import secrets; print(secrets.token_hex(32))"`.
5. Clique em **Deploy**. Em ~1 minuto o site estará no ar em `https://seu-projeto.vercel.app`.
6. Teste: abra o site, clique em uma conta de demonstração e entre.

A cada `git push` na branch principal, a Vercel publica uma nova versão sozinha.

---

## 7. Limitações conhecidas (banco simulado)

Este projeto usa um **banco de dados simulado em JSON para fins acadêmicos**. Seja honesto(a) na apresentação:

- **Na Vercel o disco do projeto é somente leitura.** Só `/tmp` aceita gravação, e ele é
  **temporário**: quando a função fica parada alguns minutos ("dorme") ou é reiniciada, o `/tmp`
  é apagado e os dados **voltam ao `seed.json`**.
- A Vercel pode rodar **várias cópias** da função ao mesmo tempo, cada uma com seu próprio `/tmp`.
  Então duas pessoas podem, em raros casos, ver dados diferentes.
- O `threading.Lock` evita gravação simultânea **dentro de uma mesma cópia**, não entre cópias.
- O login **não se perde** quando o banco reseta, porque o token é assinado (HMAC) e carrega os
  dados do usuário. Mas contas criadas depois do último reset somem junto com o `/tmp`.
- Qualquer pessoa pode se cadastrar com qualquer perfil (inclusive Coordenação). Em um sistema real,
  só a coordenação criaria contas de professor e coordenação.

**Como trocar por um banco de verdade (PostgreSQL, MongoDB, etc.):** só o arquivo
`backend/database.py` muda. As rotas usam apenas `ler`, `salvar`, `inserir`, `buscar`, `buscar_um`,
`buscar_por_id`, `atualizar`, `excluir` e `excluir_onde`. Reescrevendo essas funções com SQL
(por exemplo, `psycopg` + PostgreSQL da Neon/Supabase), o resto do sistema continua igual.

---

## 8. Segurança aplicada

- Senhas com **PBKDF2-SHA256, 100.000 iterações e salt aleatório** (`auth.py`).
- Token **assinado com HMAC-SHA256** usando `SECRET_KEY`; expira em 7 dias; logout invalida a sessão.
- Rotas protegidas: sem token → **401** e o front volta ao login; perfil errado → **403**.
- Login com mensagem genérica ("E-mail ou senha incorretos") para não revelar e-mails cadastrados.
- Front-end usa **`escapar()`** antes de colocar qualquer dado no HTML (proteção contra XSS).
- Validação **dos dois lados**: no JavaScript (resposta rápida) e no Python (a que vale de verdade).

---

## 9. Roteiro de apresentação (5 a 8 minutos)

| Tempo | O que abrir | O que falar |
|---|---|---|
| 0:00–1:00 | **O site** na tela de login | "O Frequência+ substitui a chamada em papel. Tem três perfis: professor, aluno e coordenação." Entre como **professor**. |
| 1:00–2:15 | Tela **Chamada** | Faça uma chamada, marque uma falta e **salve**. Recarregue a página (F5): "continua logado e a chamada continua salva." Mostre o **Histórico**. |
| 2:15–3:00 | Saia e entre como **aluno** | Mostre o percentual, a **faixa de quadradinhos** e os alertas. Envie uma **justificativa**. |
| 3:00–3:45 | Entre como **coordenação** | Mostre os **4 cards**, o **gráfico feito só com CSS** (barra vermelha < 75%), alertas e aprove a justificativa. |
| 3:45–4:30 | Código: **árvore de pastas** e `vercel.json` | "Separei front (`public`), API (`api`) e regras (`backend`). A Vercel serve `public` como site e manda `/api` para o Python." |
| 4:30–5:30 | `public/js/pages/chamada.js` → `api.js` → `routes_chamada.py` | Siga o fluxo do botão **Salvar chamada** (seção 4). "O front nunca faz fetch fora do `api.js`." |
| 5:30–6:30 | `backend/database.py` | "É um banco simulado: cada tabela é uma lista no JSON. Na Vercel só o `/tmp` grava e ele é temporário. Para usar PostgreSQL, só este arquivo muda." |
| 6:30–7:30 | `backend/auth.py` | "Senha vira hash com salt. O token é assinado: se alguém mudar uma letra, a assinatura não bate. O decorador `@login_required` protege as rotas." |
| 7:30–8:00 | `ui.js` → `escapar()` | "Todo dado do usuário passa por aqui antes de ir pro HTML, para evitar XSS." Encerramento. |

**Frases curtas para usar:**

- "Uma tela = um arquivo em `pages/`. Uma rota = uma função no Python."
- "O front pede, a API valida, o `database.py` grava."
- "A validação no JavaScript é para conforto; a do Python é para segurança."
- "O banco é simulado de propósito, e eu sei exatamente onde trocar."
- "Sem framework e sem build: o navegador roda exatamente o código que vocês estão vendo."

### 5 perguntas que o professor pode fazer

1. **"Por que não guardar a senha direto no banco?"**
   Se o banco vazar, as senhas vazariam. Com hash PBKDF2 + salt não dá para voltar à senha original,
   e o salt faz duas senhas iguais terem hashes diferentes. No login eu recalculo o hash e comparo.

2. **"Como o sistema sabe quem está logado em cada requisição?"**
   No login o servidor devolve um token assinado com HMAC e a `SECRET_KEY`. O front guarda no
   `localStorage` e manda no header `Authorization: Bearer`. O `@login_required` confere a
   assinatura, a validade e se a sessão não foi encerrada no logout.

3. **"Os dados ficam salvos para sempre na Vercel?"**
   Não. Na Vercel só o `/tmp` é gravável e ele é apagado quando a função dorme. É uma limitação
   consciente do banco simulado. Em produção eu trocaria o `database.py` por PostgreSQL; as rotas
   não mudam porque só usam as funções `ler/inserir/buscar/atualizar/excluir`.

4. **"O que impede um aluno de chamar a API e cadastrar outro aluno?"**
   O decorador `@perfil_requerido("coordenacao")`. Mesmo que ele esconda/mostre botões no navegador,
   a API responde **403**. Esconder o botão no front é só experiência de usuário; a regra está no back.

5. **"Como você fez o gráfico sem biblioteca?"**
   Cada barra é uma `div` com `height` igual ao percentual da turma (ex.: `height: 80%`) dentro de
   uma área de altura fixa. Uma linha tracejada fica em `bottom: 75%`, e barras abaixo de 75% ganham
   a classe `risco` (vermelha). Está em `dashboard.js` (função `graficoBarras`) e `components.css`.

---

## 10. Checklist de testes

- [ ] **Criar conta**: aba "Criar conta" → tente enviar vazio (mensagens aparecem), e-mail inválido,
      senha com 5 caracteres, e-mail `aluno@demo.com` (já cadastrado). Depois crie uma válida → entra direto.
- [ ] **Login**: senha errada mostra "E-mail ou senha incorretos"; conta demo entra no painel.
- [ ] **Logout**: botão **Sair** na topbar → volta ao login; ao recarregar continua deslogado.
- [ ] **Sessão persistente**: logado, aperte F5 → continua logado na mesma tela.
- [ ] **Rota protegida**: sem login, acesse `/api/alunos` no navegador → `{"erro": "Você precisa estar logado."}` (401).
- [ ] **Fazer chamada**: professor → Chamada → escolha turma e data → marque faltas → **Salvar chamada** → toast verde.
- [ ] **Recarregar e conferir**: F5 → a mesma turma/data mostra "já registrada" com as faltas marcadas; aparece no **Histórico**.
- [ ] **Data futura**: tente salvar com data futura → erro.
- [ ] **Justificativa**: aluno envia justificativa de uma falta → coordenação aprova → no painel do aluno o quadradinho fica âmbar e o percentual sobe.
- [ ] **Criar, editar e excluir aluno**: coordenação → Alunos → Novo aluno → Editar → Excluir (modal de confirmação).
- [ ] **Turmas**: criar turma, editar, tentar excluir turma com alunos (erro 409), excluir turma vazia.
- [ ] **Editar nome**: Meu perfil → mudar nome → topbar e avatar atualizam.
- [ ] **Excluir conta**: Meu perfil → Excluir minha conta → confirmar → volta ao login; tentar entrar de novo falha.
- [ ] **Celular**: abra no celular (ou DevTools modo responsivo) → sidebar some, aparece menu inferior.
- [ ] **Tema escuro**: mude o sistema para modo escuro → as cores trocam sozinhas.
- [ ] **XSS**: cadastre um aluno com nome `<b>teste</b>` → aparece como texto, sem negrito.
