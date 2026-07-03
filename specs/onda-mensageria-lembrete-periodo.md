# Onda — Motor de Lembrete por Período (portado do IHE) + Rastreio de WhatsApp + Tela de Status

> Método: Paxter Loop (ESPECIFICAR → CONSTRUIR → REVISAR). Decisão do CEO (03/07/2026): fazer os TRÊS
> martelos no caminho recomendado (A/A/A), com autonomia. Sistemas primos: código do IHE entra NATIVO,
> sem prefixo/tag de origem. Manager é single-tenant (sem unidade/JWT), usa `clients` (não `pacientes`),
> fuso fixo BRT (America/Sao_Paulo).

## Objetivo (uma frase)
Trazer para o Manager o motor de lembrete cronobiológico do IHE (uma mensagem POR JANELA do dia, texto
rico, 9 períodos), rastrear a entrega de TODO WhatsApp do sistema via webhook de status do Twilio, e
mostrar tudo numa tela de status de envios e falhas.

---

## PARTE 1 — Motor rico de lembrete por período (substitui o motor simples)

### Requisitos
1. Criar tabela `periodos_dia` (fonte de verdade canônica) com os 9 períodos do IHE, sigla MAIÚSCULA,
   janela_inicio/janela_fim, nome, descrição, ordem. Valores idênticos ao IHE (migration 075):
   JE 05:00–06:59 · IM 07:00–08:59 · MM 09:00–10:59 · AL 11:00–13:29 · IT 13:30–15:59 ·
   MT 16:00–17:59 · NO 18:00–19:59 · FN 20:00–22:29 · CE 22:30–23:59. Madrugada 00:00–04:59 fica vazia.
2. Criar tabela `lembretes_prescricao` (nativa, sem unidadeId): `clienteId` (FK clients), `ativo`,
   `periodos` jsonb (`{nome,tipo:'tomar'|'nao_tomar',formulas:[{nome,ativoPrincipal?,dose?,horario?,observacaoRefeicao?,posologia?}]}[]`),
   `horariosEnvio` jsonb (`string[]` HH:MM), `observacao`, timestamps.
3. Criar tabela `lembrete_envios` (idempotência): `lembreteId` (FK, cascade), `clienteId`, `janela` text
   (`YYYY-MM-DD HH:MM`), `status` (`PENDENTE|ENVIADO|FALHOU`), `erro`, `whatsappLogId` (FK log da Parte 2),
   `enviadoEm`. UNIQUE (`lembreteId`, `janela`).
4. Portar o TEXTO da mensagem (template `LEMBRETE_PRESCRICAO_REVO`) fiel ao IHE, com marca PAXTER no
   rodapé (não "PAWARDS - Instituto Padua"): saudação por HORA (Bom dia/tarde/noite) + tratamento por
   GÊNERO (Sr./Sra./primeiro nome); cabeçalho "Segue o lembrete da sua prescrição personalizada:";
   por período `⬛ *Período:* _nome_`; tipo `tomar`→`🟩 *Programado* para administrar`,
   `nao_tomar`→`🟨 *NÃO TOMAR* as fórmulas abaixo`; cada fórmula com nome, ativo — dose, horário,
   observação de refeição, posologia.
5. Portar o MOTOR: `executarLembretesPrescricao({now,toleranciaMinutos=5})` que, para cada lembrete
   ativo: calcula a hora local BRT; acha o horário dentro da janela (dispara no horário ou até 5 min
   depois, NUNCA antes); faz claim idempotente em `lembrete_envios` (insert PENDENTE onConflictDoNothing
   por `lembreteId+janela`); envia UMA mensagem com TODOS os períodos daquela prescrição; grava
   ENVIADO/FALHOU. Worker `setInterval` 60s, iniciado no boot do servidor.
6. REGRA DE OURO: agrupa por JANELA, nunca por fórmula — várias fórmulas na mesma janela = 1 mensagem.
7. Substituir o motor simples: o Cockpit ("Finalizar e Emitir Tudo") passa a alimentar
   `lembretes_prescricao` (via `sincronizarLembretePrescricao(clienteId, itens)`) em vez de
   `mensageria_lembrete`. O `mensageria.ts`/`mensageria_lembrete` antigos ficam APOSENTADOS do caminho
   ativo (não deletados — sem perda de dado, permite rollback). Mapa dos períodos antigos → canônicos:
   `manha→IM`, `tarde→IT`, `noite→NO`; `horariosEnvio` = janela_inicio dos períodos usados.
