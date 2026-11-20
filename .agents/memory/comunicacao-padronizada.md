---
name: Comunicação padronizada (texto + flyer)
description: compositor sem IA, modelos por clínica, regra de flyer, histórico
---
Módulo único lib/comunicacao-padrao.ts; modelos de texto por clínica (empresa_id NULL = padrão), regra de flyer por categoria/clínica (sem regra = SEM flyer), histórico em comunicacao_envio; tela = aba "Modelos de comunicação" em Frases da Assistente.
**Why:** CEO exigiu texto determinístico (zero IA), parágrafos com linha em branco, flyer só em pagamento/boleto/documento.
**How to apply:** novo fluxo de envio chama enviarComunicacao; teste só para clientes 11/12/1924 e até R$ 5; variável sem valor = erro, nunca texto incompleto.
