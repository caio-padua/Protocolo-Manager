# Spec — Governança de Permissões (Quem Pode o Quê) + Configuração da Importação/Triagem de Exames

Onda com autonomia total (decisão do CEO Dr. Caio, 13/07/2026). Rodar o Paxter Loop completo
(Especificar → Construir → Revisar com architect até limpo).

Origem do desenho: mockup validado no Canvas **ENTREGA 37 — GOVERNANÇA: QUEM PODE O QUE
(LIBERAÇÃO POR TOGGLE DO CEO)**. Arquivos-modelo:
`artifacts/mockup-sandbox/src/components/mockups/governanca/Governanca.tsx` e `_permissoes.ts`.

## Objetivo (conclusão primeiro)

Transformar o mockup de Governança numa TELA REAL, fonte única de permissões por papel, e usar
esse mesmo modelo para a **Configuração da Importação e Triagem de Exames**.

1. Tela **Governança — Permissões e Acessos**: matriz Ferramenta × Papel com chave 3D dourada
   (liberado/bloqueado) e cadeado para o que é reservado ao CEO. Só o CEO altera.
2. Tela **Configuração de Exames (Importação + Triagem)**: interruptores de AUTOMAÇÃO do motor
   (exigir conferência humana, auto-criar exame novo, absorver apelido de alta confiança, ligar/
   desligar a triagem automática). O ACESSO a essa tela obedece à matriz de Governança.
3. As telas do sistema OBEDECEM: ferramenta bloqueada para um papel some do menu daquele papel.

## Não-objetivo

- Não reabrir o módulo multi-clínica (SaaS/RBAC de várias clínicas) — está PARADO
  (`specs/governanca-multiclinica-PENDENTE.md`). Esta onda é single-tenant (uma clínica).
- Não criar autenticação nova por rota. A obediência nesta onda é na CAMADA DE TELA (menu e
  telas escondem o bloqueado). A checagem por rota no servidor fica como endurecimento futuro
  (hoje a API administrativa é single-tenant, sem authz — condição do app inteiro).
- Não mexer no motor de leitura do laudo por inteligência artificial.

---

## Parte 1 — Papéis (as colunas da matriz)

Fonte real: tabela `professionals`, coluna `category` + flag `isPrimaryDoctor` (o dono = CEO).

| Papel de governança | De onde vem | Observação |
|---|---|---|
| CEO (Decisor) | `isPrimaryDoctor = true` | Vê e faz TUDO; única pessoa que edita a matriz |
| Médico | category `medico` | Médico executor/validador (nuance validador fica como `role` interno, fase futura) |
| Enfermagem | category `enfermagem` | Enfermeira 01/02 |
| Recepção | category `recepcao` | — |
| Administrativo | category `administrativo` | — |
| Financeiro | category `financeiro` | — |

Frase de chamada: papel = categoria funcional; o CEO nunca aparece como coluna editável (é o dono).

---

## Parte 2 — Ferramentas (as linhas da matriz)

Grupos e itens (id estável entre matriz e telas). Cada linha é uma ferramenta que pode ser
liberada/bloqueada por papel.

| Grupo | Ferramentas (id → nome) |
|---|---|
| Exames | `exames_importar` → Importar Exames · `exames_triagem` → Sala de Triagem · `exames_config` → Configuração de Exames (soCeo) · `exames_faixas` → Curadoria de Faixas/Console · `exames_mesa` → Mesa de Validação (C1/C2) |
| Documentos | `atestado` · `encaminhamento` · `laudo_saude` · `laudo_inss` · `laudo_insumo` |
| Clínico | `protocolo` → Lançar Protocolo · `ras` → RAS/Aplicação · `anamnese` → Anamnese · `agenda` → Agenda |
| Gestão | `financeiro` → Financeiro · `estoque` → Estoque · `corpo_clinico` → Corpo Clínico · `governanca` → Governança (soCeo) |

- `soCeo = true` renderiza cadeado (reservado ao CEO) em vez de chave.

---

## Parte 3 — Onde os dados moram (fonte única)

| Item | Decisão |
|---|---|
| Armazenamento da matriz | `app_settings` chave `governanca.matriz` = JSON `{ [ferramentaId]: { [papelId]: boolean } }` (mesmo padrão dos toggles já existentes) |
| Defaults | Semeados no primeiro acesso (não destrutivo): médico e enfermagem liberados no clínico; adm/financeiro na gestão; exames liberados a médico+enfermagem+recepção conforme tabela de defaults abaixo |
| Leitura pelas telas | helper `podeUsar(matriz, ferramentaId, papelId)` no front + `lib` compartilhada |

Defaults plausíveis (o CEO ajusta depois):

