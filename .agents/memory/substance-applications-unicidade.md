---
name: Unicidade em substance_applications
description: Por que a chave única da tabela de aplicações inclui session_number
---

Regra: a duplicata proibida em `substance_applications` é o trio (session_id, substance_id, session_number), NUNCA só o par sessão+substância.

**Why:** o fluxo histórico de consolidação pode ter registrado ocorrências distintas da mesma substância numa sessão. Esses dados não podem ser apagados nem confundidos. O responsável esclareceu depois que frequências menores que sete dias podem exigir visitas distintas; o agrupamento histórico não é modelo clínico a repetir.

**How to apply:** preservar a distinção entre ocorrências e o histórico. Não reunir doses em uma única visita só por caírem na mesma semana; respeitar as datas e os limites clínicos autorizados. Contagem de visitas deve distinguir visitas de linhas de aplicação.
