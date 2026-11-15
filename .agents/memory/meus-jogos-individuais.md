---
name: Meus Jogos individuais (Area do Cliente)
description: Jogos individuais CAIXA separados dos boloes; regras de estado, robo ausente e limites do que foi provado
---
Jogos individuais vivem em tabelas, rotas e telas proprias (meus_jogos_*, /area-paciente/meus-jogos, gestao em /boloes/gestao/meus-jogos), nunca misturados com Conexao Milionaria.

**Why:** o CEO exige separacao bolao x jogo individual e nunca mostrar "pago"/"registrado" sem prova real; o robo de apostas NAO existe, entao pedido nao pode ser aceito.

**How to apply:**
- Sem robo conectado a API devolve 503 e o botao de confirmar fica desativado; nao simular robo fora de teste.
- "Pago" so por consulta direta ao Asaas (valor+referencia); "efetivado" so com comprovante no App Storage; resultado incerto vira falha_em_conferencia (nao devolve nem repete).
- Horario de fechamento oficial NAO foi achado em fonte oficial: e dado informado pelo gestor com fonte; sem ele a modalidade bloqueia.
- Teste do servidor em Postgres descartavel (meus-jogos-banco-isolado.test.ts); tela em e2e/meus-jogos.spec.ts com API simulada.
- Fora do escopo: Teimosinha, Aposta-Espelho, Surpresinha pelo robo.
