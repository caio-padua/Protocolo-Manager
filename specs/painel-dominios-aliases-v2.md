# Spec PDA v2 — Painel de Domínios & Aliases COMPLETO

## Objetivo
Sistema completo de gestão de domínios, e-mail e aliases para o CEO e (como módulo pago) para clínicas licenciadas.

---

## PEDIDO 1 — Formulário Completo ao Adicionar Domínio

Quando o CEO adiciona um domínio (comprado em qualquer registrador), preenche TODOS os campos
necessários para que o sistema possa:
  1. Armazenar o domínio no banco com dados completos
  2. Criar e-mails e aliases no Zoho automaticamente
  3. Configurar DNS (MX, SPF, DKIM, DMARC) via Cloudflare ou manual

### Campos do formulário "Adicionar Domínio"
```
SEÇÃO 1 — Identificação
  [ ] Domínio completo (ex.: pawards.com.br)
  [ ] Registrador (dropdown: Registro.br / UOL Host / Locaweb / Namecheap / GoDaddy / Cloudflare / Outro)
  [ ] Data de registro
  [ ] Data de expiração
  [ ] Auto-renovar (toggle)
  [ ] Status (ativo / pendente / em transferência)
  [ ] Titular (nome ou CNPJ/CPF)
  [ ] Notas internas

SEÇÃO 2 — Nameservers (DNS)
  [ ] NS1 (ex.: ivan.ns.cloudflare.com)
  [ ] NS2
  [ ] NS3 (opcional)
  [ ] NS4 (opcional)
  [ ] Provedor DNS ativo (dropdown: Cloudflare / Registro.br DNS / UOL Host DNS / Outro)

SEÇÃO 3 — E-mail (Zoho)
  [ ] Domínio verificado no Zoho? (sim/não)
  [ ] Método de verificação Zoho (TXT record / CNAME / HTML)
  [ ] Conta admin Zoho padrão para este domínio
  [ ] Criar aliases automaticamente? (toggle)

SEÇÃO 4 — Credenciais de Acesso (cofre — nunca exibidas em claro)
  [ ] Login no registrador
  [ ] API Key do registrador (cofre)
  [ ] Cloudflare Zone ID (cofre)
  [ ] Cloudflare API Token (cofre)
  [ ] Zoho Org ID (cofre)
  [ ] Zoho Admin Token (cofre)

SEÇÃO 5 — Empresa Vinculada
  [ ] Empresa licenciada (opcional — CEO = null)
  [ ] Módulo pago? (toggle)
  [ ] Valor mensal (se módulo pago)
```

---

## PEDIDO 2 — Verificar Disponibilidade + Compra via Sistema

### Verificação (já implementada)
- RDAP público: Registro.br (`.com.br`) + Verisign (`.com/.net`) — sem custo, sem auth

### Compra — limitações reais e alternativas

| Registrador | API de compra | Requisito |
|---|---|---|
| Registro.br | NÃO tem API pública REST — usa EPP (protocolo XML para registradores credenciados) | Ser registrador credenciado OU usar UOL Host / Locaweb como proxy |
| UOL Host | Tem API de revenda — documentação em developer.uol.com.br | Conta de revenda UOL + API key |
| Locaweb | Tem API parcial para revendedores | Conta de revenda + token |
| Namecheap | API REST excelente — `.com`, `.net`, `.org`, `.io` etc. (não `.com.br`) | Conta Namecheap + IP whitelist + API key |
| GoDaddy | API REST completa — `.com.br` via revenda | API key + secret no painel developer.godaddy.com |
| Cloudflare | Cloudflare Registrar API — preço de custo (sem markup) | Conta Cloudflare + API token com permissão Registrar |

### Fluxo proposto
```
CEO digita "parxis" → sistema verifica 5 TLDs via RDAP
→ Resultado: disponível em .com (Namecheap) / .org.br (UOL Host)
→ CEO clica "Comprar via Namecheap" → modal confirma valor + prazo
→ POST /api/dominios/comprar → chama API Namecheap → retorna confirmação
→ Sistema preenche automaticamente todos os campos do Pedido 1
→ CEO só completa a Seção 3 (Zoho) e clica Salvar
```

