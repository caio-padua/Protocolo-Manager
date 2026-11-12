---
name: Encaixe rápido interno (Quick Book)
description: Política de marcação avulsa interna com antecedência em minutos, sem cadeia anti-ilha, sem alterar a regra de 24 h do paciente
---
O canal do encaixe é a ROTA (/agenda/encaixe/*) + identidade da sessão + ferramenta `agenda_encaixe_interno` da matriz de Governança; nunca parâmetro do navegador (corpo/query com canal ou antecedência é 400).
**Why:** o CEO exigiu autorização no servidor e que paciente/protocolo/Pit Stop/concierge sigam 24 h + cadeia.
**How to apply:** rota nova de marcação interna deve chamar `autorizarEncaixeInterno`; nunca passar `encaixeInterno` ao motor por rota padrão.
- Antecedência interna (minutos) mora em app_settings (chave `agenda.encaixe_interno.antecedencia_minutos`), NÃO em coluna de agenda_settings: coluna nova no Drizzle quebraria todo select-all no banco real não migrado. Ausente = 5.
- Seletor (`avaliarEncaixeDoDia`) e confirmação usam a MESMA função; confirmação relê tudo sob travas (recurso → profissional → cliente). Sem compartilhamento de horário.
- Duplicata = mesmo cliente/agenda/data/hora/duração, sem protocolo, criada há <120 s ⇒ 200 `duplicada:true`.
- Alternativas (3 do mesmo dia ou próximo dia livre em 14) são lidas FORA da transação e só orientam.
- Limite: Google editado direto entre sincronizações (espelho de 5 min) é invisível; não há consulta ao vivo na confirmação.
