---
name: E-mail Paxter v2 (fundo terno + tabela de substancia)
description: Decisoes duraveis do e-mail branded Paxter v2 — fundo navy "terno" e substancias SEMPRE em tabela de colunas alinhadas (cartoes reprovados)
---

Decisao do CEO (28/06/2026): o e-mail branded Paxter usa fundo navy "TERNO" (mais claro que o
quase-preto antigo) e lista substancias SEMPRE como TABELA de colunas alinhadas — NUNCA cartoes
empilhados (foram testados e descartados na mesma data). Virou Padrao 19/20 da skill
`skill-layout-paxter` e Art. 66 v2 do Codigo Paxter.

Regras duraveis da tabela:
- Colunas alinhadas na vertical entre TODAS as substancias; ordem SUBSTANCIA | DOSE | SESSAO |
  FREQUENCIA | STATUS; uma coluna so aparece se PELO MENOS 1 item tiver aquele dado (degrade gracioso).
- DOSE so na quantidade de massa (miligramagem): remover a concentracao "/ N ml" (ex.: "5 mg / 2 ml"
  -> "5 mg"). Interpretacao do CEO de "dose so em mg" = TIRAR o volume, mantendo a unidade real
  (B12 legitimo continua em mcg; nao forcar tudo a "mg").

**Why:** clientes de e-mail ignoram gradiente/imagem de fundo; e a COR SOLIDA de fallback que garante
o "menos escuro" — nao confiar so no gradiente. A tabela alinhada foi o que o CEO aprovou para bater
o olho e comparar substancias num relance (Densidade B: tabela e o carro-chefe).

**How to apply:** montar a lista de substancia pelo motor unico de tabela (fonte compartilhada
previa+envio), nunca a mao (Art. 57). Previa viva e envio de teste ficam no router de marca; a rota de
teste e SOMENTE-DESENVOLVIMENTO (404 em producao) e aceita destino explicito (e-mail/WhatsApp) so para
validacao do CEO — a ferramenta definitiva de modelos (autenticada, no painel) ainda nao existe.

**WhatsApp x e-mail:** o WhatsApp NAO renderiza tabela/HTML — chega banner de marca (imagem) + texto;
a prova visual cheia (terno + tabela) e exclusiva do e-mail. Twilio WhatsApp esta configurado (From no
cofre cifrado, nao no env); telefone do destino entra cru e o helper normaliza para 55+DDD.
