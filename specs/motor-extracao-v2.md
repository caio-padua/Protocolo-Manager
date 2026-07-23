# Spec: Motor de Extração v2 — 6 pedidos do CEO (23/07/2026)

## Objetivo
Melhorar o motor de extração de exames laboratoriais com: lab name editável,
marcador de histórico na evolução, renomeação real no Drive, botões corretos
pelo skill-layout-paxter e garantia de auto-criação de cliente.

---

## Pedidos (6)

### P1 + P2 — Lab name editável
- Gemini extrai `labName` do PDF (cabeçalho/rodapé/URL de validação).
- Se `labName` for nulo no card de Procedência → campo inline editável aparece.
- PATCH `/api/exames-lab/documento/:id` grava `labName` (e `collectionDate`).
- Prompt MEDIA_SUFFIX melhora: instruir que o nome do lab fica no canto superior
  esquerdo, timbre do papel, rodapé, URL de validação.

### P3 — Data de coleta correta (22/07)
- `collectionDate` vem da extração do Gemini (já funciona).
- Coluna no painel de Evolução mostra `22/07` como data principal.
- Datas anteriores (04/05, 19/05) são histórico dentro do mesmo laudo.

### P4 + P5 — Marcador de histórico
- ADD COLUMN `is_history BOOLEAN NOT NULL DEFAULT FALSE` em `exam_results`.
- persist.ts: linhas de `analyte.history[]` recebem `isHistory: true`.
- Endpoint de evolução: coluna marcada `isHistory: true` quando TODOS os
  resultados dela são históricos.
- EvolucaoExamesPanel: badge "HISTÓRICO" no cabeçalho de colunas históricas
  (cor âmbar, texto menor).
- ProcedenciaDocumentosBloco: analitos do histórico mostram badge "Histórico"
  na coluna de status.

### P6 — Botão correto (skill-layout-paxter)
- `<a href={dUrl}>` com `className="btn-3d"` não é Button shadcn — corrigir para
  `<Button asChild className="btn-3d"><a ...>...</a></Button>`.
- `<button>` HTML com `className="btn-3d-soft"` → `<Button className="btn-3d-soft">`.

### P7 — Renomear arquivo no Drive
- Após extrair + salvar, criar CÓPIA no Drive com nome canônico:
  `YY.MM.DD EXAME SANGUE NOME_CLIENTE.pdf`.
- Original fica intocado (sandboxing).
- `copiedDriveId` gravado na tabela `drive_watcher_files` (nova coluna).
- Log: "Cópia criada no Drive: [nome]".

### P8 — Auto-criação de cliente + watcher
- Já implementado (`autoCreateClient`).
- Disparar watcher após restart para processar os 2 novos arquivos do CEO.

---

## Restrições
- Nunca DROP TABLE; ADD COLUMN via SQL direto (tabela populada).
- `btn-3d` = ação primária (1 por bloco); `btn-3d-soft` = secundária/par neutro.
- Log de watcher honesto: registrar nome do cliente criado + nome do arquivo copiado.
