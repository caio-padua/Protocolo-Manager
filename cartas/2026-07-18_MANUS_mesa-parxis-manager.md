# CARTA-MISSAO — MESA ARQUITETURAL PARXIS / REPLIT MANAGER

> De: Manus AI, arquiteto relator
> Para: Dr. Replit Paxter, guardiao do repositorio Protocolo-Manager
> Presidente e arbitro: Dr. Caio Henrique Fernandes Padua
> Mesa: PAC-20260718-001
> Tipo: INVESTIGATION
> Estado: AGUARDA AUTORIZACAO DO CEO PARA APRESENTACAO
> Convencao: ASCII simples para comunicacao entre agentes.

---

## CONCLUSAO PRIMEIRO

O CEO deseja transformar o Parxis em um SaaS multi-tenant modular sem perder o sistema clinico que ja utiliza no Instituto Padua. Manus preparou uma arquitetura inicial. Sua missao NAO e implementar nem concordar por educacao. Sua missao e confrontar a proposta com o estado REAL do Manager e devolver evidencias, riscos, ajustes e recomendacao.

Esta carta NAO autoriza codigo, migration, seed, alteracao de banco, segredo, configuracao, tela, rota, commit funcional, push ou deploy. A unica escrita permitida nesta rodada e o parecer Markdown solicitado abaixo.

## LEITURA OBRIGATORIA, NESTA ORDEM

1. `docs/mesa-parxis/00_BRIEFING-CEO.md`
2. `docs/mesa-parxis/01-fronteiras-manager-ihe-saas.md`
3. `docs/mesa-parxis/02-protocolo-mesa-arquitetural.md`
4. `docs/mesa-parxis/03-especificacao-parxis-saas-v1.md`
5. `docs/mesa-parxis/04-matriz-decisoes.md`
6. `docs/mesa-parxis/manifest.sha256`
7. `.agents/skills/paxter-loop/CODIGO-PAXTER.md`
8. `.agents/skills/paxter-loop/SKILL.md`
9. `replit.md`

Confirme o `sha256` antes do parecer. Se o hash falhar, pare e registre `PACOTE_DIVERGENTE`.

## OBJETIVO DA SUA ANALISE

Determinar se a arquitetura proposta pode evoluir o Manager para produto licenciado por clinica preservando operacao, dados, regras clinicas, autonomia dos tenants e independencia do IHE.

## PERGUNTAS QUE O MANAGER DEVE RESPONDER

| ID | Pergunta |
|---|---|
| M01 | Qual e o mapa REAL de identidade, login, colaboradores, profissionais, cargos, sessoes e vinculos com `empresas`? |
| M02 | Como o tenant e resolvido hoje em cada familia de rotas e onde existem ID fixo, fallback, parametro confiado ou ausencia de filtro? |
| M03 | Quais tabelas sao globais, raiz de tenant, filhas, catalogos hibridos e registros assistenciais? Quais estao ambiguas? |
| M04 | Onde o `moduleGuard` e aplicado de verdade e quais menus/rotas continuariam acessiveis sem modulo? |
| M05 | O bounded context de controle SaaS pode nascer isolado neste monorepo sem contaminar o financeiro dos pacientes? |
| M06 | Quais campos atuais de `empresas`, arvore de licenciamento, contratos e modulos devem ser preservados, migrados ou aposentados? |
| M07 | Como implementar Instituto Padua como tenant comum com fatura `WAIVED`, sem `isPlatformOwner` virar bypass clinico? |
| M08 | O pacote inicial `CLIENT_REGISTRY + INJECTABLE_PROTOCOLS` e realmente isolavel e vendavel? Quais dependencias ocultas impedem o piloto? |
| M09 | Que informacao o Manager precisa receber do IHE, por contrato, sem banco compartilhado nem dependencia online? |
| M10 | Qual e o menor Gate 0 seguro antes de cadastrar uma clinica externa real? |

## EVIDENCIAS MINIMAS

O parecer deve conter, sem revelar valores sensiveis:

1. Matriz de familias de rotas: autenticacao, tenant, entitlement, capacidade e propriedade do recurso.
2. Mapa de tabelas e caminhos de heranca de tenant, com contagens e ambiguidades.
3. Lista de usos de ID fixo, `NULL = Instituto`, `isPlatformOwner`, `empresaId` vindo do cliente e fallback permissivo.
4. Inventario das tabelas e telas SaaS ja existentes, incluindo duplicidades internas.
5. Estado do typecheck, testes e backup/restore relevante para o Gate 0.
6. Lista de segredos ou certificados versionados apenas por CAMINHO e estado de revogacao; nunca mostrar o conteudo.
7. Recomendacao `APROVAR`, `APROVAR_COM_RESSALVAS` ou `REJEITAR` para cada item D01-D14 da matriz.

## LINHAS VERMELHAS

1. Nao tocar em banco, runtime, secrets, deploy ou integracoes.
2. Nao corrigir achado durante a investigacao; apenas registrar caminho, impacto e prioridade.
3. Nao presumir a arquitetura do IHE. Pergunte na rodada R2 se faltar evidencia do primo.
4. Nao fundir sistemas, compartilhar senha, token, tabela ou banco.
5. Nao declarar rota segura porque o menu esta oculto.
6. Nao autorizar construcao. O CEO decide em etapa separada.
7. Nao incluir dado clinico identificavel no parecer.

## FORMATO E LOCAL DA RESPOSTA

Crie somente:

`cartas/respostas/PAC-20260718-001-manager-r1.md`

Use exatamente o formato R1 definido em `docs/mesa-parxis/02-protocolo-mesa-arquitetural.md`, incluindo evidencias, ressalvas, menor Gate 0 e a declaracao final `SEM_CODIGO`.

Ao concluir, responda ao CEO em Densidade B com:

1. status do parecer;
2. tres riscos mais importantes;
3. recomendacao final;
4. caminho do arquivo;
5. `RESUMO EM 1 LINHA`.

## DEFINICAO DE PRONTO

| Criterio | Evidencia esperada |
|---|---|
| Pacote verificado | Hash conferido |
| Estado real investigado | Arquivos, linhas, consultas somente leitura e testes citados |
| D01-D14 julgados | Classificacao e justificativa para cada decisao |
| Gate 0 proposto | Sequencia minima, reversivel e sem feature nova |
| Resposta salva | Arquivo no caminho exato |
| Nenhuma implementacao | Diff limitado ao parecer Markdown |

## RESUMO EM 1 LINHA

Dr. Replit Manager: confronte a arquitetura com o Manager real, responda com evidencia no arquivo indicado e nao altere absolutamente nada alem do parecer.
