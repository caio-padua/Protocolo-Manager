---
name: Área do Cliente — token só em cabeçalho e exclusão de conta
description: Regras Apple App Store (3.7/4.6) aplicadas à /area; exclusão é lógica e preserva prontuário.
---
Token do paciente só vale em `Authorization: Bearer`; nunca na URL (prévia do administrador usa mensagem entre janelas, `/area?previa=1`).
Excluir conta = remoção lógica dos dados criados no app (cofre, medicações próprias, vínculos, assinatura, senha, sessões); prontuário/exames/documentos ficam (retenção legal).
**Why:** Apple exige exclusão in-app e proíbe credencial na URL; Regra de Ouro proíbe apagar registro clínico.
**How to apply:** rota nova do paciente herda o bloqueio de conta excluída (middleware em /area-paciente); login/renovação/identificação por CPF checam a tabela de contas excluídas. Recursos Premium/Família/Créditos IA ainda são só cartões com cadeado "em preparação".
