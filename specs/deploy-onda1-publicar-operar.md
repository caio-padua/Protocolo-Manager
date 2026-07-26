# SPEC: ONDA 1 — PUBLICAR E OPERAR (dias 1 a 7)
_Paxter Loop — Fase 1 (Especificar)_
_Data: 26/07/2026 | Autor: Dr. Replit Manager_

---

## Objetivo

Colocar o sistema no ar no Railway com uma porta travada (senha única), segurança básica de servidor e banco provisionado, de modo que o Dr. Caio possa operar o Instituto Pádua 100% dentro do sistema a partir do dia 1.

---

## Contexto e diagnóstico (lido do código)

| Item auditado | Estado atual | O que muda nesta onda |
|---|---|---|
| CORS | `cors()` aberto — aceita qualquer origem | Fechar para lista de domínios permitidos |
| Helmet (cabeçalhos HTTP de segurança) | Ausente | Adicionar |
| Rate limit (limite de requisições) | Ausente | Adicionar |
| Autenticação de entrada | Ausente — 0 de 87 rotas verificam identidade | HTTP Basic Auth global no api-server |
| Banco na Railway | Não provisionado | Checklist de variáveis de ambiente + script de migration |
| Serviços Railway | mockup-sandbox e api-client-react seriam criados no deploy | Excluir do deploy (manter no repo) |

---

## Requisitos exatos

### 1.1 — Porta travada: HTTP Basic Auth + CORS + Helmet + Rate Limit

**1.1.a HTTP Basic Auth (autenticação básica por usuário e senha)**

- Implementar middleware `basicAuthMiddleware` em `artifacts/api-server/src/middleware/basicAuth.ts`.
- O middleware lê `process.env.ADMIN_USERNAME` e `process.env.ADMIN_PASSWORD`.
- Se alguma das duas variáveis estiver ausente no boot, o servidor LOGA ERRO FATAL e não inicializa (fail-closed, não fail-open).
- Toda requisição ao `/api/*` sem cabeçalho `Authorization: Basic <credenciais>` corretas recebe `401 Unauthorized` com cabeçalho `WWW-Authenticate: Basic realm="Padaxor"`.
- A verificação usa comparação segura (`timingSafeEqual` do módulo nativo `crypto` do Node.js) para evitar ataque de tempo (quando um atacante mede quanto tempo a comparação demora).
- O middleware é aplicado ANTES de qualquer rota, em `app.ts`, como `app.use(basicAuthMiddleware)`.
- EXCEÇÃO ÚNICA: `GET /api/healthz` não requer auth (para a Railway verificar saúde do serviço).
- NÃO aplicar ao frontend padcom (Vite serve o frontend sem auth próprio; o frontend acessa o `/api` com as mesmas credenciais do usuário logado no browser).

**1.1.b CORS fechado (controle de origem)**

- Remover `cors()` sem argumentos.
- Adicionar `cors({ origin: allowedOrigins, credentials: true })`, onde `allowedOrigins` é lida de `process.env.ALLOWED_ORIGINS` (lista separada por vírgula) na inicialização.
- Se `ALLOWED_ORIGINS` não estiver definida, usar fallback `["http://localhost:5173", "http://localhost:4173"]` (apenas desenvolvimento local).
- Em produção no Railway, `ALLOWED_ORIGINS` conterá o domínio Railway do padcom.

**1.1.c Helmet (cabeçalhos de segurança HTTP)**

- Instalar `helmet` como dependência de runtime em `@workspace/api-server`.
- Aplicar `app.use(helmet())` com configuração padrão após o CORS.
- Desabilitar apenas `helmet.contentSecurityPolicy()` se interferir com o proxy da Railway (verificar na fase de build e ajustar se necessário).

**1.1.d Rate limit (limite de requisições por endereço IP)**

- Instalar `express-rate-limit` como dependência de runtime.
- Configurar: 200 requisições por minuto por IP (window de 60 segundos, max 200).
- Retornar `429 Too Many Requests` com corpo `{ error: "Muitas requisições. Aguarde um momento." }`.
- Aplicar após Helmet, antes das rotas.
- EXCEÇÃO: `GET /api/healthz` isento de rate limit.

### 1.2 — Checklist de variáveis de ambiente para Railway

Criar arquivo `.env.railway.example` na raiz do projeto, com TODAS as variáveis necessárias para os três serviços (api-server, padcom, parxis-site), com comentários explicativos e valores de exemplo (nunca valores reais). Variáveis obrigatórias para o api-server:

| Variável | Tipo | Descrição |
|---|---|---|
| `DATABASE_URL` | Obrigatória | URL do PostgreSQL provisionado no Railway |
| `SESSION_SECRET` | Obrigatória | String aleatória >= 32 caracteres (gerar com `openssl rand -hex 32`) |
| `APP_ENCRYPTION_KEY` | Obrigatória | String aleatória >= 32 caracteres (idem) |
| `ADMIN_USERNAME` | Obrigatória | Usuário único do Dr. Caio (ex.: "drcaio") |
| `ADMIN_PASSWORD` | Obrigatória | Senha forte (ex.: saída do `openssl rand -hex 16`) |
| `ALLOWED_ORIGINS` | Obrigatória | Domínio Railway do padcom (ex.: "https://padcom.up.railway.app") |
| `ASAAS_API_KEY` | Opcional | Chave Asaas produção (deixar vazio para não ativar pagamentos) |
| `TWILIO_ACCOUNT_SID` | Opcional | Twilio produção |
| `TWILIO_AUTH_TOKEN` | Opcional | Twilio produção |
| `PORT` | Injetada pelo Railway | Não definir manualmente |

