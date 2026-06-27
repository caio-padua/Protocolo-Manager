---
name: Multi-local do medico (SP x Brasilia) + data bind de endereco no lembrete
description: Por que o quadro de Clinicas (locations) e central — agenda virtual por cidade/periodo e o endereco do local que entra automaticamente na mensagem ao paciente. NAO confundir com o SaaS multi-clinicas parado.
---

# Multi-local de atendimento + endereco no lembrete (regra de negocio do CEO)

Conceito explicado pelo CEO Dr. Caio (registrado em 27/06/2026):

O Dr. Caio atende em MAIS DE UMA CIDADE (exemplo: Sao Paulo e Brasilia), alternando por
periodo (uma semana/mes em Brasilia, outra em Sao Paulo). O quadro de Clinicas (tabela
`locations`, com endereco completo: cep/logradouro/numero/complemento/bairro/cidade/estado)
e a FONTE de cada local de atendimento.

**Como circula (o "sangue"):**

1. Marca-se uma agenda "virtual" amarrada a um local (agenda tem `agenda_resources` /
   `agenda_calendars` com `locationId`; `locations.googleCalendarId` espelha no Google Agenda).
2. A agenda do sistema mostra em QUAL cidade o Dr. estara em cada semana/mes; a administradora
   /secretaria geral supervisiona por ali (ve "Brasilia esta semana, Sao Paulo na proxima").
3. DATA BIND do endereco: o endereco do local daquela agenda entra AUTOMATICAMENTE na
   mensagem/lembrete ao paciente (mensageria + agendamento mandam link com endereco). Paciente
   de Brasilia recebe o endereco de Brasilia; quando o Dr. atende em Brasilia, a enfermeira de
   Brasilia faz as aplicacoes daquele periodo.

**Por isso o quadro de Clinicas NUNCA se aposenta.** Ele sustenta: (a) agenda multi-local,
(b) espelho no Google Agenda por local, (c) o endereco correto no lembrete de cada paciente.

**Why (erro a nao repetir):** numa varredura eu sugeri "aposentar /cadastros/clinicas como
possivel duplicata". Estava ERRADO — Clinicas e peca central deste conceito. A aparente
duplicacao entre `/cadastros/clinicas` e `/configuracoes/empresa` ("Empresa & Clinicas") e
questao de UX (unificar a porta), NUNCA de remover o cadastro de locais.

**Distincao critica:** isto e UM dono (Dr. Caio) atendendo em varios locais fisicos. NAO e o
SaaS multi-clinicas/RBAC por escopo que esta PARADO (ver `governanca-multiclinica-parada.md`).
Sao coisas diferentes; nao misturar.

**How to apply:** ao mexer em agenda, mensageria ou lembrete, garantir que o endereco do
LOCAL da agenda virtual va no texto/link ao paciente. Ao revisar menu, manter o quadro de
Clinicas. Confirmar com o CEO antes de mexer em locations.
