# Controle Financeiro Familiar

Um dashboard interativo e completo para gestão de finanças pessoais e familiares, desenvolvido para ajudar no controle de despesas mensais com visualizações claras e indicadores inteligentes.

## 🚀 Funcionalidades

- **Login com e-mail e senha**: cadastro e autenticação por Supabase Auth, sem Google OAuth.
- **Tela de entrada dedicada**: antes do painel, o app apresenta uma página de login responsiva, com cadastro e mensagens de autenticação.
- **Famílias isoladas**: a primeira pessoa que entrar cria a família e define seu nome; somente o responsável pode gerar um convite. Cada conta pode participar de uma única família.
- **Convites privados**: links usam tokens aleatórios e deixam de funcionar quando um novo convite é gerado. O acesso é isolado com políticas RLS no PostgreSQL.
- **Painel de Indicadores (Visão Geral)**: 
  - Cálculo instantâneo do Total em Aberto, Total Pago, Total Geral e Total Atrasado.
  - Divisão de gastos por tipo (Fixo, Variável, Parcelado).
  - Cálculo inteligente do **Gasto Médio Mensal** baseado em todo o histórico acumulado no banco de dados.
- **Gestão de Despesas**:
  - Cadastro de novas despesas com informações detalhadas: descrição, valor, tipo, data de vencimento e categoria.
  - Edição e exclusão rápida de registros.
  - Status inteligente de pagamento: "Pago", "Em aberto" ou "Atrasado" (calculado automaticamente com base na data de hoje e no vencimento).
  - Destaque visual e ícone de alerta em vermelho para contas vencidas.
- **Gráfico Interativo**: Distribuição visual dos gastos, facilitando o entendimento de onde o dinheiro está sendo alocado. É possível alternar entre diferentes formatos de visualização.
- **Filtro por Mês**: Navegue facilmente pelos meses para ver os dados específicos de cada período.
- **Personalização de Tema**: Opção para trocar a cor principal do aplicativo através das configurações.

## 🛠️ Tecnologias Utilizadas

Este projeto foi construído utilizando as seguintes tecnologias:

- **HTML5 & CSS3**: Estrutura e estilização moderna.
- **Tailwind CSS**: Framework CSS para estilização rápida, responsiva e utilitária (configurado via Vite).
- **JavaScript (ES6+)**: Lógica da aplicação e manipulação do DOM.
- **Supabase**:
  - *PostgreSQL*: banco relacional para famílias, despesas, rendas e categorias.
  - *Supabase Auth*: cadastro e login por e-mail e senha.
  - *Row Level Security (RLS)*: isolamento dos dados por família.
  - *Realtime*: atualização dos dados enquanto outras pessoas da família os alteram.
- **Highcharts**: Biblioteca para a renderização dos gráficos de distribuição de gastos.
- **Vite**: Ferramenta de build e servidor de desenvolvimento ultra-rápido.

## 📦 Como executar localmente

1. **Pré-requisitos**: use Node.js 20.19+ ou 22.12+, conforme os requisitos do Vite 8.
2. **Instalação das dependências**:
   No terminal, navegue até a pasta do projeto e execute:
   ```bash
   npm install
   ```
3. **Executando o projeto**:
   ```bash
   npm run dev
   ```
4. Abra `http://localhost:3000/`; quem ainda não entrou será direcionado à tela de login.

### Configuração do Supabase

1. Crie um projeto em [supabase.com](https://supabase.com/).
2. No painel, abra **Project Settings > API** e copie a **Project URL** e a chave pública **anon/publishable**.
3. Copie `.env.example` para `.env` e preencha:
   ```dotenv
   VITE_SUPABASE_URL=https://seu-projeto.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-chave-publica-anon
   ```
   Nunca coloque a chave `service_role` no navegador ou no repositório.
4. No **SQL Editor** do Supabase, execute o conteúdo de `supabase-schema.sql`. O script cria tabelas, RLS, funções para criação de família/convite e publicação Realtime.
5. Mantenha o schema `private` fora de **Project Settings > API > Exposed schemas**. As funções `SECURITY DEFINER` ficam nesse schema, enquanto o app chama wrappers `SECURITY INVOKER` no schema `public`.
6. Em **Authentication > URL Configuration**, configure a URL local de redirecionamento `http://localhost:3000/**` e os domínios de produção usados pelo sistema.
7. Em **Authentication > Password Security**, habilite **Leaked password protection**.
8. Inicie ou reinicie `npm run dev` depois de criar `.env`.

### Publicação na Vercel

1. Importe este repositório na Vercel como um projeto Vite. O arquivo `vercel.json` define `npm run build` e a pasta de saída `dist`; o projeto requer Node.js 22.12 ou superior.
2. Em **Project Settings > Environment Variables**, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` para os ambientes desejados (Production, Preview e/ou Development), usando a URL do projeto e a chave pública anon/publishable do Supabase. Não use a chave `service_role`.
3. Faça o deploy. Se alterar variáveis depois, faça um novo deploy para que elas sejam incorporadas ao build.
4. No Supabase, em **Authentication > URL Configuration**, defina **Site URL** como o domínio de produção atribuído pela Vercel e inclua esse domínio nos **Redirect URLs**. Inclua também os domínios Preview que pretende usar para testar confirmação de e-mail e convites.

`VITE_SUPABASE_URL` deve ser somente a URL HTTP(S) mostrada no painel do Supabase (formato `https://<project-ref>.supabase.co`), sem texto adicional, chaves ou espaços. Se a URL estiver inválida, a tela de login exibirá uma mensagem de configuração e o formulário ficará desabilitado até um novo deploy com a variável corrigida.

Se a versão anterior de `supabase-schema.sql` já foi executada, rode `supabase-security-hardening.sql` no SQL Editor para mover as funções privilegiadas para `private` sem recriar as tabelas.

Para compartilhar, crie uma conta e informe o nome da família após entrar. O responsável pode gerar o link em **Configurações**; outras pessoas criam suas próprias contas e entram pelo convite. Cada conta pode pertencer a uma única família.

**Dados anteriores:** a troca não exclui nem transfere automaticamente os registros que continuam no Firebase. O Supabase começa vazio; os dados antigos permanecem no projeto Firebase. Exporte-os e importe-os separadamente se precisar deles no novo banco.

## 📁 Estrutura de Arquivos Principal

- `index.html`: Interface do usuário, estrutura do painel, modais e formulários.
- `login.html`: página de entrada apresentada antes do painel.
- `login.js`: fluxo de cadastro/login por e-mail e senha.
- `supabase.js`: inicialização do cliente Supabase usando variáveis locais.
- `supabase-schema.sql`: schema PostgreSQL, funções e políticas RLS.
- `style.css`: Importação base do Tailwind CSS.
- `script.js`: lógica da aplicação, integração com Supabase, CRUD e renderização do gráfico.
- `package.json`: Lista das dependências do projeto e scripts de execução.
