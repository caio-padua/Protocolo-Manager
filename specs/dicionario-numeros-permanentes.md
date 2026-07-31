# Spec: Dicionário com Números Permanentes

**Para:** Dr. Code
**De:** Dr. Replit Paxter
**Data:** 31/07/2026
**Repositório alvo:** `caio-padua/PADUA-SOFTWARE-DESIGN`

---

## O defeito que esta spec corrige

O monitor de LLMs marcava termos técnicos com `(*N)` onde N era calculado
por mensagem — por ordem de aparição no texto.

Resultado:
- Mensagem A: `(*1) = Anthropic`
- Mensagem B: `(*1) = login_username`

Mesmo marcador, significados diferentes. O CEO nunca aprende por repetição.

---

## A regra correta

Cada termo técnico tem um número **permanente**, baseado em sua posição
no array `GLOSSARIO` em `artifacts/api-server/src/lib/slack-glossario.ts`.

- Posição 1 (índice 0) → `(*1)` → SEMPRE "hash"
- Posição 2 (índice 1) → `(*2)` → SEMPRE "API"
- Se numa mensagem só aparecer "API", a marca é `(*2)`, não `(*1)`

**Regra de crescimento:** termo novo entra no FINAL do array.
Nunca se reordena. Nunca se remove. Número permanente = identidade.

A função `anotarTermos()` já foi corrigida em `slack-glossario.ts`
para usar `GLOSSARIO.findIndex()` em vez de contador dinâmico.

---

## O que o Dr. Code deve criar

### Arquivo: `PADUA-SOFTWARE-DESIGN/DICIONARIO.md`

Tabela com exatamente os mesmos termos, na mesma ordem, com os mesmos
números do array `GLOSSARIO` do código. Os dois devem andar em sincronia.

Formato da tabela:

```markdown
# DICIONÁRIO — números permanentes

> (*N) é sempre o mesmo termo, em qualquer mensagem, hoje e daqui a um ano.
> Novo termo entra no final. Nunca se reordena. Nunca se remove.

| Nº | Termo técnico | O que é | Em linguagem de leigo |
|---|---|---|---|
| (*1) | hash | função criptográfica que produz uma impressão digital de tamanho fixo | Impressão digital de um arquivo — garante que nada foi alterado |
| (*2) | API | Application Programming Interface | Porta de comunicação entre sistemas — como um garçom que leva o pedido da cozinha à mesa |
| (*3) | JWT | JSON Web Token | Crachá digital com prazo de validade — prova quem você é sem precisar digitar senha a cada clique |
...
```

### Regra de sincronização

Sempre que um novo termo for adicionado ao array `GLOSSARIO` no código,
ele deve ser adicionado ao final do `DICIONARIO.md` com o mesmo número.

O número no `.md` é a fonte de verdade para humanos.
O índice no array TypeScript é a fonte de verdade para máquinas.
Os dois são a mesma coisa.

---

## Lista dos 55 termos atuais (para preencher o DICIONARIO.md)

| Nº | Termo |
|---|---|
| (*1) | hash |
| (*2) | API |
| (*3) | JWT |
| (*4) | CORS |
| (*5) | tenant |
| (*6) | middleware |
| (*7) | endpoint |
| (*8) | cron |
| (*9) | cron job |
| (*10) | schema |
| (*11) | deploy |
| (*12) | token |
| (*13) | webhook |
| (*14) | ledger |
| (*15) | buffer |
| (*16) | pipeline |
| (*17) | royalty |
| (*18) | RLS |
| (*19) | UUID |
| (*20) | migration |
| (*21) | seed |
| (*22) | mimeType |
| (*23) | proxy |
| (*24) | OAuth |
| (*25) | SSE |
| (*26) | env var |
| (*27) | pull |
| (*28) | commit |
| (*29) | branch |
| (*30) | merge |
| (*31) | repo |
| (*32) | fail-safe |
| (*33) | spec |
| (*34) | tenant context |
| (*35) | ai_usage_log |
| (*36) | logAiUsage |
| (*37) | requireCeoInstance |
| (*38) | PADAXOR_AI_BYPASS |
| (*39) | empresa_id |
| (*40) | tenantContext |
| (*41) | Slack |
| (*42) | Drive |
| (*43) | Sheets |
| (*44) | Cloudflare |
| (*45) | Railway |
| (*46) | Replit |
| (*47) | Anthropic |
| (*48) | Gemini |
| (*49) | OpenAI |
| (*50) | token (IA) |
| (*51) | input_tokens |
| (*52) | output_tokens |
| (*53) | P0 |
| (*54) | P1 |
| (*55) | P2 |

---

## Prova de entrega

Commit no repo `caio-padua/PADUA-SOFTWARE-DESIGN` com:
- `DICIONARIO.md` criado com os 55 termos na ordem acima
- Número no `.md` bate com índice+1 no array TypeScript

**Sem esse bate, o sistema vai continuar gerando `(*N)` inconsistentes
entre código e documentação.**