| Ferramenta | med | enf | rec | adm | fin |
|---|---|---|---|---|---|
| Importar Exames | ON | ON | ON | OFF | OFF |
| Sala de Triagem | ON | ON | OFF | OFF | OFF |
| Curadoria de Faixas | ON | OFF | OFF | OFF | OFF |
| Mesa de Validação | ON | ON | OFF | OFF | OFF |
| Documentos (atestado/encam./laudo saúde/INSS) | ON | OFF | OFF | OFF | OFF |
| Laudo Requisição de Insumo | ON | OFF | OFF | OFF | OFF |
| Protocolo / RAS / Anamnese / Agenda | ON | ON(ras,anamnese,agenda) | OFF | OFF | OFF |
| Financeiro | OFF | OFF | OFF | ON | ON |
| Estoque | OFF | ON | OFF | ON | OFF |
| Corpo Clínico | OFF | OFF | OFF | ON | OFF |
| Configuração de Exames / Governança | cadeado (só CEO) | | | | |

---

## Parte 4 — Tela Governança (reproduz a ENTREGA 37)

Rota nova: `/cadastros/governanca` (dentro de Cadastros), protegida por `CollaboratorGate`.
Só o CEO (`isPrimaryDoctor`) vê a chave editável; demais veem a matriz em modo leitura.

Fidelidade ao mockup (Paxter navy/ouro, `panel-3d`, `concave-3d`, `btn-3d`):

| Elemento | Comportamento |
|---|---|
| Cabeçalho | Selo Paxter + "Permissões e Acessos · Quem pode o quê" + crachá "Decisor (CEO): Dr. Caio Pádua" |
| KPIs | Papéis, Ferramentas, Liberações ativas (contadas do estado) |
| Matriz | 1ª coluna = ferramenta (280px); demais = papéis; célula = chave 3D dourada; `soCeo` = cadeado |
| Legenda | liberado / bloqueado / reservado ao CEO |
| Ações | "Restaurar padrão" (btn-3d-soft) e "Salvar liberações" (btn-3d) → PUT server |

---

## Parte 5 — Tela Configuração de Exames (Importação + Triagem)

Rota nova: `/cadastros/config-exames`, protegida por `CollaboratorGate` + obediência à matriz
(ferramenta `exames_config`, reservada ao CEO por padrão).

Interruptores (todos em `app_settings`, lidos pelo motor de triagem/importação):

| Chave | Rótulo na tela | Default | Efeito real |
|---|---|---|---|
| `exames.exigirValidacaoHumana` (já existe) | Exigir conferência humana (2 fases) antes de liberar na Evolução | true | Evolução só mostra `conferido` (C2) |
| `exames.triagemAtiva` | Triagem automática ligada | true | Se OFF, importação NÃO roda a faxina/triagem automática (tudo vai para a fila manual) |
| `exames.autoCriarDescoberto` | Criar cadastro automático para exame novo (origem "descoberto") | true | Se OFF, exame novo vai para "A CONFERIR" em vez de criar cadastro |
| `exames.autoAbsorverApelidoAltaConfianca` | Absorver grafia de alta confiança como apelido automaticamente | true | Se OFF, toda grafia nova espera decisão humana |

- O motor (`triagem.ts` / rota de backfill/import) lê essas chaves ANTES de criar/absorver.
- Cada interruptor usa a MESMA chave 3D dourada da Governança (componente compartilhado).

---

## Parte 6 — Obediência das telas (menu que respeita a matriz)

Blueprint: Colaborador loga -> sistema lê o papel (category) -> lê `governanca.matriz` ->
menu e telas escondem ferramentas OFF para aquele papel -> CEO vê tudo.

- Implementar um hook `usePermissoes()` no front (busca a matriz uma vez, cacheia) e um
  `podeUsar(ferramentaId)` amarrado ao papel do colaborador logado (`/collaborator/me`).
- Itens do menu lateral e botões de entrada das ferramentas checam `podeUsar`.
- Nota honesta: isto esconde na TELA; não é barreira de servidor (fase futura).

---

## Rotas (settings.ts, fetch cru, requireCollaborator)

| Rota | Função |
|---|---|
| GET `/settings/governanca` | Devolve `{ matriz, papeis, ferramentas }` (semeia default se vazio) |
| PUT `/settings/governanca` | Grava a matriz (Zod inline); só CEO (`isPrimaryDoctor`) — senão 403 |
| GET `/settings/exames` (ampliar) | Devolve as 4 chaves de automação |
| PUT `/settings/exames` (ampliar) | Grava as 4 chaves (Zod inline) |

---

## Critérios de aceite

1. Tela Governança renderiza a matriz fiel ao mockup (navy/ouro, chave 3D, cadeado soCeo).
2. CEO liga/desliga uma célula, salva, recarrega e o estado persiste (app_settings).
3. Colaborador não-CEO vê a matriz em leitura (sem editar) e a tela Governança em si é soCeo.
4. Tela Configuração de Exames grava as 4 chaves; o motor de triagem respeita `autoCriarDescoberto`
   e `autoAbsorverApelidoAltaConfianca` (exame novo vira "A CONFERIR" quando OFF).
5. Menu esconde, para um papel, as ferramentas OFF na matriz; CEO vê tudo.
6. Nada é truncado; defaults semeados de forma não destrutiva (só quando a chave não existe).

## RESUMO EM 1 LINHA
Especificada a Governança real (matriz Ferramenta × Papel com chave 3D e cadeado do CEO, fonte
única em app_settings) e a Configuração de Exames (4 interruptores de automação que o motor de
triagem obedece), com as telas escondendo o que está bloqueado por papel — pronta para o martelo.
