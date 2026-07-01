---
name: E-mail Paxter v2 (fundo terno + cartões alinhados de substância)
description: Decisões duráveis do e-mail branded Paxter — fundo navy "terno" e substâncias em CARTÕES ALINHADOS por uma linha vertical imaginária (fonte única)
---

Fundo navy "TERNO" (mais claro que o quase-preto antigo) — decisão do CEO 28/06/2026, segue valendo.

**Regra da lista de substância (CEO 30/06/2026):** cada substância é um CARTÃO próprio, mas as
informações dentro dele ficam ALINHADAS por uma "linha vertical imaginária" que se repete IGUAL de
um cartão para o outro. Não era o cartão que o CEO reprovava; era o cartão com dados desalinhados.
Cartão alinhado = aprovado.

Estrutura do cartão:
- linha 1: [ponto colorido] Substância (esquerda) ....... Dose só massa (direita);
- linha 2: Sessão N/total (esquerda) ....... Frequência "a cada N dias" (direita);
- pílula de status (Aplicado / Não aplicado) opcional.

**Why:** o CEO decide por comparação num relance (Densidade B); o alinhamento vertical é o que
permite bater o olho entre substâncias. O formato pode ser cartão, desde que as colunas caiam na
MESMA vertical em todos os itens. Fundo: clientes de e-mail ignoram gradiente/imagem — a cor sólida
de fallback é o que garante o "menos escuro"; não confiar só no gradiente.

**How to apply:**
- A lista é montada SEMPRE pelo motor único `blocoTabelaSubstancias` (substance-table.ts). O
  alinhamento vem de LARGURA FIXA idêntica das duas colunas internas em todos os cartões — sem isso a
  linha imaginária quebra. Um dado/linha só aparece se ao menos 1 item o tiver (degrade gracioso).
  Estender por props opcionais (ex.: `sessaoLabel` para relabelar a linha 2), nunca forkar o motor.
- DOSE só na massa: remover a concentração "/ N ml" via `soMiligramas` mantendo a unidade real
  (B12 legítimo continua em mcg; não forçar tudo a "mg").
- LIÇÃO (30/06/2026): a rota de prévia (`GET /api/brand/email-preview`, via sample-doc.ts) prova só
  o VISUAL, NÃO o rollout. O motor precisa estar de fato LIGADO em cada gerador de e-mail rico de
  `email-service.ts` (pré-sessão, pós-sessão, protocolo/onboarding). Já aconteceu de o motor existir
  e os fluxos reais ainda montarem tabela flat com dose crua — o code_review pega isso. Ao mexer no
  layout da substância, varrer `email-service.ts` e conferir que todo caminho de produção chama o
  motor, não só a amostra.

**WhatsApp x e-mail:** o WhatsApp não renderiza HTML — chega banner de marca (imagem) + texto; a
prova visual cheia (terno + cartões) é exclusiva do e-mail. Twilio configurado com From no cofre
cifrado (não no env); telefone do destino entra cru e o helper normaliza para 55+DDD.
