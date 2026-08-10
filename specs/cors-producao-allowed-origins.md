# Spec: Garantir que o CORS não quebre em produção quando ALLOWED_ORIGINS não estiver definida

**Data:** 10/08/2026  
**Origem:** Task #85 (tech_debt) — Paxter Loop

---

## Objetivo

Tornar o CORS do api-server à prova de configuração incorreta em produção: aceitar automaticamente
o domínio `REPLIT_DOMAINS` (quando definido) sem exigir que o operador também defina `ALLOWED_ORIGINS`
manualmente; e documentar o `ALLOWED_ORIGINS` no arquivo de exemplo do Railway.

---

## Requisitos exatos

1. Se `REPLIT_DOMAINS` estiver definida no ambiente, todos os domínios listados nela são automaticamente
   adicionados às origens permitidas — sem precisar de `ALLOWED_ORIGINS` manual.
2. Se `ALLOWED_ORIGINS` estiver definida, seus valores são somados aos de `REPLIT_DOMAINS` (união, sem duplicatas).
3. Se nenhuma das duas estiver definida, o comportamento atual é mantido: fallback para `localhost:5173`
   e `localhost:4173` com aviso de log.
4. O log de boot mostra exatamente quais origens foram carregadas (lista completa), incluindo as vindas de `REPLIT_DOMAINS`.
5. O arquivo `artifacts/api-server/.env.railway.example` (ou equivalente de documentação) inclui a variável
   `ALLOWED_ORIGINS` com comentário explicando o formato e quando é obrigatória.
6. Teste manual: curl com `Origin: <REPLIT_DOMAINS_value>` retorna `access-control-allow-origin` correto
   sem `ALLOWED_ORIGINS` definida.

---

## Casos extremos a tratar

- `REPLIT_DOMAINS` com múltiplos domínios separados por vírgula → todos incluídos.
- `REPLIT_DOMAINS` contendo espaços → trimados antes de usar.
- Mesmo domínio em `REPLIT_DOMAINS` e `ALLOWED_ORIGINS` → aparece uma só vez (sem duplicata no log).

---

## Definição de PRONTO

- Log de boot (sem `ALLOWED_ORIGINS`) mostra os domínios de `REPLIT_DOMAINS` como "origens permitidas carregadas" (não o aviso de fallback).
- `curl -H "Origin: https://<REPLIT_DOMAINS>" -X OPTIONS localhost:8080/api/client-photo/send-link/1`
  retorna status 204 com header `access-control-allow-origin` correto.
- Arquivo de exemplo atualizado com comentário claro sobre `ALLOWED_ORIGINS`.

---

## Linhas vermelhas

- NÃO remover o suporte a `ALLOWED_ORIGINS` — ele é necessário para produção própria (Railway com domínio customizado).
- NÃO alterar nenhuma rota de API.
- NÃO alterar o Helmet nem o Rate Limiter.
