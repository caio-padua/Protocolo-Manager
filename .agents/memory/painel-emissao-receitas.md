---
name: Painel Emissão de receitas — decisões do CEO
description: Regras de design e comportamento do painel Emissão do Cockpit (destinos, prévia, histórico/comparação, nome no Drive)
---
- Destinos = retângulos, cantos leves (3px), nome + mini título da função; selecionado "afunda" (btn-3d-apertado).
- SEM caixa de confirmação: clicar "Emitir e enviar" é a confirmação; aviso em texto mostra os destinos. Envio exige destino marcado e nunca repete sozinho.
- Layout (revisão): fórmulas em cima; abaixo, 2 painéis horizontais recolhíveis (seta à direita, nascem abertos): 'Prescrição, emissão e encaminhamento' e 'Prescrições — Histórico' (abas Emitidas/Comparar). Resultado do envio aparece num bevel DENTRO do mesmo painel; nada de painel novo. Sem textos explicativos nos botões; botões empilhados, retangulares (`!rounded-[2px]`, pois classes 3D vencem utilitários), selecionado = btn-3d-apertado. Mensagem: 'PDF, documento encaminhado ao número X'.
- Prévia = PDF aberto em nova aba (usa /clinical-demonstrations, documento de teste sem validade). Sem "telinha".
- Comparação (aba do painel Histórico, sem diálogo) + lado a lado de 2+ prescrições (fórmula pelo nome, ativo e dose). Lógica pura em lib/comparar-receitas.ts.
- Nome no Drive: `AA.MM.DD RECEITA MANIPULADA NOME DO CLIENTE.pdf`, nada depois. Colisão no mesmo dia vira " (2)"; vínculo fica em recipes.drive_file_id.
**Why:** CEO pediu botões não redundantes, histórico comparável e nome padronizado.
**How to apply:** a frase do CEO sobre o nome estava ambígua ("receita manipulada / receita / fórmula manipulada"); adotado "RECEITA MANIPULADA" — confirmar com ele.

## Layout atual (coluna única, aprovado pelo CEO: opções A + B + C)
- Tela de prescrição em coluna única: busca larga no topo + "Explorar categorias" (gaveta que recolhe e limpa a busca ao adicionar); receita em largura total; histórico fica NO FINAL (decisão do CEO, não mover para aba).
- Ativos em linhas [nome|dose|unidade|remover] (AtivosLinhas + lib/ativos-linhas.ts): o dado segue sendo o texto de ativos; edição reescreve só o trecho alterado; linha sem dose reconhecida fica inteira no nome.
- Dock de envio (farmácia padrão + 4 destinos + botões + resultado do envio) fica sticky no rodapé SÓ em md+ (no celular rola junto, por altura). Botões finais: Visualizar PDF | Gerar sem Assinar | Apenas Emitir | Assinar e Enviar (último).
**Why:** `.cc-panel-body` tem overflow-x:auto (vira contêiner de rolagem sem altura) e quebrava o sticky; corrigido com `:has(.cockpit-prescricao-visual){overflow:visible}` em cockpit-identidade.css.
