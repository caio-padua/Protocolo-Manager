# Spec — Grade Imaginária: Modelo Mental de Layout de Cards

**Data:** 19/06/2026  
**Autor:** Dr. Replit Paxter (a partir de aprendizado com o CEO Dr. Caio na Agenda Semanal)  
**Status:** APROVADO para construção

---

## Objetivo

Documentar e formalizar o modelo mental de "grade imaginária" como referência permanente
na skill de layout Paxter, para que qualquer agente (Dr. Replit Paxter e sistemas primos)
saiba construir cards de informação onde o olho extrai tudo de uma só olhada.

---

## Problema que esta spec resolve

Sem grade imaginária, os campos de um card variam de posição conforme o conteúdo:
- Nome longo → badge de status empurrado para baixo
- Campo opcional ausente → todos os campos abaixo sobem
- Horário em bloco lateral → comprime o nome em telas estreitas
- Resultado: o olho do CEO (TDAH) não sabe onde procurar e cansa antes de ler

Com grade imaginária, cada dado ocupa um SLOT fixo — o olho pousa uma vez e extrai tudo.

---

## Requisitos

### R1 — Estrutura de zonas em camadas horizontais
O card deve ter zonas empilhadas com altura previsível:
- Zona 1 (TOP BAR): faixa fina, sempre a mesma altura
- Zona 2 (IDENTIDADE): nome + identificador + badge de status
- Zona 3 (META GRID): grade N×M de campos rotulados
- Zona 4 (CONTEÚDO): lista de itens ou dado principal
- Faixa lateral esquerda: indicador de status (1–4px de largura, nunca tira espaço)

### R2 — TOP BAR: infos de tempo e ação sempre no topo
A primeira zona do card deve conter: timestamp/horário, identificador de sequência (Semana X)
e o menu de ações (···). Estes três elementos nunca se movem. O dropdown fica no extremo
direito (`ml-auto`). Zero wrap.

### R3 — Badge de status ao lado do identificador, nunca flutuando
O badge de status (AGENDADO / CONCLUÍDO / etc.) fica na mesma linha do CPF/identificador,
NÃO no canto superior direito junto ao nome. Razão: o tamanho do nome faria o badge
saltar de posição. Implementar: nome em linha 1, [CPF] + [BADGE] em linha 2 (ambos
`concave-3d`).

### R4 — Meta grid com grade de colunas fixa, nunca flex-wrap
Campos de metadados usam `grid grid-cols-2` (ou outra grade fixa). NUNCA `flex flex-wrap`.
Cada célula tem largura garantida. Campo vazio mostra "—" mas o slot permanece presente.

### R5 — Placeholder obrigatório nos campos vazios
Campo sem dado mostra "—" (travessão), nunca desaparece. Remover um campo faz todos os
campos abaixo subirem, quebrando o alinhamento visual entre cards.

### R6 — Lista de itens em grid de colunas fixas
Linhas de itens repetidos (substâncias, parcelas, exames) usam `grid` com `grid-cols-[...]`
de template fixo. Cada coluna tem função única e posição estável em TODAS as linhas.
Colunas canônicas: (1) marcador de cor 14px, (2) nome truncável, (3) divisor vertical,
(4) número tabular, (5) estado textual, (6) controle/checkbox.

### R7 — Guias visuais criadas pelas linhas imaginárias
O layout deve gerar pelo menos:
- 3 linhas horizontais imaginárias (fim do top bar / fim da identidade / fim do meta grid)
- 2 linhas verticais imaginárias (borda esquerda do conteúdo / coluna direita do meta grid)
Estas guias existem implicitamente — não são elementos visuais, são criadas pela regularidade.

### R8 — Faixa lateral de status (não bloco lateral)
Status colorido = faixa lateral de 4px de largura máxima. NUNCA um bloco com largura
significativa que comprima o conteúdo. A faixa indica estado sem roubar espaço.

### R9 — Documenta o anti-padrão para aprendizado
A referência deve conter uma tabela "ANTI-PADRÃO → PADRÃO" com os erros comuns
e a solução correta.

---

## Casos extremos a tratar

| Situação | Solução |
|---|---|
| Nome muito longo (>40 chars) | `truncate` no span do nome, slot fixo não estica |
| Campo opcional sem dado | Mostra "—", slot permanece, nenhum campo sobe |
| Status badge longo (ex: "PARCIALMENTE CONFIRMADO") | Badge no `concave-3d` com text-[9px] font-black, não quebra a linha da identidade |
| Tela estreita (mobile 360px) | Top bar permanece em 1 linha (time + semana + dropdown); meta grid empilha para `grid-cols-1` em telas < sm |
| Dropdown com muitos itens | Scroll interno do DropdownMenuContent, nunca ocupa o card |

---

## Definição de PRONTO

- [ ] Arquivo `grade-imaginaria.md` criado em `.agents/skills/skill-layout-paxter/references/`
- [ ] Arquivo contém: modelo mental, diagrama ASCII das zonas, tabela anti-padrão→padrão,
      receita JSX comentada e checklist de revisão
- [ ] SKILL.md atualizado com linha na tabela "0. Arquivos de referência" apontando para o novo arquivo
- [ ] Os Padrões 12 e 13 existentes na SKILL.md recebem referência cruzada para o novo arquivo
- [ ] Skill testável: qualquer agente lendo só o arquivo novo consegue construir um card correto
      sem consultar o código da Agenda

---

## Linhas vermelhas

- NÃO tocar em lógica de dados, rotas ou cálculos
- NÃO inventar classes CSS novas — usar o vocabulário existente do sistema Paxter
- NÃO criar componente React — a skill é documentação + receita JSX de referência
- A skill deve ser agnóstica a projeto (vale para Manager, IHE e sistemas primos)
