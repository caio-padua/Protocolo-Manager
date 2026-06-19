# Padcon Conect — Motor Clinico | Protocolos Injetaveis

## Overview

Sistema completo (SaaS) para gerenciamento de protocolos injetaveis em clinica de medicina estetica (Brasil). Monorepo pnpm com TypeScript. Marca: **Padcon Conect** (com 1 N). Tagline: "Motor Clinico | Protocolos Injetaveis".

Agente da plataforma: **Dr. Replit Paxter** (renomeado de Dr. Replit Manager em 18/06/2026, decisao do CEO Dr. Caio). Sistema de design proprio documentado na skill `skill-layout-paxter`.

## Branding

- **Nome**: Padcon Conect (1 N — decisao de marca)
- **Paleta principal**: Verde-petroleo (#3D7A7A / hsl(180,30%,28%)), Ciano (#45B8CC / hsl(187,72%,48%)), Branco
- **Estilo visual**: Bordas quadradas (radius 6px), cards com borda lateral colorida, MAIUSCULO nos labels KPI, elegante/empirico, sem infantilidades
- **Logo**: SVG no sidebar (PadconLogo component) — "Pad" branco + "con" ciano + "CONECT" subtitulo
- **Sidebar**: Verde-petroleo escuro, menu com bordas finas, item ativo com destaque ciano
- **TDAH-friendly**: Cores fortes e contrastantes, labels em uppercase com tracking expandido, hierarquia visual clara

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (ESM bundle)
- **PDF**: pdf-lib (generation) + node-forge (A1 ICP-Brasil digital signature) + pdf-parse v2 (text extraction via `PDFParse.getText()`) + tesseract.js (OCR fallback for scanned PDFs, uses `pdftoppm` for PDF→PNG conversion)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Project Structure

### Frontend (`artifacts/padcom`)
- **Dashboard** — overview
- **Clientes** — CRUD de clientes with Google Drive folder setup button, edit form with CEP auto-fill (ViaCEP), address decomposed into CEP/logradouro/numero/complemento/bairro/cidade/estado/pais. New fields: instagram, comoConheceu. Google Drive setup creates: folder structure (CLIENTES root → NOME CPF: xxx.xxx.xxx-xx → 15 subpastas), Google Sheet (CADASTRO + METADADOS tabs with folder IDs)
- **Protocolos** — lista + detalhe + **Lançador** (guided single-page protocol creation)
- **Agenda** — weekly session view with ICS download, Google Calendar sync, WhatsApp reminders, color-coded status cards
- **RAS** — Registro de Administração de Substâncias with A1 ICP-Brasil digital signature PDF download, auto-upload to Google Drive (PROTOCOLOS folder), manual "Enviar ao Drive" button
- **RAS FAP** (antigo "RAS Físico") — Printable landscape PDF (spreadsheet format) for nurse manual control / paper audit (FAP = Formulário de Auditoria de Procedimentos). Gerado por **pdfkit** em `artifacts/api-server/src/lib/ras-fap.ts` (export `gerarRasFapPdf`); `generatePhysicalRASPdf` em `pdf-signer.ts` é só o adaptador (PhysicalRASData → DadosRasFap). Motor da grade COPIADO IDÊNTICO do `rasFap.ts` do IHE (agenda global, SEM contínuo cruzando páginas com lacunas, célula "N/total", consolidação por semana ISO no 1º dia previsto). Regras visuais do CEO: 5 colunas de substância FIXAS por folha (sobras EM BRANCO), moldura grossa só na caixa externa, wordmark serif "RAS", assinaturas em caixas + carimbo (CRM/COREN), padding até 20 linhas/página. Accessed from protocol detail page (button "RAS FAP (Imprimir)"). Demo: `GET /api/ras-fap-demo`. Auto-uploads to client Drive PROTOCOLOS folder. Filename: `YY.MM.DD RAS FAP NOME (TITULO).pdf`
- **Estoque** — stock management with critical/low alerts
- **Financeiro** — payments tracking with PIX/credit/debit/boleto/cash methods, installments for credit cards, card identification labels, running balance with total pago/pendente
- **Profissionais** — staff management
- **Substâncias** — comprehensive substance catalog with expandable detail cards showing health benefits, body system impact bars, longevity/sleep/energy/performance info

### API Server (`artifacts/api-server`)
- All routes under `/api/` prefix
- Vite proxy configured in padcom: `/api` → port 8080
- Digital signature: A1 certificate at `certs/assinatura.pfx` (CPF 293.274.948-06)

### Database (`lib/db`)
- Tables: clients, substances, professionals, locations, protocols, protocol_items, sessions, substance_applications, ras, ras_evolutivo, stock, payments, validation_codes, nursing_assessments, task_cards, client_ratings
- Locations: Clínica Tatuapé, Clínica Mooca, Nurse Care Domiciliar
- `location_professionals` junction table

### RAS Evolutivo System (Phase 1 — Schema)
- **Professionals roles**: `role` field — medico_01, medico_02, enfermeira_01, enfermeira_02, adm_01, adm_02, financeiro_01, financeiro_02
- **Client validation**: `validationPassword` (permanent password set at protocol closing) + existing `validation_codes` (daily codes). Client validates with either.
- **Client Drive**: `driveFolderId`, `examRequestsFolderId` (subfolder "Exames Solicitados" ID)
- **`nursing_assessments`**: Enfermeira 01 fills after each application — weeklyQuestion, alertColor (green/yellow/red), observation, adherenceLevel (alta/media/baixa), tolerance (excelente/boa/regular/ruim), symptoms, needsTeamContact, startTime/endTime
- **`task_cards`**: Internal cards + Trello sync — types: welcome_adm, welcome_enf, followup, alert, payment_nf, monthly_review, exam_reminder, final_session. assignedRole maps to professional role. trelloCardId/trelloListId for sync.
- **`client_ratings`**: Client rates nurse 0-5 stars, selects nurse from dropdown, ratingSource (post_application / post_contact). Rating ≤3 triggers management alert.
- **`ras_evolutivo`**: Per-session PDF data — sessionNumber, totalSessions, progressPercent, substances (jsonb), alertColor, adherence, tolerance, weeklyObservation, sessionHistory (last 3 sessions), designatedDoctor, isAntepenultimate/isUltimate flags, examReminderSent, consultationReminder, validationCode, validatedByClient/validatedAt, pdfUrl/drivePdfId
- **Alert color rules**: Green → history only. Yellow → card for enfermeira_02. Red → card for enfermeira_02 AND medico_02.
- **Automated triggers**: Payment done → card financeiro_02. Every 30 days → card enf_02 + medico_02. Antepenúltima sessão → exam reminder to client (email+WhatsApp, "Exames Solicitados" subfolder). Última sessão → card enf_02 + adm_02 (consultation with designated doctor).
- **Trello**: API integration (not Replit connector — none available). Cards sync bidirectionally via trelloCardId.

### Substances Schema
- `procedureType`: "iv" (endovenoso, 30min), "im" (intramuscular, 15min), "implant" (implante, 1h)
- `durationMinutes`: default duration per procedure type
- `description`, `mainFunction`, `perceivedEffects`, `timeToEffect`: clinical info
- `starRating`: 1-5 efficacy rating
- `bodySystemEffects`: JSON with effects per body system (cardiovascular, neurologico, metabolismo, hepatico, imunologico, dermatologico, muscular, endocrino, longevidade, etc.)
- Health/Wellness fields: `longevityBenefit`, `qualityOfLifeImpact`, `sleepBenefit`, `energyBenefit`, `libidoBenefit`, `physicalPerformance`, `muscleStrength`, `mentalClarity`, `skinHairNails`, `immuneSupport`, `contraindications`, `scientificEvidence`, `categoryType`

### Key Features
- **Lançador**: Single-page guided protocol creation with up to 10 substance slots (per-substance start date, frequency, dose). Tela de resumo tem dois botões de lançamento: "Confirmar e Lançar Protocolo" (cria e vai ao detalhe) e o atalho "Lançar + Gerar RAS FAP" (cria → valida/gera sessões → gera o RAS FAP paisagem → baixa para impressão + envia ao Drive do cliente → vai ao detalhe). O RAS FAP só tem linhas de sessão depois da validação, por isso o atalho valida antes de gerar.
- **Weekly consolidation**: Sessions grouped by week (Mon-Sun), one visit per week per client
- **ICS integration**: Download ICS files per session or per week; Google Calendar deep links
- **WhatsApp reminders**: Pre-formatted messages sent to client's phone
- **A1 ICP-Brasil signature**: Multi-page PDF with RAS + substance info sheets + consent terms, digitally signed with PKCS#7
- **Protocolo Completo PDF**: 8-10 page comprehensive protocol document with: cover page (PADCOM branding, client/doctor info, protocol value), benefits matrix (star ratings + 8 benefit categories per substance), substance fact sheets (description, function, body system effects, contraindications), TCLE per procedure type (IV/IM/SC/Implant), LGPD clause, session timeline grid, financial summary (payments, installments, balance), ICP-Brasil digital signature. Auto-uploads to Google Drive + emails to client. Route: `GET /api/protocols/:id/document-pdf`
- **Per-substance confirmation**: Each substance in a session confirmed individually (DISP/PROX badges)
- **Color-coded session cards**: Green=completed, Amber=partially confirmed, Blue=today, Red=missed, Gray=cancelled
- **Substance pills with visual state**: Applied substances show green ring + checkmark; pending show DISP/PROX badge
- **TDAH-friendly UI**: Color-coded, high contrast, clear visual hierarchy throughout
- **Validation codes**: 6-digit alphanumeric codes for client identity verification
- **Procedure types**: IM (15min), IV (30min), Implant (1h)
- **Automated emails via Gmail API** (Replit Google Integration — OAuth):
  - Subject format: `Clinica Padua | Aplicacao Endovenosa | A7K3M2`
  - Pre-session: validation code, substance list, schedule info (HTML template)
  - First-session emails: Include detailed substance benefit info (longevity, sleep, energy, performance, etc.)
  - Post-session: completed substances + signed RAS PDF attachment via MIME multipart
  - Weekly batch: `/api/email/send-weekly-reminders`
  - Uses `google-gmail` connector via Replit integrations
- **Google Calendar sync** (Replit Google Integration — OAuth):
  - Per-session: `/api/google-calendar/sync-session/:id`
  - Per-week: `/api/google-calendar/sync-week`
  - Duration auto-set: IV=30min, IM=15min, Implant=60min
  - Connected calendars include: AGENDA GERAL, AGENDA MEDICO, AGENDA ENFERMAGEM
- **Google Drive integration** (Replit Google Integration — OAuth):
  - Client folder structure: `PACIENTES/[CLIENT NAME] [CPF]/` with 15 subfolders
  - Subfolders: CADASTRO (with CADASTROS ANTIGOS), PATOLOGIAS, EXAMES, AVALIACOES, RECEITAS, PROTOCOLOS, FINANCEIRO, CONTRATOS, ATESTADOS, LAUDOS, TERMOS, FOTO PERFIL, IMAGENS, PESQUISA, OUVIDORIA
  - Protocol PDF naming: `YY.MM.DD PROTOCOLO NOME DO CLIENTE.pdf`
  - RAS PDF naming: `DD.MM.YY RAS NOME DO CLIENTE CPF.pdf`
  - **File renaming**: `POST /api/google-drive/rename-files` (async fire-and-forget). Pattern: `YY.MM.DD TIPO [AREA] NOME_CLIENTE.ext`. Date from Drive `createdTime`. Classification priority: COMPLEX_EXAM (densitometria, biopsia, etc.) > IMAGING (USG, RMN, TC, etc.) > LAB → "EXAME". Text extraction: pdf-parse v2 first, OCR fallback via tesseract.js. Body part appended only if not redundant with type.
  - **PDF diagnostics**: `GET /api/google-drive/diagnose-pdfs?max=N` — extracts text + classifies without renaming
  - Idempotent: won't recreate existing folders
  - Auto-share view-only with client email
  - Setup per-client: `/api/google-drive/setup-client/:clientId`
  - Upload protocol/RAS to Drive: `/api/google-drive/upload-protocol/:clientId`, `/api/google-drive/upload-ras/:clientId`

### Client Upload Portal (`/portal`)
- **Public-facing** responsive mobile-first page (no admin sidebar)
- **Identification**: CPF + data de nascimento → HMAC token (30min TTL, signed with SESSION_SECRET)
- **Security**: Generic error messages (no CPF enumeration), token-bound uploads (prevents IDOR)
- **Upload types**: Exame de Sangue, Ultrassom, Tomografia, Ressonância, Densitometria, Laudo, Comprovante de Pagamento, Foto/Imagem, Receita, Atestado, Outro
- **Body region dropdown**: Shown only for imaging exams (USG, TC, RMN, Densitometria)
- **File naming**: `YY.MM.DD TIPO [REGION] NOME_CLIENTE.ext`
- **Folder routing**: Type maps to Drive subfolder (exames→EXAMES, laudo→LAUDOS, comprovante→FINANCEIRO, foto→IMAGENS, etc.)
- **API endpoints**: `POST /api/client-portal/identify`, `POST /api/client-portal/upload` (multipart, requires token)
- **Link distribution**: Via WhatsApp to each client

## Working Language
- UI and user communication in Portuguese (Brazil)
- Term: "cliente" (not "paciente")

## CONCEITO RAIZ — Sistemas Primos Independentes (IHE x Manager)

Decisao do CEO (Dr. Caio), registrada em 14/06/2026. Vale como regra para todas as ondas de integracao/transmutacao.

1. IHE (Integrative Health Engine) e Padcon Conect (Manager) sao sistemas PRIMOS: independentes, cada um dono dos seus proprios dados, que colaboram por interface — nunca fundidos.

2. Na transmutacao/integracao, NADA entra com prefixo de origem nem coluna/tag de origem. O dado, ao entrar num sistema, passa a ser nativo dele.

3. "Separar os gemeos siameses": mesmo com dor no coracao, desacoplar tudo que hoje esta conjugado entre os dois sistemas.

4. Colaboracao maxima: cada Dr (agente) pensa 10 passos a frente em possiveis conflitos e erros antes de agir.

5. Esta decisao SUBSTITUI a premissa anterior da CARTA_02 (que pedia TAG de origem e import unificado). A nova diretriz e: primos independentes, sem tag de origem.

6. EXCECAO ao item 2 (decisao do CEO em 15/06/2026): as tabelas-deposito do catalogo `catalogo_formulas`, `catalogo_injetaveis` e `catalogo_implantes` usam a coluna `id_ihe` (id de origem do IHE) como chave unica de deduplicacao. Motivo: nessas tres colecoes nenhum campo de negocio e unico (codigo_semantico se repete), entao so o id de origem garante 0 perda de dado (54 formulas / 305 injetaveis / 32 implantes). As demais colecoes mantem chave de negocio nativa (catalogo_itens=codigo_padcom, catalogo_blends=codigo_blend, periodos_dia=sigla) e os pacientes deduplicam por chave natural, sem id de origem.

6-A. EXTENSAO da excecao (Onda 1 motor/exames — aprovada pelo CEO em 15/06/2026, apos auditoria do commit 5ca1888d): mais 5 colecoes usam `id_ihe` como chave de deduplicacao porque nenhum campo de negocio e unico nelas (verificado por teste de unicidade): `catalogo_doencas`, `motor_regras` (regra_id repete 3x), `anamnese_questionario` (pergunta_id Q030 duplica), `mapa_anamnese_motor`, `catalogo_endovenosos` (soros repetem codigo). As demais 8 colecoes da Onda 1 mantem chave de negocio nativa: catalogo_exames=codigo_exame, catalogo_analitos=codigo, catalogo_blocos=codigo_bloco, catalogo_bloco_exames=(bloco_id+nome_exame+grau), direcao_favoravel_exame=nome_exame, catalogo_sintomas=codigo_semantico, catalogo_cid10=codigo, motor_decisao_clinica=caso_id. `catalogo_exames` guarda a linha crua inteira em coluna jsonb `dados` (zero perda das 68 colunas de origem).

6-B. DIVIDAS TECNICAS da Onda 1 (registradas pelo CEO em 15/06/2026 para a proxima onda; NAO bloqueiam a Onda 1): (1) vinculo bloco<->exame hoje e por TEXTO (nome_exame) — migrar para chave estrangeira (FK) por id antes de o motor consumir em producao; (2) campos sim/nao vieram como TEXTO — converter para booleano ao montar a tela; (3) a consulta do motor por doenca pede o numero `id_ihe` — adicionar busca por nome/codigo.

## CARTA_08 (IHE) — RAS FAP corrigido (17/06/2026)

Resumo da CARTA_08 recebida do IHE e executada pelo Dr. Replit Manager.

1. RAS FAP = folha A4 paisagem imprimivel (substancias x idas a clinica), preenchida a caneta na sala (FAP = Formulario de Auditoria de Procedimentos).

2. Motor da grade COPIADO IDENTICO do `rasFap.ts` do IHE (fonte-da-verdade). Verificado por diff normalizado: `segundaDaSemana`, `chunk`, `planejarPaginasRasFap` byte-identicos; `montarGrade` difere so por 1 ponto-e-virgula cosmetico. A LOGICA da grade nunca deve ser alterada (so render/estetica).

3. As 7 regras de ouro da grade: (a) 1 visita por semana ISO (consolidacao); (b) SEM contínuo na agenda GLOBAL, cruzando paginas com LACUNAS (folha 2 pode pular de SEM 10 para SEM 13); (c) celula "N/total"; (d) varias doses na mesma semana juntam com middot; (e) padding ate 20 linhas POR pagina; (f) 5 colunas de substancia FIXAS por folha, sobras EM BRANCO; (g) data eleita = 1o dia previsto da semana.

4. As 4 regras visuais do CEO: 5 colunas fixas por folha (largura como se fossem 5; sobras em branco); moldura grossa SO na caixa externa de cada bloco; visual clean/elegante/classico (wordmark serif "RAS", fio duplo, tom pastel); faixa de assinaturas em CAIXAS retangulares, profissionais com espaco de CARIMBO (CRM/COREN).

5. Implementacao: `gerarRasFapPdf` em `artifacts/api-server/src/lib/ras-fap.ts` (pdfkit); `generatePhysicalRASPdf` em `pdf-signer.ts` virou ADAPTADOR fino. Gabarito cego da carta (sec.10) conferido pelo motor puro. RAS JURIDICO (assinado digital) fica para depois.

6. VARIANTES VISUAIS (pele) — `ModoRasFap` = PREMIUM|SIMPLES|MARCA|MINIMAL|BRONZE. So o RENDER muda (cores, wordmark serif/sans, fio do cabecalho, pintura da celula, largura da moldura via `Paleta`); o motor da grade e as 4 regras visuais do CEO permanecem identicos. `generatePhysicalRASPdf(data, modo="PREMIUM")`. Rota de demonstracao: `GET /api/ras-fap-demo?tema=PREMIUM|MARCA|MINIMAL|BRONZE` (whitelist tipada, fallback PREMIUM) e `?big=1` (3 substancias semanais x 26 sessoes = 2 folhas, prova viva da regra de 20 linhas por folha). Default em producao continua PREMIUM ate o CEO bater o martelo do tema.

7. AJUSTES FINOS DE RENDER (17/06/2026; valem para os 4 temas; motor da grade INTACTO): (a) cabecalho das colunas de substancia na grade virou "SESSÃO" (com acento, via flag `keepAccents` em `celula()` que pula o `semAcento()`); (b) frequencia "A CADA N DIAS" -> "A cada N dias"; (c) coluna DATA EFETIVA reordenada para logo apos HORA em `COLS_FIXAS` (soma de larguras inalterada); (d) pintura da celula virou faixa marcadora de 1/4 a esquerda + fracao "N / total" nos 3/4 da direita (temas battleship/center; o tema "tick"/MINIMAL segue sem pintura); (e) fracao com espaco "1 / 12".

8. CABECALHO HARMONIOSO + NUMERACAO APLIC (17/06/2026; valem para os 4 temas; motor da grade INTACTO): (a) cabecalho da GRADE DE APLICACOES das colunas FIXAS agora todo na mesma fonte/tamanho/altura (helper `cabecalhoFixo`, Helvetica-Bold 6, centralizado V+H, multi-linha), via novo campo `head:string[]` em `COLS_FIXAS`; (b) labels: "SEM." -> "APLIC"; "DATA AGEND." -> 2 linhas DATA/AGENDADA; "DATA EFETIVA" -> 2 linhas DATA/EFETIVA; demais inalterados; (c) coluna APLIC numera 1..20 por folha em TODAS as linhas (inclusive padding), continua cruzando folhas (folha 2 = 21..40) e RESETA a cada grupo de substancias — via param `aplicInicio` em `desenharGrade` + contador `aplicBase` no loop de `gerarRasFapPdf` (reset quando `p.grupo` muda, passo fixo += `LINHAS_POR_PAGINA`); o campo `numero` do motor deixa de alimentar a coluna (so o indice do render numera), mas o motor segue intacto. (d) Demo de stress `?n=N` (`buildCountDemoSubstances` em `ras.ts`, 1 substancia semanal x N, cap 400). Validado: `?n=150` -> 8 folhas, APLIC 1..160, padding 151..160 numerado, ZERO corte de dado. NOTA (Art.50): a numeracao limpa 1..N por grupo substitui a exibicao da LACUNA do SEM global (regra 3b) no caso raro de multi-grupo (>5 substancias); a agenda global continua preservada internamente pelo motor.

## Preferencias do Usuario (Dr. Caio) — Como me comunicar

Metodo de trabalho (decisao do CEO, 19/06/2026): para QUALQUER funcionalidade nao-trivial, seguir o **Paxter Loop** (skill `paxter-loop`) — Especificar (spec escrita em `specs/<nome>.md`) -> Construir (so o que esta na spec) -> Revisar com o architect ate aprovar sem pendencia. O CEO aciona por fala ("rode o loop", "spec isso", "pode buildar", "manda revisar").

Formato de resposta — densidade canonica "B" travada em 15/06/2026 (ver TITULO XI da Biblia DIRETRIZES_CENTRAIS_E_PRE_REQUISITOS_CEO_DR_CAIO):

Art. 37  Conclusao primeiro; explicacao depois.

Art. 38  A TABELA e a base, o carro-chefe de toda resposta: ela carrega o dado para o CEO bater o olho e entender num relance. A numeracao (1, 1.1) NAO narra paragrafo: serve so para AGRUPAR um assunto fechado, como esqueleto. A parede linear de "1.1 uma frase por linha" deixa de ser o carro-chefe e fica proibida como portadora principal do conteudo. Densidade canonica "B", definida em 15/06/2026.

Art. 39  Todo bloco de informacao e uma TABELA emoldurada, com titulo auto explicativo, linha de cabecalho, primeira linha em tom pastel e colunas alinhadas verticalmente.

Art. 39-A  Fluxo, sequencia ou caminho desenha-se como BLUEPRINT com setas (exemplo: Passo A -> Passo B -> Passo C), nunca como texto corrido.

Art. 39-B  No maximo UMA "frase de chamada" curta por bloco, antes ou depois da tabela; nada de paragrafo de narracao.

Art. 39-C  Cada secao numerada e separada da seguinte por uma linha horizontal de regua (tres hifens: ---).

Art. 40  Tudo por extenso; nunca abreviar; explicar toda sigla na primeira vez.

Art. 41  Voz e fonetica: interpretar pelo contexto, sem comentar o erro.

Art. 42  Em telas: dizer o texto exato do botao e onde ele fica.

Art. 43  Decisoes em A/B/C com default recomendado; uma pergunta por vez; cada opcao em sua propria linha, empilhada.

Art. 44  Zero emoji em texto tecnico; virgula decimal e datas no padrao do Brasil (exemplo: 1.342,50 e 13/06/2026).

Art. 45  Fechar SEMPRE com "RESUMO EM 1 LINHA".

Art. 46  Maximo 6 martelos (decisoes) por resposta.

Art. 47  Sinceridade total, zero bajulacao; proibido responder so para agradar; proibido anunciar como feito o que nao foi feito.

Art. 48  Cartas para outros agentes: bloco pronto para colar, ASCII puro, sem acento.

Art. 49  Nao misturar OPERAR (uso clinico real) com ARQUITETAR (construir com agentes) na mesma resposta.

Art. 50  Nao mudar uma decisao do CEO sem avisar; se o CEO errar, corrigir com fundamento.

Art. 51  Comunicacao visual no Canvas (decisao do CEO em 16/06/2026): quando o assunto for fluxo, comparacao de opcoes, arquitetura ou "antes x depois", o agente deve oferecer/desenhar um ORGANOGRAMA (blueprint) no Canvas — caixas + setas, cores da marca (verde-petroleo/ciano para sistema, verde para resultado, laranja para o item novo/proposto), faixas separando cada caminho, e uma nota-resumo. Ao terminar, sempre chamar presentArtifact com os ids das formas. Esta pratica complementa a Densidade B (tabela continua sendo o carro-chefe do texto). Vale para todos os repositorios/agentes do CEO.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
