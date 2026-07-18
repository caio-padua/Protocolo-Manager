# Spec — Painel de Domínios & Aliases (PDA)

## Objetivo
Dar ao CEO (e futuramente às clínicas licenciadas) um painel completo para: verificar disponibilidade de domínios, registrar novos, gerenciar os existentes, e criar aliases de e-mail automaticamente via Zoho Admin API — tudo em uma tela unificada.

## Arquitetura — 3 blocos em sequência

```
TELA: /comunicacao/dominios

[BLOCO 1 — VERIFICADOR DE DISPONIBILIDADE]
  Input: nome base (ex.: "pawards")
  Sistema verifica: pawards.com.br | pawards.com | pawards.net | pawards.com.br
  Resultados: badge verde (disponível) ou vermelho (registrado) por TLD
  Ação: botão "Registrar" abre modal → chama API do registrador configurado

[BLOCO 2 — DOMÍNIOS SOB CONTROLE]
  Tabela dos domínios cadastrados no DB (tabela `dominios`)
  Colunas: domínio | status | registrador | expira em | alias count | checkbox
  Seleção múltipla via checkbox
  Importar domínio existente: botão "Adicionar domínio manualmente"

[BLOCO 3 — CRIADOR DE ALIASES] (aparece ao selecionar ≥1 domínio)
  Campo: prefixo (ex.: ceo / clinica / atendimento)
  Preview ao vivo: ceo@pawards.com.br | ceo@parxis.com.br
  Conta destino: dropdown dos usuários Zoho do org
  Botão "Criar aliases" → chama Zoho Admin API para cada domínio selecionado
  Resultado: toast por domínio (sucesso / falha / já existe)
```

## Tabela `dominios` (nova no DB)

```sql
CREATE TABLE dominios (
  id serial PRIMARY KEY,
  dominio text NOT NULL UNIQUE,         -- ex.: pawards.com.br
  registrador text,                      -- namecheap | godaddy | cloudflare | manual
  registrador_domain_id text,            -- ID externo no registrador (para API)
  status text NOT NULL DEFAULT 'ativo',  -- ativo | expirado | pendente | cancelado
  expira_em date,
  auto_renovar boolean DEFAULT true,
  empresa_id integer,                    -- FK futura para empresas_licenciadas
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);
```

## Bloco 1 — Verificador (implementar agora — Registro.br RDAP público)
- Endpoint: `GET /api/dominios/check?base=pawards`
- Chama `https://rdap.registro.br/domain/{base}.com.br` (404 = disponível)
- Chama `https://rdap.verisign.com/com/v1/domain/{base}.com` para .com
- Retorna: `{ "pawards.com.br": "disponivel" | "registrado", "pawards.com": "..." }`
- UI: grid de cards por TLD com status colorido

## Bloco 2 — Domínios sob controle (implementar agora — sem credenciais externas)
- `GET /api/dominios` — lista do banco
- `POST /api/dominios` — adiciona manualmente `{ dominio, registrador, expira_em }`
- `DELETE /api/dominios/:id` — remove (com confirmação)
- UI: tabela com checkbox + botão "Adicionar manualmente"

## Bloco 3 — Aliases Zoho (implementar quando CEO fornecer credenciais Zoho)
- Requer: `ZOHO_ORG_ID` + `ZOHO_ADMIN_TOKEN` (ou refresh token OAuth2)
- `GET /api/dominios/aliases?dominio=pawards.com.br`
- `POST /api/dominios/aliases` `{ prefix, dominio[], targetAccount }`
- `DELETE /api/dominios/aliases/:aliasId`

## Bloco 1B — Registro de novos domínios (implementar após CEO escolher registrador)
- **Opção Namecheap**: `POST /api/dominios/register` → `https://api.namecheap.com/xml.response`
- **Opção GoDaddy**: `POST /api/dominios/register` → `https://api.godaddy.com/v1/domains/purchase`
- **Opção Cloudflare**: `POST /api/dominios/register` → `https://api.cloudflare.com/client/v4/registrar`
- Requer: API key do registrador no cofre de integrações

## Linhas vermelhas
- NUNCA registrar domínio sem confirmação explícita do CEO (modal com valor + prazo).
- NUNCA expor API keys de registradores no front-end.
- NUNCA criar alias fora dos domínios cadastrados no DB.
- NÃO apagar domínio do DB se tiver aliases ativos.

## Definição de PRONTO
- Verificador de disponibilidade funciona (Registro.br RDAP + .com via Verisign).
- Bloco 2 lista e permite adicionar/remover domínios manualmente.
- Bloco 3 cria aliases em domínios Zoho selecionados (após credenciais).
- Screenshots confirmam os 3 blocos operando.

## STATUS DAS PARTES
- Blocos 1 (verificador) + 2 (gestão manual): BUILD AGORA (sem credenciais)
- Bloco 3 (aliases Zoho): AGUARDA ZOHO_ORG_ID + ZOHO_ADMIN_TOKEN
- Bloco 1B (registro automático): AGUARDA escolha do registrador pelo CEO