8. Rota manual de disparo: `POST /api/lembretes/processar` (para worker externo/teste), devolve
   `{examinados,enviados,falhas,pulados}`.

---

## PARTE 2 — Rastreio geral de WhatsApp + webhook de status do Twilio

### Requisitos
9. Criar tabela `whatsapp_mensagens_log`: `id`, `clienteId?`, `telefone` (guardado; API mascara),
   `corpo`, `sid` (SID do Twilio), `status` (queued|sent|delivered|read|failed|undelivered|…),
   `errorCode?`, `contexto` (ex.: `lembrete_prescricao`|`cockpit`|`manual`), `criadoEm`, `atualizadoEm`.
   Índice por `sid`.
10. `sendWhatsapp` passa a: (a) registrar a linha de log ao enviar (com `sid` e status inicial);
    (b) enviar `StatusCallback` no corpo do Twilio apontando para a rota pública de status; (c) retornar
    `logId` no `WhatsappResult` para o chamador vincular (`lembrete_envios.whatsappLogId`). Assinatura
    ganha `opts.contexto?`, `opts.clienteId?`. Comportamento atual preservado (nunca lança, fallback link).
11. Webhook público `POST /api/whatsapp/status` registrado ANTES do `collaboratorGuard` (padrão asaas):
    valida `X-Twilio-Signature` (HMAC-SHA1 base64 de URL pública + params ordenados, com o `authToken`);
    assinatura inválida → 403 e NÃO altera nada; válida → atualiza `whatsapp_mensagens_log` por
    `MessageSid` (status + errorCode) e, se houver, o `lembrete_envios` vinculado. Nunca loga o token;
    telefone mascarado no log de servidor.
12. Base pública da URL vem de `publicWebhookUrl` (REPLIT_DOMAINS), igual aos outros webhooks.

---

## PARTE 3 — Tela de status (console de WhatsApp)

### Requisitos
13. Endpoints de leitura (livres, single-tenant): `GET /api/whatsapp/messages?limit=` (log recente),
    `GET /api/whatsapp/stats` (contagem por status), `GET /api/lembretes/failures` (envios FALHOU).
14. Nova tela em `/comunicacao/whatsapp-status` (registrada no App.tsx), no padrão visual Paxter
    (`ConsoleShell`/`panel-3d`, skill-layout-paxter): KPIs (enviados/entregues/falhas), tabela de
    mensagens recentes (data, cliente/telefone mascarado, contexto, status colorido, erro) e tabela de
    falhas de lembrete. Link para esta tela a partir do console `/comunicacao/mensageria`.
15. Telefone SEMPRE mascarado na tela (ex.: `+55 11 9****-**89`).

---

## Casos extremos a tratar
- Twilio não configurado: envio devolve `via:link`, log registra sem `sid`, webhook nunca chega — tela
  mostra como "não enviado por Twilio" (não como falha de entrega).
- Fuso/hora: nunca disparar antes do horário; recuperar até 5 min depois se o worker perder um tick.
- Idempotência: mesmo período/dia nunca dispara 2×, mesmo com múltiplos ticks (claim único por janela).
- Assinatura Twilio inválida ou ausente: 403, sem efeito colateral (não marca entregue nem falho).
- Cliente sem gênero: tratamento cai no primeiro nome (sem Sr./Sra.). Sem telefone: pula.
- `MessageSid` desconhecido no webhook: responde 200 sem erro (não cria linha órfã).

## Definição de PRONTO
- 3 tabelas novas criadas e no schema (`periodos_dia` semeada com as 9 linhas exatas).
- Motor rico roda no boot, dispara 1 mensagem por janela, idempotente; Cockpit alimenta o novo motor.
- Texto da mensagem = template do IHE com rodapé PAXTER.
- `sendWhatsapp` loga + manda StatusCallback; webhook valida assinatura e atualiza status.
- Tela `/comunicacao/whatsapp-status` mostra KPIs + mensagens + falhas, telefone mascarado; validada por
  screenshot real.
- architect aprova requisito por requisito, zero pendência.

## Linhas vermelhas
- NÃO tocar motor de orçamento (`/api/budgets/calculate`) nem desmembramento.
- NÃO deletar `mensageria_lembrete` nem `mensageria.ts` (aposentar, não apagar — sem perda de dado).
- NÃO logar o `authToken` nem telefone em claro no servidor. Mascarar telefone na API/tela.
- Rebrand: trocar só texto visível (rodapé → PAXTER); preservar SIDs, colunas, tokens.
- NÃO inventar multi-tenant: motor é single-tenant, fuso BRT fixo.
