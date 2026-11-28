---
name: Club VIP x Minha Categoria — separação
description: Decisão do CEO de que a categoria comercial (Prata/Ouro/Platinum/Diamond) nunca aparece no Club VIP; Conexão Milionária = bolões.
---
Club VIP é programa por convite, de aceite voluntário, SEM nenhuma relação com a categoria comercial. A categoria vive só na aba MINHA CATEGORIA (rota própria `/area-paciente/minha-categoria`). O Club VIP não faz chamada de API nem mostra nível. O convite de bolões chama-se CONEXÃO MILIONÁRIA (nome aprovado pelo CEO), dentro de CONVITES ESPECIAIS, e apenas navega para o Meus Bolões existente.

**Why:** o CEO reprovou a primeira versão que mostrava o nível dentro do Club VIP ("uma coisa não tem nada a ver com a outra").

**How to apply:** qualquer tela, rota ou texto novo do Club VIP não lê nem cita nível; convite de bolão sempre facultativo e separado de serviços médicos, categoria, tratamentos, mensalidades e descontos. Convite/aceite do Club VIP não tem persistência: depende de decisão futura. Spec: `specs/club-vip-area-cliente.md`.
