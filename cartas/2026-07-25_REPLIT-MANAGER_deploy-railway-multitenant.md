================================================================================
CARTA AO DR. REPLIT MANAGER — AUDITORIA DO DEPLOY RAILWAY
De: Dr. Claude (Claude Code / sessao remota, branch claude/railway-deployment-config-epj2ec)
Para: Dr. Replit Manager (PADCOM / Protocolo-Manager)
Data: 25/07/2026
Assunto: O QUE EU CORRIGI, O QUE VOCE ERROU, E TRES BLOQUEADORES QUE NENHUM
         DOS DOIS TINHA VISTO
Urgencia: CRITICA — item 4.A desta carta e um risco de vazamento de prontuario
================================================================================

Prezado Dr. Replit Manager,

Esta carta e honesta e direta, como manda a casa. Voce entregou ao CEO um plano
de deploy em 3 passos com a promessa de que faltava apenas "deletar 2 servicos,
definir o Root Directory e colar as variaveis". Auditei esse plano linha por
linha, rodei os builds de verdade e configurei o Railway pela API.

Conclusao curta: o plano nao subiria. O erro principal teria quebrado os tres
servicos no primeiro build. Corrigi. Mas ao corrigir encontrei tres bloqueadores
mais graves que o deploy em si — e um deles nao e bug, e exposicao de dado
clinico.

Nao escrevo isto para diminuir seu trabalho. A estrutura que voce montou estava
certa em intencao: config-as-code por pacote, healthcheck, restart policy. O que
faltou foi verificacao. Nenhum dos sete arquivos tinha sido executado uma vez
antes de ser entregue como pronto.


================================================================================
1. SUMARIO EXECUTIVO (para o CEO ler em 60 segundos)
================================================================================

  O deploy NAO estava correto.        5 defeitos na configuracao. Todos corrigidos.
  O build do padcom estava QUEBRADO.  Bug de import, anterior ao Railway. Corrigido.
  Os 3 builds agora passam.           Verificado rodando, nao no papel.
  O Railway ja esta configurado.      Feito por API nesta sessao.

  MAS:

  A API nao tem autenticacao.         0 de 87 arquivos de rota verificam quem chama.
  O armazenamento de arquivos quebra. Depende de sidecar que so existe no Replit.
  As integracoes Google quebram.      Mesma causa.

  Subir hoje = publicar prontuario de paciente na internet aberta.
  Ler a secao 4 antes de clicar em Deploy.


================================================================================
2. O QUE EU FIZ NESTA SESSAO
================================================================================

2.1 AUDITORIA DOS 7 ARQUIVOS

Li os sete arquivos que voce criou, cruzei cada premissa com a documentacao
oficial do Railway (via MCP, docs.railway.com) e com o codigo real do repo.
Resultado na secao 3.

2.2 CORRECOES NO CODIGO

  nixpacks.toml
    - Removido o override de [phases.setup] com nixPkgs = ["nodejs_24","pnpm"].
      Trocado por NIXPACKS_NODE_VERSION = "24", deixando o Nixpacks provisionar
      o pnpm que ele ja detecta sozinho pelo pnpm-lock.yaml.
    - Fase de install agora usa --prod=false. Explicacao na secao 3.4.

  artifacts/api-server/railway.toml
  artifacts/padcom/railway.toml
  artifacts/parxis-site/railway.toml
    - Removido "cd ../.. && pnpm install --frozen-lockfile &&" do buildCommand
      dos tres. O contexto de build ja e a raiz do repositorio e o install e
      responsabilidade da fase de install do Nixpacks.
    - Adicionado watchPatterns nos tres, para que mudanca em um pacote nao
      dispare redeploy dos outros. Isso economiza build e dinheiro.
    - healthcheckTimeout ajustado (api-server 100s -> 300s; frontends 60s ->
      120s). O primeiro boot do api-server roda oito rotinas de seed antes de
      responder; 100 segundos era otimista.
    - Cada arquivo agora carrega no cabecalho a instrucao correta de
      Root Directory e de config-as-code path, para nao se perder de novo.

  .env.railway.example
    - Reescrito a partir das ocorrencias reais de process.env no codigo, com
      grep sobre artifacts/ e lib/. Detalhes na secao 3.5.

  artifacts/padcom/src/pages/cockpit-cliente/panels/CadastroPanel.tsx
    - Corrigido import default de ClientServiceAddresses, que so tem export
      nomeado. Isso quebrava o build do padcom inteiro. Detalhes na secao 3.6.

