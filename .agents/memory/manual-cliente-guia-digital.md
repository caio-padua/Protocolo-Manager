---
name: Manual do Cliente PaxMed (/guia-digital)
description: decisões do guia público e da aba COMUNICAÇÃO; o que os testes protegem
---
Manual vive na MESMA rota /guia-digital (identidade por ?tenant=, config.ts) e a aba COMUNICAÇÃO só linka para ele com o slug da clínica do cliente (GET /comunicacao devolve clinicaSlug; já não devolve código).
**Why:** pedido do CEO: sem segunda tela, sem código previsível, sem texto falso (senha de 6 letras, sem senha, estatística sem fonte).
**How to apply:** e2e/guia-manual-cliente.spec.ts guarda textos proibidos, links oficiais Telegram, seção "em preparação" sem preço, isolamento tenant A/B. e2e/guia-quota-diaria.spec.ts falha por mock defasado da tela /comunicacao/guia-paciente (pré-existente, não do manual).
