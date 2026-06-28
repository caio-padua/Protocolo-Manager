---
name: E-mail Paxter v2 (fundo terno + tabela de substancia alinhada)
description: Padrao visual do e-mail branded apos v2 — fundo navy "terno" mais claro e substancias em TABELA de colunas alinhadas (CEO descartou cartoes)
---

Regra: o casco do e-mail Paxter (Hermes, `messaging/render-email.ts` -> `paxterEmailShell`) usa fundo
"TERNO" navy MAIS claro que o antigo `#05080f` — cor solida de fallback `#0a1430` + gradiente de
profundidade (`#0b1426->#0e1c3a->#16284e`) + brilho dourado no topo + tramado de 22px; card `#0e1a34`.
A lista de substancias de e-mail clinico e uma TABELA de colunas ALINHADAS, NUNCA cartoes.

**Tabela de substancia** (fonte unica `messaging/substance-table.ts` -> `blocoTabelaSubstancias`):
colunas FIXAS, alinhadas na vertical entre TODAS as substancias, sobre painel `#13234a`, zebra leve.
Ordem: SUBSTANCIA | DOSE | SESSAO | FREQUENCIA | STATUS. (1) DOSE so na quantidade em miligramagem —
o helper `soMiligramas` REMOVE a concentracao "/ N ml" (ex.: "5 mg / 2 ml" -> "5 mg"); (2) nome em
serifa creme `#f3ead6`, ponto colorido semantico opcional; (3) SESSAO "4/12"; (4) FREQUENCIA "a cada N
dias"; (5) STATUS em pilula (verde `#0f2a1e/#34d399` = Aplicado / vermelho `#2a1010/#f87171` = Nao
aplicado); (6) coluna so aparece se PELO MENOS 1 substancia tiver aquele dado (degrade gracioso).

**Why:** o CEO reprovou o e-mail "muito escuro" (quase preto) e a tabela de 3 colunas apertada;
aprovou o fundo terno em 28/06/2026. Na mesma data TESTOU cartoes empilhados e os DESCARTOU — preferiu
de volta a TABELA, agora com colunas alinhadas e dose so em miligramagem. `substance-cards.ts` foi
removido. Virou Padrao 20 (TABELA) + Padrao 19 na skill `skill-layout-paxter`; Art. 66 v2 no Codigo Paxter.

**How to apply:** qualquer e-mail clinico novo/alterado monta `blocoTabelaSubstancias` em `blocosHtml`
do PaxterDoc; nunca montar tabela de substancia a mao (Art. 57). Clientes de e-mail ignoram
gradiente/imagem -> e a COR SOLIDA de fallback que garante o "menos escuro" (nao confiar so no
gradiente). Previa viva: `GET /api/brand/email-preview` (amostra em `messaging/sample-doc.ts`, fonte
unica previa+envio). Envio de teste para validacao do CEO: `POST /api/brand/email-test {to}` — rota
SOMENTE-DESENVOLVIMENTO (404 em producao), nao precisa de segredo, nao loga endereco. A "ferramenta que
grava o modelo" definitiva (autenticada, no painel) ainda nao foi construida — esperar aval do CEO.
