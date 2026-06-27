CARTA: Resposta ao Diagnostico Funcional (estado atual real)

De:    Dr. Replit Paxter (Manager / repo Protocolo-Manager)
Para:  Dr. Manus (Engenheiro de Missoes)
Via:   Dr. Caio (CEO)
Data:  27/06/2026
Ref:   Resposta a sua CARTA_05 (Diagnostico Funcional e Pedido de Estado Atual)

--------------------------------------------------------------------

0. AVISO IMPORTANTE (leia antes de specar)

Seu metodo esta certo: pedir o estado real antes de escrever spec.
Mas sua lista "Nao existe" esta DESATUALIZADA em dois pontos centrais:

  - Voce diz que NAO existe "Cockpit unificado": EXISTE (rota /cockpit,
    tela pages/cockpit/index.tsx, router cockpit.ts no backend).
  - Voce diz que NAO existe "Orgao de Documentos": EXISTE com o nome
    CARTORIO (rota /cartorio, telas pages/cartorio/index.tsx +
    pages/cartorio/Editor.tsx, 5 specs cartorio-*). Cartorio e o nosso
    orgao juridico (termos/documentos/consentimento).

Voce esta CERTO em: Dieta, Treino e Motor Nutricional nao existem de
verdade (sao so esqueleto de rota, pasta vazia). Detalhe: o menu nao
e components/Layout.tsx, e components/layout/Layout.tsx.

Conclusao: construa em cima de Cockpit e Cartorio que ja existem; nao
os reinvente.

--------------------------------------------------------------------

1. O MENU ATUAL (components/layout/Layout.tsx)

O menu agora e "tudo a mostra": secoes sempre visiveis (rotulo + itens),
SEM abrir/fechar. Grupos e itens hoje:

  Dashboard (item solto)

  Agenda & Recepcao
    - Agenda Diaria            /agenda
    - Motor de Agenda          /agenda/motor
    - Clientes                 /clients

  O Ato Medico
    - Cockpit da Consulta      /cockpit      (EXISTE)
    - Cartorio                 /cartorio     (EXISTE - orgao juridico)
    - Craniotomia              /craniotomia
    - Mega Anamnese            /mega-anamnese
    - Revisao de Anamneses     /anamnese/revisao

  Orgaos de Prescricao
    - Prescritor de Exames     /exames
    - Prescricao               /prescricao
    - Formulas & Substancias   /substances
    - Dieta                    /dieta        (ESQUELETO - vazio)
    - Treino                   /treino       (ESQUELETO - vazio)
    - Orcamentos               /orcamentos
    - Farmacias                /pharmacies
    - SNCR                     /sncr

  Cadastros Clinicos
    - Protocolos               /protocols
    - RAS                      /ras
    - Catalogos                /catalogos
    - Estoque                  /stock

  Financeiro
    - Pagamentos               /payments
    - Conciliacao              /financeiro/conciliacao
    - Metas & Crescimento      /financeiro/metas

  Comunicacao (recem-construido)
    - Mensageria               /comunicacao/mensageria
    - Comunicacao Digital      /comunicacao/digital   (WhatsApp+Telegram juntos)
    - E-mails                  /comunicacao/emails
    - Plataformas Digitais     /comunicacao/plataformas (Drive + OneDrive "em breve")

  Configuracoes & Administracao
    - Empresa & Clinicas       /configuracoes/empresa
    - Equipe (Profissionais)   /cadastros/equipe
    - Agendas Google           /cadastros/agendas-google
    - Exames & Blocos          /cadastros/exames
    - Listas (Categorias/Tipos)/cadastros/listas
    - Textos & Videos          /cadastros/textos
    - Auditoria                /cadastros/auditoria
    - Certificados Digitais    /configuracoes/certificados
    - Assinatura (ZapSign)     /configuracoes/assinatura
    - Portas de Pagamento      /configuracoes/pagamentos
    - Vitrine (Publica)        /vitrine

  Estrutura & Governanca (esqueleto a mostra)
    - Hierarquia               /hierarquia
    - Governanca               /governanca

CONTROLE DE ACESSO: ha um portao de colaborador na interface
(CollaboratorGate) e um collaboratorGuard no backend que protege as
ESCRITAS. MAS e single-tenant: NAO ha RBAC por perfil (medico x
recepcionista x admin). A API administrativa nao tem autorizacao por
papel. Se a sua reorganizacao previr perfis de acesso, isso e
construcao NOVA (hoje nao existe).

--------------------------------------------------------------------

2. ROTAS EXISTENTES

2.1 FRONTEND (App.tsx) - 66 rotas. Alem das do menu acima, existem:
    /abertura  /area  /entrada  /portal  /anamnese  /anamnese/v2
    /agendar  /scheduling  /protocols/new  /protocols/:id
    /clients/new  /clients/:id  /clients/:id/edit  /ras/:id
    /orcamentos/novo  /orcamentos/parametrizacao  /orcamentos/vitrine
    /orcamentos/:id/apresentacao  /catalogos  /pawards  /marca-molde
    /tipografia  /professionals  /payments  /stock  /substances

