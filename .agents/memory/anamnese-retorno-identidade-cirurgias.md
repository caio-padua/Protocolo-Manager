---
name: Anamnese de retorno — identidade do cadastro e fatos que só crescem
description: Nome/CPF/idade vêm do cadastro; cirurgias não se retiram; comparação só do mesmo cliente e clínica.
---
- Ids reais: identidade = 1 (nome), 2 (CPF), 41 (idade); cirurgias = 8, 9, 88, 315. pergunta_id repete, nunca é chave.
- Servidor recusa (409) resposta de identidade em sessão amarrada e recusa retirada de fato de cirurgia; "comunicar erro" abre pedido em anamnese_correcoes (criada por CREATE IF NOT EXISTS, fora do Drizzle) sem tocar no histórico.
- Caso "BETE BOQUETE / 11122233300": mesmo cliente (11), sessão de teste digitou nome/CPF fictícios e a nova sessão HERDAVA essas respostas (nome/CPF eram "fixa"); não era mistura de pacientes.
**Why:** o cockpit marcava "Mudou" em nome/CPF, confundindo cadastro com evolução clínica.
**How to apply:** nunca herdar/comparar ids de identidade; rotas de revisão ficam em routes/anamnese-revisao.ts com requireMessageClinic; teste em banco descartável copia o DDL real via pg_dump.
