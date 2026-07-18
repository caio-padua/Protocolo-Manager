# SPEC — Parxis Bridge de Colaboração Arquitetural

**Data:** 17/07/2026
**Autor:** Manus AI
**Status:** ESPECIFICADO — aguardando construção e revisão

## Objetivo

Criar um protocolo local, versionável e validável para o CEO, o arquiteto Manus e o agente desenvolvedor Replit trocarem missões, respostas, evidências, perguntas e aprovações sem depender de cartas soltas ou de memória de sessão.

## Requisitos exatos

1. A ferramenta será executada por `node tools/parxis-bridge/cli.mjs` e usará apenas bibliotecas nativas do Node.js.
2. Os dados canônicos ficarão em `.agents/bridge/missions/*.json`; cada missão terá uma versão Markdown em `.agents/bridge/rendered/*.md` para leitura humana.
3. O comando `init` criará a estrutura e o índice sem apagar conteúdo existente.
4. O comando `create <draft.json>` validará o rascunho, gerará identificador sequencial `PXB-AAAAMMDD-NNN`, persistirá a missão e atualizará o índice.
5. Toda missão conterá, no mínimo: título, objetivo, tipo, solicitante, destinatário, caminho da especificação, escopo incluído, escopo excluído, requisitos, linhas vermelhas e critérios de aceite.
6. O campo de pergunta bloqueante aceitará zero ou uma pergunta por mensagem, preservando a regra “uma pergunta por vez”.
7. O comando `reply <id> <response.json>` anexará uma resposta validada, exigindo resumo, evidências, achados e recomendação; uma resposta do executor levará a missão para revisão do arquiteto.
8. O comando `transition <id> <status> --actor <ator> --note <nota>` aplicará apenas transições permitidas e registrará histórico append-only.
9. A ferramenta impedirá `BUILD_AUTHORIZED` antes de `APPROVED`.
10. O comando `queue [ator]` mostrará as missões que aguardam aquele ator; os atores canônicos serão `CEO`, `MANUS_ARCHITECT` e `REPLIT_EXECUTOR`.
11. O comando `show <id>` exibirá a versão Markdown atual; `render [id]` regenerará as versões legíveis.
12. O comando `validate [id]` verificará todas as missões ou uma missão específica e retornará código de saída diferente de zero se houver inconsistência.
13. Cartas renderizadas para outro agente usarão texto ASCII simples, sem acentos, mantendo os dados JSON em UTF-8 como fonte canônica.
14. O índice conterá apenas metadados de fila e nunca substituirá as missões como fonte da verdade.
15. A ferramenta não fará chamadas de rede, não executará código contido nas missões e não enviará alterações ao GitHub.
16. Será incluído um README com fluxo operacional claro para CEO, Manus e Replit, além de modelos de missão e resposta.

## Estados e transições

| Estado atual | Próximos estados permitidos |
|---|---|
| `DRAFT` | `READY_FOR_REPLIT`, `CANCELED` |
| `READY_FOR_REPLIT` | `REPLIT_WORKING`, `BLOCKED`, `CANCELED` |
| `REPLIT_WORKING` | `NEEDS_MANUS_REVIEW`, `NEEDS_CEO_DECISION`, `BLOCKED` |
| `NEEDS_MANUS_REVIEW` | `READY_FOR_REPLIT`, `APPROVED`, `NEEDS_CEO_DECISION`, `BLOCKED` |
| `NEEDS_CEO_DECISION` | `READY_FOR_REPLIT`, `APPROVED`, `CANCELED` |
| `APPROVED` | `BUILD_AUTHORIZED`, `CANCELED` |
| `BUILD_AUTHORIZED` | `REPLIT_WORKING`, `IMPLEMENTED`, `BLOCKED` |
| `IMPLEMENTED` | `NEEDS_MANUS_REVIEW`, `VERIFIED`, `BLOCKED` |
| `VERIFIED` | `CLOSED` |
| `BLOCKED` | `READY_FOR_REPLIT`, `NEEDS_MANUS_REVIEW`, `NEEDS_CEO_DECISION`, `CANCELED` |
| `CLOSED` | Nenhum |
| `CANCELED` | Nenhum |

## Casos extremos

| Caso | Tratamento obrigatório |
|---|---|
| Rodar `init` duas vezes | Preservar todos os arquivos e reconstruir apenas o índice |
| Rascunho inválido | Não criar missão parcial; informar todos os campos ausentes |
| Identificador concorrente | Usar criação exclusiva e tentar o próximo número sem sobrescrever |
| Missão desconhecida | Retornar erro claro e código de saída diferente de zero |
| Transição proibida | Não alterar arquivo nem histórico |
| Duas perguntas bloqueantes | Rejeitar a entrada |
| Resposta sem evidência | Rejeitar a resposta |
| Markdown desatualizado | `validate` detecta; `render` corrige |
| Conteúdo com acentos | Preservar no JSON e transliterar somente a carta Markdown entre agentes |
| Caminho de especificação inexistente | Alertar na validação; bloquear `READY_FOR_REPLIT` |

## Definição de PRONTO

| Critério | Evidência |
|---|---|
| Estrutura criada | Diretórios, README, modelos, índice e utilitário presentes |
| Fluxo válido | Criar missão de exemplo, colocá-la em `READY_FOR_REPLIT`, responder e chegar a `NEEDS_MANUS_REVIEW` |
| Trava de build | Tentativa de `BUILD_AUTHORIZED` antes de `APPROVED` falha |
| Fila por ator | `queue REPLIT_EXECUTOR` e `queue MANUS_ARCHITECT` retornam o item correto em cada etapa |
| Validação | `validate` conclui sem erro no conjunto final |
| Segurança | Nenhuma rede, segredo ou execução de payload |
| Reversibilidade | Remover a pasta da ferramenta não altera o sistema clínico |

## Linhas vermelhas

1. Nunca enviar código ou mensagens automaticamente para serviços externos.
2. Nunca alterar a `main`, fazer `push` ou abrir Pull Request sem autorização do CEO.
3. Nunca armazenar senha, token, certificado ou dado clínico nas missões.
4. Nunca autorizar construção antes de especificação aprovada.
5. Nunca declarar uma missão concluída sem evidências e validação.
6. Nunca usar a ferramenta como substituto da autenticação, auditoria ou filas do produto Parxis em produção.

**RESUMO EM 1 LINHA:** o Parxis Bridge transforma a conversa entre CEO, arquiteto e executor em missões versionadas, com estados, evidências, uma pergunta por vez e trava contra construção prematura.