---

## PEDIDO 3 — Módulo Completo de E-mail (CEO gere, Clínica solicita)

### O que o CEO pode fazer (via sistema PAXTER):
1. **Criar e-mail** → POST Zoho Admin API /accounts
2. **Apagar e-mail** → DELETE Zoho Admin API /accounts/:id
3. **Criar alias** → POST Zoho Admin API /accounts/:id/aliases
4. **Apagar alias** → DELETE Zoho Admin API /aliases/:id
5. **Listar contas e aliases** → GET Zoho Admin API /accounts
6. **Configurar DNS** → Cloudflare API (MX, SPF, DKIM, DMARC)
7. **Ver relatório de uso** → quota, last login, etc.

### Módulo pago para Clínicas Licenciadas:
- Clínica acessa tela "Solicitações de E-mail" (leitura)
- Preenche formulário: "Quero e-mail clínica@meudominio.com.br" + justificativa
- CEO recebe notificação (card Trello / WhatsApp / e-mail)
- CEO avalia → aprova → sistema cobra (Asaas) → cria automaticamente
- Clínica recebe e-mail com credenciais

---

## PEDIDO 4 — 4 Blocos por Registrador na UI

### Estrutura da tela (4 blocos independentes, colapsáveis):

```
┌─ BLOCO REGISTRO.BR ─────────────────────────────────────────┐
│  Limitação: sem API REST pública. Opções:                    │
│  [A] Verificar via RDAP (já funciona)                        │
│  [B] Registrar via UOL Host (revenda — precisa API key)      │
│  [C] Registrar manualmente → link para registro.br/registro  │
│  Credenciais UOL Host: [____________________] [Salvar]       │
└──────────────────────────────────────────────────────────────┘

┌─ BLOCO NAMECHEAP ───────────────────────────────────────────┐
│  TLDs: .com .net .org .io .co (NÃO .com.br)                │
│  API key: [__________] IP whitelist: [__________] [Salvar]  │
│  [Verificar] [Comprar] [Listar domínios da conta]           │
└──────────────────────────────────────────────────────────────┘

┌─ BLOCO GODADDY ─────────────────────────────────────────────┐
│  TLDs: todos incluindo .com.br via revenda                  │
│  API Key: [________] Secret: [________] [Salvar]            │
│  [Verificar] [Comprar] [Listar domínios da conta]           │
└──────────────────────────────────────────────────────────────┘

┌─ BLOCO CLOUDFLARE ──────────────────────────────────────────┐
│  Registrar: preço de custo (sem markup)                     │
│  API Token: [________________] [Salvar]                     │
│  [Verificar] [Comprar] [Gerenciar DNS de todos os domínios] │
│  DNS rápido: [Configurar MX Zoho] [Configurar SPF/DKIM]    │
└──────────────────────────────────────────────────────────────┘
```

---

## STATUS DE CONSTRUÇÃO

| O que | Buildável agora | Aguarda |
|---|---|---|
| Formulário completo com todas as seções | SIM | — |
| 4 blocos de registrador com credenciais | SIM | — |
| Verificação RDAP | JÁ PRONTO | — |
| Módulo de e-mail Zoho (criar/apagar/alias) | Scaffold agora | ZOHO_ORG_ID + ZOHO_ADMIN_TOKEN |
| DNS Cloudflare (MX, SPF, DKIM) | Scaffold agora | CF_API_TOKEN + ZONE_ID por domínio |
| Compra via Namecheap | Scaffold agora | NC_API_KEY + NC_USERNAME + IP whitelist |
| Compra via GoDaddy | Scaffold agora | GD_API_KEY + GD_API_SECRET |
| Compra via UOL Host (Registro.br) | Scaffold agora | UOL_API_KEY (conta de revenda) |
| Módulo pago para clínicas (formulário solicitar) | SIM | — |
