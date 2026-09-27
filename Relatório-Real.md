# Relatório real da auditoria do projeto

**Data da auditoria:** 27/09/2026  
**Escopo:** revisão somente de leitura do projeto, com foco em vulnerabilidades, controle de acesso, erros de sintaxe/execução, erros funcionais e erros de escrita.  
**Estado:** nenhum arquivo de código foi alterado. Este relatório é o único arquivo criado nesta etapa.

## Resumo

Foi identificado um risco de **XSS persistente**: valores fornecidos por usuários autenticados são salvos no Firestore e depois inseridos na página como HTML, sem escape. Um membro com acesso à família pode potencialmente executar JavaScript no navegador de outros membros ao fazer com que conteúdo malicioso seja renderizado.

As verificações de sintaxe/build não foram concluídas porque a versão de Node.js disponível não é compatível com a sintaxe de importação usada pelo projeto, e o Vite instalado também exige recursos de uma versão mais recente do Node. Não foi possível, portanto, concluir se há outros erros de sintaxe ou de execução por meio dessas verificações.

## Achados

### 1. XSS persistente em dados compartilhados

- **Severidade:** Alta
- **Confiança:** 9/10
- **Categoria:** injeção de HTML/JavaScript (XSS armazenado)
- **Arquivos envolvidos:** [script.js](./script.js) e [firestore.rules](./firestore.rules)

**Evidência:** nomes de categorias e descrições de despesas são gravados no Firestore e posteriormente interpolados em HTML usando `insertAdjacentHTML`/`innerHTML`, sem escape. Os pontos identificados na revisão são `script.js:303-330`, `script.js:363-384` e `script.js:725-750`. As regras em `firestore.rules:18-23` permitem que membros autenticados da mesma família criem registros compartilhados.

**Impacto:** um membro autenticado pode tentar armazenar conteúdo HTML com manipuladores de eventos ou outros vetores de execução. Quando a aplicação renderizar esse conteúdo, o script poderá executar na sessão de outros membros que visualizem o registro.

**Recomendação para uma etapa futura:** renderizar valores não confiáveis como texto com `textContent` e APIs de criação de elementos; evitar interpolá-los em HTML ou atributos. Validar a correção com dados controlados e testes de renderização.

## Verificações e limitações

- `git diff --check main...HEAD` não apontou problemas.
- O projeto não define um script de testes em `package.json`.
- A verificação sintática não foi concluída: Node.js 18.19 disponível não reconhece a sintaxe de atributos de import usada em `script.js`.
- O Vite instalado falha ao iniciar porque requer `node:util.styleText`, indisponível nessa versão do Node.js.
- O build não foi executado, para evitar alterações nos arquivos de saída em `dist`.
- As limitações acima significam que erros de sintaxe, build ou execução não foram descartados.

## Histórico de atualizações

| Data | Atualização |
|---|---|
| 27/09/2026 | Criação do relatório após auditoria somente de leitura. Nenhum código foi alterado. |

Em futuras alterações do projeto, atualizar este relatório para registrar as correções realizadas e o resultado das verificações pertinentes.
