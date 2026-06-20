# Spec — Edicao de substancia em "gaveta vertical" (inline)

Data: 20/06/2026. Decisao do CEO (Dr. Caio): a edicao de substancia
NAO deve mais abrir o Sheet lateral da direita ("puxadinho"). Deve expandir
para BAIXO, dentro do mesmo card/painel da substancia, no mesmo alinhamento
e largura — "como se uma gaveta com andar na vertical abrisse".

## Objetivo
Trocar o `SubstanceEditSheet` (drawer lateral) por um painel de edicao inline
que cresce para baixo dentro do proprio card da lista `/substances`.

## Comportamento
1. Botao "Editar" no card -> abre o painel de edicao inline ABAIXO do cabecalho
   do card, no mesmo alinhamento/largura.
2. Apenas UM card em edicao por vez. Ao abrir a edicao de um card:
   - os outros cards recolhem (tanto detalhes quanto edicao);
   - a tela rola ate o card em edicao.
3. O painel de edicao reaproveita os MESMOS campos/secoes do formulario atual
   (Identificacao; Posologia & Logistica; e demais secoes do SubstanceEditSheet).
4. Rodape do painel: "Cancelar" (fecha sem salvar) e "Salvar alteracoes"
   (grava via mesma mutation atual e fecha a gaveta).
5. A expansao de DETALHES (chevron, somente leitura) e a expansao de EDICAO sao
   exclusivas: abrir edicao fecha os detalhes do mesmo card e vice-versa.

## Linha vermelha
- Reaproveitar a logica/validacao/mutation ja existentes (mesmo contrato OpenAPI).
  So muda a APRESENTACAO (de Sheet lateral -> painel inline). Zero mudanca de dado,
  schema, rota de API ou payload.
- Cor de substancia e sistema corporal continuam DADO intocavel.

## Aceite
- Clicar "Editar" expande o painel para baixo no mesmo card; salvar persiste e
  recolhe; cancelar descarta e recolhe; abrir outro card recolhe o anterior.
- O Sheet lateral nao aparece mais em /substances.
- Validado por screenshot da tela /substances com um card em edicao.
