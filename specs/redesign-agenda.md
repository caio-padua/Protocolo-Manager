# Spec — Redesign da Agenda Semanal (Padcon Conect)

Data: 19/06/2026 — CEO Dr. Caio. Método: Paxter Loop. Sistema de design: skill-layout-paxter (3D).

## Objetivo (uma frase)
Reorganizar a tela `artifacts/padcom/src/pages/agenda/index.tsx` para que TODO dado tenha posição FIXA (nunca desloca quando vazio), substância vire quadradinho de cor + nome em linha inteira com colunas alinhadas, confirmação por caixinha (uma a uma + todas), expandir/recolher por lupa, fonte um pouco mais legível e layout que caiba no celular — preservando 100% dos handlers, mutations e modais.

## Diagnóstico dos prints (origem dos requisitos)
- D1. Etiquetas de metadados (status, unidade, protocolo, semana, procedimento, profissional) usam `flex-wrap` → o MESMO campo cai em linha/posição diferente entre cartões (ex.: "AGENDADO" colado no CPF num cartão e em linha própria noutro).
- D2. Marcador da substância é LED pulsante (`paxter-led`), não quadradinho de cor.
- D3. Substâncias usam `flex gap-3 flex-wrap`; `N/total` e badge `DISP/PROX` flutuam; linhas `prox` não têm `N/total` nem botão → colunas desalinham.
- D4. "CONFIRMAR" é palavra repetida por linha, ocupa espaço.
- D5. No celular: dia em bloco à esquerda + cartões com `ml-16` desperdiça largura e desalinha.
- D6. Fonte dos dados pequena demais (`text-[10px]`).

## Requisitos exatos
R1. POSIÇÃO FIXA + CAMPO ROTULADO (regra-mãe TDAH): cada metadado da sessão ocupa um SLOT fixo, com rótulo curto em maiúsculo; se não houver valor, o slot fica em BRANCO (um traço "—") mas NÃO some e NÃO desloca os vizinhos. Ordem fixa dos slots, igual em todo cartão: STATUS, UNIDADE, PROTOCOLO, SEMANA, PROCEDIMENTO, PROFISSIONAL.
   - Implementar como grade de campos rotulados (não `flex-wrap` solto). No desktop pode ser grade de 2-3 colunas; no celular empilha 1-2 colunas, mas a ORDEM e a presença dos slots não mudam.

R2. CABEÇALHO DO CARTÃO estável: HORÁRIO + NOME + CPF + STATUS sempre na mesma posição. O horário fica visualmente associado à data/dia (continua sendo um "derivado" do grupo do dia), mas no celular não pode estourar a largura.

R3. SUBSTÂNCIAS — LINHA PADRÃO com COLUNAS FIXAS (o coração do pedido):
   - Cada substância é UMA linha dentro de um sulco concavo (`concave-3d`), empilhadas verticalmente (`space-y-2`), uma embaixo da outra.
   - Colunas fixas, na mesma ordem em TODA linha (grade com mesmo template): [1] QUADRADINHO de cor (cor da substância, `substanceColor`, quadrado `rounded-[3px]`, ~14px) · [2] NOME da substância ocupando a linha (flex-1, truncável) · [3] N/total em insert (`tabular-nums`; se `sessionNumber===0`, slot fica em branco "—") · [4] ESTADO (APLICADA / A APLICAR / PRÓXIMA) em chip neutro de largura fixa · [5] CAIXINHA de confirmação (só quando aplicável; senão slot reservado vazio).
   - Linhas `disp`, `prox` e aplicadas usam o MESMO template de colunas; células sem dado ficam em branco, jamais deslocando as colunas.

R4. QUADRADINHO DE COR, NÃO LUZ: o identificador visual da substância é um quadradinho preenchido com a cor da substância. NADA de `paxter-led` pulsante para identidade de substância. (LED segue permitido só para estado vivo do dia, se necessário, mas a identidade da substância é o quadrado.)

R5. CONFIRMAÇÃO POR CAIXINHA (não palavra):
   - Cada substância `disp` ainda não aplicada e com a sessão não concluída tem uma CAIXINHA (checkbox quadrado) na coluna [5]. Marcar a caixinha dispara a MESMA mutation `useConfirmSubstanceApplication` (payload idêntico: `{ substanceId, confirmed: true }`).
   - Há um controle "MARCAR TODAS" (caixinha no cabeçalho do bloco de substâncias do cartão) que confirma todas as `disp` não aplicadas daquele cartão (itera a mesma mutation por substância).
   - Substância já aplicada mostra CHECK verde (`CheckCircle2`/`CheckCheck` verde) no lugar da caixinha; `prox` não tem caixinha (slot reservado vazio).
   - Remover a palavra "Confirmar" como botão de texto por linha.

