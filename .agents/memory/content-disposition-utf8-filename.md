---
name: Content-Disposition com nome de arquivo acentuado quebra o download (ERR_INVALID_CHAR)
description: Por que uma rota de download de PDF retorna HTTP 500 "Invalid character in header content" quando o nome do arquivo vem de um título/nome de paciente em português, e qual o padrão certo já usado no próprio projeto.
---

# Nome de arquivo dinâmico em Content-Disposition precisa de encodeURIComponent + filename*=UTF-8''

Rotas que geram PDF (protocolo, RAS FAP, receita, atestado, encaminhamento, sessão,
dieta) frequentemente montam o nome do arquivo a partir de dado real (nome do
cliente, título do protocolo) e escrevem direto:

```ts
res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
```

Isso quebra com HTTP 500 (`Invalid character in header content
["Content-Disposition"]`) assim que `filename` contém um acento, cedilha ou
travessão — o que é a norma em português (ex.: "LONGEVIDADE + HORMONAL +
METABOLISMO — CARLUCIA"). O Node.js valida caracteres de cabeçalho HTTP em modo
estrito e rejeita bytes fora do ASCII básico quando não vêm codificados.

**Why:** o bug fica invisível em teste manual superficial porque só aparece
quando o nome/título tem acento ou travessão — protocolos de teste com nome
"simples" (sem acento) mascaram o problema. Descoberto ao testar de ponta a
ponta uma rota de download recém-reescrita com um protocolo de teste cujo
título tinha "—" e "Ç".

**How to apply:** usar sempre o padrão RFC 5987, já usado e comprovado em
`artifacts/api-server/src/routes/exames-lab.ts` (rota de download do cofre):

```ts
res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
```

Cobre acento, travessão e qualquer caractere especial sem exceção manual.

**Pendência conhecida (15/08/2026):** o padrão antigo (`filename="${...}"` cru
com dado dinâmico) ainda existe em outros arquivos do `api-server` além dos já
corrigidos em `ras.ts` — pelo menos `protocols.ts` (2 ocorrências),
`exam-requests.ts`, `area-paciente.ts` (2), `atestados.ts`,
`encaminhamentos.ts`, `sessions.ts` (2), `prescriptions.ts` (2), `dieta-pdf.ts`
e `assinaturas.ts`. Todas usam nome de paciente/protocolo/receita como fonte —
mesmo risco. Nenhuma foi corrigida ainda (fora do escopo do conserto do
`ras.ts`); precisa de autorização do CEO antes de tocar (regra de fila/uma
tarefa por vez).
