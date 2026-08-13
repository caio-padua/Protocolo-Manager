---
name: "Tipo de dieta" = protocolo existente, não tabela nova
description: Ao modelar um conceito de negócio novo, primeiro checar se uma tabela existente já É esse conceito com outro nome.
---

# "Tipo de dieta" reaproveita `dietaProtocolosTable`, não cria tabela nova

Ao construir o motor de "Tipos de Dieta" (Low Carb, Cetogênica, Mediterrânea,
Carnívora, Hiperproteica), a tentação óbvia era criar uma tabela nova
`dieta_tipos`. Mas o motor de cardápio já tinha `dieta_protocolos` — "modelos
reutilizáveis de dieta" com objetivo/descrição/estiloAlimentar — que é
exatamente o mesmo conceito com outro nome de superfície.

**Regra:** antes de desenhar uma tabela nova para um conceito de negócio,
procurar no schema por uma tabela existente que já representa a mesma coisa
sob um nome diferente (ex.: "protocolo" ≈ "tipo de dieta"; ver também
`profissionais-estratificacao.md` e outros casos de sinônimo de domínio).

**Why:** criar tabela duplicada fragmenta a fonte de verdade (dois lugares
para o mesmo "tipo"), quebra o motor de cardápio existente que já lia
`dieta_protocolos`, e obriga sincronizar dois cadastros manualmente.

**How to apply:** ao receber uma tarefa que introduz um "conceito novo", grep
no schema por tabelas com campos semelhantes (nome/objetivo/descrição) antes
de escrever `pgTable(...)` novo. Só criar tabela nova quando o conceito for
genuinamente M:N ou tiver campos que a tabela existente não tem (nesse caso
usar tabela de junção, não duplicar a entidade — ver
`dietaReceitaProtocolosTable` como o M:N correto entre receitas e protocolos).