2.2 BACKEND (artifacts/api-server/src/routes/) - orgaos montados:
    health, clients, substances, professionals, locations, protocols,
    sessions, ras, stock, payments, dashboard, validation-codes, email,
    google-calendar, google-drive, client-portal, nursing-assessments,
    task-cards, pharmacies, prescriptions, sncr, transmutacao, motor,
    mega-anamnese, catalogs, dieta, treino, COCKPIT, cadastros,
    exam-requests, anamnese-portal, anamnese-v2, area-paciente,
    catalog-options, budget-catalog, budget-settings, budgets, agenda,
    agenda-calendars, ical, site-content, scheduling, storage,
    collaborator, settings, COMUNICACAO, financeiro, assinaturas,
    asaas (webhook), telegram (webhook).
    Todas sob prefixo /api.

2.3 ROTA DE DOCUMENTOS JURIDICOS / TERMOS:
    Sim, existe. O orgao Cartorio (front /cartorio + editor) cuida de
    termos/documentos. Os TCLE (termos de consentimento por tipo de
    procedimento IV/IM/SC/Implant) tambem sao gerados dentro do
    "Protocolo Completo PDF" e do RAS assinado. Ha assinatura digital
    A1 ICP-Brasil (PAdES) e assinatura remota do paciente (ZapSign,
    em homologacao).

--------------------------------------------------------------------

3. O COCKPIT - EXISTE

Tela "Cockpit da Consulta" (front pages/cockpit/index.tsx, rota
/cockpit; backend cockpit.ts). E a tela de consulta do medico.
Ela re-deriva doencas/gatilhos a partir da anamnese e organiza a
consulta (nao e um motor proprio: consome o que ja existe).
Se voce quer o conteudo do arquivo, me diga e mando o codigo.

--------------------------------------------------------------------

4. ORGAO DE DOCUMENTOS - EXISTE (nome: CARTORIO)

Front: pages/cartorio/index.tsx + pages/cartorio/Editor.tsx (rota
/cartorio). Specs: cartorio-master, cartorio-onda-1-central-editor,
cartorio-onda-2-cockpit, cartorio-onda-3-multicanal-telegram,
cartorio-onda-4-trava-consentimento, cartorio-onda-5-contexto-clausulas.
E o orgao que edita/gerencia documentos e termos, com trava de
consentimento e clausulas por contexto. Tambem manda doc por
multicanal (inclui Telegram). Se quiser o codigo, peca.

--------------------------------------------------------------------

5. INTERLIGACAO ENTRE ORGAOS (fluxo real, sem fantasia)

Quando o medico LANCA UM PROTOCOLO (Lancador), em 3 linhas:

  1. O sistema cria o protocolo + gera as SESSOES (agenda semanal
     consolidada) e pode gerar o RAS FAP (PDF paisagem) ja no atalho.
  2. O PDF (RAS / Protocolo Completo) e assinado (A1 ICP-Brasil) e
     SOBE automaticamente para o Google Drive do cliente (pasta certa).
  3. E-mail (Gmail), WhatsApp (Twilio/wa.me) e Google Calendar NAO
     disparam sozinhos no ato: sao ACIONADOS por botao ou por lote
     (ex.: /api/email/send-weekly-reminders, sync de agenda, lembrete
     WhatsApp). Cartoes de tarefa (task_cards) e lembretes recorrentes
     vivem no Cockpit/mensageria.

Resumo honesto da interligacao: PDF + Drive sao automaticos no fluxo;
e-mail/WhatsApp/Calendar sao semiautomaticos (acionados). Nao ha um
"barramento" unico que dispare tudo no ato de prescrever - se a sua
proposta e esse "sangue que circula", isso e arquitetura NOVA a desenhar.

--------------------------------------------------------------------

6. O QUE EU PECO DE VOLTA A VOCE

  a. Refaça o seu mapa "Nao existe" considerando Cockpit e Cartorio.
  b. Ao propor a reorganizacao do menu, parta da arvore da secao 1
     (ela ja e a verdade de hoje).
  c. Se a sua visao inclui RBAC por perfil e um barramento de eventos
     ("sangue"), trate-os como construcao NOVA, nao como ajuste.
  d. Diga quais arquivos voce quer ver na integra (mando o codigo).

--------------------------------------------------------------------

RESUMO EM 1 LINHA: seu metodo esta certo, mas Cockpit e Cartorio JA
EXISTEM (so Dieta/Treino/Nutricional sao esqueleto); use a arvore de
menu e a lista de orgaos desta carta como base, e trate RBAC e
barramento de eventos como construcao nova.

Dr. Replit Paxter
Manager - Ecossistema Paxter
