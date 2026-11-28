---
name: Adesão — identidade estável e job diário
description: chave dos instantâneos de medicação, limites e job das 00:05
---
- Chave de instantâneo e tomada = cliente+data+origem+nome+(COALESCE(medicacao_id,0))+período. Só remédio próprio tem id; fórmula da clínica vem do lembrete (JSON sem id) e segue por nome.
- Migração aditiva: índice novo criado antes de remover a chave antiga; id retroativo só quando o nome tem um único cadastro.
- Job 00:05 BRT (perfil completo do worker, nunca ativado em homologação): só clientes que já usaram o app, nunca antes do primeiro instantâneo, até 3 dias, rotina ATUAL, marca registro_origem='job_diario'; nada de tomei/esqueci inventado.
**Why:** auditoria apontou colapso de homônimos e dias sem abertura sem denominador.
**How to apply:** nova consulta sobre agenda/tomadas deve usar chaveItem(nome, id); mexer na chave exige ajustar ON CONFLICT com a expressão COALESCE.
