---
name: Rascunhos clínicos e emissão incerta
description: Limites da recuperação local de edição e cuidado com emissão de resultado incerto.
---

Rascunhos locais de receitas e exames são recuperação de edição no navegador, não backup do prontuário nem sincronização entre aparelhos. Manter essa limitação explícita; não anunciar salvamento centralizado.

**Why:** A preservação de edição não prova se uma emissão com falha de conexão chegou a gerar documento no servidor. Recuperar automaticamente e reenviar pode duplicar documentos clínicos.

**How to apply:** Ao recuperar, nunca emitir nem enviar mensagens automaticamente. Exigir contexto autenticado e escolha consciente de recuperação, preservar dados quando a resposta chegar após saída do contexto e orientar a conferência do histórico antes da repetição de uma emissão incerta.

Revalidar autorização no mesmo contexto não deve destruir a edição em memória: ocultar e bloquear temporariamente é diferente de desmontar o formulário.

**Why:** Quando o navegador recusa uma gravação ou outra aba causa conflito, a edição em memória pode ser a única cópia das alterações clínicas. Reiniciar o formulário durante uma checagem de sessão perde essa cópia mesmo sem troca de médico ou paciente.

**How to apply:** Preservar a instância durante checagens transitórias; remover o acesso e desmontar quando a autorização for efetivamente recusada ou o contexto confirmado mudar. Testar com gravação local falhando, não apenas com rascunhos já salvos.
