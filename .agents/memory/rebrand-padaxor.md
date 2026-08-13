---
name: Cadeia de marca — PAXTER > PARXIS > PADAXOR > PAXMED
description: Histórico oficial dos nomes da marca visível ao cliente. Vigente desde 13/08/2026 é PAXMED. Onde já foi aplicado e o que ainda usa nome antigo.
---

# Cadeia de marca do sistema clínico

| Ordem | Nome | Situação |
|---|---|---|
| 1 | PAXTER | aposentado |
| 2 | PARXIS | aposentado |
| 3 | PADAXOR | aposentado |
| 4 | **PAXMED** | **vigente desde 13/08/2026** |

**Why:** o CEO renomeou a marca visível ao cliente quatro vezes. Cada rodada foi
aplicada só em parte do sistema, então o código carrega as quatro gerações ao mesmo
tempo. Antes de escrever qualquer nome de marca, confirmar que é PAXMED — nunca copiar
o nome de um arquivo vizinho, que pode estar duas gerações atrasado.

## Regras estáveis (não mudam com o nome)

- Tagline em inglês: **"Clinical Intelligence System"** — sobreviveu a todos os
  rebrands. Não reescrever.
- PADCON = infraestrutura/engenharia, empresa que constrói. Não é a marca clínica e
  **não** muda junto.
- Identificadores técnicos NÃO acompanham o rebrand: colunas de banco, nomes de pacote,
  tokens, classes CSS, UID de `.ics`. Só troca texto e marca visível.

## Onde PAXMED já está aplicado

- Carta de Tratamento Premium (`pdf-signer.ts`): capa, header e rodapé de páginas
  internas, texto de assinatura e metadados do PDF.
- Arte da capa: `paxmed-symbol.png` (monograma PX) + `paxmed-wordmark.png`.

## Dívida conhecida de marca

- QR do rodapé da Carta aponta para `paxter.com.br` (constante `PAXTER_SITE_URL`) —
  duas gerações atrás. O domínio definitivo nunca foi decidido pelo CEO.
- Cerca de 37 arquivos ainda escrevem PADAXOR (telas, e-mails, Telegram, Slack, outros
  geradores de PDF).
- Outros geradores de PDF (atestado, dieta) ainda escrevem "Paxter".

**How to apply:** rebrand em massa exige ordem explícita do CEO (Regra de Ouro). Não
varrer o sistema por conta própria; corrigir o artefato em que se está trabalhando e
reportar o resto.
