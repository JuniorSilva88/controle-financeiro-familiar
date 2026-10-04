# Relatório de migração, segurança e publicação

**Atualizado em:** 04/10/2026
**Aplicação:** [Finanças Familiar](https://controle-financeiro-familiar-dusky-one.vercel.app)
**Hospedagem:** Vercel
**Backend:** projeto Supabase `Despesas-Familiar`

## Estado atual

- A aplicação foi migrada de Firebase/Firestore para Supabase Auth e PostgreSQL.
- O painel e a tela de login estão publicados na Vercel. O build de produção foi reportado como concluído com sucesso e o usuário confirmou que a tela de login passou a abrir após a configuração multi-page do Vite.
- O frontend exige `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. A URL deve ser HTTP(S), e somente a chave pública anon/publishable pode ser usada no navegador.
- Dados remotos do Firebase não foram apagados nem migrados automaticamente.
- O fluxo de criar conta, entrar, criar família, convidar outro usuário e validar isolamento RLS entre duas contas ainda precisa de testes funcionais dedicados.

## Migração e arquitetura

- Supabase Auth substituiu o login Firebase.
- Tabelas PostgreSQL cobrem famílias, membros, convites, despesas, categorias e rendas.
- Os dados de aplicação são associados a `family_id` e protegidos por Row Level Security.
- As funções privilegiadas estão no schema não exposto `private`; wrappers RPC públicos usam `SECURITY INVOKER`.
- O Realtime atualiza despesas, categorias e rendas.
- Vite está configurado como build multi-page, com `index.html` e `login.html` como entradas independentes; a saída é `dist/`.
- O Highcharts está fixado em `12.4.0` no lockfile e incluído no bundle local, sem baixar scripts executáveis do CDN em tempo de execução.

## Revisão de segurança antes da publicação

Foi feita uma revisão focada no frontend publicado: segredos, XSS/injeção DOM, autenticação/sessão, acesso Supabase/RLS e recursos externos.

| Achado | Severidade | Estado | Tratamento |
|---|---|---|---|
| Highcharts carregado de URLs CDN mutáveis, sem versão fixada nem SRI (`index.html`) | Média | Corrigido localmente em 04/10/2026 | Dependência `highcharts@12.4.0` exata no npm; removidos os dois scripts CDN do HTML e importados pelo bundle do Vite. |
| Inserção de dados controlados pelo usuário no DOM | Alta (histórico) | Corrigido | Categorias, mensagens e linhas de despesas usam criação de elementos e `textContent` em vez de interpolação de conteúdo fornecido pelo usuário em HTML. |
| Dependência Express não utilizada trazia versões vulneráveis de `qs` | Moderada | Corrigido localmente em 04/10/2026 | Express foi removido; a aplicação Vercel é estática e usa Vite Preview localmente. O campo obsoleto `main: server.js` também foi removido. |

A correção do Highcharts precisa ser incluída no próximo commit/deploy para passar a proteger a versão hospedada. A revisão não encontrou outras vulnerabilidades acionáveis no escopo analisado. Isso não equivale a teste de penetração nem a uma certificação de segurança do serviço Supabase.

### Testes/verificações de segurança realizados

- Busca no código versionado por `service_role`, secret keys e credenciais administrativas expostas no frontend.
- Busca por padrões conhecidos de execução/inserção dinâmica de HTML no JavaScript.
- Inspeção das configurações RLS, funções Supabase e uso de sessão pelo cliente.
- Revisão de dependência externa de scripts e mitigação do Highcharts por empacotamento local com versão exata.
- Auditoria de dependências npm: a primeira execução encontrou dois avisos moderados em `qs`, dependência transitiva do Express não utilizado. Express foi removido; nova execução de `npm audit` encontrou zero vulnerabilidades.
- `node --check` nos módulos JS alterados e `git diff --check`.

## Validação técnica e limitações

- Os módulos JavaScript alterados passaram em `node --check`.
- `npm audit`: aprovado, zero vulnerabilidades conhecidas no grafo atual de dependências.
- `npm run build` executado com Node.js 24.21.0: aprovado; o bundle gera `dist/index.html`, `dist/login.html` e empacota Highcharts localmente.
- `git diff --check`: aprovado após revisão da documentação.
- Configuração Vite multi-page e JSON da Vercel foram revisados; a configuração define `index.html` e `login.html` como entradas.
- O build anterior na Vercel terminou com `✓ built` e `Deployment completed`, antes desta atualização. A correção atual precisa de novo deploy para ser aplicada no domínio.
- O Node.js padrão deste ambiente é 18, abaixo dos requisitos de Vite/Rolldown; a validação do build foi executada com Node.js 24.21.0.
- O novo deploy deve ser conferido para garantir que o bundle publicado inclui Highcharts localmente e que ambos os documentos HTML são servidos.
- Não foram executados testes reais com contas familiares independentes para confirmar autorização, fluxo de convite ou isolamento RLS.
- A migration `supabase-security-hardening.sql` não foi confirmada como executada no projeto remoto; verificar o estado real antes de aplicá-la.
- A configuração de proteção contra senhas vazadas depende do plano e das opções disponíveis no projeto Supabase; verificar no painel.

## Configuração operacional

- Vercel: definir `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` para Production (e Preview se usado), depois executar novo deploy quando mudarem.
- Supabase: configurar **Site URL** e **Redirect URLs** para o domínio de produção `https://controle-financeiro-familiar-dusky-one.vercel.app`.
- Não colocar `service_role`, secret keys ou credenciais administrativas no frontend, em variáveis `VITE_*` ou no repositório.
- Manter o schema `private` fora de **Exposed schemas** da Data API.

## Dados do Firebase

Os dados existentes no Firestore continuam no projeto Firebase original. Nenhuma exclusão remota foi feita. A migração de dados exige backup/exportação e transformação para associar cada despesa aos campos obrigatórios `family_id` e `user_id` do novo banco. Só excluir o banco antigo depois de confirmar o backup e a importação.

## Histórico

| Data | Atualização |
|---|---|
| 27/09/2026 | Auditoria inicial; substituição do Firebase pelo Supabase; criação de autenticação, schema SQL, famílias e convites. |
| 03/10/2026 | Correções de XSS por construção segura do DOM e ajustes de sessão/Realtime; criação da configuração de build da Vercel. |
| 04/10/2026 | Corrigido build multi-page para publicar `login.html`; diagnosticada URL do Supabase inválida na configuração da Vercel. |
| 04/10/2026 | Revisão pré-publicação identificou scripts Highcharts mutáveis via CDN; pacote fixado e incorporado no build local, aguardando deploy. README e relatório atualizados. |
