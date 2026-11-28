# Verificação de dispositivo — retirar inicialização legada

## Objetivo
Eliminar a infraestrutura órfã de códigos sem quebrar o reenvio do agendamento.

## Inspeção e requisitos
1. O diagnóstico original está parcialmente desatualizado: o handler de reenvio
   já usa `device_contact_verifications`, assim como `verifyDeviceCode`.
2. Preservar a rota pública usada por `agendar.tsx`, seus limites de 60 segundos
   e cinco envios diários, o retorno de `challengeId` e os canais existentes.
3. Remover `ensureVerifyTables`, seu singleton e o SQL de criação/alteração da
   tabela antiga. Não executar DROP nem apagar dados existentes.
4. Comprovar que o código e o identificador devolvidos pelo reenvio chegam à
   verificação canônica, sem dependência da tabela antiga.

## Impacto e falhas previstas
| Risco | Barreira | Teste |
| --- | --- | --- |
| Remover rota ainda usada e impedir reenvio | Preservar contrato e handler já migrado | Requisição HTTP ao reenvio |
| Reintroduzir tabela antiga | Remover inicialização órfã | Guarda de regressão no código de produção |
| Enviar identificador diferente ao validar | Preservar identificador retornado | Reenvio seguido de verificação |
| Perder limites contra abuso | Não alterar transação nem limites | Cooldown e teto diário sem envio |

## Pronto
Testes de rota e biblioteca passam; nenhuma referência operacional à tabela
antiga permanece. A rota é mantida como entrada do fluxo canônico já migrado,
em vez de removê-la e quebrar seu consumidor atual. Revisão de conclusão pela
validação da tarefa. Sem alteração visual, envio real ou operação em produção.

## Linhas vermelhas
Não alterar regras de verificação, agendamento, pagamentos ou permissões.
Não apagar tabelas nem dados. Usar banco e mensageria simulados nos testes.

## Evidências de desenvolvimento
- `pnpm --filter @workspace/api-server exec vitest run src/tests/verify-device-route.test.ts src/tests/verify-device-lib.test.ts src/tests/device-friction-e2e.test.ts src/tests/concierge-device-throttle.test.ts --maxWorkers=1`:
  quatro arquivos e 74 testes aprovados, incluindo quatro casos novos.
- Reinício do serviço recompilou o servidor e chegou a `Server listening`.
- `POST /api/scheduling/send-verification-code` com CPF sintético inválido:
  HTTP 400 e `CPF inválido.`, sem envio externo.
- `/api/healthz`: `{"status":"ok"}` conferido em captura. Não há alteração de
  tela nesta entrega; a captura não comprova interação nem envio de mensagem.
- `git diff --check`: aprovado. Banco e mensageria simulados nos testes;
  nenhuma exclusão de dados ou tabela e nenhuma publicação.
- Avisos de configuração de desenvolvimento, inteligência artificial e
  atualização de agenda apareceram no reinício, fora do escopo desta limpeza.
