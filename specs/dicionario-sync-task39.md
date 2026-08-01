# Spec: Dicionário PADAXOR — Sync e Verificação (*N)
**Task:** #39
**Data:** 31/07/2026
**Autor:** Dr. Replit Paxter

---

## Objetivo

Garantir que o número (*N) exibido no relatório Slack de cada termo do glossário seja idêntico ao número permanente em `dicionario/dicionario.json` (fonte de verdade no GitHub), e que qualquer divergência seja detectada automaticamente.

---

## Requisitos obrigatórios

1. **R1 — Fonte única:** `slack-glossario.ts` é o espelho do `dicionario.json` para uso em runtime. O campo `numero` de cada entrada em `slack-glossario.ts` DEVE bater com o campo `numero` do mesmo `termo` em `dicionario.json`. A comparação é case-insensitive no campo `termo`.

2. **R2 — Script gerador do MD:** criar `dicionario/gerar_md.py` no repo `PADUA-SOFTWARE-DESIGN` que lê `dicionario/dicionario.json` e regera `DICIONARIO.md` com as 4 colunas canônicas: `Nº | Termo | Tradução (leigo) | Analogia Clínica`. O script é idempotente: rodar duas vezes produz o mesmo arquivo.

3. **R3 — Endpoint de verificação:** `GET /api/padaxor/dicionario/verificar` (protegido por `requireCeoInstance`) que:
   - Lê o `dicionario.json` diretamente do GitHub via API pública (raw content) — sem depender de clone local
   - Compara cada termo de `GLOSSARIO` (slack-glossario.ts, carregado em memória) com o JSON do GitHub
   - Retorna `{ totalGlossario, totalGithub, divergencias: [{ termo, numeroGlossario, numeroGithub }], sync: boolean }`

4. **R4 — Confirmação zero divergência:** quando chamado após o build, o endpoint deve retornar `sync: true` e `divergencias: []`.

5. **R5 — anotarTermos preservado:** a função `anotarTermos` (que substitui `(*N)` nos textos do relatório) deve continuar usando `entry.numero` explícito — nunca a posição no array.

---

## Casos extremos

- GitHub API indisponível: retornar `{ sync: null, erro: "GitHub API indisponível" }` com HTTP 503 (não 500).
- Termo em `slack-glossario.ts` que não existe no GitHub JSON: listar como `divergencia` com `numeroGithub: null`.
- Termo no GitHub que não existe em `slack-glossario.ts`: listar separado em `apenasNoGithub: [{ termo, numero }]`.

---

## Definição de PRONTO

| Critério | Como conferir |
|---|---|
| R1: números batem | `GET /api/padaxor/dicionario/verificar` retorna `sync: true` |
| R2: script existe e roda | `cd /tmp/PADUA-SW && python3 dicionario/gerar_md.py && head DICIONARIO.md` |
| R3: endpoint responde | curl retorna JSON válido com `totalGlossario: 85` |
| R4: zero divergências | campo `divergencias: []` no curl |
| R5: anotarTermos usa numero explícito | grep `entry.numero` em slack-glossario.ts |

---

## Linhas vermelhas

- NÃO renumerar termos existentes em `slack-glossario.ts` (números 1–85 são permanentes).
- NÃO fazer fetch autenticado (usar raw.githubusercontent.com público).
- NÃO alterar `anotarTermos` de forma que mude o comportamento atual.
- NÃO modificar `dicionario.json` via código — só o Dr. Code ou script dedicado.
