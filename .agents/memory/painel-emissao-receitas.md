---
name: Painel Emissão de receitas — decisões do CEO
description: Regras de design e comportamento do painel Emissão do Cockpit (destinos, prévia, histórico/comparação, nome no Drive)
---
- Destinos = retângulos, cantos leves (3px), nome + mini título da função; selecionado "afunda" (btn-3d-apertado).
- SEM caixa de confirmação: clicar "Emitir e enviar" é a confirmação; aviso em texto mostra os destinos. Envio exige destino marcado e nunca repete sozinho.
- Prévia = PDF aberto em nova aba (usa /clinical-demonstrations, documento de teste sem validade). Sem "telinha".
- Histórico expandido em diálogo grande + comparação lado a lado de 2+ prescrições (fórmula pelo nome, ativo e dose). Lógica pura em lib/comparar-receitas.ts.
- Nome no Drive: `AA.MM.DD RECEITA MANIPULADA NOME DO CLIENTE.pdf`, nada depois. Colisão no mesmo dia vira " (2)"; vínculo fica em recipes.drive_file_id.
**Why:** CEO pediu botões não redundantes, histórico comparável e nome padronizado.
**How to apply:** a frase do CEO sobre o nome estava ambígua ("receita manipulada / receita / fórmula manipulada"); adotado "RECEITA MANIPULADA" — confirmar com ele.
