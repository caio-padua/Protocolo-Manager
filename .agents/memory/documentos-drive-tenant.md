---
name: Documentos clínicos no Drive por empresa
description: Regras para salvar protocolos e RAS em pastas empresariais sem usar a raiz global como fallback.
---

Documentos clínicos de protocolo e RAS devem resolver a raiz `drive_clientes_folder_id` da empresa já autorizada e passá-la explicitamente ao helper de pastas. Sem raiz, CPF ou subpasta do cliente, bloquear o upload ou informar que a cópia no Drive não ocorreu; nunca usar a raiz global como fallback nesses fluxos. A raiz global só permanece para integrações antigas ainda não migradas.

**Why:** A estrutura fixa compartilhada pode misturar documentos de clínicas diferentes mesmo quando a rota autoriza corretamente o cliente.

**How to apply:** Antes de adicionar ou alterar qualquer envio clínico ao Drive, conferir a empresa do protocolo e a configuração de pasta; testar duas empresas sintéticas e a ausência de raiz sem chamar o provedor real.
