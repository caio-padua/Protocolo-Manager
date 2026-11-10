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
fonte de vagas lida do motor já existe, e a reserva atômica só da enfermagem
local também (sem rota ainda); a lacuna real é a reserva conjunta com médico
(a sessão só guarda um recurso) e a rota que une tudo.

Duas infusões endovenosas na mesma visita somam o tempo (decisão do dono).

Agenda sem janela de expediente cadastrada: o motor responde "sem expediente",
nunca "sem vaga" — manter essa distinção em toda tela e mensagem (vale também
para exceção/feriado e para agenda do Google desatualizada).

Ler o motor custa CPU (~100 ms por dia e agenda: ele expande todos os
compromissos recorrentes do Google a cada dia). Ler dias em paralelo foi
medido e NÃO ganhou tempo; limitar o período ao que o protocolo precisa.

Reserva atômica de protocolo (enfermagem local): trava pelo MESMO bloqueio por
empresa da marcação avulsa e só aceita agenda de modalidade "local" — conferir
`kind` e slot de 20 min NÃO basta, domiciliar/online passam nessas checagens.

**Why:** revisão independente achou agenda domiciliar com grade de 20 min sendo
reservada; e teste de corrida que passa sem o bloqueio é prova vazia.

**How to apply:** teste de concorrência precisa de gatilho `pg_sleep` no INSERT
de sessions para forçar a sobreposição (sem ele a corrida depende de sorte);
rodar mutação deliberada (tirar o bloqueio) e ver o teste cair. Testes de banco
com estado compartilhado: TRUNCATE no beforeEach e cenário próprio em cada teste.
Teste com Date congelado não mede tempo com Date.now — usar performance.now.
DDL de teste vindo do Drizzle precisa criar as sequências dos defaults nextval.

Prévia/confirmação de agendamento de protocolo: o plano é calculado FORA do
bloqueio, então a impressão digital da prévia precisa cobrir tudo (doses,
totais, intervalos, datas, durações) e a reserva precisa reconferir uma
fotografia desses dados SOB o bloqueio; comparar só datas/horários deixa gravar
dose diferente da que o colaborador confirmou (achado de revisão independente).

**Why:** o hash só de data+horário+identidade passava com a dose trocada; e
uma edição entre o recálculo e o bloqueio gerava sessões fora da prescrição.

**How to apply:** nova entrada de dado que influencie o plano entra na função
de fotografia (usada pelas duas pontas). Teste a janela com um gancho que edita
o banco entre a comparação e a reserva (ex.: callback de reautorização).
Google desatualizado tem código próprio (agenda_desatualizada), nunca "sem plano".
O planejador poda a busca a partir de ~4 aplicações com 12 vagas cada
(searchWasPruned=true é normal); prévia de 36 aplicações levou ~6 s em banco de ensaio.

Lançamento de protocolo usa somente a clínica e as agendas ativas vinculadas ao
cadastro do cliente; listas globais não são fonte de autorização. A prévia e a
reserva conferem a agenda e o local, e a sessão persistida usa o local realmente
confirmado. Um protocolo validado sem sessões pode ser reservado pelo fluxo novo;
sessões antigas sem recurso ficam preservadas e não são reenviadas nem reparadas
automaticamente.

**Why:** uma lista global permitiu selecionar enfermagem e local de outras clínicas;
a validação antiga também criou sessões sem reservar horário, e agendas alternativas
podem ter locais operacionais diferentes.

**How to apply:** ao alterar seletores, prévia ou reserva, derive opções do cadastro
do cliente e confira o mesmo recurso e local dentro da reserva. Não transforme
sessões legadas em compromissos sem uma ação de recuperação explícita.
