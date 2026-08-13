# Especificação — Carta de Tratamento Premium v2 (Documento-Modelo PADAXOR)

Data: 13/08/2026
Autor: Dr. Replit Paxter
Ordem do CEO: opção B + kaizen máximo + autonomia total
Arquivo alvo: `artifacts/api-server/src/lib/pdf-signer.ts`

---

## 1. Objetivo (uma frase)

Transformar o PDF do protocolo no **documento-modelo** de todos os e-mails enviados a pacientes:
legível, clássico, premium, com TODA a informação cadastrada da substância e com **grade
visual idêntica em toda página**, inclusive quando um campo está vazio.

---

## 2. Defeito de origem (causa raiz provada)

| Item | Constatação |
|---|---|
| Sintoma relatado | Texto vira pontinhos ilegíveis; páginas quase vazias |
| Erro do leitor de PDF | `Embedded font file may be invalid` (3 ocorrências) |
| Causa técnica | `pdfDoc.embedFont(buffer)` **sem** a opção `subset: true` |
| Prova executada | PDF de teste sem recorte = fonte quebrada; com recorte = perfeito |
| Locais | `pdf-signer.ts:1260-1264` e `pdf-carta-tratamento.ts:799` |

Glossário: **subset** (recorte de fonte) = embutir no PDF apenas os caracteres realmente usados.
O formato `.woff` é comprimido para navegador; embutido inteiro, o leitor de PDF não o descomprime.

---

## 3. Requisitos exatos

### R1 — Fonte legível (obrigatório, bloqueante)
1.1. Todo `embedFont` de arquivo `.woff` passa a usar `{ subset: true }`.
1.2. Vale para `pdf-signer.ts` (5 fontes) e `pdf-carta-tratamento.ts` (6 fontes).
1.3. PRONTO quando: `pdftoppm` converte o PDF em imagem **sem nenhum** `Syntax Error`.

### R2 — Grade fixa e invariável (regra TDAH de hiperfoco — LEI DO DOCUMENTO)
2.1. Toda ficha de substância tem **exatamente a mesma estrutura**, na **mesma ordem**,
     nas **mesmas coordenadas**, independentemente de haver dado ou não.
2.2. Campo sem informação **NUNCA some**. O rótulo permanece e o valor recebe um
     tratamento elegante e discreto: travessão em tom claro (`—`) para valores curtos e a
     frase `A definir em avaliação clínica.` em itálico claro para blocos de texto.
2.3. Proibido: bloco que aparece numa página e desaparece na outra.
2.4. Proibido: reflow (conteúdo subindo para preencher buraco de campo vazio).

### R3 — Aproveitamento total do cadastro de substâncias
Todos os campos abaixo (tela `SubstanceEditForm.tsx`, tabela `substances`) devem chegar ao PDF:

| Bloco no documento | Campos de origem |
|---|---|
| Cabeçalho de identidade | `name`, `categoryType`, `category`, `procedureType` |
| Grade de prescrição | `dose`, `procedureType`, `totalSessions`, `intervalDays`, `durationMinutes`, `timeToEffect` |
| Composição | `composicao` |
| Narrativa clínica | `description`, `mainFunction`, `perceivedEffects` |
| Benefícios por área (10) | `longevityBenefit`, `qualityOfLifeImpact`, `sleepBenefit`, `energyBenefit`, `libidoBenefit`, `physicalPerformance`, `muscleStrength`, `mentalClarity`, `skinHairNails`, `immuneSupport` |
| Impacto por sistema | `bodySystemEffects` |
| Escala clínica | `starRating` |
| Posologia | `posologia` |
| Segurança | `contraindications` |
| Ciência | `scientificEvidence` |

3.1. Os 10 benefícios deixam de ser truncados em 45 caracteres. Cada um vira um item
     legível com rótulo próprio e texto completo (com continuação em página anexa se preciso).

### R4 — Conteúdo do Manus, em português do CEO
4.1. Blocos narrativos com rótulos humanos, não técnicos:
     - `O QUE É` (de `description`)
     - `FUNÇÃO NO SEU PLANO` (de `mainFunction`)
     - `O QUE PODE SER PERCEBIDO` (de `perceivedEffects`)
4.2. Radar / Mapa de sistemas com **polígono preenchido** visível.
4.3. Bloco final `LEVE ESTAS PERGUNTAS` — perguntas para o paciente levar à consulta.

### R5 — Acentuação correta
5.1. Com fonte recortada, o documento passa a aceitar acentos. Rótulos e textos usam
     português correto (`FUNÇÃO`, `COMPOSIÇÃO`, `CONTRAINDICAÇÕES`, `EVIDÊNCIA CIENTÍFICA`).
5.2. Caracteres fora do alcance da fonte não podem derrubar a geração.

### R6 — Densidade da página
6.1. Nenhuma ficha pode terminar com mais de um terço da folha vazio.
6.2. Continuação de texto usa a mesma identidade visual da ficha (não pode parecer rascunho).

---

## 4. Casos extremos a tratar

| Caso | Comportamento exigido |
|---|---|
| Substância com todos os campos vazios | Página completa, grade inteira visível, todos com placeholder elegante |
| Texto muito longo | Continua em página anexa com o mesmo cabeçalho da ficha |
| `bodySystemEffects` vazio | Painel do radar permanece, com aviso discreto `Mapa não cadastrado` |
| `starRating` ausente | Escala permanece desenhada, sem preenchimento |
| Acento fora da fonte | Substituição silenciosa, nunca exceção |
| Nome muito longo | Fonte reduz até caber, nunca corta |

---

## 5. Definição de PRONTO

| # | Critério | Como se confere |
|---|---|---|
| 1 | Zero `Syntax Error` ao converter o PDF em imagem | `pdftoppm` limpo |
| 2 | Texto legível na imagem renderizada | Inspeção visual página a página |
| 3 | Duas substâncias diferentes produzem páginas com grade idêntica | Comparar imagem da ficha 1 com a ficha 5 |
| 4 | Campo vazio aparece com placeholder, não sumido | Inspeção visual |
| 5 | Radar com polígono preenchido | Inspeção visual |
| 6 | Todos os 10 benefícios presentes quando cadastrados | Inspeção visual |
| 7 | Testes existentes continuam passando | `pnpm vitest run` |
| 8 | Revisão do architect sem pendência | Fase 3 do loop |

---

## 6. Linhas vermelhas

1. NUNCA apagar dado ou coluna (Regra de Ouro do CEO, 16/07/2026).
2. NÃO alterar o motor de cálculo financeiro nem o de sessões.
3. NÃO tocar em `/api/budgets/calculate` nem no motor de desmembramento.
4. NÃO remover a assinatura PAdES (selo verde) já funcionando.
5. NÃO renomear rotas nem quebrar o contrato de `generateProtocolDocumentPdf`.
6. Preservar `generateProtocolLetterPdf` (rota `/carta-pdf`) — é outro documento, intacto.
