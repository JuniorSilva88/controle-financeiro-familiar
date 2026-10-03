# Relatório real da auditoria e das alterações

**Atualizado em:** 27/09/2026
**Estado:** URL e chave pública configuradas somente no `.env` local; conexão com o serviço Auth confirmada; o aviso do Database Linter confirma que as funções do schema inicial existem no projeto remoto; a migration de hardening e a configuração de senha ainda estão pendentes.

## Implementado nesta migração

- Substituído o login Google/Firebase por cadastro e autenticação com e-mail e senha no Supabase Auth.
- A tela de entrada permite alternar entre entrar e criar uma conta e preserva o token do convite durante confirmação por e-mail.
- Substituído o acesso a despesas, categorias, rendas e convites por consultas ao Supabase/PostgreSQL.
- Criado [supabase-schema.sql](./supabase-schema.sql) com tabelas, índices, funções para criação de família/convite, políticas RLS e inscrição das tabelas no Realtime.
- O schema SQL atualizado define as funções `SECURITY DEFINER` no schema não exposto `private`; o app usa wrappers `SECURITY INVOKER` no schema público. Para o banco remoto que já executou a versão inicial, foi preparado [supabase-security-hardening.sql](./supabase-security-hardening.sql). Essa migração ainda não foi executada no projeto remoto.
- Mantido o modelo de uma família por conta, com convites aleatórios e dados isolados por `family_id`.
- A URL e a chave pública informadas foram guardadas somente em `.env`; o arquivo está ignorado pelo Git. [.env.example](./.env.example) contém valores vazios de exemplo.
- Removidos do código os arquivos e dependências do Firebase. Os dados já armazenados no Firebase **não são apagados**, mas também **não são transferidos** para o Supabase. A migração de dados antigos não foi solicitada.

## Configuração necessária antes de usar

1. Executar [supabase-security-hardening.sql](./supabase-security-hardening.sql) no SQL Editor, pois o schema inicial já está presente no projeto indicado pelo aviso do linter.
2. Configurar a URL de redirecionamento de confirmação de e-mail em **Authentication > URL Configuration** (incluindo `http://localhost:3000/login.html`).
3. Ativar **Authentication > Password Security > Leaked password protection**.
4. Reiniciar o servidor Vite após qualquer alteração em `.env`.

Nenhuma chave `service_role` deve ser colocada no navegador ou no repositório. Sem as etapas acima, a tela informa que falta configurar o Supabase e as operações de dados não estarão disponíveis.

O alerta do Supabase Auth sobre proteção contra senhas vazadas exige uma configuração no painel: **Authentication > Password Security > Leaked password protection**. Não pode ser habilitado pelo schema SQL deste projeto.

## Achados de segurança

### XSS persistente em valores compartilhados — corrigido

- **Severidade:** Alta
- **Confiança:** 9/10
- **Estado:** corrigido em 03/10/2026
- **Arquivo:** [script.js](./script.js)

Os dados controlados por usuários nas categorias, mensagens e linhas de despesas agora são inseridos por APIs seguras do DOM, como `textContent`, em vez de serem interpolados em HTML. A alteração foi validada com `node --check script.js` e `git diff --check`.

**Validação adicional recomendada:** testar no navegador nomes de despesas e categorias com caracteres HTML para confirmar a renderização literal.

## Verificações e limitações

- A dependência `@supabase/supabase-js` foi adicionada ao projeto.
- `node --check` para `login.js`, `script.js` e `supabase.js`: aprovado.
- `npm run build -- --outDir /tmp/controle-financeiro-supabase-build`: aprovado.
- `git diff --check`: aprovado.
- A página de login local reconhece a configuração Supabase e habilita o formulário.
- Consulta de sessão ao Supabase Auth respondeu sem erro; ainda não existe sessão de usuário.
- O redirecionamento do painel para a tela de login foi validado preservando o token de convite.
- O fluxo real de cadastro, login, criação de família, convite e isolamento RLS ainda não pôde ser testado porque não foi criada uma conta de teste.
- O SQL de hardening foi preparado para executar no projeto existente. Não foi executado remotamente; o linter ainda precisa ser reexecutado depois da migração.
- A proteção contra senhas vazadas continua pendente da ativação manual no painel do Supabase.
- Os dados antigos do Firestore permanecem no projeto Firebase original; nenhuma operação de exclusão ou migração remota foi feita.

## Histórico

| Data | Atualização |
|---|---|
| 27/09/2026 | Auditoria inicial identificou XSS persistente em dados compartilhados. |
| 27/09/2026 | Criadas tela de login, famílias e convites; o login Firebase foi substituído por Supabase Auth e as operações de banco por PostgreSQL/RLS. Criado schema SQL e documentada a configuração pendente. Nenhum dado remoto do Firebase foi apagado ou copiado. XSS continua pendente. |
| 27/09/2026 | Preparada migration para mover funções `SECURITY DEFINER` para `private`, fora do Data API, mantendo RPCs públicos `SECURITY INVOKER`. Registrado que a migration ainda precisa ser executada e que a proteção contra senhas vazadas precisa ser habilitada no painel. |
