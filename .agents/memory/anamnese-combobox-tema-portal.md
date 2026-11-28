---
name: Anamnese — seletor pesquisavel e tema
description: dropdown da anamnese precisa renderizar dentro da raiz tematica; sexo do cadastro tem historico proprio
---
Popover do Radix vai por padrão para o body, fora da classe `.dark`/`.anamnese-solo`, e perde o tema.
**Why:** a anamnese aplica o tema numa raiz própria, não no html.
**How to apply:** Portal com `container` = `.anamnese-solo` (ver combobox.tsx); filtro do cmdk trocado por busca sem acento (a padrão é aproximada e traz itens sem relação). Limites: lista única >7 e múltipla >9 viram seletor pesquisável. Sexo registrado: correção só com motivo, antes/depois em clients_sexo_historico, escopo por clínica.
