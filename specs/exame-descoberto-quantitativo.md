# Demanda 1 — Cadastrar unidade e faixas de exame descoberto "não quantitativo"

Loop: Paxter Loop (Especificar → Construir → Revisar). Opção escolhida pelo CEO: A (botão que revela os editores).

## Objetivo
Permitir cadastrar unidade padrão, unidades aceitas e faixas (nome + valores) de um exame que a
ferramenta marcou como "não quantitativo" (ex.: Frutosamina), destravando o ovo/galinha atual.

## Causa verificada
Backend calcula `quantitativo = (units.length > 0 || zones.length > 0)`. Exame descoberto sem unidade
e sem faixa nasce `quantitativo:false`. No front, `naoQuant` esconde AMBOS os editores (Medida e
Significado Clínico). Logo, não há como cadastrar a primeira unidade nem a primeira faixa.

## Requisitos (exatos)
1. Quando o exame estiver "não quantitativo", o painel MEDIDA · UNIDADES exibe um botão
   "Tornar quantitativo (cadastrar unidade e faixas)" no lugar da mensagem.
2. Ao clicar, os DOIS editores (Medida · Unidades e Significado Clínico · Direção & Faixas) ficam
   visíveis para aquele exame.
3. A revelação é por exame e se reseta ao trocar de exame (não vaza para outro "não quantitativo").
4. Se ainda não houver nenhuma linha de unidade, o clique cria uma linha vazia marcada como PADRÃO,
   pronta para digitar.
5. Salvar unidade reutiliza o endpoint existente `PUT /catalogo-faixas/unidades` (já marca o exame
   como quantitativo). Salvar faixas reutiliza `PUT /faixas`.
6. Ao salvar faixas, o rótulo "não quantitativo" também some (marcar quantitativo no estado local),
   para consistência com o salvar unidade.
7. Enquanto a unidade não for cadastrada, o painel de Significado Clínico (faixas), quando ainda não
   revelado, mostra mensagem orientando a cadastrar a unidade acima.

## Casos extremos
- Trocar de exame durante a revelação: o estado de revelação zera (Requisito 3).
- Salvar só faixas (sem unidade): permitido; o backend torna quantitativo ao ter zonas; o estado
  local também reflete (Requisito 6).
- Guard de corrida do carregarDetalhe permanece intacto.

## Definição de PRONTO
- No exame Frutosamina (não quantitativo), aparece o botão; ao clicar, surgem os editores de unidade
  e de faixas; consigo definir unidade padrão, adicionar unidades com fator, nomear as 5 faixas e
  preencher De/Até; salvo unidade e faixas sem erro; o rótulo "não quantitativo" desaparece.
- Nenhum endpoint novo; motor de cálculo/triagem intactos.

## Linhas vermelhas
- NÃO tocar no motor de triagem/cálculo nem nos endpoints existentes.
- NÃO mexer no seletor de apelido manual (Demanda anterior já aprovada).
- NÃO mudar cor de faixa (cor é por severidade/posição, não editável).
