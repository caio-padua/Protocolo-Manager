# Spec — Motor Único de Envio Branded ("Hermes Paxter")

Status: ESPECIFICADO (aguardando "pode buildar" do CEO)
Data: 28/06/2026
Dono do método: Código Paxter, Art. 66 (Título X)

## Objetivo (uma frase)

Criar UM único motor de envio por onde TODA mensagem do sistema (e-mail, WhatsApp e
Telegram) passa obrigatoriamente, vestindo automaticamente o padrão de marca PAXTER
(navy/ouro, símbolo de vidro + wordmark + "Clinical Intelligence System"), para que
nenhuma mensagem nova precise reimplementar o visual — a dor do CEO de "pedir sempre o
mesmo padrão" deixa de existir.

## Fonte-da-verdade visual (o "modelo de perfeição")

O e-mail da tela de cadastro (que coleta dados + foto) é o MODELO aprovado:
`artifacts/api-server/src/routes/client-registration.ts` → `buildRegistrationEmailHTML`.
Elementos canônicos: fundo `#05080f`, card navy `#0b1426` com borda ouro
`rgba(201,162,79,.30)`, cabeçalho com símbolo de vidro (`/brand/paxter-symbol.png`) +
wordmark (`/brand/paxter-wordmark.png`) + subtítulo "Clinical Intelligence System",
filete dourado, botão dourado "bulletproof", rodapé. O motor REPLICA este modelo;
NUNCA o redesenha.

## Requisitos exatos (numerados, sem ambiguidade)

1. Criar UM módulo `artifacts/api-server/src/lib/messaging/` com a função única
   `enviarMensagemPaxter(doc, destino, canais)`.
2. O "documento de mensagem" (`doc`) é abstrato e independente de canal:
   `{ eyebrow?, titulo, paragrafos: string[], botao?: {label,url}, notaRodape?,
   anexos?: {nome, conteudoBase64, mime}[] }`. Quem chama fornece SÓ conteúdo.
3. `destino`: `{ email?, telefone?, telegramChatId? }`. `canais`: subconjunto de
   `["EMAIL","WHATSAPP","TELEGRAM"]`.
4. UM renderizador de e-mail compartilhado `renderPaxterEmail(doc)` reproduz EXATAMENTE
   o template-modelo. Passa a ser a única fonte de HTML de marca do sistema.
5. WhatsApp recebe o MESMO padrão: banner-imagem PAXTER (navy/ouro) via `MediaUrl` +
   legenda formatada (negrito `*...*`, linhas) derivada do mesmo `doc`. Estender
   `sendWhatsapp` para aceitar `mediaUrl?` opcional.
6. Telegram recebe o MESMO padrão: `sendPhoto` com o mesmo banner + legenda HTML
   (parse_mode HTML) derivada do mesmo `doc`. Estender `telegram.ts` com `sendTelegramPhoto`.
7. Banner branded: gerar/hospedar UMA imagem PNG navy/ouro PAXTER em URL pública estável
   (reusar os assets `/brand/` já servidos publicamente, compondo o cartão, OU gerar via
   satori/canvas e salvar no Object Storage). Mesma identidade visual do e-mail.
8. Migrar TODOS os envios atuais para chamar o motor único:
   - Já branded (unificar no motor): cadastro, foto, pré-sessão, pós-sessão, protocolo,
     onboarding, cobrança (asaas).
   - Plain-text → passam a branded: pedido de exame, RAS, área do paciente (login).
9. Status honesto por canal no retorno (`{ canal, sent, via, mock?, error? }`), nunca
   fingir envio (memória `comunicacao-status-honesto`).
10. Registrar o padrão na skill `skill-layout-paxter` como Padrão numerado novo
    ("Envio Branded") — Lei do Layout (Art. 59), para herdar nos primos.
11. Promulgar artigo no Código Paxter (Art. 66) — FEITO em 28/06/2026.
12. "Nunca esquecido" (enforcement): entry point único; os senders crus
    (`sendGmailMessage`/`sendWhatsapp`/`sendTelegram`) viram camada baixa, com comentário
    no topo apontando para o motor como porta obrigatória.

## Casos extremos a tratar

1. Cliente sem e-mail / sem telefone / sem chat Telegram: pula o canal, status honesto,
   NÃO falha o fluxo.
2. Banner indisponível (URL pública fora do ar): WhatsApp/Telegram caem para texto
   formatado SEM imagem (degrade gracioso), nunca falham por causa da imagem.
3. Escapar conteúdo: Telegram (HTML) escapa `<`,`>`,`&`; WhatsApp usa markdown próprio
   (`*negrito*`), nunca HTML.
4. Anexos de PDF (pós-sessão/RAS): preservados no e-mail via MIME multipart — NÃO quebrar
   o que já funciona hoje.
5. Idempotência: o motor não reenvia sozinho; quem chama controla quando enviar.
6. Provedor não configurado (sem token no cofre): MOCK honesto, fluxo segue.

## Definição de PRONTO (conferível por qualquer um)

1. Motor único existe; os 10 envios chamam ele; os 3 plain-text agora saem branded.
2. WhatsApp e Telegram saem com banner + legenda (ou degrade texto se banner off).
3. `architect` PASS requisito por requisito contra esta spec.
4. Prova real: preview/screenshot do e-mail renderizado e do cartão de canal; teste real
   de pelo menos 1 canal com status honesto.
5. Padrão registrado na skill `skill-layout-paxter` + Art. 66 promulgado.
6. Relatório ao CEO em Densidade B, fechando com "RESUMO EM 1 LINHA".

## Linhas vermelhas (NÃO violar)

1. NUNCA logar/expor o valor de token (Telegram/Twilio/ZapSign/cofre).
2. NÃO tocar no motor de assinatura (ZapSign/`adapters.ts`) nem em cálculo financeiro.
3. NÃO mudar o visual aprovado do e-mail de cadastro — o motor REPLICA, não redesenha.
4. NÃO quebrar anexos de PDF já existentes (pós-sessão/RAS).
5. Status honesto obrigatório — proibido marcar "enviado" sem envio real.
6. UM formato, UM motor (Art. 57): nenhuma rota remonta HTML/mensagem de marca à mão.

## Ordem de build sugerida (uma onda, em sub-passos)

1. Motor + `renderPaxterEmail` + banner branded (fundação).
2. Estender WhatsApp (MediaUrl) e Telegram (sendPhoto).
3. Migrar os 10 senders para o motor; converter os 3 plain-text.
4. Registrar na skill + revisão architect + prova real.