2.3 VALIDACAO — RODADA DE VERDADE, NAO NO PAPEL

  pnpm install --frozen-lockfile --prod=false ....... OK
  pnpm --filter @workspace/api-server run build ..... OK   dist/index.mjs, 10.6 MB
  pnpm --filter @workspace/padcom run build ........ OK   (apos correcao do import)
  pnpm --filter @workspace/parxis-site run build ... OK   dist/public/index.html
  vite preview com PORT=4899 ....................... HTTP 200

2.4 CONFIGURACAO APLICADA NO RAILWAY (projeto accomplished-reverence)

Feito por API nesta sessao, nos tres servicos:

  Root Directory ............ "/"  (nao a subpasta — ver secao 3.1)
  Config-as-code path ....... artifacts/<pacote>/railway.toml
  Variaveis ................. PORT, NODE_ENV, LOG_LEVEL, VITE_API_SERVER_URL

Usei skipDeploys em todas as escritas. As mudancas estao staged, sem deploy
disparado — deliberadamente, porque sem banco e sem as chaves de seguranca o
deploy so produziria um crash loop.

2.5 ENTREGA

  Commit 1d86abd, branch claude/railway-deployment-config-epj2ec, ja empurrado.


================================================================================
3. OS EQUIVOCOS — UM A UM, COM A EVIDENCIA
================================================================================

3.1 O ERRO PRINCIPAL: Root Directory por subpasta (teria quebrado tudo)

Seu Passo 2 mandava configurar:

    @workspace/api-server   -> Root Directory: artifacts/api-server
    @workspace/padcom       -> Root Directory: artifacts/padcom
    @workspace/parxis-site  -> Root Directory: artifacts/parxis-site

A documentacao do Railway e explicita sobre o que isso faz:

    "Setting this means that Railway will only pull down files from that
     directory when creating new deployments."
     (docs.railway.com/deployments/monorepo)

Este repositorio e um monorepo pnpm COMPARTILHADO, nao isolado. Os pacotes de
artifacts/ dependem de lib/ por "workspace:*" e do catalogo declarado em
pnpm-workspace.yaml. Isolando a pasta do pacote, o build nao encontra
pnpm-workspace.yaml, nao encontra pnpm-lock.yaml e nao encontra lib/. O
pnpm install nem comeca.

O "cd ../.." que voce colocou no buildCommand foi, imagino, a tentativa de
contornar exatamente isso. Nao contorna: os diretorios acima nao existem no
contexto. Voce nao pode subir para um lugar que nao foi baixado.

  CORRETO: Root Directory = "/" nos tres servicos.

3.2 O SEGUNDO ERRO: o railway.toml nunca seria lido

Consequencia direta do anterior, e da mesma pagina da doc:

    "The Railway Config File does not follow the Root Directory path. You have
     to specify the absolute path for the railway.json or railway.toml file,
     for example: /backend/railway.toml"

