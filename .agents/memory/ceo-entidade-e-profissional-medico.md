---
name: CEO = entidade empresarial; interruptor Profissional Médico
description: Regra do CEO sobre quem assina documentos e como o cadastro médico dele entra no sistema.
---
O CEO da PaxMed é entidade empresarial. O cadastro MÉDICO dele (profissional) é outro cadastro: é só importado (somente leitura) na tela Identidade do CEO e liberado por um interruptor "Profissional Médico". Ligado: foto exibida = a do médico, e ele emite. Desligado: foto = a do CEO, e o médico do CEO não emite. Todo documento sai no nome do médico que fez o login; outros médicos nunca passam pelo interruptor.

**Why:** decisão do CEO em 18/11/2026; antes a capa e telas usavam um "médico principal" global.
**How to apply:** a trava fica em resolveClinicalEmitter (cobre receituário, exames, lembretes, protocolos); testes que mockam o banco precisam mockar lib/ceo-identidade. O código de receituário com "médico principal" fixo é legado comentado/interditado, não é rota viva. isPrimaryDoctor continua existindo (agenda/concierge/papéis) e não foi aposentado.

Limpeza feita: as rotas /settings/doctor-photo (foto antiga da capa) foram removidas porque nada as lia; o arquivo assets/dr-caio-photo.jpg foi preservado (Regra de Ouro). Os blocos legados comentados em receituario.ts e receituario-worker.ts são desabilitados e foram mantidos de propósito ("preservados para migração").
