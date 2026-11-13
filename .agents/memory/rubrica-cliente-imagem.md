---
name: Rubrica do cliente em imagem (cadastro + RAS FAP)
description: Decisões e armadilhas da rubrica enviada como imagem para todos os clientes; como o RAS FAP escolhe entre imagem e iniciais
---

Cada cliente pode ter uma rubrica em imagem (tabela própria com histórico, arquivo em armazenamento PRIVADO, só PNG processado). No RAS FAP: com imagem, ela substitui as iniciais só nas marcas "plena" e "cadastro"; sem imagem continuam "Sobrenome, I.N.I."; AGUARDANDO e NÃO CONFIRMADA nunca mostram imagem.

Uma confirmação conserva a versão da imagem daquele momento, inclusive a
ausência conhecida; trocar o cadastro não autoriza alterar a rubrica histórica.
Legado sem prova deve ser identificado, nunca preenchido com a imagem de hoje.

**Why:** em 13/11/2026 foi exigido preservar a versão efetivamente vinculada à
visita, sem fabricar prova retroativa quando o sistema anterior não a registrou.

**How to apply:** distinguir ausência comprovada de versão desconhecida; a
confirmação mais forte posterior não substitui uma captura histórica existente.

**Why:** pedido do CEO (09/11/2026): "sem rubrica, iniciais; com rubrica, a imagem". Das três fotos de teste, só a de proporção larga (cerca de 3,5 para 1) fica legível na célula de 120 x 15 pontos; as de proporção cerca de 1,2 para 1 ficam com ~15 pontos de largura.

**How to apply:**
- Rubrica registrada e ilegível, ou com hash diferente do registro, LANÇA erro; nunca cai em iniciais em silêncio.
- pngjs 5 em modo síncrono aceita PNG cortado ao meio (devolve a metade em branco) e descomprime PNG entrelaçado sem teto de memória: conferir os capítulos do arquivo e recusar entrelaçado ANTES de decodificar. jpeg-js já lança em JPEG cortado.
- Troca nunca apaga a versão anterior (Regra de Ouro); o índice único parcial garante uma ativa por cliente e a troca usa trava de transação.
- Sem rota de histórico nem envio pelo próprio cliente (fora do escopo; seria código sem chamador).
