# Spec B — Multi-Remetente Zoho (pawards.com.br)

## Objetivo
Permitir que o sistema envie e-mails usando qualquer endereço do domínio `pawards.com.br` (ex.: `clinica@pawards.com.br`, `ceo@pawards.com.br`) via Zoho Mail API ou SMTP, em paralelo ou substituindo o Gmail OAuth.

## Pré-requisito (bloqueante — precisa do CEO)
Credenciais Zoho em uma das formas:
- **Opção A (recomendada)**: Zoho OAuth2 — `ZOHO_CLIENT_ID` + `ZOHO_CLIENT_SECRET` + `ZOHO_REFRESH_TOKEN`
- **Opção B (mais simples)**: App Password SMTP — host `smtp.zoho.com`, porta 587, login + senha de app

## Requisitos

### R1 — Cofre de credenciais Zoho
- Campos adicionados ao cofre de integrações existente (`/api/integrations`):
  - `zoho_mail_provider`: `oauth2 | smtp`
  - `zoho_from_address`: endereço padrão de envio (ex.: `clinica@pawards.com.br`)
  - `zoho_client_id` (secret)
  - `zoho_client_secret` (secret)
  - `zoho_refresh_token` (secret)
  - `zoho_smtp_login` (opcional, para Opção B)
  - `zoho_smtp_password` (secret, opcional)

### R2 — Provider abstrato
- Novo arquivo `lib/email-provider.ts` com interface `EmailProvider`:
  ```
  sendEmail(options: EmailOptions): Promise<{ ok: boolean; error?: string }>
  getFromAddress(): Promise<string | null>
  ```
- Implementações: `GmailProvider` (extrai código atual) e `ZohoProvider` (nova).
- `email-service.ts` escolhe o provider ativo via `app_settings.email_provider` (valor: `gmail | zoho`).

### R3 — Por tipo de e-mail
- `app_settings` ganha campos opcionais `email_from_pre_sessao`, `email_from_pos_sessao`, `email_from_lembrete`.
- Se vazio, usa o `zoho_from_address` padrão.
- Tela de e-mail mostra tabela editável: Tipo | Remetente atual | Ação (editar).

### R4 — Tela de configuração Zoho
- Card "Zoho Mail" na tela `/comunicacao/emails` (ou nova aba "Remetentes"):
  - Status (conectado / não configurado)
  - Campo "Endereço padrão" (editável)
  - Tabela por tipo de e-mail com remetente configurado
  - Botão "Testar conexão" (envia e-mail para o próprio CEO)

### R5 — Fallback
- Se Zoho falhar, tenta Gmail (se configurado). Loga o fallback no `email_log.provider`.

## Linhas vermelhas
- NÃO remover o Gmail Provider — ele continua como fallback.
- NÃO fazer DROP em nenhuma tabela.
- NÃO alterar o formato dos e-mails (HTML, template, assunto).

## Definição de PRONTO
- Credenciais Zoho no cofre.
- Envio de e-mail de teste chega na caixa do CEO vindo de `@pawards.com.br`.
- Tela mostra qual provider está ativo.
- Log registra `provider: "zoho"`.

## STATUS: AGUARDANDO CREDENCIAIS ZOHO DO CEO
