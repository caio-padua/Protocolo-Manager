# Anamnese V2 — 01 · Arquitetura e Dados (data binding, retoma, link)

## 1. Visao de arquitetura (blueprint)
Paciente/Enfermeira/Medico -> Tela V2 (paginas por grupo) -> autosave -> Sessao salva (banco)
-> Motor (motor-anamnese, inalterado) -> Achados (diagnosticado/suspeito) -> Relatorios (RAS + juridico).

```
[Identifica] -> [Sessao criada/retomada] -> [Responde por grupo] --autosave--> [anamnese_sessions/responses]
                                                  |                                   |
                                            [Recusa bloco]                      [Motor de regras]
                                                  |                                   |
                                            [refusals]                        [achados: DIAG/SUSP]
                                                                                     |
                                                                      [RAS de relatorio] + [Relatorio juridico]
```

## 2. Tabelas (Drizzle) — novas, sem tocar nas existentes
Reusar `anamnese_questionario` (as 114 perguntas, ja existe). Adicionar:

| Tabela | Papel | Campos-chave |
|---|---|---|
| `anamnese_sessions` | uma sessao de preenchimento | id, clientId(nullable), token(unico, p/ link), mode(paciente/enfermeira/medico), conductedBy(profId nullable), status(rascunho/concluida), startedAt, completedAt, lastSeenAt, tempoTotalSeg, percentResumo(jsonb) |
| `anamnese_session_answers` | resposta por pergunta | id, sessionId(FK), questionRowId(FK->anamnese_questionario.id), perguntaId(redundancia semantica), valor(jsonb), respondidoEm, tempoSeg |
| `anamnese_refusals` | recusa de bloco/grupo | id, sessionId(FK), escopo(bloco|grupo), alvo(nome), motivo(nullable), registradoEm |
| `anamnese_findings` | achados do motor | id, sessionId(FK), tipo(diagnosticado|suspeito), rotulo, origemPerguntaId(nullable), severidade, criadoEm |
| `anamnese_group_notes` | observacao por grupo (enfermeira/medico) | id, sessionId(FK), grupo, autorProfId(nullable), observacao, criadoEm |

Regras (revisadas apos parecer do architect, 21/06/2026):
- A CHAVE da resposta e `questionRowId` (FK para `anamnese_questionario.id`, que e estavel e unico).
  `perguntaId` (codigo semantico, ex.: I-TAB01) e guardado como redundancia legivel, NAO como chave —
  porque no schema atual `perguntaId` e nullable e nao-unico. Answers unicos por (sessionId, questionRowId), upsert por essa chave.
- `token` da sessao = base p/ link compartilhavel (ver secao 4); nunca expor clientId no link.
- NUNCA truncar `clients`; FK clientId opcional (sessao pode comecar sem cliente, ex.: demo).
- `complete` e IDEMPOTENTE e TRANSACIONAL: lock da sessao + dedupe de findings por
  (sessionId, tipo, rotulo, origemPerguntaId). Reexecutar nao duplica achados.

## 3. Data binding (o ponto que o CEO mais cobrou)
Toda resposta e gravada com a chave estavel `questionRowId` (+ `perguntaId` legivel), nunca por
indice de tela. Assim o motor e os relatorios leem por chave estavel. O front nunca "interpreta"
clinica — so captura e amarra; a interpretacao e do motor.

### 3.1 Contrato do `valor` (jsonb) por tipo de pergunta (OBRIGATORIO)
Sem contrato, o motor e os relatorios ficam frageis. Forma fixa por tipo:
| Tipo | Forma do `valor` | Exemplo |
|---|---|---|
| sim/nao | `{ "tipo":"bool", "v": true }` | tem diabetes |
| escolha unica | `{ "tipo":"single", "v":"opcaoId" }` | sexo = F |
| multipla | `{ "tipo":"multi", "v":["a","c"] }` | sintomas marcados |
| escala/intensidade | `{ "tipo":"escala", "v": 7, "min":0, "max":10 }` | dor |
| numero | `{ "tipo":"num", "v": 50, "unid":"mg" }` | dose |
| texto | `{ "tipo":"texto", "v":"..." }` | queixa principal |
| matriz medicacao | `{ "tipo":"matriz", "linhas":[{remedio,mg,manha,tarde,noite,doencaRef}] }` | medicacao |
O front valida a forma (Zod) antes de enviar; o back revalida no PATCH.

### 3.2 Convivencia com o legado (sem quebrar o que existe)
O portal atual usa `/api/anamnese-portal/submit` -> `anamnese_resposta`. A V2 vive em paralelo sob
`/api/anamnese-v2/*` e rota `/anamnese/v2` (ou flag), SEM apagar o legado. Migracao de leitura/escrita
e flag de corte ficam em `09-hardening-e-compatibilidade.md`. So promover a V2 a padrao apos aprovacao.

## 4. Link compartilhavel + retoma
- Gerar link: `/anamnese/s/:token` (token = HMAC assinado com SESSION_SECRET, TTL configuravel).
- Retoma: ao abrir o token, carrega sessao + respostas; paciente continua de onde parou.
- Autosave: a cada resposta (debounce) grava em `anamnese_session_answers` + atualiza lastSeenAt.
- Fallback offline: rascunho tambem em localStorage (padrao useDraft do padcom-saas) para nao
  perder se a rede cair; sincroniza ao reconectar.
- Erro generico na identificacao (sem enumeracao de CPF), igual ao portal atual.

## 5. Endpoints (api-server, sob /api)
| Metodo+Rota | Funcao |
|---|---|
| POST /api/anamnese-v2/session | cria sessao (mode, clientId?) -> retorna token |
| GET /api/anamnese-v2/session/:token | carrega sessao + respostas + recusas (retoma) |
| GET /api/anamnese-v2/questionario | devolve as 114 perguntas + config de grupos/ramificacao |
| PATCH /api/anamnese-v2/session/:token/answer | upsert de 1 resposta (autosave) |
| POST /api/anamnese-v2/session/:token/refuse | registra recusa de bloco/grupo |
| POST /api/anamnese-v2/session/:token/complete | conclui -> roda motor -> grava findings |
| GET /api/anamnese-v2/session/:token/report | RAS de relatorio (dados p/ PDF) |

Contrato definido no OpenAPI primeiro (codegen Orval), conforme pnpm-workspace.

RESUMO EM 1 LINHA: 4 tabelas novas, resposta amarrada por ID semantico (data binding real),
sessao com token para link + retoma + autosave, e o motor existente intocado gerando os achados.