R6. LUPA EXPANDIR/RECOLHER: por padrão o cartão mostra só as substâncias `disp` (o que será aplicado naquele dia). Um botão com ícone de lupa/expandir alterna para mostrar TODAS as substâncias (inclui `prox`). Estado por cartão (ex.: `useState` map por `session.id` ou componente de linha com estado local). Recolhido = só `disp`; expandido = `disp` + `prox`, todas empilhadas no mesmo template de colunas.

R7. FONTE MAIS LEGÍVEL: subir o tamanho dos dados — nome da substância para no mínimo `text-xs` (≈12px) e metadados de `text-[10px]` para `text-[11px]`; HORÁRIO permanece em destaque. Sem exagero (não virar título).

R8. CELULAR (cabe na tela, paridade com desktop):
   - Abaixo de `md`/`lg`: remover o recuo `ml-16` dos cartões (ficam em largura cheia); a faixa do dia continua no topo, em largura cheia.
   - Cabeçalho do cartão empilha sem estourar: HORÁRIO compacto + NOME (quebra em 2 linhas se preciso) + STATUS; CPF abaixo.
   - A grade de metadados vira 1-2 colunas no celular; substâncias seguem 1 por linha com as colunas fixas.
   - Conferir em ~402-428px de largura.

R9. SEPARAÇÃO NÍTIDA (declive): o bloco de substâncias fica visualmente "afundado" (sulco concavo) e separado do bloco de metadados — separação líquida clara entre "dados da sessão" e "substâncias".

R10. PRESERVAR TUDO que não é apresentação: navegação de semana, "Hoje", ICS (semana e por sessão), Sync Google (semana e por sessão), e-mail pré/pós, gerar/verificar código, avaliação de enfermagem, WhatsApp, dropdown de ações, todos os modais (`Dialog`), `NursingAssessmentForm`, skeleton e estado vazio. Mesmos textos de toast e mesmos endpoints.

R11. PROMULGAR A LEI NA SKILL: inserir na `skill-layout-paxter` (seção de padrões) um novo padrão "Posição fixa + campo vazio rotulado" e o padrão "Linha de item com colunas fixas (quadradinho de cor + nome + estado + caixinha)", para propagar a regra às demais telas. Anunciar a inserção ao CEO (número/título/data).

## Casos extremos
- Sessão sem substâncias `disp` (só `prox`): cartão recolhido mostra estado vazio "Nenhuma substância para hoje"; lupa revela as `prox`.
- `sessionNumber===0` (placeholder `prox`): coluna N/total fica em branco ("—"), nunca some a coluna.
- Substância sem cor: usar fallback neutro `#94a3b8` só no quadradinho.
- Nome longo: truncar com reticências, sem estourar a linha; colunas à direita permanecem fixas.
- Sessão `completed`/`cancelled`/`missed`: sem caixinha de confirmar; aplicadas com check verde; "marcar todas" não aparece se não houver `disp` confirmável.
- Profissional/unidade ausentes: slot fica "—", não some.
- Mutation em andamento: caixinha mostra estado de carregando (spinner) e fica desabilitada; não confirmar duas vezes.

## Definição de PRONTO
- P1. Em DOIS cartões diferentes (conteúdos diferentes), cada metadado está EXATAMENTE na mesma posição/coluna; nada desloca por falta de dado.
- P2. Substâncias empilhadas uma embaixo da outra, com quadradinho de cor (não LED), nome em linha, e N/total + estado + caixinha em colunas alinhadas entre linhas e entre cartões.
- P3. Caixinha confirma uma substância (mesma mutation/payload); "marcar todas" confirma o resto do cartão; aplicada vira check verde.
- P4. Lupa alterna entre "só do dia" (`disp`) e "todas" (`disp`+`prox`).
- P5. Fonte dos dados maior conforme R7.
- P6. No celular (~402-428px) o cartão cabe, sem recuo lateral, sem estouro horizontal; conferido por screenshot. Desktop também conferido por screenshot.
- P7. Todos os fluxos do R10 continuam funcionando (sem erro de console; endpoints e toasts iguais).
- P8. Lei promulgada na skill e anunciada ao CEO.
- P9. Revisão do architect aprovada sem pendência.

## Linhas vermelhas (não cruzar)
- NÃO alterar a API/rotas de sessões nem o payload das mutations (`useConfirmSubstanceApplication`, ICS, sync, e-mail, códigos). Mudança é só de APRESENTAÇÃO.
- NÃO inventar campo "RAS emitido" na sessão (não existe no dado; exigiria mexer na API). Fica para tarefa futura.
- NÃO remover o relevo 3D dos painéis/sub-painéis (essência Paxter); cantos sempre quadrados.
- NÃO trocar cor por dois sentidos: quadradinho = identidade da substância; verde = aplicada/concluída; ciano = item atual/foco; âmbar = atenção/limite.
- NÃO mexer no motor de cálculo/dados; só render e estado de UI.
