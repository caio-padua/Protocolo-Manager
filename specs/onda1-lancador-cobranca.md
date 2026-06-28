# Spec Onda 1 — Lançador de Cobrança avulsa (multicanal Paxter)

## Objetivo
Tela premium no Financeiro que cria uma cobrança avulsa no Asaas (página hospedada "clica e paga") e dispara o link de pagamento ao cliente por E-mail, WhatsApp e Telegram, com status honesto por canal e visual Paxter (loginho com vidro + wordmark PAXTER ouro + frase inglesa com brilho, fundo navy).

## Contexto técnico (fonte da verdade)
- Backend já existe: `POST /asaas/charge` cria a cobrança e grava em `payments` (NÃO alterar — linha vermelha).
- Gateways: `sendWhatsapp(phone, msg)` (Twilio; fallback link wa.me), `sendTelegram(chatId, text)` (Bot API; MOCK sem token), e-mail via Gmail (`lib/email-service`/`google-gmail`).
- Status real dos canais: `GET /comunicacao/status` → { telegram, whatsapp, gmail, drive }.
- `asaasCreateCharge` usa `billingType: UNDEFINED` (cliente escolhe PIX/cartão/boleto), mínimo R$ 5,00.

## Requisitos exatos
1. **Menu**: novo item no grupo "Financeiro" do sidebar: "Lançador de Cobrança" → rota `/financeiro/cobranca`. Ícone coerente (Send/Rocket). Rota registrada no `App.tsx` dentro do `<Layout>`.
2. **Cabeçalho da tela (marca)**: usar o componente vivo da marca (PaxterLogo/PaxterLockup — variante de cabeçalho com vidro, tone dark sobre navy). NUNCA desenhar letras à mão. Frase inglesa oficial ("Precision in integrative care") com o tratamento de brilho já existente. Fundo navy (hero).
3. **Formulário — TODOS os campos visíveis, slot fixo (Padrão 12 / grade imaginária), nada some**:
   - Cliente: seletor com busca, mostra NOME + CPF; obrigatório. Origem = cadastro de clientes.
   - Valor (R$): obrigatório, mínimo 5,00, máscara/decimal vírgula BR.
   - Descrição: opcional.
   - Vencimento: data; default = amanhã.
   - Destinos por canal (preenchidos do cliente, editáveis): E-mail (client.email), WhatsApp (client.phone), Telegram (chat id manual; cliente não tem coluna — campo livre, opcional).
   - Canais: 3 chaves (toggle) E-mail / WhatsApp / Telegram. Cada uma com chip de STATUS honesto: configurado? (de `/comunicacao/status`) e tem destino? Se não dá para enviar, o toggle informa o motivo (Padrão 4 StatusChip; nunca verde sem credencial).
4. **Ação "Lançar Cobrança"**: chama um endpoint novo `POST /asaas/charge/launch` que: (a) cria a cobrança (reutiliza `ensureCustomer` + `asaasCreateCharge`, grava em payments igual ao endpoint atual); (b) envia o link `invoiceUrl` pelos canais escolhidos; (c) devolve `invoiceUrl` + resultado POR canal.
5. **Mensagem padrão (skin/skill padrão)**: texto com identidade da clínica (de `lib/brand.ts`/settings), valor em R$ (BR), descrição, vencimento e o LINK de pagamento. E-mail = HTML; WhatsApp/Telegram = texto. Helper único compõe a mensagem (uma fonte, os 3 canais usam a mesma base).
6. **Resultado honesto (memory comunicacao-status-honesto)**: painel de retorno distingue: ENVIADO (via real), LINK/FALLBACK (sem credencial, gerou link manual), MOCK (sem token), ERRO (com motivo). Nunca dizer "enviado" quando foi mock/fallback. Sempre exibir o `invoiceUrl` copiável (não perder o link mesmo se um canal falhar).
7. **Contrato-first**: definir o endpoint no `openapi.yaml`, rodar codegen (Orval) e usar o hook gerado + schema Zod no front, SE o restante do app usa hooks; se o padrão do app para Asaas for fetch direto, seguir o mesmo padrão existente (consistência > dogma).

## Casos extremos a tratar
- Cliente sem CPF → Asaas recusa → erro claro ANTES de tentar enviar (não criar cobrança meia-boca).
- Cliente sem e-mail / sem telefone / sem telegram chat id → aquele canal fica indisponível com motivo; os outros seguem.
- Valor < 5,00 → bloquear no front e no back (back já bloqueia).
- Asaas fora do ar → 502, mostrar erro, NÃO fingir envio.
- Sucesso parcial: cobrança criada mas um canal falhou → mostrar cobrança OK + quais canais falharam + link copiável.
- Nenhum canal marcado → permitir só criar a cobrança (gera o link), avisando que nada foi enviado.

## Definição de PRONTO
- Item no menu Financeiro + rota funcionando.
- Tela com marca Paxter (vidro + wordmark ouro + frase), todos os campos visíveis e alinhados (grade imaginária), responsiva (mobile e desktop).
- Criar 1 cobrança real (mínimo R$ 5,00) end-to-end e receber `invoiceUrl`.
- Envio pelos canais com STATUS honesto (real/fallback/mock/erro) — comprovado por execução real (não só "compilou").
- architect (Paxter Loop, Fase 3) aprova requisito por requisito, zero pendência.
- Screenshot da tela.

## Linhas vermelhas
- NÃO alterar `POST /asaas/charge` existente nem o webhook.
- NÃO mudar o motor de cálculo / payload de salvar por estética.
- NÃO inventar letras da marca; usar componentes vivos.
- NÃO logar nem expor tokens/segredos.
