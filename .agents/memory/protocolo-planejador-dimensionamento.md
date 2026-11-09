---
name: Participação médica por via e estado do planejador de protocolos
description: Regra de participação médica dada pelo médico e a lacuna real do agendamento de protocolo.
---

Participação médica: intramuscular, subcutânea e endovenosa não reservam o
médico; implante e procedimento estético reservam (regra dada em 09/11/2026).
Valor nulo no cadastro nunca é tratado como "dispensa o médico".

**Why:** a validação do protocolo grava sessões sem reservar recurso. O
planejador puro e o dimensionamento por períodos já existem com testes, mas
nenhuma rota os usa; dizer que "não existe planejador" é falso.

**How to apply:** a capacidade da vaga é medida em períodos de 20 minutos
RESERVADOS (não em tempo clínico) e o médico precisa cobrir todos eles. A
fonte de vagas lida do motor já existe; a lacuna real é a reserva atômica de
dois recursos (a sessão só guarda um recurso) e a rota que une tudo.

Duas infusões endovenosas na mesma visita somam o tempo (decisão do dono).

Agenda sem janela de expediente cadastrada: o motor responde "sem expediente",
nunca "sem vaga" — manter essa distinção em toda tela e mensagem (vale também
para exceção/feriado e para agenda do Google desatualizada).

Ler o motor custa CPU (~100 ms por dia e agenda: ele expande todos os
compromissos recorrentes do Google a cada dia). Ler dias em paralelo foi
medido e NÃO ganhou tempo; limitar o período ao que o protocolo precisa.
