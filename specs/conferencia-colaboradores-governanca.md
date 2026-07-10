# Spec — Conferência Humana em 2 Fases, Colaboradores Fictícios e Governança de Validação

Onda com autonomia total (decisão do CEO Dr. Caio). Sem validação intermediária.
Rodar o Paxter Loop completo (Especificar → Construir → Revisar com architect até limpo).

## Objetivo (conclusão primeiro)

Quatro pilares numa única onda, todos no motor de Exames + Corpo Clínico:

1. Colaboradores e categorias FICTÍCIOS completos (recepção, administrativo, financeiro),
   com dados e cargos prontos — o CEO só troca os nomes. Menu suspenso de CATEGORIA e
   campo de CARGO funcionais e editáveis na tela do Corpo Clínico.
2. Conferência humana do exame em DUAS fases: C1 (operacional) e C2 (clínica), cada uma
   assinada por um colaborador identificado como "Sobrenome, Nome (Cargo)".
3. Selo/código interno discreto no cabeçalho da leva (documento) e um TERCEIRO espaço na
   coluna da Evolução (hoje só data no topo + laboratório na base) mostrando o nível de
   conferência (IA / C1 / C2) e quem conferiu.
4. Botão-mestre global "liberar ou não as validações" — quando desligado, a Evolução deixa
   de exigir a conferência humana e passa a aceitar o valor lido pela inteligência artificial.

## Não-objetivo

- Não mexer no motor de extração por inteligência artificial (leitura do laudo).
- Não criar autenticação nova por rota (a API administrativa é single-tenant, sem authz — condição do app inteiro).
- Não truncar nem recriar tabelas; documentos já "conferido" (legados) continuam válidos.

---

## Pilar 1 — Colaboradores fictícios + dropdowns de categoria/cargo

Backend `professionals.ts` JÁ aceita `category` e `role`. Schema JÁ tem as colunas
(`category` default "outro", `role` default "executor").

### 1.1 Tela (artifacts/padcom/src/pages/professionals/index.tsx)

| Campo novo no formulário do Corpo Clínico |
|---|
| Categoria funcional — menu suspenso: Médico / Enfermagem / Recepção / Administrativo / Financeiro / Outro (grava em `category`) |
| Cargo — campo de texto editável, ex.: "Recepcionista", "Gerente Administrativo" (grava em `role`) |

- Ao editar, o formulário carrega a categoria e o cargo do profissional.
- Card do profissional exibe uma etiqueta discreta com a categoria funcional.

### 1.2 Contrato (lib/api-spec/openapi.yaml + codegen)

`category` já está em Professional/Create/Update. FALTA `role` nos três (senão o Zod do POST
descarta o campo — vide memória `substancias-put-contrato`). Adicionar `role: string` opcional
em `Professional`, `CreateProfessionalBody`, `UpdateProfessionalBody` e rodar o codegen.

### 1.3 Seed (artifacts/api-server/src/lib/seed-team.ts)

Adicionar (idempotente, por nome) áreas e colaboradores administrativos SEM agenda
(não aparecem para o cliente):

| Novos colaboradores fictícios |
|---|
| Área "Recepção" (nao_medico) → especialização "Atendimento" |
| Área "Administrativo" (nao_medico) → especialização "Gestão" |
| Área "Financeiro" (nao_medico) → especialização "Contas a Receber" |
| Recep. Beatriz Nunes — category recepcao, role "Recepcionista" |
| Adm. Otávio Ramos — category administrativo, role "Gerente Administrativo" |
| Fin. Larissa Coelho — category financeiro, role "Analista Financeiro" |

Sem conselho, sem número de registro, sem recurso de agenda.

---

## Pilar 2 — Conferência em 2 fases (C1 operacional + C2 clínica)

### 2.1 Schema (lib/db/src/schema/exam-results.ts) — colunas NULLABLE (push seguro)

Em `exam_documents`, adicionar (todas anuláveis, snapshot para auditoria):
`conf1ProfessionalId`, `conf1Name`, `conf1Cargo`, `conf1At`,
`conf2ProfessionalId`, `conf2Name`, `conf2Cargo`, `conf2At`.

### 2.2 Fluxo de status (blueprint)

