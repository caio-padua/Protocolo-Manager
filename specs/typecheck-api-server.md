# Restaurar a checagem de tipos da API

## Objetivo

Fazer a checagem completa do servidor da API terminar sem erros, preservando o
escopo de arquivos, as autenticações e todos os testes existentes.

## Estado inicial verificado

Comando: `pnpm --filter @workspace/api-server run typecheck`.

Resultado: saída 2, com 169 erros em 52 arquivos. Nenhum arquivo com “outbox”
no nome aparece no relatório. A configuração inclui todo o diretório `src`,
portanto inclui código do servidor, scripts e testes.

## Classificação inicial das causas

| Grupo | Evidência | Correção permitida |
| --- | --- | --- |
| Respostas externas sem tipo | JSON e retornos do conector inferidos como `unknown` | Validar ou tipar os campos usados, sem presumir o formato |
| Contratos internos divergentes | Campos inexistentes, retorno de arquivo e parâmetros antigos | Alinhar chamadas aos tipos atuais e preservar o comportamento |
| Nulos e caminhos de saída | Identificadores, documentos e retornos incompletos | Tratar ausência explicitamente em cada caminho |
| Tipos de testes e simuladores | Dados incompletos, promessas e assinaturas incompatíveis | Corrigir fixtures e simuladores, mantendo suas asserções |
| Fronteiras de pacotes e declarações | Arquivo fora de `rootDir`, módulo não exportado, dependência ausente e nomes globais duplicados | Ajustar importações, dependências ou escopo sem excluir arquivos |
| Adaptador de armazenamento alternativo | Contrato do adaptador difere do armazenamento atual | Confirmar os usos e corrigir o contrato sem remover a implementação |

## Falhas previstas e proteção

Uma conversão ampla para `any`, o enfraquecimento de `strict`, a exclusão de
testes ou o descarte de arquivos fariam o comando passar sem restaurar a
checagem. Cada lote deve manter as verificações existentes e ser seguido por
uma nova checagem completa e pelos testes relevantes.

## Definição de concluído

1. O comando informado termina com código zero e zero diagnósticos.
2. Nenhum arquivo de teste ou código é excluído da configuração para ocultar
   erros.
3. Os testes existentes continuam presentes e passam.
4. Os contratos de serviços externos são validados antes do uso e falham de
   forma explícita quando a resposta é inválida.
5. A checagem corresponde ao código atual e não a declarações geradas antigas.

## Evidências desta execução

1. `pnpm --filter @workspace/api-server run typecheck`: código zero, sem
   diagnósticos. A configuração continua incluindo `src` inteiro, sem exclusão
   de testes.
2. `pnpm --filter @workspace/api-server run build`: código zero.
3. Comando de testes executado:

   ```sh
   pnpm --filter @workspace/api-server exec vitest run --maxWorkers=2 \
     src/tests/replit-connection.test.ts \
     src/tests/avatar-voice-e2e.test.ts \
     src/tests/cockpit-badge.test.ts \
     src/tests/concierge-admin-routes.test.ts \
     src/tests/concierge-penalidade-lib.test.ts \
     src/tests/device-friction-e2e.test.ts \
     src/tests/dieta-pdf-client-timeout.test.ts \
     src/tests/exam-dispatch-restart.test.ts \
     src/tests/google-conflito-postgres.test.ts \
     src/tests/llm-monitor-dispatch.test.ts \
     src/tests/onboarding-clinic-auth.test.ts \
     src/tests/onboarding-quota-restart.test.ts \
     src/tests/pit-stop-postgres.test.ts \
     src/tests/professional-empresas-postgres.test.ts \
     src/tests/semantic-codes-route.test.ts \
     src/tests/telegram-claim-rota.test.ts \
     src/tests/telegram-dedupe-fluxo-rota.test.ts \
     src/tests/telegram-slack-reply-alert.test.ts \
     src/tests/telegram-webhook-secret.test.ts
   ```

   Resultado: 19 arquivos e 237 testes aprovados. Ambiente de desenvolvimento,
   dados sintéticos, banco isolado nos testes de integração e serviços externos
   simulados; nenhuma mensagem foi enviada. A suíte completa de 211 arquivos não
   foi executada.
4. Dois problemas de ambiente de teste foram corrigidos sem alterar a segurança
   de produção: um teste de rota agora simula explicitamente o contexto já
   autenticado e também cobre a recusa a não proprietários; o simulador do
   conector do Google agora declara a resposta HTTP como bem-sucedida.
5. Revisão independente: BLOQUEADA. A ferramenta de revisor separado está
   indisponível nesta sessão. Autorrevisão não substitui essa etapa.
6. O servidor da API não foi reiniciado. O início do processo também sincroniza
   dados externos e ativa tarefas de manutenção; reiniciá-lo neste escopo poderia
   produzir efeitos fora dos testes.

Estado do PAXTER Loop: checagem, build e testes direcionados passaram; a
homologação permanece pendente da suíte completa, da revisão independente e da
validação de inicialização segura.
