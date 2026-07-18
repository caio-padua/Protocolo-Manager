# Spec C — Robô de Aliases (Zoho Admin API)

## Objetivo
O sistema cria, lista e remove aliases de e-mail no domínio `pawards.com.br` de forma autônoma via Zoho Mail Admin API — o CEO só escolhe o prefixo (ex.: `ceo`) e confirma; o robô faz o resto.

## Pré-requisito (bloqueante — precisa do CEO)
- Spec B concluída (Zoho configurado)
- Token de admin Zoho com scope `ZohoMail.organization.accounts.ALL`
- `org_id` da organização Zoho (visível em admin.zoho.com → Settings → Organization)

## Requisitos

### R1 — Tela de gerenciamento de aliases
- Nova seção "Aliases do Domínio" em `/comunicacao/emails` ou `/configuracoes/emails`.
- Tabela mostrando aliases existentes: Alias | Conta de destino | Criado em | Ação (remover).
- Botão "Novo alias" abre modal com:
  - Campo `prefixo` (ex.: `ceo`) → preview automático → `ceo@pawards.com.br`
  - Campo "Conta de destino" (qual caixa Zoho recebe — dropdown dos usuários do org)
  - Botão "Criar" → chama API → toast de confirmação

### R2 — Rotas de API (admin-only)
- `GET /api/email/aliases` → lista aliases via Zoho Admin API
- `POST /api/email/aliases` → cria alias `{ prefix, targetAccount }`
- `DELETE /api/email/aliases/:aliasId` → remove alias

### R3 — Zoho Admin API integration
- Endpoint: `https://mail.zoho.com/api/organization/{org_id}/accounts/{account_id}/emailalias`
- Autenticação: Bearer token (access token OAuth2 do admin)
- O sistema renova o token automaticamente via refresh_token (igual ao provider OAuth2 da Spec B)

### R4 — Usar alias como remetente
- Após criar o alias, ele aparece automaticamente no dropdown de remetente da Spec B (R3).
- CEO pode imediatamente configurar: "Pré-sessão vem de ceo@pawards.com.br".

### R5 — Proteção
- Só permite aliases no domínio `pawards.com.br` (validação server-side).
- Confirmação antes de remover (modal + texto "Digite o alias para confirmar").
- Log de auditoria (quem criou/removeu, quando).

## Fluxo autônomo completo
```
CEO digita "ceo" → preview "ceo@pawards.com.br" → clica Criar
→ sistema chama Zoho Admin API → alias criado em segundos
→ aparece na lista + no dropdown de remetente (Spec B)
→ CEO configura "Pré-sessão de ceo@pawards.com.br"
→ próximo e-mail enviado com From: ceo@pawards.com.br
```

## Linhas vermelhas
- NÃO criar alias fora do domínio `pawards.com.br`.
- NÃO remover alias sem confirmação explícita.
- NÃO expor token de admin no front-end.

## Definição de PRONTO
- Tela lista aliases reais do Zoho.
- CEO cria alias e recebe e-mail de confirmação do próprio Zoho.
- Alias aparece no dropdown de remetente.

## STATUS: AGUARDANDO SPEC B + ORG_ID + ADMIN TOKEN ZOHO DO CEO
