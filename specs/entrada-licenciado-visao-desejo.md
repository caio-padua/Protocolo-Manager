# Spec — Entrada do Licenciado (Visao de Desejo) + nitidez CEO x Medico

Data: 27/07/2026 · Pedido do CEO Dr. Caio (voz) · Status: CONSTRUIR

## 1. Objetivo

Duas entradas nitidamente separadas, com login e senha proprios:

| Entrada | Quem | O que ve |
|---|---|---|
| CEO ("caio") | Dr. Caio dono da plataforma | 100% do sistema, opera o Instituto Padua como hoje (NADA muda) |
| Licenciado ("Dr. Caio medico licenciado") | Dr. Caio como um medico licenciado qualquer | Copia da estrutura: menus/modulos habilitados VISIVEIS porem TRAVADOS; clique abre mensagem de desejo |

Hoje somente o CEO usa as duas entradas (teste do proprio produto). O mecanismo
ja nasce pronto para futuros licenciados.

## 2. Mensagem de desejo (ao clicar num modulo travado)

| Elemento | Regra |
|---|---|
| Descricao | O que o modulo faz, em linguagem de beneficio |
| Valor promocional | Valido por 48 horas a partir da visualizacao; apos 48h o valor de adesao MUDA (sobe) |
| Indicacao | Se indicado por outro licenciado: 10% de desconto NA ADESAO (fechamento); a MENSALIDADE nao muda |
| Tom | Recorrencia + escassez; o sistema respira monetizacao para o CEO |
| Valores | Placeholders editaveis em UM arquivo (catalogo); CEO confirma os numeros depois |

## 3. Mecanica (usa o que ja existe — nao reinventar)

- Papel novo: `category = "licenciado"` em professionals (texto, sem migration).
- `role-destino.ts`: licenciado -> `/licenciado` (destino no login).
- Pagina nova `/licenciado` no padcom: shell propria (fora do Layout admin),
  navy/ouro Paxter, lista os modulos (mesma taxonomia de `empresas.modulos_ativos`
  / menuItems) com cadeado + modal de desejo.
- Guard: sessao de colaborador com category licenciado que abrir tela admin e
  redirecionada para `/licenciado` (governanca por camada de tela).
- Login do licenciado: profissional novo "Caio Padua (Licenciado)" com
  usuario/senha proprios (senha provisoria; CEO troca depois).
- CEO: intocado (isPrimaryDoctor=true, acesso total, destino "/").

## 4. Fora de escopo (nesta onda)

- Cobranca real da adesao (Asaas) ao aderir — proximo passo apos CEO validar.
- Contagem persistente das 48h por licenciado no banco (MVP: prazo exibido).
- Seletor de dois chapeus no topo (decisao A/B/C da ENTREGA 51 continua aberta).

## 5. Aceite

- POST /api/collaborator/login com o usuario licenciado devolve destino "/licenciado".
- /licenciado mostra modulos travados; clique abre modal com descricao, valor 48h e regra dos 10%.
- Login CEO segue devolvendo destino "/" e operando tudo.
