---
name: Agenda x Local — vocabulário da forma de atendimento
description: forma de atendimento = Sede/Online/Outro local; "remoto" abolido; cor única entre agenda e local; cartão único
---
Forma de atendimento da agenda: valores gravados local/online/externo, rótulos Sede/Online/Outro local. `locations.agenda_papel` usa os mesmos (sem "remoto"); constraint rejeita "remoto".
Cor: `agenda_resources.color` e `locations.color` são espelhadas pelo servidor nos dois sentidos (PUT da agenda e PUT do local).
Cartão de agenda único em `components/CartaoAgenda.tsx` (Agenda Configuração e aba Locais da empresa).

**Why:** o sistema tinha duas palavras (online na agenda, remoto no local) para o mesmo conceito; o CEO quer que agenda e local de atendimento nunca se confundam.
**How to apply:** ao criar tela ou rota de agenda, usar `lib/agenda-forma.ts`; calendários do Google ainda terminam em "- REMOTO", o sugeridor aceita os dois sufixos e devolve online. Migração 20261120 só rodou no banco de desenvolvimento; produção precisa dela junto das pendentes.

CEO insistiu (11/11/2026): agenda NUNCA se chama "local" na tela (aba do cadastro da empresa = "Agendas"); título dos campos é "Título agenda" (sem "da"); sem quebra de linha no cartão — largura da coluna da lista cresce para caber. Padrão 41 da skill de layout tem o desenho.

**Local externo (12/11/2026):** o rótulo da forma `externo` é "Local externo" (não mais "Outro local"), também na aba do cadastro da empresa. O CEO mandou renomear TAMBÉM as agendas e os calendários do Google para "... - LOCAL EXTERNO": o Google foi renomeado primeiro (renameCalendar na conta da clínica) e o sistema seguiu pela reconciliação (renomeia agenda e local, grava auditoria); o parser da reconciliação e o papel sugerido aceitam os dois sufixos (LOCAL EXTERNO e o antigo OUTRO LOCAL). Valor gravado `externo` não muda. O endereço do local externo deve ser escolhido no fechamento do protocolo (variável por atendimento), não fixo na Agenda Configuração — decisão do CEO, ainda a implementar.
