---
name: Git push/fetch — fallback de autenticação HTTPS
description: Quando o git via terminal (ou o painel Git do Replit) falha com "Invalid username or token", como diagnosticar e destravar usando o secret GITHUB_PAT.
---

Sintoma: `git fetch`/`git push` para um remoto GitHub HTTPS falha com "remote: Invalid username or token. Password authentication is not supported for Git operations." — tanto no painel Git do Replit quanto em comandos git manuais no shell.

Causas possíveis, checar NESTA ORDEM:
1. Branch divergente + mudanças não commitadas no working tree (git recusa sincronizar sozinho). Resolver primeiro: commitar tudo, só depois mexer em credencial.
2. Credencial de ambiente (GIT_ASKPASS, é o que o painel Git do Replit usa por trás) expirada/inválida — sintoma persiste mesmo com working tree limpo.

Fallback que funcionou neste projeto: existe um secret `GITHUB_PAT` separado da integração GitHub gerenciada pelo Replit. Para usar sem nunca expor o valor:
```
AUTH_HEADER="Authorization: Basic $(printf 'x-access-token:%s' "$GITHUB_PAT" | base64 -w0)"
git -c http.extraHeader="$AUTH_HEADER" push origin main
```
`-c` é escopado ao comando (nunca grava o token em `.git/config`). Testar primeiro com `ls-remote` (read-only) antes de `push`.

**Por quê:** GITHUB_PAT resolveu quando a credencial de ambiente (GIT_ASKPASS) estava quebrada — ou seja, são DOIS mecanismos de autenticação independentes neste ambiente; consertar um pelo terminal não conserta automaticamente o outro (o painel visual do Replit).

**Como aplicar:** se o usuário reportar erro recorrente no botão de sync do painel Git do Replit mesmo depois do terminal sincronizar, a integração GitHub gerenciada provavelmente precisa ser reconectada (ProposeIntegration com o connection id do GitHub) — GITHUB_PAT não conserta o painel, só destrava comandos manuais.
