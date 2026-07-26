============================================================
CARTA TECNICA -- Dr. Replit Paxter PARA Dr. Code
Data: 26/07/2026
Projeto: Padcon Conect / PADAXOR
Repo: Protocolo-Manager (github: caio-padua)
============================================================

SECAO 1 -- CONTEXTO E HONESTIDADE
------------------------------------------------------------
Dr. Code,

Eu cuido da plataforma Replit (desenvolvimento, preview, banco
de dados local). Voce cuida do repositorio local e dos commits.
O CEO (Dr. Caio) quer o sistema rodando no Railway HOJE para
testar no Instituto Padua (Paduccia) com dados reais.

Esta carta tem 5 blocos:
  A) Auditoria do que foi construido nas ultimas 3 demandas
  B) O que precisa acontecer para subir no Railway
  C) Tela do CEO (hub multi-tenant + impersonacao)
  D) Tela de Bilhetagem (uso + plano + economia)
  E) Kaizen -- os 10 passos seguintes, em ordem

Sem bajulacao. Onde tem divida tecnica, eu falo aberto.

============================================================
SECAO A -- AUDITORIA DAS ULTIMAS 3 DEMANDAS
============================================================

DEMANDA 1: E-mail Paxter v2 + WhatsApp branded
---------------------------------------------
O que foi feito:
- E-mail agora tem fundo navy "terno" (HTML com tabela
  inline CSS, nao CSS externo que Gmail bloqueia).
- Substancias sempre em tabela alinhada dentro do e-mail.
- WhatsApp: apenas banner de marca + texto simples
  (Twilio nao renderiza HTML).
- Dose exibida sem "/ml" (so a massa, ex: "2mg").
- Banner composto por PNGs oficiais (simbolo vidro +
  wordmark PADAXOR), sem redesenho.
