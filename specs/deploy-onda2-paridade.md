# SPEC: ONDA 2 — PARIDADE (dias 7 a 21)
_Paxter Loop — Fase 1 (Especificar)_
_Data: 26/07/2026 | Autor: Dr. Replit Manager_

---

## Objetivo

Substituir os três serviços que dependem exclusivamente da infraestrutura Replit (Object Storage via sidecar, integrações Google via Replit Connectors, workers duplicáveis) por alternativas que funcionem igualmente no Railway e no Replit, sem quebrar o ambiente de desenvolvimento.

---

## Contexto e diagnóstico (lido do código)

| Componente | Dependência Replit atual | Consequência fora do Replit |
|---|---|---|
| Object Storage (fotos, exames, documentos) | Sidecar em `http://127.0.0.1:1106` (endereço interno exclusivo do Replit) | Toda foto, exame e documento quebra |
| Google Agenda / Gmail / Drive | Replit Connectors (token injetado pelo ambiente Replit) | Agenda, e-mail e Drive param de funcionar |
| Jobs agendados (farmácia 22h, lembrete minuto, receituário 6h, Drive watcher) | `setInterval` e `cron.schedule` dentro do processo principal do api-server | Com 2 ou mais réplicas: mensagem dupla ao paciente, cobrança dupla de lembrete |

---

## Requisitos exatos

### 2.1 — Object Storage: substituir sidecar Replit por S3-compatível

**Contexto**: o código atual usa `@google-cloud/storage` com autenticação via sidecar em `127.0.0.1:1106`. Esse endereço só existe dentro do Replit. Fora, toda leitura/gravação de arquivo falha silenciosamente ou com erro de rede.

**Solução escolhida**: Cloudflare R2 (compatível com S3 — mesma API da Amazon S3, sem custo de saída de dados). Alternativa aceitável: AWS S3 ou qualquer bucket S3-compatível configurável por variável de ambiente.

**Implementação**:

a) Instalar `@aws-sdk/client-s3` e `@aws-sdk/s3-request-presigner` em `@workspace/api-server`.

b) Criar `artifacts/api-server/src/lib/objectStorageS3.ts` com a mesma interface pública que `objectStorage.ts` atual:
   - `upload(key, buffer, mimeType)` → grava no bucket
   - `download(key)` → retorna Buffer
   - `delete(key)` → remove
   - `getSignedUrl(key, expiresInSeconds)` → URL pré-assinada para download privado
   - `exists(key)` → booleano

c) Implementar detecção de ambiente com BANDEIRA DUPLA:
   ```
   if (process.env.REPLIT_OBJECT_STORAGE_BUCKET) {
     // usa o sidecar Replit (desenvolvimento)
   } else {
     // usa S3-compatível (Railway/produção)
   }
   ```
   Assim, o ambiente de desenvolvimento (Replit) continua funcionando sem alteração.

d) Variáveis de ambiente para S3 (adicionar ao `.env.railway.example`):

| Variável | Descrição |
|---|---|
| `S3_ENDPOINT` | URL do endpoint S3 (ex.: `https://<account-id>.r2.cloudflarestorage.com`) |
| `S3_ACCESS_KEY_ID` | Chave de acesso |
| `S3_SECRET_ACCESS_KEY` | Segredo da chave |
| `S3_BUCKET_NAME` | Nome do bucket |
| `S3_REGION` | Região (para R2: `auto`) |

e) Substituir todas as importações de `./objectStorage` nas rotas e libs por `./objectStorageS3` (ou renomear o arquivo para manter a importação).

f) Arquivos com `objectStorage` hoje: `storage.ts`, `mega-anamnese.ts`, `client-registration.ts`, `client-photo.ts`, `professionals.ts`, `assinatura/service.ts`, `cert-source.ts`. Cada um recebe a mesma interface — sem mudança de lógica.

g) Testar com upload real: `POST /api/storage/upload` de um arquivo de teste, depois `GET /api/storage/<chave>` e confirmar download.

### 2.2 — Google Agenda, Gmail e Drive: bandeira dupla com OAuth próprio

**Contexto**: as integrações Google atuais usam tokens injetados pelos Replit Connectors. Fora do Replit, esses tokens não existem.

**Estratégia**: detecção de ambiente + OAuth próprio via Google Service Account (conta de serviço — sem fluxo de login do usuário, token gerado pelo próprio servidor).

**Por que Service Account e não OAuth 2.0 com browser?**
O Dr. Caio é operador único. Não há usuário final que precise autorizar via janela do navegador. Uma Service Account com permissão delegada ao e-mail do Dr. Caio (Google Workspace Admin → delegação de domínio) resolve com uma chave JSON e sem interação humana.

**Implementação**:

a) Instalar `googleapis` em `@workspace/api-server` (já pode estar instalado — verificar antes).

b) Criar `artifacts/api-server/src/lib/googleAuth.ts`:
   ```
   export function getGoogleAuth(scopes: string[]) {
     if (process.env.REPLIT_CONNECTORS_TOKEN) {
       // retorna auth via Replit Connectors (desenvolvimento)
       return replitConnectorAuth(scopes);
     }
     // retorna auth via Service Account (Railway/produção)
     return serviceAccountAuth(scopes);
   }
   ```

c) Service Account: chave JSON armazenada como variável de ambiente `GOOGLE_SERVICE_ACCOUNT_JSON` (o conteúdo completo do arquivo JSON da Service Account, sem quebras de linha — base64-encoded).

