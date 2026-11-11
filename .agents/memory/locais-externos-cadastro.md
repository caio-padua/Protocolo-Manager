---
name: Locais externos da clínica (consultórios sublocados)
description: Cadastro próprio de endereços externos do mesmo CNPJ, copiados para a agenda EXTERNA; fora de locations
---
Tabela `locais_externos` (SQL puro, migração 20261116, sem Drizzle) guarda consultórios sublocados do mesmo CNPJ. A agenda EXTERNA continua gravando o endereço nas próprias colunas `external_*`; o seletor só COPIA (sem vínculo por id) e os campos seguem editáveis. Rotas em `/agenda/locais-externos`; inativar, nunca apagar.
**Why:** CEO pediu cadastro em vez de digitar toda vez, sem tocar em `locations` (polimórfica, Regra de Ouro). Dados de teste (Jardins e São Miguel Paulista, fictícios) estão em `scripts/seed-locais-externos-ficticios.sql`, só dev.
**How to apply:** editar um local externo NÃO atualiza agendas que já copiaram o endereço (limite conhecido). Nunca rodar o seed em produção. Agenda "EXTERNA" legada pode ter modality `local` — conferir antes de supor que o endereço vale.