- Assets do banner em rota publica /api/brand/* antes
  do collaboratorGuard (obrigatorio para e-mail funcionar,
  porque o Gmail busca a imagem DEPOIS de entregar).

Divida tecnica honesta:
- O banner e gerado em PNG estatico. Se a marca mudar,
  precisa regenerar o PNG manualmente.
- Nao testamos abertura no Outlook (apenas Gmail foi
  confirmado visualmente). Outlook tem quirks proprios
  com tabelas inline.
- WhatsApp: ainda na sandbox do Twilio (+14155238886).
  Em producao precisara de numero aprovado + templates
  pre-aprovados pelo Meta (processo leva 3-7 dias).

Arquivos envolvidos:
  artifacts/api-server/src/lib/emailService.ts
  artifacts/api-server/src/lib/whatsappService.ts
  artifacts/api-server/src/routes/brand.ts
  artifacts/padcom/src/pages/comunicacao/

------------------------------------------------------------
DEMANDA 2: Rebrand PADAXOR
------------------------------------------------------------
O que foi feito:
- Marca visivel ao cliente trocada de PAXTER -> PADAXOR.
- Aplicado na tela publica /consulta-receituario.
- Wordmark: zero filtro/blend-mode; PNG oficial;
  object-fit: contain; header sempre navy.
- Identidades tecnicas PRESERVADAS:
  UID dos .ics, colunas do banco (codigoPadcom),
  package names, tokens de auth, variaveis CSS.

Divida tecnica honesta:
- Rebrand PARCIAL. O sistema interno (padcom, menu lateral,
  PDFs internos) ainda usa "PAXTER" em varios lugares.
  O CEO decidiu nao fazer o rebrand global por enquanto.
  Isso e INTENCIONAL, nao e bug.
- O site institucional PARXIS continua com sua propria
  marca separada -- nao confundir com PADAXOR.

Arquivos envolvidos:
  artifacts/padcom/src/pages/consulta-receituario.tsx
  artifacts/padcom/src/_shared/paxterLockup.tsx
  public/brand/ (wordmarks PNG)

------------------------------------------------------------
DEMANDA 3: As 4 Ondas de Deploy (Railway Go-Live)
------------------------------------------------------------
Esta foi a maior demanda. Detalho cada onda:

ONDA 1 -- Seguranca da API (porta travada)
  Arquivos criados/modificados:
    artifacts/api-server/src/middleware/basicAuth.ts
    artifacts/api-server/src/middleware/securityConfig.ts
    artifacts/api-server/src/app.ts

  O que foi feito:
  - basicAuth.ts: autenticacao HTTP Basic para proteger
    /api/* em producao.
    Dev (Replit, sem NODE_ENV=production) = bypass com
    warning (para nao quebrar o ambiente de desenvol-
    vimento).
    Prod = fail-closed (process.exit se ADMIN_USERNAME
    ou ADMIN_PASSWORD nao definidos).
  - timingSafeEqual (crypto nativo Node.js) para comparar
    credenciais sem timing attack.
  - 15 prefixos de bypass publico (area-paciente,
    anamnese-v2, scheduling, webhooks, brand, ical, etc.).
  - securityConfig.ts: CORS lista branca (ALLOWED_ORIGINS
    env var, separada por virgula), Helmet CSP fechado,
    rate-limit 200 req/min por IP.
  - app.ts: ordem exata dos middlewares:
    CORS -> Helmet -> body-parser -> basicAuth ->
    rateLimit -> tenantContext -> routes.
  - IS_CLONE flag: se IS_CLONE=true no env, /api/agentes/*
    e /api/agentes-chat/* retornam 503 (evita duplicacao
    de agentes IA quando Railway escala replicas).

  Divida tecnica honesta:
  - basicAuth so protege a camada de rede (Railway
    expoe a porta publica). Nao substitui autenticacao
    por papel (collaboratorGuard, que ja existe e esta
    ativo para todas as rotas admin).
  - Rate-limit e por IP, sem Redis. Em Railway com
    multiplas replicas, cada replica tem seu proprio
    contador. Aceitavel para fase 1, mas em escala
    precisa de Redis compartilhado (Passo 9 do Kaizen).
  - CORS: o frontend (padcom) estara na mesma origem
    no Railway, entao CORS so bloqueia chamadas de
    dominios terceiros. Correto por ora.

ONDA 2 -- Paridade de Infraestrutura
  Arquivos criados:
    artifacts/api-worker/package.json
    artifacts/api-worker/tsconfig.json
    artifacts/api-worker/build.mjs
    artifacts/api-worker/src/index.ts
    artifacts/api-worker/src/worker.ts
    artifacts/api-server/src/lib/objectStorageS3.ts
    artifacts/api-server/src/lib/googleAuth.ts
    docs/GUIA_GOOGLE_SERVICE_ACCOUNT.md
    .env.railway.example (atualizado com todas as vars)

  Arquivos modificados:
    artifacts/api-server/src/index.ts (removeu cron/Drive)
    artifacts/api-server/src/app.ts (removeu startCronJobs)

  O que foi feito:
  - api-worker: NOVO pacote separado com 4 jobs cron:
      * Farmacia (22h diarias): liberar slots de receituario
      * Lembrete (a cada minuto): disparar mensagens
      * Receituario (6h): processar fila diaria
      * Drive (5min): importar laudos novos do Google Drive
  - Motivo da separacao: api-server no Railway pode ter
    N replicas. Cron duplicado = N execucoes do mesmo job.
    api-worker tem numReplicas=1 SEMPRE. Isso e lei.
    Nunca deixar o Railway escalar o api-worker.
  - objectStorageS3.ts: dual-flag.
    Se OBJECT_STORAGE_URL existir, usa o sidecar do Replit.
    Se S3_BUCKET existir, usa S3/R2 (Cloudflare ou AWS).
    Senao, cai em disco local (so em dev).
  - googleAuth.ts: dual-flag.
    Se REPLIT_GOOGLE_* existir, usa os Connectors do Replit.
    Se GOOGLE_SERVICE_ACCOUNT_JSON existir (base64 do JSON),
    usa Service Account direto (para Railway).
  - GUIA_GOOGLE_SERVICE_ACCOUNT.md: passo a passo de como
    criar a Service Account no Google Cloud Console, dar
    permissao de Domain-Wide Delegation, baixar o JSON
    e converter para base64 para colocar no env do Railway.

  Divida tecnica honesta:
  - api-worker NAO tem workflow no Replit ainda. Em Replit
    o cron continua rodando dentro do api-server para
    compatibilidade com o ambiente de desenvolvimento.
    ISSO PRECISA SER UNIFICADO. Sugestao: criar workflow
    "api-worker: Worker" no Replit tambem, e remover o
    cron do api-server definitivamente (inclusive em dev).
  - A variavel SESSION_SECRET pode estar hardcoded em
    alguns lugares do codigo legado. Precisa de auditoria
    (grep por SESSION_SECRET no api-server).

ONDA 3 -- Medicao e Prova de Valor
  Arquivos criados:
    lib/db/schema/consumo.ts (schema Drizzle)
    artifacts/api-server/src/lib/consumo.ts (lib)
    artifacts/api-server/src/routes/prova-de-valor.ts
    artifacts/padcom/src/pages/prova-de-valor.tsx
    (registrado em artifacts/api-server/src/routes/index.ts)
    (item adicionado ao menu em Layout.tsx)

  O que foi feito:
  - Tabela consumo_eventos: cada operacao do sistema
    vai registrar um evento (modulo, tipo, empresa_id,
    chave_idempotencia para evitar duplicatas).
  - ADD COLUMN custo_unitario e chave_idempotencia em
    3 tabelas existentes (via ALTER TABLE, nunca db push
    em tabela populada -- regra de ouro do repo).
  - lib/consumo.ts: registrarConsumo (idempotente por
    chave SHA256), somarConsumo (agregacao por modulo),
    listarConsumo (auditoria).
  - Rota GET /api/prova-de-valor/kpis: KPIs para o CEO
    ver o valor gerado pelo sistema.
  - Tela prova-de-valor.tsx no padcom.

  Divida tecnica honesta:
  - registrarConsumo ainda NAO e chamado nas rotas de
    negocio. A infraestrutura existe, mas a instrumentacao
    e zero por enquanto. Nenhuma operacao real gera
    evento de consumo.
  - Isso e INTENCIONAL para a fase 1 (o sistema precisa
    subir antes de instrumentar). Mas e prioridade
    imediata apos o Railway.
  - O custo_unitario por evento nao foi definido ainda
    (esta zerado). Precisa de uma tabela de preco por
    modulo/tipo (ver Secao D desta carta).

ONDA 4 -- Licenciamento (moduleGuard + menu dinamico)
  Arquivos criados:
    artifacts/api-server/src/lib/menuItems.ts
    artifacts/api-server/src/routes/menu.ts

  Arquivos modificados (router.use(moduleGuard(...))):
    artifacts/api-server/src/routes/agenda.ts
    artifacts/api-server/src/routes/sessions.ts
    artifacts/api-server/src/routes/financeiro.ts
    artifacts/api-server/src/routes/payments.ts
    artifacts/api-server/src/routes/stock.ts
    artifacts/api-server/src/routes/ras.ts
    artifacts/api-server/src/routes/protocols.ts
    artifacts/api-server/src/routes/prescriptions.ts
    artifacts/api-server/src/routes/receituario.ts
    artifacts/api-server/src/routes/cockpit.ts
    artifacts/api-server/src/routes/mega-anamnese.ts
    artifacts/api-server/src/routes/exames-lab.ts
    artifacts/api-server/src/routes/agentes-wpp.ts
    artifacts/api-server/src/routes/comunicacao.ts
    artifacts/api-server/src/routes/lembretes.ts
    artifacts/padcom/src/components/layout/Layout.tsx
    artifacts/api-server/src/routes/index.ts

  O que foi feito:
  - moduleGuard(moduloId): middleware que consulta o
    estado dos modulos do tenant e retorna 403 se o
    modulo nao esta ativo. empresa_id=5 (Instituto Padua,
    isPlatformOwner) bypassa sempre e ve tudo.
  - 15 routers com router.use(moduleGuard("modulo")).
  - menuItems.ts: lista mestre de 27 itens com campo
    moduloRequerido. O servidor sabe o que cada modulo
    libera no menu.
  - GET /api/menu: retorna os itens filtrados pelo que
    o tenant atual tem ativo. Protegido por
    collaboratorGuard.
  - Layout.tsx: useEffect busca /api/menu uma vez ao
    carregar, extrai o Set de modulosAtivos, e a funcao
    filtrarNavegacao esconde os grupos do menu cujo
    modulo nao esta ativo. Fail-open: se a API falhar,
    mostra tudo (nunca deixa o medico sem menu).

  Divida tecnica honesta:
  - PERGUNTA CRITICA para voce, Dr. Code: o moduleGuard
    atual (artifacts/api-server/src/middleware/
    moduleGuard.ts) consulta qual tabela ou qual campo
    para saber se um modulo esta ativo para o tenant?
    Se for app_settings (JSONB), e uma gambiarra que
    precisa virar tabela propria (empresas_modulos).
    Se ja tem a tabela, me diga o schema.
    Isso e pre-requisito para a tela de bilhetagem.
  - A tabela de modulos ainda NAO esta definida
    formalmente no schema Drizzle com as colunas
    corretas para billing. Precisa de migration SQL
    formal (ver Secao D).

============================================================
SECAO B -- RAILWAY: O QUE PRECISA ACONTECER AGORA
============================================================

ONDE ACHAR OS ARQUIVOS NO REPO:
  .env.railway.example              <- todas as variaveis
  docs/GUIA_GOOGLE_SERVICE_ACCOUNT.md <- passo Google SA
  artifacts/api-server/             <- service 1 (API)
  artifacts/padcom/                 <- service 2 (frontend)
  artifacts/api-worker/             <- service 3 (cron jobs)
  lib/db/schema/                    <- schema do banco

ORDEM DE CRIACAO DOS SERVICOS NO RAILWAY:
  [1] PostgreSQL (Railway add-on ou Neon.tech)
      -> Copiar a DATABASE_URL gerada
  [2] api-server
      -> Root dir: artifacts/api-server
      -> Build cmd: pnpm install && pnpm run build
      -> Start cmd: node dist/index.js
      -> Porta: 8080
  [3] padcom
      -> Root dir: artifacts/padcom
      -> Build cmd: pnpm install && pnpm run build
      -> Start: Railway Static Site (servir /dist)
      -> OU: pequeno Express server servindo os arquivos
         (necessario para o SPA fallback funcionar)
  [4] api-worker
      -> Root dir: artifacts/api-worker
      -> Build cmd: pnpm install && node build.mjs
      -> Start cmd: node dist/index.js
      -> SEM porta exposta (nao e HTTP server)
      -> numReplicas: 1 (NUNCA alterar)

VARIAVEIS OBRIGATORIAS (coluna = service que precisa):
  DATABASE_URL             api-server, api-worker
  NODE_ENV=production      api-server, api-worker
  ADMIN_USERNAME           api-server (porta travada)
  ADMIN_PASSWORD           api-server (porta travada)
  SESSION_SECRET           api-server (min 64 chars)
  ALLOWED_ORIGINS          api-server (URL do padcom)
  ASAAS_API_KEY            api-server (pagamentos)
  TWILIO_ACCOUNT_SID       api-server (WhatsApp/SMS)
  TWILIO_AUTH_TOKEN        api-server (WhatsApp/SMS)
  GOOGLE_SERVICE_ACCOUNT_JSON  api-server, api-worker
  GOOGLE_DELEGATED_EMAIL   api-server, api-worker
  IS_CLONE=false           api-worker
  S3_BUCKET                api-server (storage de arquivos)
  S3_ACCESS_KEY_ID         api-server
  S3_SECRET_ACCESS_KEY     api-server
  S3_ENDPOINT              api-server (URL do R2 ou AWS)

VARIAVEIS OPCIONAIS (mas recomendadas):
  ZAPSIGN_API_TOKEN        api-server (assinatura digital)
  TELEGRAM_BOT_TOKEN       api-server (notificacoes)

CUIDADOS CRITICOS ANTES DO PRIMEIRO DEPLOY:
  1. api-worker numReplicas SEMPRE = 1.
     Cron duplicado = mensagens duplicadas para pacientes.
     Configurar na secao de Deploy do Railway como
     "Fixed" com valor 1.

  2. Rodar as migrations SQL ANTES de subir os services.
     O Railway conecta no PostgreSQL externo. As tabelas
     precisam existir antes do primeiro boot.
     Sugestao: criar um script migration-consolidated.sql
     com todas as migrations das ultimas ondas e rodar
     via psql antes do deploy.
     Ver nas ultimas demandas: ADD COLUMN em
     consumo_eventos, custo_unitario, chave_idempotencia.

  3. O certificado A1 (certs/assinatura.pfx) precisa
     existir no container do api-server.
     PERGUNTA para voce: este arquivo esta no .gitignore?
     Se sim, o Railway nao vai encontra-lo.
     OPCOES:
       a) Remover do .gitignore e commitar criptografado
          (nao recomendado: chave privada no git).
       b) Converter para base64, colocar em variavel de
          ambiente CERT_PFX_BASE64, e no boot do servidor
          gravar em disco a partir da variavel.
          Esta e a opcao correta para producao.

  4. PADCOM em producao: o proxy /api do Vite NAO existe.
     Em producao, o padcom precisa chamar a URL absoluta
     do api-server (ex: https://api.seudominio.com/api).
     Opcoes:
       a) Variavel de ambiente VITE_API_BASE_URL no build
          do padcom apontando para o api-server.
       b) Colocar ambos (api-server e padcom) sob o mesmo
          dominio com paths diferentes (padcom em /,
          api-server em /api) via Railway custom domains.
          Esta e mais simples e evita CORS entre servicos.

  5. Primeiro acesso: apos o deploy, testar:
     GET https://api.seudominio.com/api/healthz
     Deve retornar 200 {"status":"ok"}.
     Se retornar 401, basciAuth esta ativo mas sem header.
     Isso e esperado (so o padcom logado envia o header).

============================================================
SECAO C -- TELA DO CEO (HUB MULTI-TENANT + IMPERSONACAO)
============================================================

O CEO quer:
  1. Uma tela separada onde ele ve TODAS as clinicas
     (todos os tenants) em tempo real.
  2. Um login diferente do login de colaborador.
     Hoje so existe o "Portao do Colaborador".
     O CEO precisa de um "Portal CEO" com credenciais
     proprias.
  3. De dentro do Portal CEO, ele consegue "entrar como"
     qualquer licenciado (impersonacao controlada)
     para sentir a experiencia do cliente.

ARQUITETURA PROPOSTA (em 3 fases):

  --- FASE 1 (imediata): Login CEO + tabela de tenants ---

  Nova rota: POST /api/ceo/login
    Body: { username, password }
    Valida contra ADMIN_USERNAME + ADMIN_PASSWORD
    (as mesmas do basicAuth -- o CEO e o dono da plataforma).
    Retorna: { token: JWT com payload { role: "ceo" } }
    O JWT tem prazo de 8h.

  Novo middleware: ceoGuard
    Valida o JWT com role="ceo".
    Totalmente separado do collaboratorGuard
    (que e para medicos/secretarias de UMA clinica).
    Arquivo: artifacts/api-server/src/middleware/ceoGuard.ts

  Nova pagina: /ceo no padcom
    Layout proprio (sem o menu lateral das clinicas).
    Header: PADAXOR em navy + "Central de Controle CEO".
    Tabela de tenants com as colunas:
      Clinica | Modulos ativos | Ultimo acesso |
      Eventos este mes | Faturamento previsto | Status.
    Botao "Entrar como" em cada linha (Fase 2).

  --- FASE 2: Impersonacao ---

  Rota: POST /api/ceo/impersonate/{empresa_id}
    Protegida por ceoGuard.
    Retorna: { impersonationToken: JWT com empresa_id
               da clinica alvo, role: "collab",
               originalCeoToken: tokenOriginal,
               exp: +1h }

  O frontend troca o token atual por esse impersonationToken.
  Todas as rotas passam a ver empresa_id do licenciado.

  Faixa visual de aviso (CRITICA):
    Faixa vermelha no TOPO do Layout, acima de tudo:
    "MODO IMPERSONACAO -- [Nome da Clinica] -- [Sair]"
    O botao "Sair" chama POST /api/ceo/impersonate/exit
    e restaura o token do CEO.

  Regra de auditoria:
    Toda acao feita em modo de impersonacao registra
    no log: { ator: "CEO", empresa_impersonada: X,
               acao: "...", timestamp: ... }.
    NUNCA gravar como se fosse o proprio licenciado.

  --- FASE 3: SSE em tempo real ---

  A rota /api/ceo/stream ja existe (SSE, push a cada 30s).
  So falta o frontend ligar o EventSource e renderizar
  os dados em tempo real na tabela de tenants.
  Dados que ja vem: modulos ativos, eventos, status.

NOTA TECNICA PARA O DR. CODE:
  O JWT do CEO nao deve ser enviado para rotas normais
  do api-server (evitar que o CEO bypasse o moduleGuard
  por acidente). O ceoGuard deve ser registrado SOMENTE
  nas rotas sob /api/ceo/*. As demais rotas continuam
  usando collaboratorGuard ou nenhum guard.

============================================================
SECAO D -- TELA DE BILHETAGEM (USO + PLANO + ECONOMIA)
============================================================

O CEO chamou de "bilhetagem". O nome tecnico mais preciso e
"Metered Billing Console" ou "Usage & Plan Dashboard".
Vou usar "bilhetagem" como o CEO disse.

O CONCEITO EXATO QUE O CEO DESCREVEU:
  Para cada modulo, o licenciado ve SEMPRE:
    - Uso acumulado no mes (em unidades e em R$)
    - Qual o custo pay-per-use (PPU) se sem plano
    - Se tem plano ativo para aquele modulo:
        * Qual o plano (Standard / Full / etc.)
        * O valor fixo mensal do plano
        * O uso acumulado (mesmo que nao seja cobrado)
        * A economia: PPU calculado vs o fixo do plano
  - Tudo SEMPRE visivel, independente do plano.
    O que muda e so a coluna "cobrado" e a linha
    de economia.

  EXEMPLO 1 (com plano Full):
    Modulo: Mensageria
    Plano ativo: Full (R$ 300,00/mes)
    Mensagens enviadas ate dia 20: 312 mensagens
    Valor PPU: R$ 2,40 por mensagem = R$ 748,80
    Valor cobrado: R$ 300,00 (plano full, teto fixo)
    Economia: R$ 448,80

  EXEMPLO 2 (sem plano, PPU):
    Modulo: Mensageria
    Plano ativo: Nenhum (PPU)
    Mensagens enviadas ate dia 20: 48 mensagens
    Valor PPU: R$ 2,40 por mensagem = R$ 115,20
    Valor cobrado: R$ 115,20
    Economia: R$ 0,00
    Sugestao automatica (gerada pelo sistema):
    "Com o plano Full (R$ 300/mes), voce atingiria
     o break-even em 125 mensagens. Voce ja enviou
     48. Aderir agora custa R$ 300 no mes cheio."

  EXEMPLO 3 (com plano Standard -- com limite):
    Modulo: Exames (analise de laudos IA)
    Plano ativo: Standard (R$ 150/mes, ate 50 laudos)
    Laudos processados: 38
    Valor PPU: R$ 8,00 por laudo = R$ 304,00
    Valor cobrado: R$ 150,00 (dentro do plano)
    Laudos restantes no plano: 12
    Economia: R$ 154,00

BANCO DE DADOS NECESSARIO (migrations SQL):

  Tabela 1: modulos_catalogo
  CREATE TABLE IF NOT EXISTS modulos_catalogo (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    descricao TEXT,
    custo_ppu NUMERIC(10,4) NOT NULL DEFAULT 0,
    unidade TEXT NOT NULL DEFAULT 'operacao',
    icone TEXT,
    criado_em TIMESTAMPTZ DEFAULT now()
  );

  Seed inicial:
  INSERT INTO modulos_catalogo (id, label, custo_ppu, unidade) VALUES
    ('agenda',      'Agenda & Recepcao',   0.50,  'agendamento'),
    ('protocolos',  'Protocolos',          0.10,  'aplicacao'),
    ('financeiro',  'Financeiro',          0.05,  'transacao'),
    ('mensageria',  'Mensageria',          2.40,  'mensagem'),
    ('exames_lab',  'Analise de Exames',   8.00,  'laudo'),
    ('cockpit',     'Cockpit Clinico',     0.20,  'consulta'),
    ('comunicacao', 'Comunicacao',         1.50,  'envio')
  ON CONFLICT DO NOTHING;

  Tabela 2: planos_modulo
  CREATE TABLE IF NOT EXISTS planos_modulo (
    id SERIAL PRIMARY KEY,
    modulo_id TEXT REFERENCES modulos_catalogo(id),
    nome TEXT NOT NULL,
    valor_mensal NUMERIC(10,2) NOT NULL,
    inclui_unidades INT,  -- null = ilimitado (Full)
    descricao TEXT,
    ativo BOOLEAN DEFAULT true
  );

  Seed de planos (exemplo para Mensageria):
  INSERT INTO planos_modulo
    (modulo_id, nome, valor_mensal, inclui_unidades) VALUES
    ('mensageria', 'Full', 300.00, NULL),
    ('mensageria', 'Standard', 150.00, 500),
    ('exames_lab', 'Full', 200.00, NULL),
    ('exames_lab', 'Standard', 150.00, 50),
    ('agenda', 'Full', 100.00, NULL),
    ('agenda', 'Standard', 60.00, 200)
  ON CONFLICT DO NOTHING;

  Tabela 3: empresas_modulos (a que o moduleGuard usa)
  CREATE TABLE IF NOT EXISTS empresas_modulos (
    empresa_id INT REFERENCES empresas(id),
    modulo_id TEXT REFERENCES modulos_catalogo(id),
    plano_id INT REFERENCES planos_modulo(id),
    ativo BOOLEAN DEFAULT true,
    ativo_desde DATE,
    notas TEXT,
    PRIMARY KEY (empresa_id, modulo_id)
  );

  Seed para Instituto Padua (empresa_id=5, owner):
  INSERT INTO empresas_modulos (empresa_id, modulo_id, ativo)
  SELECT 5, id, true FROM modulos_catalogo
  ON CONFLICT DO NOTHING;
  -- Instituto Padua nao tem plano_id (owner = ilimitado)

ROTAS NECESSARIAS:

  GET /api/billing/resumo
    -> Para o licenciado: resumo do mes atual por modulo.
    -> Para o CEO (com ?empresa_id=X): mesmo resultado
       mas da empresa alvo (requer ceoGuard).
    -> Response:
       [{
         modulo_id, label, unidade,
         unidades_usadas, custo_ppu_total,
         plano_ativo: { nome, valor_mensal,
                        inclui_unidades },
         valor_cobrado, economia,
         sugestao_upgrade  (ou null)
       }]

  GET /api/billing/historico
    -> Meses anteriores fechados.
    -> Response: [{ mes, ano, total_ppu, total_cobrado,
                    economia_total }]

  GET /api/billing/modulos
    -> Todos os modulos do catalogo com preco e plano
       atual do tenant. Para construir a tela completa.

  POST /api/billing/aderir
    -> Licenciado escolhe um plano para um modulo.
    -> Body: { modulo_id, plano_id }
    -> Gera cobranca pro-rata no Asaas para o mes atual.
    -> Atualiza empresas_modulos.

TELA NO PADCOM (/billing):
  - Uma linha por modulo (sempre todos, mesmo os inativos).
  - Colunas (tabela):
      Modulo | Uso (unidades) | PPU calc. |
      Plano | Valor cobrado | Economia | Acao
  - Badge de status: "Full" verde, "Standard" azul,
    "PPU" cinza, "Inativo" vermelho, "Owner" ouro.
  - Coluna Acao: botao "Aderir ao Full" se sem plano
    (link para /billing/planos ou modal de upgrade).
    Se ja tem plano, mostra "Gerenciar".
  - Se owner (Instituto Padua): badge "OWNER" ouro.
    Sem coluna de acao (nao faz sentido comprar plano).
  - Rodape da tabela: total do mes, total cobrado,
    economia total, data de fechamento do ciclo.
  - No topo: banner "Ciclo atual: 01/08 a 31/08/2026"
    com contador regressivo de dias.
  - A tela existe na area do LICENCIADO (nao do medico).
    Acesso por: /billing (no padcom, apos login de
    colaborador com papel "admin" da clinica).

============================================================
SECAO E -- KAIZEN: OS 10 PASSOS SEGUINTES (EM ORDEM)
============================================================

Passo 1 -- ESTA SEMANA (urgente):
  Subir no Railway.
  Criar os 3 servicos: api-server, padcom, api-worker.
  Rodar as migrations SQL manualmente via psql.
  Configurar todas as variaveis de .env.railway.example.
  Testar: healthz 200, login de colaborador, cadastro de
  cliente no Instituto Padua (Paduccia).
  CRITERIO DE SUCESSO: Dr. Caio consegue cadastrar um
  cliente e criar um agendamento no Railway.

Passo 2 -- ESTA SEMANA (logo apos subir):
  Instrumentar o consumo.
  Chamar registrarConsumo() nas rotas que geram eventos:
    - Envio de mensagem WhatsApp/email (mensageria)
    - Emissao de receituario (protocolos)
    - Processamento de laudo de exame (exames_lab)
    - Agendamento de consulta (agenda)
  Sem isso, a tabela consumo_eventos fica vazia e a
  bilhetagem nao tem dados.

Passo 3 -- SEMANA 2:
  Criar as migrations SQL formais:
    modulos_catalogo, planos_modulo, empresas_modulos.
  Seed do Instituto Padua como owner (todos modulos ativos,
  sem plano_id = ilimitado).
  Confirmar que o moduleGuard le de empresas_modulos
  (nao de app_settings ou outro lugar temporario).

Passo 4 -- SEMANA 2:
  Portal CEO.
  Rota /api/ceo/login + middleware ceoGuard.
  Pagina /ceo no padcom com lista de tenants.
  Login separado do colaborador.
  Sem impersonacao ainda, so leitura.

Passo 5 -- SEMANA 3:
  Tela de Bilhetagem (/billing no padcom).
  Rotas GET /api/billing/resumo e /api/billing/modulos.
  Interface completa com a tabela descrita na Secao D.
  Licenciado ve o proprio consumo.
  CEO ve todos (com filtro de empresa).

Passo 6 -- SEMANA 3:
  Impersonacao do CEO.
  POST /api/ceo/impersonate/{empresa_id}.
  Faixa vermelha no Layout durante a impersonacao.
  Botao "Sair da impersonacao".
  Dr. Caio pode entrar como se fosse o Instituto Padua
  e sentir a experiencia do licenciado.

Passo 7 -- SEMANA 4:
  Integracao Asaas para billing automatico.
  Webhook de fechamento de ciclo (job do api-worker,
  dia 1 de cada mes).
  Calcula o valor de cada empresa (real ou plano).
  Gera cobranca automatica no Asaas (boleto/Pix).
  Licenciado recebe o link de pagamento por email.

Passo 8 -- SEMANA 5:
  Self-service de planos.
  Tela /billing/planos onde o licenciado escolhe o
  plano de cada modulo.
  Salva em empresas_modulos.
  Gera cobranca imediata pro-rata via Asaas.
  O moduleGuard passa a ler o plano novo imediatamente.

Passo 9 -- SEMANA 6:
  Rate-limit com Redis compartilhado.
  Necessario quando api-server tiver mais de 1 replica.
  Railway add-on Redis (ou Upstash) como backend do
  rate-limit (substituir o express-rate-limit em memoria
  pelo redis-store).

Passo 10 -- FUTURO (apos sistema estavel):
  White-label por licenciado.
  Cada clinica pode ter seu proprio logo e cor primaria.
  O Layout busca o tema em GET /api/config/tema e injeta
  CSS variables. PADAXOR fica so nos PDFs e emails
  (marca do sistema PADAXOR). A clinica aparece com
  sua propria identidade na tela de atendimento.
  Isso e o diferencial competitivo maximo do SaaS.

============================================================
PERGUNTAS PARA O DR. CODE RESPONDER ANTES DE COMECAR
============================================================

PERGUNTA 1 (CRITICA):
  O moduleGuard (artifacts/api-server/src/middleware/
  moduleGuard.ts) consulta qual tabela ou campo para saber
  se um modulo esta ativo para o tenant?
  E app_settings? E uma coluna em empresas? Ja tem
  empresas_modulos?
  Isso define se precisa de migration nova ou so de seed.

PERGUNTA 2 (CRITICA):
  O certificado certs/assinatura.pfx esta no .gitignore?
  Se sim: como colocar no Railway sem commitar?
  Proposta: converter para base64 e colocar na variavel
  CERT_PFX_BASE64. O servidor le a variavel no boot e
  grava em /tmp/assinatura.pfx. Voce concorda?

PERGUNTA 3:
  A tabela empresas tem as colunas is_platform_owner e
  company_slug? O bypass do moduleGuard para empresa_id=5
  usa essas colunas ou e um if hardcoded?

PERGUNTA 4:
  Existe um arquivo de migration consolidado com todas as
  alteracoes de schema das ultimas 3 demandas? Se nao,
  precisamos criar um migration-consolidated.sql antes
  do primeiro deploy no Railway. Voce tem o historico
  das alteracoes do lado de voce (local)?

PERGUNTA 5:
  Como o padcom acessa o api-server em producao?
  Hoje em Replit o Vite faz proxy /api -> porta 8080.
  Em Railway esse proxy nao existe.
  Opcao A: variavel VITE_API_BASE_URL no build do padcom.
  Opcao B: ambos sob o mesmo dominio (padcom em /,
            api em /api) via Railway custom domain.
  Qual voce prefere? Opcao B e mais simples operacional-
  mente mas exige um proxy reverso na frente (nginx ou
  Caddy). Opcao A e mais simples de configurar mas
  exige CORS configurado corretamente.

============================================================
FECHAMENTO
============================================================

Dr. Code, este e o estado real do sistema em 26/07/2026.

O que foi feito e solido na fundacao (seguranca, infra,
medidores, licenciamento). Mas ainda e fundacao -- nenhuma
instrucao de consumo foi conectada ao motor real ainda.
O Railway e o primeiro teste em condicoes reais.

Quando voce responder as 5 perguntas, eu e o CEO
revisamos juntos e definimos o plano final de execucao.

Sem preguica. Sem atalho. 10 passos a frente sempre.

Dr. Replit Paxter
Padcon Conect / PADAXOR
26/07/2026
============================================================
```
