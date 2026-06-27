# MULTI-SPEC / ROADMAP — Pendências da Comunicação e arredores

DATA: 27/06/2026
SOLICITANTE: CEO Dr. Caio
CONTEXTO: ao construir o menu-raiz "Comunicação" (ver `specs/menu-comunicacao.md`), vários braços
ficaram PRONTOS no esqueleto mas ainda NÃO ligados. Este documento reúne cada pendência num bloco
próprio, com o que falta e o gatilho para destravar. Nada aqui está "feito"; é o mapa do que vem.

---

## 1. Visão geral das pendências (carro-chefe)

| # | Pendência | Estado hoje | Gatilho para ligar |
|---|---|---|---|
| 1 | Telegram — teste real (caminho A) | Motor pronto; SEM token neste repl | Colar `TELEGRAM_BOT_TOKEN` no cofre deste ambiente |
| 2 | WhatsApp — envio direto Twilio | Fallback wa.me só; sem credenciais | Colar `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_WHATSAPP_FROM` |
| 3 | OneDrive — integração real | NÃO existe (placeholder honesto) | Decisão do CEO + credenciais Microsoft Graph |
| 4 | E-mails — gestão de modelos | Envio existe; textos em "Textos & Vídeos" | Consolidar modelos num só lugar (onda futura) |
| 5 | Mensageria — console do motor | Motor opera no Cockpit; console é vitrine | Definir catálogo de mensagens/templates editável |
| 6 | Governança/Hierarquia — RBAC e multi-clínica | Esqueleto à mostra; motor PARADO | Ordem explícita do CEO (escopo já decidido) |
| 7 | ZapSign — produção + webhook | Em homologação | Chave de produção + segredo de webhook |
| 8 | `replit.md` muito grande | Cresceu além do confortável | Enxugar em pausa natural (mover detalhe a donos) |

---

## 2. Telegram — teste real (caminho A)

| Campo | Valor |
|---|---|
| Objetivo | Vincular `chat_id` ao cliente 1924, disparar mensagem de teste real e devolver o `message_id` |
| Bloqueio | `TELEGRAM_BOT_TOKEN` ausente neste repl (verificado na fonte) |
| Linha vermelha | NUNCA imprimir/logar o valor do token; usar sem ver |
| Quando ligar | Assim que o token estiver no painel de Secrets deste ambiente |
| Prova de pronto | Status do canal acende verde; teste retorna `message_id` numérico |

Fluxo: cofre recebe token -> webhook captura chat_id (prova de posse) -> disparo de teste -> message_id.

---

## 3. WhatsApp — envio direto via Twilio

| Campo | Valor |
|---|---|
| Estado | `isWhatsappConfigured()` = falso; sistema só gera link wa.me de apoio |
| Falta | As três credenciais Twilio no cofre |
| Quando ligar | Após o CEO autorizar a conta Twilio de produção |
| Prova de pronto | Status WhatsApp acende verde; envio server-side sem cair no fallback |

---

## 4. OneDrive — integração real (Microsoft Graph)

| Campo | Valor |
|---|---|
| Estado | NÃO existe em código; painel mostra "Em breve" honesto |
| Desenho | Espelho do Google Drive: mesma estrutura de pastas por cliente |
| Falta | Decisão do CEO + app registrado no Microsoft Graph + credenciais |
| Risco | Sincronizar Drive <-> OneDrive sem duplicar nem perder arquivo |

---

## 5. E-mails — gestão de modelos

| Campo | Valor |
|---|---|
| Estado | Envio via Gmail funciona; textos espalhados em "Textos & Vídeos" |
| Falta | Um único lugar para editar assunto/corpo de cada tipo de e-mail |
| Onda futura | Editor de modelos com variáveis (nome, código, agenda) |

---

## 6. Mensageria — console do motor

| Campo | Valor |
|---|---|
| Estado | Motor opera no Cockpit (cartões + lembretes recorrentes) |
| Falta | Catálogo editável de mensagens/templates e regras de recorrência |
| Cuidado | Não reescrever o motor; só dar uma vitrine de controle |

---

## 7. Governança / Hierarquia — RBAC e multi-clínica

| Campo | Valor |
|---|---|
| Estado | Esqueleto à mostra no menu; motor PARADO por ordem do CEO |
| Escopo | Guardado em `specs/governanca-multiclinica-PENDENTE.md` |
| Regra | NÃO construir sem ordem explícita; arquitetura já decidida |
| Hierarquia x Governança | Hierarquia = organograma (estrutura); Governança = regras sobre a estrutura |

---

## 8. ZapSign — produção + webhook

| Campo | Valor |
|---|---|
| Estado | Assinatura remota em homologação |
| Falta | Chave de produção + segredo de webhook (`ASAAS_WEBHOOK_TOKEN` já listado como faltante) |
| Cuidado | Webhook inválido NUNCA marca evento como processado (não suprime retry) |

---

## 9. Higiene — enxugar `replit.md`

| Campo | Valor |
|---|---|
| Problema | Arquivo cresceu além do confortável de ler |
| Plano | Mover detalhe para os donos do "Mapa da Memória"; manter README enxuto |
| Quando | Em pausa natural, com aviso ao CEO antes de remover qualquer bloco |

---

RESUMO EM 1 LINHA: este roadmap lista, em blocos próprios, as 8 pendências da Comunicação e arredores
(Telegram/WhatsApp/OneDrive/E-mails/Mensageria/Governança/ZapSign/enxugar replit.md), cada uma com o
que falta e o gatilho para ligar — nada está feito, é o mapa do que vem.
