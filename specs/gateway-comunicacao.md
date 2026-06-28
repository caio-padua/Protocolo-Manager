# Spec — Plataforma Gateway de Comunicação (submenu de Comunicações)

Decisão do CEO (Dr. Caio), 28/06/2026. Construção direta autorizada por fala.

## Objetivo

Criar dentro do menu **Comunicação** um submenu novo chamado **"Plataforma Gateway de
Comunicação"**, reunindo as duas principais plataformas de envio (gateways de WhatsApp):
**Twilio** e **Gupshup**. Cada plataforma tem um **toggle** (ligar/desligar a escolha do
operador) e uma **luzinha de vela** (status real de configuração).

## Significado HONESTO dos dois indicadores (sem simulação)

| Indicador | O que mostra | Fonte |
|---|---|---|
| Luzinha de vela (StatusVela) | A plataforma está CONFIGURADA? (credenciais no cofre/ambiente) | Servidor, real |
| Toggle (Switch) | O operador ESCOLHEU usar esta plataforma? (preferência) | app_settings, persistido |

Regra: a luzinha NUNCA fica verde sem credenciais reais. O toggle persiste de verdade
(sobrevive a recarregar a página). Verde + ligado = ativo e pronto.

## Backend

1. `lib/gupshup.ts` — `isGupshupConfigured()` lê `GUPSHUP_API_KEY` + `GUPSHUP_APP_NAME`.
   Sem motor de envio ainda (não pedido); só reporta presença de credenciais.
2. `routes/comunicacao.ts`:
   - `GET /api/comunicacao/gateways` → lista `[{ provider, label, configured, enabled, missingKeys }]`
     para `twilio` e `gupshup`.
   - `POST /api/comunicacao/gateways/:provider` → body `{ enabled: boolean }`; persiste em
     `app_settings` na chave `gateway.<provider>.enabled`. Atrás do `collaboratorGuard` global.

Twilio configurado = `isWhatsappConfigured()` (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN +
TWILIO_WHATSAPP_FROM/WHATSAPP_FROM). Gupshup configurado = `isGupshupConfigured()`.

## Frontend

3. `pages/comunicacao/gateways.tsx` — tela "Plataforma Gateway de Comunicação" (estilo Paxter
   3D, reusa `ConsoleShell`/`ToolCard`/`StatusVela`/`ExplainRow`). Dois cards: Twilio e Gupshup,
   cada um com luzinha + Switch + aviso de chaves faltando.
4. `App.tsx` — rota `/comunicacao/gateways`.
5. `Layout.tsx` — item de menu "Plataforma Gateway de Comunicação" (ícone Network), no topo do
   grupo Comunicação.

## Depois de construir

6. Pedir ao CEO as chaves do Twilio (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN) para ativar
   primeiro o Twilio. O número remetente do sandbox (whatsapp:+14155238886) já foi configurado.

## Fora de escopo (não construir agora)

- Motor de ENVIO via Gupshup (só status/toggle nesta onda).
- Roteamento automático do envio pelo gateway escolhido (entra quando Gupshup tiver envio).
