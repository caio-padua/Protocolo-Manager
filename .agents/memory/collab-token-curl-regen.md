---
name: Token de colaborador para teste por curl
description: Como forjar o token HMAC do Portão do Colaborador para curl e por que ele some no restart
---

Para testar rotas `requireCollaborator` (ex.: `/api/importar-drive/*`) por curl, é preciso
forjar o token HMAC manualmente. O formato NÃO é segmentado por ponto: o token é
`base64url( "collab:<profId>:<role>:<exp>:<sig>" )` onde `<sig>` é HMAC-SHA256 do payload
`collab:<profId>:<role>:<exp>` em **hexadecimal** (segredo = `SESSION_SECRET`). Ver
`createCollaboratorToken`/`verifyCollaboratorToken` em `artifacts/api-server/src/lib/collaborator-auth.ts`.

**Why:** errei 2x fazendo `base64url(payload) + "." + base64url(sig)` (401). O gerador real
concatena payload+sig com `:`, assina em hex e faz base64url do conjunto inteiro.

**How to apply:** antes de forjar à mão, LER `createCollaboratorToken` e reproduzir exatamente.
Enviar como `Authorization: Bearer <tok>`. O token salvo em `/tmp` some quando o api-server
reinicia (checkpoint automático); é só regerar. Reiniciar o api-server também zera o estado
em memória de importações em andamento (dados no banco ficam; dedup por unique(clientId,hash)).
