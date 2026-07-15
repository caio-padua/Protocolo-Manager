# Spec — Faxina da Sala de Triagem (Caminho A) + Curadoria de unidade/direção (Caminho B)

Data: 15/07/2026. Autor: Dr. Replit Paxter. Decisão do CEO Dr. Caio: rodar A e B em paralelo
e "não entregar com nenhuma pendência". Régua dos qualitativos: **Opção A** (qualitativo já é
resolvido quando classificado/criado, sem exigir unidade/direção — é da natureza dele).

## Problema

- Sala de Triagem tem **701 grafias pendentes** (655 `ambiguo`, 46 `nao_exame`).
- As **sugestões automáticas** (`suggested_code`) estão clinicamente ERRADAS em muitos casos
  (ex.: Anti-HCV → Anti-TPO; CA 125 → CA 19-9; Vitamina C → Ácido Fólico; 17-OH-progesterona →
  Alfa-2 eletroforese). **Não usar `suggested_code`.** A resolução é por julgamento clínico.
- 6.293 `exam_results` estão com `analyte_code` NULL (destravam quando o cluster é resolvido).
- Caminho B: analitos ativos sem `canonical_unit` (~119) e sem `direction` (~132).

## Regra de ouro (linha vermelha clínica)

Na dúvida é **NOVO**, nunca apelido. Apelido errado corrompe prontuário (junta exames de
doenças diferentes); NOVO apenas isola os resultados sob um código próprio (reversível por
ENGLOBAR depois). Só faço APELIDO quando há **certeza clínica** (mesma substância/analito).

## Caminho A — resolver as 701 (motor determinístico e idempotente)

Blueprint por item da fila:

  item -> é não-exame / subitem de bioimpedância (segmentar, tração, consumo, impedância,
          gordura/massa por segmento) ?  -> SIM: IGNORAR (resolution="ignorado")
       -> NÃO: bate com CERTEZA clínica num code ativo do catálogo (mapa curado de famílias) ?
          -> SIM: APELIDO ao code certo (absorve grafia como sinônimo, carimba o cluster)
          -> NÃO: NOVO (createDiscoveredExam; carimba o cluster; define `kind`)

Definição de `kind` do NOVO (para a Opção A):
- `qualitative` quando sorologia/anticorpo/antígeno viral/teste rápido/IgG/IgM/HIV/Hepatite/
  Dengue/Chikungunya/Citomegalovírus/Caxumba/Herpes/Sífilis/cultura.
- `body_composition` quando bioimpedância que decidirmos manter (por ora estas caem em IGNORAR).
- `urine` quando "(urina)"/"urinária".
- senão `blood`.

Resultado: **0 linhas `status='pendente'`** ao final (todo item vira resolvido: apelido | novo | ignorado).

## Caminho B — unidade + direção (só quantitativos: kind='blood' e 'urine')

Fonte honesta, sem inventar dado:
- `canonical_unit`: quando vazia, puxar a unidade **mais frequente do laudo** (`exam_results.unit_raw`)
  dos resultados daquele code. Se não houver unidade no laudo, deixar registrado como sem unidade
  (exame sem dimensão) — não inventar.
- `direction`: default clínico **`target`** (dentro da referência é o bom) para a maioria; usar
  `higher_better` / `lower_better` apenas para os casos canônicos conhecidos (mapa curado).
  `target` NÃO é invenção: é o comportamento correto da maioria dos analitos laboratoriais.

Qualitativos (Opção A): **isentos** de unidade/direção. Ficam marcados `kind='qualitative'`.

## Caminho C (depois de B, fora desta onda salvo sobra de tempo)

Faixas dos exames sem faixa. Só faz sentido após B (faixa exige unidade). Não bloqueia A+B.

## Aceite (pendência zero, definição travada)

1. `SELECT count(*) FROM exam_analyte_triagem WHERE status='pendente'` = **0**.
2. Nenhum analito **quantitativo ATIVO** (`kind in ('blood','urine')`) sem `canonical_unit`
   **quando o laudo forneceu unidade**; os sem unidade no laudo ficam listados e justificados.
3. Nenhum analito **quantitativo ATIVO** sem `direction`.
4. Qualitativos podem ficar sem unidade/direção (Opção A) — não contam como pendência.
5. Idempotência: rodar o seed 2x não duplica exame nem re-sobrescreve curadoria humana.

## Como construir (committed, determinístico — nunca SQL de runtime solto)

- Novo módulo `artifacts/api-server/src/lib/exam-extraction/seed-triagem-curadoria.ts`:
  - Mapa `APELIDOS` (regex/normalizado → code ativo) — só famílias com certeza clínica.
  - Conjunto `IGNORAR` (padrões de subitem/bioimpedância) + todos os `nao_exame`.
  - `DIRECAO_CANONICA` (normalizado → higher_better|lower_better) para os casos conhecidos.
  - Reaproveitar `createDiscoveredExam`, `absorbAsAlias`, `setResultCodeForNormKey`.
- Rota `POST /exames-lab/triagem/curadoria` (colaborador) que roda o seed e devolve o resumo.
- Verificação por SQL real (typecheck global é pré-quebrado — validar por dados/curl).
