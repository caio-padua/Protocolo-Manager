---
name: Aprovação clínica delegada
description: Regra durável para preparar, aprovar e emitir documentos clínicos em clínicas separadas.
---

# Aprovação clínica delegada

**Regra:** a autorização clínica exige permissão global por função e concessão local da clínica. Profissionais de enfermagem autorizados podem preparar solicitações, mas não emitir nem assinar documentos. O médico responsável, ativo e vinculado à mesma clínica confere e emite sob a própria identidade. A clínica ou o profissional indicados pelo navegador nunca concedem acesso. A aprovação não envia mensagens automaticamente; tentativas repetidas não podem gerar uma segunda emissão. A visualização de histórico exige vínculo e autorização ativos.

**Why:** o sistema deve permitir que uma clínica delegue preparo sem confundir quem pediu, quem revisou e quem assumiu a responsabilidade médica, mantendo isolamento entre clínicas.

**How to apply:** proteger cada rota de emissão, inclusive rotas antigas, usando o mesmo contexto autenticado do servidor. Revalidar clínica, cliente, profissional, função, certificado, permissão global e concessão local imediatamente antes de emitir. Manter prova de preparador, aprovador, decisão, documentos e resultado de envio.
