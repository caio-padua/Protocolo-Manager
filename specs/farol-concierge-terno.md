# Spec — Farol Concierge em "terno azul-marinho" (tela /agendar, Dr. Caio)

Decisao do CEO (30/06/2026). Redesenho da tela do "farol" do fluxo Concierge.

## Problema atual
O simbolo respira SOZINHO (stage `motor1`) e SO DEPOIS os retangulos do farol
entram (stage `vias`, sem simbolo). O CEO quer os dois CONCORRENTES: simbolo em
cima respirando + mensagens do farol embaixo, ao mesmo tempo.

## Alvo (o que construir)
Moldura unica "terno azul-marinho" (navy) reaproveitada por motor1, vias e motor2,
sempre navy (independente do tema claro/escuro da pagina), inspirada na tela
"foto do paciente" (`foto.tsx`): `panel-3d` sobre fundo navy, dentro de um wrapper
`.dark` para as classes 3D irem para a variante navy.

Layout da moldura (coluna):
- TOPO (centro): simbolo `PaxterSymbolGlass` respirando (`dc-breathe`), SEMPRE visivel.
  Abaixo do simbolo, titulo editorial + frase da fase.
- BAIXO (linha): retangulo SALIENTE ("Up Bevel") com a faixa de status do farol +
  3 LEDs de progresso. A faixa muda de cor por fase (Padrao do alerta clinico da skill):
  - fase 0 (vermelho) = `paxter-alert paxter-alert-red`: "sua data esta esgotada".
  - fase 1 (amarelo)  = `paxter-alert paxter-alert-amber`: "verificando o Concierge".
  - fase 2 (verde)    = `bevel-3d bevel-3d-ok`: "a Helena conseguiu / prioridade liberada".
- CANTO INFERIOR DIREITO: porcentagem/velocidade dentro de um WELL concavo
  (`concave-3d`, espaco afundado), ao lado da faixa (sem sobrepor).

Comportamento:
- `vias`: porcentagem sobe de 0 a 100 em ~10s (mesmo tempo do verde); fases
  vermelho (0-4s) -> amarelo (4-10s) -> verde (10s, revela as duas vias).
- `motor1` e `motor2` usam a MESMA moldura (simbolo no topo + well da % no canto),
  para a transicao ser continua (simbolo nunca "some" antes dos retangulos).
- motor2 mantem a pilha de mensagens encadeadas como a faixa de baixo.

## Fora de escopo (anotado para depois, pedido do CEO)
- Toggle que LIGA/DESLIGA a "maquiagem de escassez de horarios" (nem sempre o
  Concierge fica ativo). So projetar a tela para acomodar; NAO construir o toggle agora.

## Regras herdadas
- skill-layout-paxter: vocabulario Saliente/Concavo, classes 3D unlayered, navy+ouro,
  status (vermelho/amarelo/verde) sobrevive como COR DE STATUS.
- Nao mexer no motor de agendamento nem no payload; mudanca e so de APRESENTACAO.
