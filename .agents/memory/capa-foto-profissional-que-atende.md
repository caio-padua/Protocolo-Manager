---
name: Foto da capa = profissional que atende
description: A capa de tratamento usa a foto do cadastro do profissional do protocolo, nunca uma foto global do CEO.
---
Decisão do CEO (18/11/2026): a tela Médico Responsável é identidade empresarial (CEO) e não define a foto da capa. A capa usa a foto do profissional do protocolo (professionals.photo_url); sem foto, a capa sai sem retrato, jamais com foto de outra pessoa.

**Why:** a foto global (arquivo dr-caio-photo.jpg) aparecia na capa de qualquer médico.
**How to apply:** novas capas/PDFs recebem professionalId e usam carregarFotoProfissional; o arquivo antigo e a rota /settings/doctor-photo foram preservados (Regra de Ouro), só sem uso na capa.