d) Escopos necessários por serviço:
   - Google Calendar (agenda): `https://www.googleapis.com/auth/calendar`
   - Gmail: `https://www.googleapis.com/auth/gmail.send`
   - Google Drive: `https://www.googleapis.com/auth/drive`

e) Substituir todas as chamadas diretas a `listConnections('google-calendar')` etc. pela função `getGoogleAuth()`. Arquivos a varrer: todas as rotas que tocam em Google.

f) Variáveis de ambiente (adicionar ao `.env.railway.example`):

| Variável | Descrição |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Conteúdo do JSON da Service Account, base64-encoded |
| `GOOGLE_DELEGATED_EMAIL` | E-mail do Dr. Caio para delegação de domínio |

g) Criar `docs/dr-replit/PARA_MANAGER/GUIA_GOOGLE_SERVICE_ACCOUNT.md` explicando (sem código) como o Dr. Caio cria a Service Account no Google Cloud Console, habilita as APIs necessárias e exporta o JSON.

### 2.3 — Worker isolado: evitar jobs duplicados em múltiplas réplicas

**Problema**: hoje existem 4 jobs no mesmo processo do api-server:
- `setInterval` do Drive Watcher (em `app.ts`) — a cada 5 minutos
- `cron.schedule` farmácia 22h (em `cron.ts`)
- `cron.schedule` lembrete por período — a cada minuto (em `cron.ts`)
- `cron.schedule` receituário 6h (em `cron.ts`)

Com 2 réplicas Railway rodando, cada job executa DUAS VEZES. Resultado: 2 mensagens de lembrete para o mesmo paciente, 2 execuções do receituário, 2 execuções do Drive Watcher simultâneas.

**Solução**: separar em serviço de worker dedicado (uma réplica fixa, sem autoscaling).

a) Criar `artifacts/api-worker/` como novo workspace package pnpm:
   - `package.json` com `name: "@workspace/api-worker"`
   - `src/index.ts`: importa e inicia todos os cron jobs
   - `src/worker.ts`: contém a lógica dos 4 jobs (migrada de `cron.ts` e `app.ts`)
   - Compartilha `@workspace/db` e libs do api-server via workspace

b) Os jobs migram sem alteração de lógica — apenas de arquivo.

c) No api-server: remover o `startCronJobs()` e o bloco do Drive Watcher de `app.ts`. O api-server passa a ser puro servidor HTTP.

d) No Railway: criar 4º serviço `api-worker` com:
   - `startCommand: "pnpm --filter @workspace/api-worker run start"`
   - `numReplicas: 1` (fixo, nunca autoscalar)
   - Mesmas variáveis de ambiente do api-server (compartilham o mesmo banco)

e) No Replit: o workflow atual do api-server continua, mas agora inicia api-server e api-worker juntos (ou criar workflow separado).

f) Adicionar registro no boot: `logger.info("Worker iniciado. Jobs ativos: farmácia-22h, lembrete-minuto, receituário-6h, drive-watcher-5min")`.

g) Adicionar rota `GET /api/worker/status` (sem auth, apenas para Railway verificar o worker) retornando `{ status: "ok", jobs: [...] }`.

---

## Casos extremos a tratar

| Cenário | Comportamento esperado |
|---|---|
| S3 indisponível no upload | Rota retorna 503 com `{ error: "Armazenamento temporariamente indisponível" }` — nunca silencia o erro |
| Service Account Google sem permissão | Rota de agenda retorna 502 com `{ error: "Integração Google não configurada" }` — sem fallback silencioso |
| Worker crashar | Railway reinicia automaticamente; lembrete do minuto seguinte cobre o que foi perdido (idempotência existente) |
| Worker com 2 réplicas acidentais | Idempotência nos jobs (chave_idempotencia + registro de `enviadoEm`) impede duplicata — mas o correto é `numReplicas: 1` |
| Variável `GOOGLE_SERVICE_ACCOUNT_JSON` malformada | Erro no boot do worker com log descritivo — não crashar silenciosamente |

---

## Definição de PRONTO

| Critério | Como verificar |
|---|---|
| Upload de foto no Railway → persiste no R2 | `POST /api/clients/:id/photo` → confirmar no painel R2 que o arquivo existe |
| Download de foto no Railway → retorna arquivo real | `GET /api/clients/:id/photo` → imagem renderiza no browser |
| Agenda Google no Railway → cria evento | `POST /api/agenda/eventos` → ver evento criado no Google Calendar do Dr. Caio |
| Ambiente Replit não quebra após as mudanças | Todos os workflows Replit continuam respondendo normalmente |
| Worker inicia e loga os 4 jobs | Log do boot do worker mostra os 4 jobs registrados |
| Sem api-server rodando jobs duplicados | `grep "cron\|setInterval" artifacts/api-server/src/app.ts` → zero ocorrências após a mudança |

---

## Linhas vermelhas

- NUNCA remover o caminho Replit Connectors do código — a bandeira dupla preserva o desenvolvimento.
- NUNCA colocar a chave JSON da Service Account diretamente no código-fonte.
- NUNCA subir a réplica do worker para mais de 1 instância (Railway: `numReplicas: 1` fixo).
- NUNCA migrar lógica de negócio ao criar o worker — apenas mover os jobs, sem alterar o que fazem.
- NUNCA alterar as tabelas enquanto o worker migra jobs — schema é assunto da Onda 3.
