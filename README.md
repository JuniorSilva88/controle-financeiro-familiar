# Controle Financeiro Familiar

Um dashboard interativo e completo para gestão de finanças pessoais e familiares, desenvolvido para ajudar no controle de despesas mensais com visualizações claras e indicadores inteligentes.

## 🚀 Funcionalidades

- **Autenticação Segura**: Login através da conta do Google (via Firebase Auth) para garantir que seus dados sejam privados e salvos na nuvem.
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
- **Firebase**: 
  - *Firestore Database*: Banco de dados NoSQL em tempo real para armazenamento das despesas.
  - *Firebase Authentication*: Para login de usuários via Google.
- **Chart.js**: Biblioteca para a renderização dos gráficos de distribuição de gastos.
- **Vite**: Ferramenta de build e servidor de desenvolvimento ultra-rápido.

## 📦 Como executar localmente

1. **Pré-requisitos**: Certifique-se de ter o [Node.js](https://nodejs.org/) instalado em sua máquina.
2. **Instalação das dependências**:
   No terminal, navegue até a pasta do projeto e execute:
   ```bash
   npm install
   ```
3. **Executando o projeto**:
   ```bash
   npm run dev
   ```
4. O servidor local será iniciado (normalmente em `http://localhost:3000` ou `http://localhost:5173`).

> **Aviso**: É necessário configurar um arquivo `firebase-applet-config.json` na raiz do projeto com as credenciais do seu projeto do Firebase para que a autenticação e o banco de dados funcionem corretamente.

## 📁 Estrutura de Arquivos Principal

- `index.html`: Interface do usuário, estrutura do painel, modais e formulários.
- `style.css`: Importação base do Tailwind CSS.
- `script.js`: Toda a lógica central da aplicação (integração com Firebase, manipulação de estado, CRUD e renderização do gráfico).
- `package.json`: Lista das dependências do projeto e scripts de execução.
