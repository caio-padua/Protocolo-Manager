---
name: Dicionário — fonte única e sincronização automática
description: Arquitetura de sincronização entre GLOSSARIO (código), DICIONARIO.md e aba Google Sheets — regra de onde adicionar termo novo.
---

## Regra central

`slack-glossario.ts` → array `GLOSSARIO` é a **única fonte de verdade de máquina**.

Toda outra representação (aba Sheets, DICIONARIO.md, Slack `(*N)`) deriva daí.

## Fluxo ao adicionar um novo termo

1. Adicionar `{ numero, termo, leigo }` no **final** do array `GLOSSARIO` em `artifacts/api-server/src/lib/slack-glossario.ts`.
   - `numero` = próximo inteiro sequencial. Nunca reutilizar. Nunca reordenar.
2. O servidor **já sincroniza automaticamente** no boot → aba DICIONARIO no Sheets recebe a linha nova.
3. Para sync imediato sem restart: `POST /api/admin/planilha/sincronizar-dicionario`.
4. Para regenerar o `DICIONARIO-para-subir.md` (markdown humano): rodar `python3 dicionario/conferir_dicionario.py` no repo PADUA-SOFTWARE-DESIGN (Dr. Code).

## O que a sincronização FAZ e o que ela NÃO FAZ

| Ação | Comportamento |
|---|---|
| Linha nova no GLOSSARIO | Append na aba Sheets (linha nova no final) |
| Linha já existente | IGNORADA — preserva colunas C/E/F que o CEO preencheu |
| Aba DICIONARIO ausente | Cria do zero com cabeçalho + todos os termos + formatação navy |

## Arquivos-chave

- Fonte: `artifacts/api-server/src/lib/slack-glossario.ts` → `GLOSSARIO`
- Sync lib: `artifacts/api-server/src/lib/sheets-dicionario.ts` → `sincronizarDicionarioSheets(sid)`
- Boot: `artifacts/api-server/src/app.ts` — dynamic import + `.catch()` (não bloqueia boot)
- Rota manual: `POST /api/admin/planilha/sincronizar-dicionario` (autenticada com requireCeoInstance)

**Why:** antes havia `GLOSSARIO_INLINE` hardcoded em `admin-planilha-temp.ts` que divergia do `GLOSSARIO` real. Qualquer novo termo exigia atualização em 3 lugares. Agora é 1 lugar.

**How to apply:** toda vez que o CEO pedir "adicionar termo ao dicionário", editar SOMENTE o array `GLOSSARIO` em `slack-glossario.ts` e reiniciar o servidor (ou chamar a rota de sync). O resto propaga automaticamente.