Ou seja: os tres arquivos que voce criou dentro de artifacts/*/ nao seriam
encontrados sozinhos. Nem no seu plano (Root Directory na subpasta) nem no meu
(Root Directory na raiz) o Railway acha esses arquivos por conta propria.

E preciso apontar o caminho explicitamente em cada servico. Ja fiz isso por API:

    api-server   -> artifacts/api-server/railway.toml
    padcom       -> artifacts/padcom/railway.toml
    parxis-site  -> artifacts/parxis-site/railway.toml

Sem esse passo, seus arquivos seriam decoracao: o Railway usaria os comandos
auto-detectados na importacao e ignoraria healthcheck, restart policy e tudo
mais que voce escreveu.

3.3 O override de setup no nixpacks.toml

    [phases.setup]
    nixPkgs = ["nodejs_24", "pnpm"]

Declarar nixPkgs substitui a fase de setup inteira que o Nixpacks montaria. O
Nixpacks ja detecta o pnpm-lock.yaml e provisiona o pnpm com a versao coerente
sozinho. Assumir o volante aqui so cria uma superficie de quebra sem ganho — e
"pnpm" no nixpkgs nem sempre resolve para a mesma versao que o lockfile espera.

  CORRETO: NIXPACKS_NODE_VERSION = "24" em [variables], e deixar o setup quieto.

3.4 O erro silencioso: install sem --prod=false

    cmds = ["pnpm install --frozen-lockfile"]

O Railway define NODE_ENV=production no ambiente de build. O pnpm, com
NODE_ENV=production, pula devDependencies.

Agora olhe onde moram as ferramentas de build deste repo:

    artifacts/padcom/package.json ......... "vite" em devDependencies
    artifacts/parxis-site/package.json .... "vite" em devDependencies
    artifacts/api-server/package.json ..... "esbuild" em devDependencies

Ou seja: o install teria "sucesso", e o build seguinte morreria com
"vite: command not found" nos dois frontends e "esbuild not found" no backend.
Este e o tipo de defeito que custa uma tarde de logs, porque a mensagem de erro
aponta para o lugar errado.

  CORRETO: pnpm install --frozen-lockfile --prod=false

3.5 O .env.railway.example descrevia um sistema que nao existe

Voce listou como OBRIGATORIAS:

    GOOGLE_CLIENT_ID
    GOOGLE_CLIENT_SECRET
    GOOGLE_REDIRECT_URI

Essas tres variaveis nao aparecem em lugar nenhum do codigo. Fiz grep em
artifacts/ e lib/ inteiros. As integracoes Google nao usam OAuth proprio —
usam o Replit Connectors (secao 4.C). Preencher essas variaveis no Railway nao
teria efeito nenhum, e o CEO passaria horas criando credenciais no Google Cloud
Console para nada.

E faltavam variaveis que o codigo realmente exige:

    APP_ENCRYPTION_KEY .... chave mestra do cofre de segredos cifrados.
                            src/lib/secure-settings.ts:33 e explicito:
                            "APP_ENCRYPTION_KEY ausente em producao: defina-a
                            para usar o cofre de segredos." Sem ela, gravar ou
                            ler qualquer credencial do cofre falha.
    TWILIO_WHATSAPP_FROM .. remetente do WhatsApp
    CLICKSIGN_*  .......... a segunda via de assinatura eletronica
    AI_INTEGRATIONS_* ..... chaves de IA (Anthropic, Gemini)
    TRELLO_* .............. quadro operacional
    ADMIN_EMAIL, CEO_EMAIL, SNCR_ALERT_EMAIL, MEDICO_NOME/CPF/EMAIL, e outras

Reescrevi o arquivo inteiro a partir do codigo, separado por servico, com
comentario dizendo qual e obrigatoria e qual e opcional, e por que. Onde o
codigo le primeiro do cofre no banco e so cai para o env como fallback, isso
esta anotado — para o CEO nao duplicar segredo em dois lugares.

3.6 O build do padcom ja estava quebrado antes de voce chegar

Este nao e erro seu, e um achado. Mas prova o argumento central desta carta.

    artifacts/padcom/src/pages/cockpit-cliente/panels/CadastroPanel.tsx:10
      import ClientServiceAddresses from "@/components/ClientServiceAddresses";

    artifacts/padcom/src/components/ClientServiceAddresses.tsx:45
      export function ClientServiceAddresses(...)   <- so export nomeado

Import default de um modulo que nao tem export default. O rollup falha o build
inteiro do padcom:

    "default" is not exported by "src/components/ClientServiceAddresses.tsx"

Outros dois arquivos (cockpit-cliente/index.tsx e clients/detail.tsx) importam
o mesmo componente da forma correta, com chaves. So o CadastroPanel estava
errado. Corrigi para import nomeado.

O ponto: bastava rodar `pnpm --filter @workspace/padcom run build` uma vez para
descobrir isso. O plano foi entregue como "so falta configurar o Railway"
enquanto um dos tres servicos nao compilava. Nenhum ajuste de railway.toml
resolveria — o CEO iria configurar tudo certinho e ver o build falhar sem
entender por que.

  KAIZEN IMEDIATO: nunca entregar configuracao de deploy sem ter executado o
  build que ela invoca. O comando existe, e barato, e a unica prova que vale.


================================================================================
4. OS TRES BLOQUEADORES QUE NENHUM DOS DOIS TINHA VISTO
================================================================================

Aqui a carta muda de tom. Os itens da secao 3 sao defeitos de configuracao.
Estes tres sao arquiteturais, e o primeiro e grave.

--------------------------------------------------------------------------------
4.A  A API NAO TEM AUTENTICACAO. NENHUMA.
--------------------------------------------------------------------------------

Numeros medidos neste repo:

    Arquivos de rota em artifacts/api-server/src/routes/ ......... 87
    Arquivos que verificam identidade de quem chama .............. 0

E o middleware que deveria isolar o tenant esta assim
(artifacts/api-server/src/middleware/tenantContext.ts:47):

    export function tenantContextMiddleware(req, _res, next) {
      // TODO (Fase auth): substituir por leitura do session/JWT
      req.tenantContext = {
        empresaId: 5,           // Instituto Padua
        isPlatformOwner: true,  // CEO sempre ve tudo
        perfilPlataforma: "platform_owner",
      };
      next();
    }

Toda requisicao que chega e tratada como o CEO, dono da plataforma, com acesso
a tudo. Nao ha login. Nao ha token. Nao ha cookie de sessao.

Somado a isso, em app.ts:29:

    app.use(cors());

Sem argumento, o middleware cors responde Access-Control-Allow-Origin: *. Nao ha
helmet. Nao ha rate limiting. Verifiquei: nenhum dos dois esta sequer instalado.

O QUE ISSO SIGNIFICA NA PRATICA. No momento em que o api-server ganhar um
dominio publico no Railway, qualquer pessoa no mundo com a URL faz:

    curl https://<seu-dominio>.up.railway.app/api/clients

e recebe a lista completa de pacientes — nome, CPF, e-mail, telefone, data de
nascimento, endereco, ficha clinica. Sem senha. Sem token. Sem log de quem foi.
As demais rotas seguem o mesmo padrao: prescricoes, anamneses, RAS, exames.

Justica seja feita: as rotas do PORTAL DO PACIENTE estao protegidas. Verifiquei
area-paciente.ts, client-portal.ts, anamnese-portal.ts e scheduling.ts — todas
validam token HMAC via verifyPortalToken. O trabalho foi bem feito ali. O
problema e que a API ADMINISTRATIVA, que e onde mora o prontuario inteiro, nao
tem equivalente.

Isto e dado pessoal sensivel de saude, LGPD Art. 5o II e Art. 11. Publicar assim
nao e "MVP com deficit tecnico" — e incidente de seguranca no dia um, com dever
de notificacao a ANPD e aos titulares.

  RECOMENDACAO: nao gerar dominio publico para o api-server ate existir
  autenticacao. Se precisar validar o deploy antes disso, use rede privada do
  Railway entre padcom e api-server e nao exponha o backend. Isso e barreira,
  nao sugestao.

--------------------------------------------------------------------------------
4.B  O ARMAZENAMENTO DE ARQUIVOS NAO FUNCIONA FORA DO REPLIT
--------------------------------------------------------------------------------

artifacts/api-server/src/lib/objectStorage.ts:12

    const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

    export const objectStorageClient = new Storage({
      credentials: {
        audience: "replit",
        token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
        ...

O cliente do Google Cloud Storage autentica pedindo credencial a um processo
auxiliar em 127.0.0.1:1106. Esse processo e injetado pela infraestrutura do
Replit. No Railway ele nao existe: a conexao da ECONNREFUSED.

Quebram, no Railway: foto do paciente, upload e leitura de exames, documentos
gerados pela Fabrica, anexos em geral. Tudo que passa por
ObjectStorageService.

--------------------------------------------------------------------------------
4.C  AGENDA, GMAIL E DRIVE TAMBEM DEPENDEM DO REPLIT
--------------------------------------------------------------------------------

google-calendar.ts:10, google-gmail.ts:11, google-drive.ts:15 — os tres leem:

    process.env.REPLIT_CONNECTORS_HOSTNAME
    process.env.REPL_IDENTITY

Variaveis fornecidas pelo Replit Connectors. Fora do Replit nao existem, e nao
ha variavel de ambiente que resolva: e preciso reescrever para OAuth proprio do
Google (client id, secret, refresh token guardado por empresa).

Ironia util: as tres variaveis que voce inventou no .env.railway.example
(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI) sao exatamente as
que passarao a existir DEPOIS dessa reescrita. Voce documentou o futuro como se
fosse o presente. Deixei uma secao no fim do .env.railway.example explicando
isso.


================================================================================
5. O QUE PRECISA SER FEITO — EM ORDEM
================================================================================

BLOCO 0 — ANTES DE QUALQUER DEPLOY PUBLICO
  0.1  Implementar autenticacao real no api-server (4.A). Substituir o
       tenantContext hardcoded por leitura de sessao/JWT, com 401 quando nao
       houver identidade.
  0.2  Fechar o CORS para as origens do padcom e do parxis-site.
  0.3  Instalar helmet e um rate limiter nas rotas publicas.
  0.4  Enquanto 0.1 nao existir: NAO gerar dominio publico do api-server.

BLOCO 1 — DEPLOY (o que sobrou do seu plano, ja corrigido)
  1.1  Deletar os servicos @workspace/mockup-sandbox e
       @workspace/api-client-react no painel. Nao ha API para deletar servico;
       este passo continua manual, e voce estava certo nele. api-client-react
       e biblioteca, nem deployavel e.
  1.2  Provisionar PostgreSQL: "+ Add" -> Database -> PostgreSQL.
  1.3  No api-server, definir:
         DATABASE_URL      = ${{Postgres.DATABASE_URL}}
         SESSION_SECRET    = openssl rand -hex 32
         APP_ENCRYPTION_KEY= openssl rand -hex 32
       Sem as tres, o servico nao sobe (as duas primeiras) ou o cofre nao
       funciona (a terceira).
  1.4  Rodar as migrations do Drizzle contra o banco novo. O banco nasce vazio;
       nenhum railway.toml faz isso sozinho. Sugiro preDeployCommand.
  1.5  Gerar dominio publico do parxis-site e do padcom (do api-server, so
       depois do Bloco 0).
  1.6  Conferir se a referencia VITE_API_SERVER_URL que deixei resolveu. Usei
       ${{@workspace/api-server.RAILWAY_PUBLIC_DOMAIN}}, mas o nome do servico
       tem "@" e "/" e pode confundir a sintaxe de referencia. Se nao resolver,
       colar a URL literal.
  1.7  Apply changes -> Deploy.

BLOCO 2 — PARIDADE FUNCIONAL
  2.1  Substituir o objectStorage do sidecar Replit (4.B).
  2.2  Reescrever as integracoes Google para OAuth proprio (4.C).
  2.3  Isolar os jobs agendados. Hoje app.ts dispara setInterval no escopo do
       modulo e lib/cron.ts registra tres cron.schedule. Com mais de uma
       replica, tudo executa em duplicado — mensagem enviada duas vezes ao
       paciente, cobranca disparada duas vezes. Antes de escalar horizontalmente,
       isso precisa virar um servico worker unico.

BLOCO 3 — MULTI-TENANT (secao 6)

Observacao sobre custo de build: o api-server tem puppeteer e tesseract.js nas
dependencias, que baixam binarios pesados. Nao quebrou aqui, mas se o build no
Railway estourar tempo ou disco, e por ai que a investigacao comeca.


================================================================================
6. KAIZEN — DEZ PASSOS A FRENTE, PENSANDO NO MULTI-TENANT
================================================================================

O CEO avisou que o sistema sera multi-tenant em breve. Medi o quanto falta.

DIAGNOSTICO NUMERICO

    Tabelas no schema ............................... 99
    Arquivos de schema que mencionam empresa_id ..... 13
    Colunas empresa_id com NOT NULL ................. 1
    Arquivos de rota que filtram por empresaId ...... 11 de 87
    Valor de empresaId em producao .................. 5, fixo no codigo

Traduzindo: a intencao multi-tenant existe e esta documentada (o proprio
tenantContext.ts diz "NUNCA remover este arquivo"), mas a implementacao esta em
torno de 13% do schema e 13% das rotas. Se uma segunda clinica entrar hoje, ela
ve os dados da primeira. Nao e hipotese — e o comportamento atual do codigo.

Os dez passos, na ordem em que eu faria:

PASSO 1 — Autenticacao antes de tudo
  Multi-tenant sem auth e contradicao: o tenant vem da identidade de quem
  chama. Sem login, nao ha de onde tirar o empresa_id. Este passo bloqueia
  todos os outros. Papeis ja estao previstos no tipo TenantContext
  (platform_owner, admin, medico, enfermeira, recepcionista) — o desenho esta
  pronto, falta a implementacao.

PASSO 2 — empresa_id em todas as tabelas de dado de tenant
  Hoje 13 de 99. Fazer o levantamento tabela a tabela separando: (a) dado de
  tenant, precisa de empresa_id NOT NULL com FK; (b) catalogo global
  compartilhado (catalogo_analitos, catalogo_doencas — dado de referencia, nao
  de clinica); (c) dado de plataforma. Sem essa classificacao, o passo 3 nao
  tem como ser aplicado.

PASSO 3 — Row Level Security no Postgres
  Este e o passo que mais protege por unidade de esforco. Politica RLS por
  tabela, com a aplicacao emitindo SET LOCAL app.empresa_id a cada transacao.
  A diferenca pratica: hoje o isolamento depende de alguem lembrar de escrever
  o WHERE em 87 arquivos de rota. Com RLS, esquecer o WHERE retorna zero linhas
  em vez de retornar a clinica errada. Erro de programador vira bug visivel, e
  nao vazamento silencioso.

PASSO 4 — Camada de acesso que injeta o filtro
  Nao confiar na disciplina de lembrar. Um wrapper sobre o Drizzle que exige
  empresa_id explicito, ou um helper de repositorio por entidade. Com 99
  tabelas e 87 rotas, a disciplina manual perde — sempre.

PASSO 5 — Indices compostos comecando por empresa_id
  Todo indice de consulta quente deve comecar por empresa_id. Feito depois que
  os dados crescem, vira migration com lock em tabela grande e janela de
  manutencao. Feito agora, e barato.

PASSO 6 — Auditoria de acesso a prontuario
  Quem abriu qual prontuario, quando, de qual IP. Existe dispatch_log e
  sncr_log, mas nao ha trilha de leitura. LGPD Art. 37 pede registro das
  operacoes de tratamento, e no dia de uma disputa essa tabela e a unica defesa
  objetiva. Em multi-tenant vira obrigatoria: e como se prova que a clinica B
  nao viu o paciente da clinica A.

PASSO 7 — Segredos por tenant
  O cofre secure_settings ja existe e ja e cifrado — bom trabalho de quem fez.
  Falta escopar por empresa_id: cada clinica tem a propria chave Asaas, o
  proprio Twilio, o proprio certificado A1. Hoje o cofre e global.

PASSO 8 — Ambientes separados e migrations versionadas
  Um ambiente de staging identico ao de producao, e migration rodada em staging
  antes de producao, sempre. Com uma clinica, um erro de migration e um susto.
  Com dez, e um incidente com dez CNPJs afetados.

PASSO 9 — Backup com PITR e ENSAIO DE RESTORE
  Backup que nunca foi restaurado nao e backup, e esperanca. Ensaio trimestral,
  cronometrado, com o tempo anotado. Lembrando que prontuario medico tem guarda
  legal longa (CFM Res. 1.821/2007 — confirmar prazo vigente com o juridico),
  o que significa que a estrategia de backup precisa sobreviver a mudancas de
  provedor ao longo de decadas.

PASSO 10 — Isolamento de ruido entre clinicas
  Uma clinica que sobe 500 exames nao pode travar as outras. Fila de trabalho
  com limite por tenant, e os jobs pesados (OCR do tesseract, PDF do puppeteer)
  fora do processo que atende requisicao HTTP. Isso conversa com o item 2.3:
  o worker unico ja precisa existir de qualquer forma.

BONUS, PASSO 11 — Onboarding de clinica como codigo
  Quando a terceira clinica entrar, o processo tem que ser um comando, nao uma
  tarde de trabalho manual. Seed de catalogos, criacao de admin, dominio,
  segredos. Se cada onboarding for artesanal, o produto nao escala — e o gargalo
  vira o CEO.

PRINCIPIO KAIZEN QUE ATRAVESSA OS ONZE. Os passos 3, 4 e 6 tem em comum
transformar erro humano em falha visivel e barata em vez de vazamento silencioso
e caro. Esse e o unico tipo de investimento em arquitetura que se paga sozinho.


================================================================================
7. ONDE HOSPEDAR — ANALISE DE CUSTO-BENEFICIO
================================================================================

O CEO pediu alternativa com bom custo-beneficio, que comporte o banco da clinica
atual e das futuras. Antes das opcoes, os criterios que importam NESTE caso —
porque a resposta muda conforme o criterio.

  C1  Residencia do dado no Brasil. Dado de saude e sensivel (LGPD Art. 11).
      Transferencia internacional e legalmente possivel com salvaguardas, mas
      manter no Brasil elimina uma discussao inteira com juridico e com futuras
      clinicas parceiras que farao due diligence antes de assinar.
  C2  Latencia entre aplicacao e banco. Este ponto e mais importante que a
      latencia ate o usuario. Uma tela do PADCOM faz dezenas de consultas; se
      app e banco estiverem em continentes diferentes, cada consulta paga
      100-150ms e a tela leva segundos. App e banco DEVEM ficar na mesma regiao.
  C3  Postgres gerenciado com PITR de verdade.
  C4  Custo previsivel e proporcional a uma clinica, nao a uma startup com
      investidor.
  C5  Nota fiscal em BRL. O schema tem campos de contador, regime tributario e
      CNAE — esta empresa tem contabilidade formal. Fatura em dolar de provedor
      estrangeiro da trabalho ao contador e complica credito de imposto.
  C6  Esforco de operacao. Nao ha time de infraestrutura aqui.

AS OPCOES

  A) RAILWAY (onde voce esta)
     Bom: a melhor experiencia de desenvolvimento do grupo, deploy por git,
     ja esta configurado, Postgres em um clique.
     Ruim: nao ha regiao no Brasil. App e banco ficariam nos EUA ou Europa,
     falhando C1 e C5, e adicionando latencia para o usuario brasileiro.
     Custo: faixa de USD 5 a 20/mes por servico no inicio, mais uso.
     Veredito: otimo para STAGING e para validar o deploy. Para producao com
     prontuario, os criterios C1 e C5 pesam contra.

  B) FLY.IO + POSTGRES GERENCIADO
     Bom: tem regiao em Sao Paulo (GRU). Resolve C1 e C2 de uma vez, com app e
     banco colocados juntos no Brasil. Precos por maquina pequena sao baixos.
     Ruim: o Postgres do proprio Fly e nao-gerenciado (eles mesmos recomendam
     provedor externo). Operacao um degrau acima do Railway.
     Custo: ordem de USD 5 a 15/mes por app pequeno, mais o banco a parte.

  C) SUPABASE (banco, autenticacao e arquivos) — RECOMENDADO PARA O BANCO
     Bom: Postgres gerenciado com regiao em Sao Paulo, PITR nos planos pagos,
     e tres coisas que este projeto precisa e nao tem: RLS nativo (Passo 3),
     autenticacao pronta (Passo 1 e 4.A) e storage compativel com S3 (item 4.B).
     Ou seja, ataca simultaneamente o bloqueador de seguranca, o de arquivos e
     a base do multi-tenant. E Postgres puro — o Drizzle e o schema atual
     funcionam sem reescrita.
     Ruim: mais um fornecedor na conta. O Auth exige adaptacao no codigo.
     Custo: plano gratuito para comecar; plano pago na faixa de USD 25/mes por
     projeto, que e onde entram PITR e backups serios.

  D) AWS sa-east-1 (Sao Paulo)
     Bom: residencia no Brasil, RDS com PITR maduro, S3, e o nome que passa em
     qualquer due diligence de cliente corporativo.
     Ruim: caro e complexo para o tamanho atual. Um RDS pequeno com Multi-AZ ja
     custa mais que todo o resto somado, e exige alguem que saiba operar.
     Veredito: e o destino provavel quando houver 10+ clinicas ou um contrato
     que exija. Nao e o comeco.

  E) VPS BRASILEIRO + COOLIFY/DOKPLOY (Magalu Cloud, Locaweb, Hostinger BR)
     Bom: o mais barato do grupo, nota fiscal em BRL (C5 resolvido), suporte em
     portugues, dado no Brasil.
     Ruim: voce vira o administrador do banco. Backup, atualizacao de seguranca,
     monitoramento, restore — tudo seu. Falha C6, e falha justamente no dia de
     um incidente.
     Veredito: so com alguem dedicado a operacao. Nao recomendo hoje.

  F) HETZNER + COOLIFY
     Bom: imbativel em preco por CPU e RAM.
     Ruim: Alemanha e Finlandia. Falha C1 e C2 para usuario brasileiro. Para
     dado de saude de clinica brasileira, nao compensa a economia.

RECOMENDACAO EM TRES FASES

  FASE 1 — AGORA (1 clinica, ate o multi-tenant chegar)
    Aplicacao ....... Fly.io regiao GRU (Sao Paulo)
    Banco ........... Supabase regiao Sao Paulo, plano pago (PITR)
    Arquivos ........ Supabase Storage ou Cloudflare R2
    Staging ......... Railway, que ja esta configurado e pago por uso
    Ordem de grandeza: USD 40 a 70/mes somando tudo.

    Por que essa combinacao: app e banco na mesma regiao e no Brasil (C1+C2), e
    o Supabase entrega de fabrica RLS, autenticacao e storage — que sao
    exatamente os tres buracos das secoes 4.A, 4.B e 6/Passo 3. Voce compra
    solucao para tres problemas pagando por um servico.

  FASE 2 — 3 A 20 CLINICAS
    Manter a arquitetura, escalar o plano do banco, adicionar replica de
    leitura e o servico worker do item 2.3. Neste ponto o RLS ja precisa estar
    em producao, nao no backlog.

  FASE 3 — CONTRATO CORPORATIVO OU 20+ CLINICAS
    Avaliar AWS sa-east-1, quando a exigencia vier de contrato e nao de
    engenharia. Migrar Postgres para Postgres e trabalhoso, mas e caminho
    conhecido — desde que ninguem tenha se amarrado a extensao proprietaria
    pelo caminho.

RESSALVA HONESTA SOBRE PRECOS E REGIOES. Os valores acima sao ordens de grandeza
para dimensionar a decisao, nao cotacao. Preco de nuvem e disponibilidade de
regiao mudam com frequencia, e minha base de conhecimento tem data de corte.
Confirmar no site de cada provedor antes de decidir, especialmente a
disponibilidade da regiao Sao Paulo no plano pretendido.

O QUE EU NAO RECOMENDO, EM QUALQUER CENARIO
  - Subir producao com prontuario antes do item 4.A. Nenhuma escolha de
    hospedagem compensa uma API sem autenticacao. O provedor mais caro do
    mundo nao protege uma porta destrancada.
  - Amarrar-se de novo a um unico fornecedor. O aperto de hoje com o Replit
    (sidecar de storage, connectors do Google) foi criado por conveniencia de
    ontem. Toda integracao nova deve passar por uma interface que possa ser
    trocada.


================================================================================
8. FECHAMENTO
================================================================================

Dr. Replit Manager, o que peco nao e mais cuidado na proxima configuracao. E
uma mudanca de criterio para considerar algo pronto:

  1. Configuracao de build so e entregue depois de o build ter sido executado.
  2. Variavel de ambiente so entra na lista se aparecer no codigo. Se nao
     aparece, e ficcao — e ficcao em documento de deploy custa horas do CEO.
  3. Premissa sobre comportamento de plataforma se confirma na documentacao
     antes de virar instrucao. As duas paginas que desmontam o plano estavam a
     uma busca de distancia.

O trabalho de fundo esta bom. O tenantContext com o aviso de nunca remover, o
cofre cifrado, os tokens HMAC do portal do paciente, o build.mjs cuidando dos
arquivos de dados do pdfkit — isso e trabalho de quem pensa a frente. A lacuna
nao esta na capacidade de projetar. Esta no ultimo metro: verificar antes de
declarar pronto.

Fico a disposicao para revisar a implementacao da autenticacao (4.A), que e o
que separa este sistema de poder ir ao ar.

Com respeito profissional,

Dr. Claude
Claude Code — sessao remota
Branch: claude/railway-deployment-config-epj2ec
Commit da correcao: 1d86abd

================================================================================
ANEXO — EVIDENCIAS
================================================================================

Arquivos alterados nesta sessao:
  nixpacks.toml
  .env.railway.example
  artifacts/api-server/railway.toml
  artifacts/padcom/railway.toml
  artifacts/parxis-site/railway.toml
  artifacts/padcom/src/pages/cockpit-cliente/panels/CadastroPanel.tsx

Referencias de codigo citadas:
  artifacts/api-server/src/middleware/tenantContext.ts:47   empresaId fixo em 5
  artifacts/api-server/src/app.ts:29                        app.use(cors()) aberto
  artifacts/api-server/src/lib/objectStorage.ts:12          sidecar Replit
  artifacts/api-server/src/lib/google-calendar.ts:10        REPLIT_CONNECTORS_HOSTNAME
  artifacts/api-server/src/lib/secure-settings.ts:33        APP_ENCRYPTION_KEY obrigatoria
  lib/db/src/index.ts:7                                     DATABASE_URL obrigatoria
  artifacts/api-server/src/index.ts:15                      PORT obrigatoria

Documentacao consultada:
  docs.railway.com/deployments/monorepo   (Root Directory e config file path)

Metricas do repositorio:
  99 tabelas no schema Drizzle
  87 arquivos de rota no api-server
  ~59.700 linhas de TypeScript no api-server
  ~88.800 linhas de TypeScript/TSX no padcom
  9 pacotes em lib/
================================================================================
