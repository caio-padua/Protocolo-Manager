# Git e Railway: estado verificado em 27/11/2026

Somente leitura. Nada foi apagado, publicado, juntado ou alterado no GitHub, no Railway ou no Lovable. Sem valores de segredos.

## A. Resumo para o Pull Request da homologação para a main

| Item | Valor |
|---|---|
| Repositório | caio-padua/Protocolo-Manager |
| Origem | `homologacao/paxmed-modelo-2b` |
| Destino | `main` (parada desde 03/11/2026) |
| Distância | 888 commits à frente, 0 atrás (a main já está dentro da origem; sem conflito de histórico) |
| Tamanho | 2.513 arquivos, 274.437 linhas somadas, 17.990 removidas |
| Já incluído nela | `feature/clinical-certificate-status-unsigned` (38 commits) |

Onde estão as mudanças (arquivos por pasta):

| Pasta | Arquivos |
|---|---|
| artifacts/api-server | 945 |
| artifacts/padcom | 569 |
| lib/api-zod | 233 |
| .agents/memory | 167 |
| artifacts/mockup-sandbox | 132 |
| scripts/migrations | 56 |
| e2e/evidencias | 50 |
| lib/db | 35 |

Conteúdo funcional recente (já registrado em specs e testes): vitrines PAXMED e PAXCARE por domínio, convite PAXMED, convite de médico pelo cliente, central de acolhimento e primeiro acesso, isolamento entre clínicas A e B, cofre PaxCare.

Cuidados antes de juntar:
1. Há 3 migrações novas de banco em `scripts/migrations`. Aplicar em produção só com cópia de segurança e ordem escrita.
2. Juntar na main NÃO publica nada por si só: o Railway já ignora os deploys (ver C).
3. Segredos de produção ausentes no Replit: `APP_ENCRYPTION_KEY` e `PUBLIC_API_BASE_URL`.
4. Revisão independente do diff inteiro não foi feita; testes rodaram por módulo, não como suíte total.

## B. Revisão das branches no GitHub

| Branch | Situação | Conteúdo | Recomendação (decisão do Dr. Caio) |
|---|---|---|---|
| `homologacao/paxmed-modelo-2b` | 888 à frente | Todo o trabalho atual | Juntar na main (A) |
| `feature/clinical-certificate-status-unsigned` | 38 à frente da main; já dentro da homologação | Certificado e assinatura | Nada a fazer; ficará redundante depois do merge |
| `claude/railway-deployment-config-epj2ec` (PR nº 6) | Divergida: 24 à frente, 716 atrás; 19 arquivos | Linha de produção PADAXOR (docs), senhas, monitor de LLM, Slack | Não juntar como está: base de 30/07/2026. Revisar arquivo a arquivo e refazer sobre a main nova |
| `claude/lovable-railway-deploy-jo3c7k` | Divergida: 2 à frente, 896 atrás; 4 arquivos | Ajustes de deploy do Railway (26/07/2026) | Provavelmente superada; conferir `railway.toml` antes de descartar |
| `docs/pac-20260718-001-mesa-parxis` | Divergida: 2 à frente, 1.189 atrás; 16 arquivos | Mesa arquitetural Parxis (documentos) | Preservar; decidir se vira pasta de docs na main |
| `ordem-permanente-satelite` | 0 à frente, 355 atrás | Nenhuma mudança própria | Sem conteúdo; pode ser arquivada com ordem escrita |

As 223 branches `subrepl-*` existem só na cópia local do Replit (tarefas em segundo plano), não no GitHub. Não apagar sem ordem escrita.

Regra proposta: uma `main` e uma branch de trabalho por vez; Pull Request pequeno e frequente.

## C. Checklist do Railway (projeto accomplished-reverence, ambiente production)

Verificado por leitura:

| Serviço | Endereço Railway | Últimos 50 deploys | Resposta HTTP hoje |
|---|---|---|---|
| @workspace/api-server | workspaceapi-server-production-f5ec.up.railway.app | todos SKIPPED (último em 03/11/2026), nenhum SUCCESS | 404 "Application not found" |
| @workspace/padcom | workspacepadcom-production.up.railway.app | todos SKIPPED, nenhum SUCCESS | 404 |
| @workspace/parxis-site | workspaceparxis-site-production.up.railway.app | SKIPPED (último em 27/11/2026) | 404 |

Conclusão: nenhum dos três serviços está no ar. "Application not found" é resposta do Railway, sem aplicação respondendo. O site Lovable PAXMED ainda chama o endereço do api-server, que devolve 404; por isso contatos e logins vindos dele não chegam ao Manager.

Domínios próprios (paxmed.com.br, paxcare.com.br): nenhum cadastrado nos serviços.

Variáveis do api-server no Railway (só nomes): presentes ADMIN_USERNAME, ADMIN_PASSWORD, ALLOWED_ORIGINS, APP_ENCRYPTION_KEY, DATABASE_URL, SESSION_SECRET, NODE_ENV, PORT, LOG_LEVEL, chaves de IA. Ausentes frente ao modelo `.env.railway.example`: ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_DELEGATED_EMAIL, PUBLIC_API_BASE_URL. Padcom tem VITE_API_SERVER_URL. Conferir quais são realmente obrigatórias na produção antes de cadastrar.

Ordem proposta (cada passo só com ordem escrita do Dr. Caio):

| Passo | Ação | Risco |
|---|---|---|
| C1 | Juntar a homologação na main (A) | Baixo: não publica sozinho |
| C2 | Descobrir por que os deploys saem SKIPPED (gatilho do GitHub, padrões de arquivos observados, ou ramificação ligada) | Baixo: só leitura |
| C3 | Cadastrar `PUBLIC_API_BASE_URL` e demais segredos faltantes no api-server | Médio |
| C4 | Fazer cópia de segurança do banco Railway e aplicar as migrações novas | Alto |
| C5 | Primeiro deploy do api-server e conferência de `/api/healthz` e `/api/brt` | Médio |
| C6 | Cadastrar paxmed.com.br e paxcare.com.br e apontar o DNS | Alto |
| C7 | Alinhar o Lovable às rotas do Manager (login do paciente, consentimento no contato, adesão do médico) | Médio; é trabalho no Lovable |
