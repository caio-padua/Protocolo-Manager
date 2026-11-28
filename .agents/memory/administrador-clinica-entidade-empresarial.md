---
name: Administrador de clínica = entidade empresarial
description: categoria administrador_clinica no Corpo Clínico é o dono, não agendável, com campos profissionais apagados
---
Dono da clínica (categoria administrador_clinica) é cadastro separado do médico responsável (mesma pessoa, dois cadastros).
**Why:** o dono pediu campos profissionais "apagadinhos" para não gerar conflito com agenda e registro.
**How to apply:** formulário desativa tipo/categoria/especialização/áreas/conselho/registro/atendimentos/vínculos; POST aceita sem área (grava null); scheduling exclui a categoria; seletor empresarial só lista essa categoria.