### 1.3 — Script de migration automática no boot

**Problema**: no Railway, o banco PostgreSQL nasce vazio. O Drizzle ORM (ferramenta de banco da casa) não executa migrations automaticamente no boot — alguém precisa rodar `drizzle-kit migrate` ou equivalente.

**Solução**: criar script `scripts/src/migrate.ts` que:
1. Conecta ao banco via `DATABASE_URL`.
2. Executa todas as migrations pendentes em `lib/db/drizzle/` (pasta das migrations geradas pelo Drizzle).
3. Loga cada migration aplicada.
4. Encerra com código 0 em sucesso, código 1 em falha.

Adicionar em `artifacts/api-server/package.json` o script:
```
"db:migrate": "tsx scripts/src/migrate.ts"
```

**Na Railway**: o campo `startCommand` de cada serviço recebe apenas o comando de start. O deploy command (antes do start) deve executar `pnpm --filter @workspace/api-server run db:migrate && pnpm --filter @workspace/api-server run start`.

Documentar isso no `.env.railway.example` e no `docs/dr-replit/PARA_MANAGER/GUIA_DEPLOY_RAILWAY.md`.

### 1.4 — Configuração Railway: excluir mockup-sandbox e api-client-react

- NÃO deletar os diretórios do repositório (Regra de Ouro da casa: nunca destruir).
- Garantir que o arquivo `artifacts/mockup-sandbox/.replit-artifact/artifact.toml` e `artifacts/api-client-react/.replit-artifact/artifact.toml` (se existir) NÃO sejam referenciados na configuração Railway.
- Criar/atualizar `railway.toml` na raiz apontando apenas os serviços: `api-server`, `padcom`, `parxis-site`.
- Verificar se existe arquivo `nixpacks.toml` por serviço e se está configurado corretamente (lesson aprendida na auditoria do Dr. Claude: nixpacks sobrescreve `[phases.setup]`; usar `NIXPACKS_NODE_VERSION` em vez disso).

### 1.5 — Rota de saúde (health check)

- Criar `GET /api/healthz` que retorna `{ status: "ok", ts: <ISO timestamp> }` com status 200.
- Sem auth, sem rate limit (usado pelo Railway para verificar se o serviço está vivo).
- Resposta em menos de 500ms (não deve depender de banco).

---

## Casos extremos a tratar

| Cenário | Comportamento esperado |
|---|---|
| `ADMIN_PASSWORD` vazio no boot | Servidor não sobe; loga `FATAL: ADMIN_PASSWORD não definida` e encerra |
| `DATABASE_URL` inválida no boot | Migration falha, servidor não sobe, Railway marca deploy como falho |
| Tentativa de brute-force na senha | Rate limit de 5 tentativas falhas por minuto por IP (configuração adicional mais restrita na rota `/api/*` sem credenciais corretas) |
| Requisição CORS de origem não permitida | 403 com corpo `{ error: "CORS: origem não permitida" }` |
| Railway reiniciar réplica | Health check `/api/healthz` responde sem depender de estado; Railway sabe que o serviço voltou |

---

## Definição de PRONTO

| Critério | Como verificar |
|---|---|
| `GET /api/healthz` sem auth → 200 | `curl https://<dominio-railway>/api/healthz` → `{"status":"ok"}` |
| `GET /api/clientes` sem auth → 401 | `curl https://<dominio-railway>/api/clientes` → 401 |
| `GET /api/clientes` com auth correta → 200 | `curl -u drcaio:<senha> https://<dominio-railway>/api/clientes` → lista |
| CORS rejeitando origem estranha → 403 | `curl -H "Origin: https://malicioso.com" ...` → 403 ou sem cabeçalho CORS |
| Helmet: cabeçalho `X-Frame-Options` presente | `curl -I` → ver `X-Frame-Options: SAMEORIGIN` |
| Rate limit: 201ª requisição → 429 | Script de teste simples em loop |
| Boot sem `ADMIN_PASSWORD` → falha imediata | Testar localmente com variável removida |
| Migration roda no boot sem erro | Log do boot mostra "migrations aplicadas: N" |

---

## Linhas vermelhas

- NUNCA usar `process.exit(0)` em middleware de auth (encerrar o servidor em vez de rejeitar a requisição).
- NUNCA logar a senha ou o cabeçalho Authorization.
- NUNCA aplicar Basic Auth na rota `/api/healthz`.
- NUNCA usar `cors({ origin: "*" })` em produção.
- NUNCA fazer `db push` em banco populado — apenas migrations.
- NUNCA deletar `artifacts/mockup-sandbox/` ou `artifacts/api-client-react/` do repositório.
