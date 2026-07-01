---
name: E-mail Paxter v2 (fundo terno + tabela de substancia)
description: Decisoes duraveis do e-mail branded Paxter v2 — fundo navy "terno" e substancias SEMPRE em tabela de colunas alinhadas (cartoes reprovados)
---

Decisao do CEO (28/06/2026): o e-mail branded Paxter usa fundo navy "TERNO" (mais claro que o
quase-preto antigo). Fundo terno segue valendo.

REFINAMENTO do CEO (30/06/2026) — SUBSTITUI a parte "tabela vs cartoes" da decisao de 28/06:
a lista de substancia pode SIM ser em CARTOES (um cartao por substancia), DESDE QUE as
informacoes dentro do cartao fiquem ALINHADAS por uma "linha vertical imaginaria" que se
repete IGUAL de um cartao para o outro. Ou seja: nao era "cartao" que o CEO reprovava, era
cartao com dados desalinhados. Cartao alinhado = aprovado.

Estrutura do cartao aprovada:
- linha 1: [ponto] Substancia (esquerda) ....... Dose so massa (direita);
- linha 2: Sessao N/total (esquerda) ....... Frequencia "a cada N dias" (direita);
- (opcional) pilula de status Aplicado/Nao aplicado.
- O alinhamento vem de LARGURA FIXA identica das duas colunas internas em TODOS os cartoes
  (constantes COL_ESQ/COL_DIR em substance-table.ts) — sem isso a "linha imaginaria" quebra.

Regras duraveis mantidas:
- Dose/Sessao/Frequencia alinhadas na vertical entre TODAS as substancias; um dado/linha so
  aparece se PELO MENOS 1 item tiver aquele dado (degrade gracioso).
- DOSE so na quantidade de massa (miligramagem): remover a concentracao "/ N ml" (ex.: "5 mg / 2 ml"
  -> "5 mg"). Interpretacao do CEO de "dose so em mg" = TIRAR o volume, mantendo a unidade real
  (B12 legitimo continua em mcg; nao forcar tudo a "mg").

**Why:** clientes de e-mail ignoram gradiente/imagem de fundo; e a COR SOLIDA de fallback que garante
o "menos escuro" — nao confiar so no gradiente. O que o CEO exige e o ALINHAMENTO (bater o olho e
comparar substancias num relance, Densidade B); o formato pode ser cartao OU tabela, desde que as
colunas caiam na mesma vertical em todos os itens.

**How to apply:** montar a lista de substancia pelo motor unico `blocoTabelaSubstancias`
(substance-table.ts, fonte compartilhada previa+envio), nunca a mao (Art. 57) — NAO renomear a
funcao para nao quebrar os 5 fluxos ricos + sample-doc + google-calendar que a chamam. Previa viva e
envio de teste ficam no router de marca (GET /api/brand/email-preview); a rota de teste e
SOMENTE-DESENVOLVIMENTO (404 em producao) e aceita destino explicito (e-mail/WhatsApp) so para
validacao do CEO — a ferramenta definitiva de modelos (autenticada, no painel) ainda nao existe.

**WhatsApp x e-mail:** o WhatsApp NAO renderiza tabela/HTML — chega banner de marca (imagem) + texto;
a prova visual cheia (terno + tabela) e exclusiva do e-mail. Twilio WhatsApp esta configurado (From no
cofre cifrado, nao no env); telefone do destino entra cru e o helper normaliza para 55+DDD.
