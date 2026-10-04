# Finanças Familiar

Aplicação web para organizar as despesas, rendas e categorias de uma família, com autenticação por e-mail, compartilhamento por convite e dados isolados por políticas RLS no Supabase.

## Aplicação

A versão publicada está disponível em:

**[https://controle-financeiro-familiar-dusky-one.vercel.app](https://controle-financeiro-familiar-dusky-one.vercel.app)**

## Funcionalidades

- Cadastro e login por e-mail e senha com Supabase Auth.
- Criação de uma família para uma nova conta ou entrada por link de convite.
- Despesas recorrentes e parceladas, com edição, exclusão e situação de pagamento.
- Resumo mensal, indicadores financeiros, filtros e gráficos.
- Rendas mensais e categorias personalizadas.
- Atualização de dados em tempo real para membros da mesma família.
- Políticas RLS para separar os registros por família.

## Tecnologias

- HTML, CSS, JavaScript e Tailwind CSS.
- Vite 8 para desenvolvimento e build.
- Supabase Auth, PostgreSQL, Row Level Security e Realtime.
- Highcharts 12.4.0, empacotado localmente como dependência fixada.
- Vercel para hospedagem.

## Executar localmente

Requisitos: Node.js 22.12 ou superior e npm.

```bash
npm install
cp .env.example .env
```

Preencha `.env` com a URL do projeto Supabase e sua chave pública:

```dotenv
VITE_SUPABASE_URL=https://seu-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica-anon-ou-publishable
```

Inicie o servidor:

```bash
npm run dev
```

Abra <http://localhost:3000>. O build de produção pode ser gerado com:

```bash
npm run build
```

O Vite produz `dist/index.html` e `dist/login.html`; a aplicação usa os dois documentos como entradas independentes.

## Configurar o Supabase

1. Crie um projeto no [Supabase](https://supabase.com/).
2. Copie a **Project URL** e a chave pública **anon/publishable** em **Project Settings → API Keys**.
3. No SQL Editor do Supabase, execute [`supabase-schema.sql`](./supabase-schema.sql).
4. Mantenha o schema `private` fora da lista **Exposed schemas** da Data API. As funções privilegiadas ficam nesse schema; a aplicação chama wrappers públicos `SECURITY INVOKER`.
5. Em **Authentication → URL Configuration**, configure a URL do site e os redirects para os ambientes usados, por exemplo `http://localhost:3000/**` e o domínio de produção.
6. Confira as opções de segurança disponíveis para autenticação por senha no plano do projeto.

Se o banco remoto já recebeu uma versão inicial diferente do schema atual, revise [`supabase-security-hardening.sql`](./supabase-security-hardening.sql) e aplique-o somente se corresponder ao estado real do banco. Não execute migrations remotamente sem conferir o SQL e o estado das funções.

## Publicar na Vercel

O repositório está preparado para deploy estático com Vite: [`vercel.json`](./vercel.json) define `npm run build` e a saída `dist`.

1. Importe o repositório GitHub `JuniorSilva88/controle-financeiro-familiar` na Vercel e use `main` como branch de produção.
2. Em **Project → Settings → Environment Variables**, crie:
   - `VITE_SUPABASE_URL`: somente a URL HTTP(S) do projeto Supabase.
   - `VITE_SUPABASE_ANON_KEY`: a chave pública anon/publishable.
3. Habilite as variáveis para **Production** e, se necessário, **Preview**. Mudanças exigem um novo deploy para serem incorporadas ao frontend.
4. Em **Supabase → Authentication → URL Configuration**, configure a URL de produção `https://controle-financeiro-familiar-dusky-one.vercel.app` como **Site URL** e adicione `https://controle-financeiro-familiar-dusky-one.vercel.app/**` em **Redirect URLs**.

> `VITE_` significa que o valor é incluído no JavaScript enviado ao navegador. Use apenas a chave pública anon/publishable. Nunca use `service_role`, secret keys ou credenciais administrativas no frontend, em variáveis `VITE_*` ou no Git.

## Dados antigos do Firebase

A migração para Supabase não copia nem exclui automaticamente os dados do Firestore. Os dados antigos permanecem no projeto Firebase original. Faça um backup, exporte e valide os registros antes de qualquer exclusão. A tabela nova `public.despesas` exige `family_id` e `user_id`, portanto os dados importados precisam ser associados à família e à conta corretas.

## Arquivos principais

- [`index.html`](./index.html): painel.
- [`login.html`](./login.html) e [`login.js`](./login.js): autenticação e cadastro.
- [`script.js`](./script.js): lógica do painel, dados, renderização e gráficos.
- [`supabase.js`](./supabase.js): configuração do cliente Supabase.
- [`supabase-schema.sql`](./supabase-schema.sql): schema, funções, RLS e configuração do Realtime.
- [`supabase-security-hardening.sql`](./supabase-security-hardening.sql): hardening para instalações que já receberam a versão inicial do schema.
- [`vite.config.js`](./vite.config.js) e [`vercel.json`](./vercel.json): build multi-page e hospedagem.
- [`Relatório-Real.md`](./Relatório-Real.md): histórico da migração, verificações e pendências operacionais.
