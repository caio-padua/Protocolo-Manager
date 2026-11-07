---
name: Cadastro empresarial separado da agenda
description: Distingue dados legais da empresa e locais de atendimento ligados às agendas.
---

Regra: O “Cadastro de Empresas” guarda os dados jurídicos, fiscais e de contato da empresa. “Clínicas & Locais” organiza locais e agendas de atendimento; não substituir um cadastro pelo outro nem inferir hierarquia empresarial a partir de vínculos de agenda ou referências de planilha.

**Why:** O CEO esclareceu que locais e agendas são uma camada operacional, enquanto empresas são registros próprios do cadastro empresarial; misturar os conceitos causou confusão.

**How to apply:** Ao alterar menus, cadastros empresariais ou telas de agenda, preservar as duas funções e manter os dados de origem informativos até haver autorização explícita para outra arquitetura.

Regra: “Clínicas & Locais” deve ser a entrada principal para acessar a identidade documental da empresa vinculada, mantendo uma identidade compartilhada por seus locais.

**Why:** O CEO escolheu unificar o acesso sem duplicar os cadastros ou confundir a empresa com as unidades de atendimento.

**How to apply:** Mostrar a identidade somente após confirmar o vínculo e a autorização; não escolher nem alterar vínculos por suposição.
