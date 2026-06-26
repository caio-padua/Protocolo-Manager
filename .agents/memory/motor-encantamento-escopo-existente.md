---
name: Motor de Encantamento — muito da "visão nova" já existe
description: Antes de especificar grandes visões do CEO, verificar specs/ e rotas — boa parte já está especificada/parcial.
---

Regra: quando o CEO descreve uma "visão grande nova" do Motor de Encantamento, NÃO escrever spec do zero.
Primeiro varrer `specs/` e `artifacts/api-server/src/routes` + `lib/db` — muito já existe ou está parcial.

**Why:** na rodada de 25/06/2026, a "visão nova" do CEO (QR em documentos, link de pagamento, requisição
de exame, vídeo de IA) já estava majoritariamente coberta: QR já existe em PDF (lib `qrcode`),
"braços de pagamento" já têm coluna/seed/rota, requisição de exame e área do cliente já implementadas.
Lacunas REAIS eram poucas: captura de foto remota (sem UI), interface de assinatura remota,
módulo de vídeo IA (HeyGen/ElevenLabs inexistente), painel de ganhos/repasse do médico assistente.

**How to apply:** a spec certa nesses casos é de CONSOLIDAÇÃO/roadmap que aponta o existente e nomeia
só a lacuna, organizada em ondas com decisões — não duplicar specs irmãs. Roadmap vivo em
`specs/motor-encantamento-consolidacao.md`. Agente NÃO dá push GitHub (Art. 61); CEO sincroniza pela aba Git.
