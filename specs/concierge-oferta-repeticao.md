# Concierge: repetição da oferta sem duplicar código

## Objetivo e pronto
Chamadas repetidas com o mesmo CPF e fingerprint durante os dez minutos de
validade reutilizam o challengeId, não reenviam WhatsApp/Telegram e informam
codeSent=true quando houve envio confirmado pelo provedor.

## Impacto e limites
- Preservar o lock e o TTL de getOrCreateChallenge.
- Adicionar apenas um marcador nullable de envio confirmado na tabela lazy de
  desafios, com migração SQL idempotente espelhada. Sem backfill: registros antigos
  não comprovam envio.
- A rota consulta o marcador no reuso e grava-o somente após sent=true.
- Sem alterações de tela, cobrança, penalidade ou regras de verificação.
- Testes sintéticos com banco e canais simulados; nenhum envio externo real.

## Falhas previstas
| Falha | Barreira e teste |
|---|---|
| Reload após envio | Mesmo ID, codeSent=true e um só envio |
| Várias requisições rápidas | Apenas isNew=true pode enviar; teste de rajada |
| Provedor recusa ou contato ausente | Marcador ausente, codeSent=false, sem retry automático |
| Envio em andamento ou resultado não registrado | codeSent=false até confirmação persistida; nunca supor sucesso |
| Expiração, CPF ou fingerprint diferente | Contrato da lib preservado; não reutilizar outro par |

## Evidência
Executar testes da rota de fricção e da biblioteca de dispositivos com um worker.
A prova é automatizada e isolada; não comprova entrega no aparelho nem o lock em
PostgreSQL real. Captura visual não se aplica: nenhuma tela foi alterada.

## Resultado da validação
- Comando: `pnpm --filter @workspace/api-server exec vitest run src/tests/device-friction-e2e.test.ts src/tests/verify-device-lib.test.ts src/tests/verify-device-route.test.ts src/tests/concierge-device-throttle.test.ts --maxWorkers=1`
- Resultado: 4 arquivos, 74 testes aprovados, incluindo dez recargas, rajada de
  dez acessos, recusa do WhatsApp e dez chamadas diretas da biblioteca com um INSERT.
- API reiniciada e `GET /api/healthz` retornou `{"status":"ok"}`.
- Captura do endpoint de saúde confirmou a resposta; houve erro 502 de recurso
  auxiliar no navegador. Não houve inspeção de tela autenticada ou teste visual
  desktop/mobile, pois não há mudança de interface.
- `git diff --check`: aprovado.
- Typecheck geral: reprovado em arquivos fora do escopo (incluindo
  `pax-finance/laboratorio-calc.ts` e exports ausentes em `assinaturas-fallback.ts`);
  nenhum diagnóstico nos quatro arquivos TypeScript modificados.
- Canais externos e banco foram simulados. Nenhuma entrega a paciente foi feita
  pelo teste. Lock real entre processos e renovação após TTL não foram exercitados.
