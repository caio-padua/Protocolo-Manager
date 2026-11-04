---
name: Prescrição sem assinatura com certificado pessoal vencido
description: Limites de segurança para emitir e identificar um documento clínico não assinado.
---

Regra: a exceção sem assinatura é restrita à prescrição explícita no Cockpit quando o certificado pessoal do médico autenticado estiver comprovadamente vencido. O documento deve ser marcado como não assinado, permanecer apenas para consulta e download autenticados, e exigir assinatura manual antes de uso clínico. Não enviar, reenviar, publicar por link, compartilhar no Drive, encaminhar à farmácia nem disparar lembretes. Receita controlada e pedido de exames continuam bloqueados sem certificado vigente. Certificados globais usados por RAS e protocolos permanecem separados e não recebem essa exceção.

**Why:** Separar “gerado” de “assinado” evita atribuir validade ou autoria criptográfica inexistente e impede transmissão automática de um documento incompleto.

**How to apply:** Ao alterar qualquer emissão clínica, preservar a identidade do médico, cliente, clínica e governança; persistir o estado da assinatura; testar abertura autenticada e recusa de envio; nunca inferir assinatura em registros históricos.
