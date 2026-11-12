---
name: Vínculo profissional×agenda tem três origens
description: A aba Vínculos do cadastro do profissional precisa ler titular + location_professionals + agenda_profissionais_preferidos
---
Uma tela que lê só uma das três tabelas de vínculo mostra "desvinculado" para quem é titular da agenda (caso real: Dr. Caio só aparecia na Sede).

**Why:** o CEO viu apenas SEDE marcada; a causa não era dado hardcoded nem divergência de API (auditoria deu 0 divergências), e sim a tela ler uma origem só.
**How to apply:** ao criar ou mexer em qualquer tela de vínculo, reutilizar `vinculoDoLocal` / `lib/agenda-vinculos.ts`; rodar `GET /api/agenda/auditoria-vinculos` para provar consistência; titular não se liga/desliga pelo cadastro do profissional.
