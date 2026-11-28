# Clientes que abriram o Guia Digital

## Objetivo
Identificar no painel de Onboarding todos os clientes com abertura registrada nos últimos 30 dias.

## Requisitos
1. Preservar GET /api/onboarding/stats protegido e sem cache, com empresa proveniente do contexto autenticado.
2. Retornar `pacientes` com `client_id`, `nome` e `ultimo_acesso`, uma linha por cliente, usando a abertura mais recente dentro da janela de 30 dias.
3. Exigir que evento e cadastro pertençam à empresa consultada; ignorar eventos anônimos e cadastros inexistentes na lista.
4. Não truncar a lista em 50 clientes. `pacientesUnicos` deve corresponder à lista identificável.
5. Exibir nome completo e último acesso (data e hora de Brasília), mais recentes primeiro, mantendo o painel 3D e leitura no celular.
6. Exibir estado explícito quando só houver acessos anônimos. Não apresentar dados anteriores como atuais após falha de atualização.
7. Enviar a identificação Bearer do colaborador com o helper compartilhado em cada consulta, inclusive nas atualizações, sem fixar a sessão inicial.

## Impacto e limites
- Consulta em onboarding_eventos e clients; consumo em PainelOnboarding no CommandCenter.
- Contrato aditivo existente preservado; sem mudança de esquema, migração, escrita, envio, cobrança ou publicação.
- Não alterar a coleta pública de eventos, autenticação ou outros painéis.

## Falhas previstas e testes
| Falha | Consequência | Barreira / evidência |
|---|---|---|
| Evento aponta cliente de outra clínica | Exposição de identidade | JOIN por id e empresa; PostgreSQL descartável com duas clínicas |
| Acessos repetidos ou antigos | Duplicação ou data incorreta | GROUP BY e MAX dentro dos 30 dias; teste com datas diferentes |
| Mais de 50 clientes | Nomes ausentes | Sem LIMIT; teste com 55 clientes |
| Acessos sem cliente | Identidade inventada | Excluir da lista, manter totais gerais e mensagem explícita |
| Navegador em outro fuso | Data do último acesso errada | Formatação com America/Sao_Paulo |
| Atualização falha | Dados antigos parecem atuais | Ocultar dados ao mostrar erro |

## Pronto
Testes de rota e PostgreSQL isolado aprovados; apresentação testada por renderização.
Captura do aplicativo sem remover autenticação; registrar a limitação se a tela protegida não puder ser vista.
Revisão final pelo fluxo de conclusão da tarefa. Nenhuma operação de produção.

## Evidências de desenvolvimento
| Nível | Esperado | Obtido |
|---|---|---|
| SMOKE / contrato | Resposta atualizada, erro sem cache e contexto obrigatório | 22 testes de rota aprovados |
| DADO | Lista completa, MAX por cliente, 30 dias e isolamento | 3 testes PostgreSQL descartável aprovados; 57 clientes identificáveis, sem corte em 50 |
| RENDERIZAÇÃO / REQUISIÇÃO | Nome inteiro, data/hora BRT, estados e envio da sessão | 6 testes aprovados; 24/11 02:30 UTC exibido como 23/11 23:30; sessão atual enviada em cada consulta |
| VISUAL | Aplicativo carrega sem retirar autenticação | Captura desktop abriu o painel; consultas recusadas com 401 sem sessão, portanto lista autenticada não conferida visualmente; celular e temas não capturados |
| LOG | Servidores reiniciam e escutam | API e Vite iniciados; sem erro de compilação nos arquivos alterados; avisos existentes em outros módulos |
| TIPOS | Nenhum diagnóstico nos arquivos alterados | Nenhum encontrado; verificação global continua falhando fora do escopo (36 erros no frontend e 1 no laboratório financeiro da API) |

Comandos:
- `pnpm --filter @workspace/api-server exec vitest run src/tests/onboarding-stats.test.ts src/tests/onboarding-eventos-tenant.test.ts src/tests/onboarding-pacientes-postgres.test.ts --maxWorkers=1`
- `pnpm --filter @workspace/padcom exec vitest run src/pages/CommandCenter.test.tsx --maxWorkers=1`
- `pnpm --filter @workspace/padcom exec tsc -p tsconfig.json --noEmit`
- `pnpm --filter @workspace/api-server exec tsc -p tsconfig.json --noEmit`
- `git diff --check`

Leitura apenas: concorrência de escrita, cancelamento, emissão e efeitos externos não se aplicam.
O teste de rota injeta apenas o contexto sintético para exercitar a consulta; não certifica a cadeia global de autenticação.
Nenhum dado real foi escrito pelos testes. A revisão final é responsabilidade do encerramento da tarefa.

### Correção após revisão
A chamada nativa existente não enviava a identificação do colaborador. A consulta agora usa
`collabAuthHeaders()` em cada carregamento e descarta os dados após falha.
Testes no nível da requisição verificam cabeçalho da sessão sintética de clínica 42,
consumo da respectiva lista, troca/expiração de sessão e recusa sem autenticação.