recebido (IA leu) -> conferido_1 (C1 operacional) -> conferido (C2 clínica = liberado)

- Documentos legados já em "conferido" continuam válidos (tratados como C2 concluído; conf2Name nulo = "conferência legada").

### 2.3 Rota PATCH /documentos/:id/conferir (exames-lab.ts)

- Body: `{ fase: 1 | 2, professionalId: number }`.
- Backend busca o profissional pelo id e grava o snapshot (nome + cargo) do lado servidor
  (mais confiável do que aceitar o nome do cliente). Cargo = `role` do profissional; se vazio,
  rótulo legível da `category`.
- Fase 1: exige status "recebido" -> grava conf1* + status "conferido_1".
- Fase 2: exige status "conferido_1" (ou legado "recebido" quando o botão-mestre estiver desligado)
  -> grava conf2* + `conferredAt` + status "conferido".
- 409 se o documento ainda está "processando".

### 2.4 Identidade "Sobrenome, Nome (Cargo)"

- Util no frontend: remove prefixo (Dr., Dra., Enf., Psic., Nutr., Recep., Adm., Fin.),
  último token = sobrenome, monta "Sobrenome, Nome (Cargo)".
- Seletor de conferente na Mesa de Validação: menu com todos os profissionais; padrão = o
  colaborador logado (collab-auth), quando houver.

---

## Pilar 3 — Selo/código interno + 3º espaço na Evolução

### 3.1 Selo de nível no cabeçalho da leva e na fila

| Selo por nível de conferência (discreto) |
|---|
| IA — cinza (só a inteligência artificial leu) |
| C1 — âmbar (conferência operacional feita) |
| C2 — verde (conferência clínica feita = liberado) |

- Código interno discreto no cabeçalho do documento: `LEVA L-000123` (derivado do id, zero-padded).

### 3.2 Terceiro espaço na coluna da Evolução

GET /evolucao/:clienteId passa a devolver, por coluna, além de `date` e `lab`:
`confLevel` ("ia" | "c1" | "c2") e `conferente` (nome formatado, ou nulo).
A tela mostra o terceiro nível abaixo do laboratório: selo do nível + nome do conferente.

`confLevel` derivado do status do documento: recebido→ia, conferido_1→c1, conferido→c2.

---

## Pilar 4 — Botão-mestre global de validações

### 4.1 Chave

`app_settings` chave `exames.exigirValidacaoHumana`, default `true`.

| Estado do botão-mestre | Efeito na Evolução (WHERE) |
|---|
| LIGADO (padrão) | mostra só documentos com status "conferido" (exige C2) |
| DESLIGADO | mostra documentos com status diferente de "processando" e "erro" (aceita valor da IA) |

- Afeta SOMENTE o filtro da Evolução. A Mesa de Validação continua mostrando tudo.

### 4.2 Rota (settings.ts)

GET /settings/exames -> `{ exigirValidacaoHumana: boolean }`.
PUT /settings/exames body `{ exigirValidacaoHumana: boolean }` (validação inline com Zod,
requireCollaborator como as demais rotas de settings). Sem OpenAPI (fetch cru, como o resto
da tela de exames já faz).

### 4.3 Tela

Botão-mestre no topo da tela de Exames, com rótulo claro:
"Exigir conferência humana (2 fases) antes de liberar na Evolução" — ligado/desligado.

---

## Critérios de aceite

1. Formulário do Corpo Clínico grava e edita categoria e cargo; POST e PUT persistem `role`.
2. Seed cria os três colaboradores administrativos (idempotente) sem agenda.
3. Conferir em duas fases muda o status corretamente e grava os snapshots dos dois conferentes.
4. Fila, cabeçalho e coluna da Evolução mostram o selo IA/C1/C2 e o conferente "Sobrenome, Nome (Cargo)".
5. Botão-mestre desligado faz a Evolução aceitar documentos só com leitura da IA; ligado volta a exigir C2.
6. Documentos legados "conferido" continuam aparecendo; nada é truncado.

## RESUMO EM 1 LINHA
Especificados os quatro pilares — colaboradores fictícios com dropdown de categoria/cargo, conferência em duas fases identificada, selo IA/C1/C2 com terceiro espaço na Evolução e botão-mestre global de validações — prontos para construir.
