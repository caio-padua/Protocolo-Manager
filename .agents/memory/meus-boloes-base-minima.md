---
name: Meus Bolões — base mínima e regras de isolamento
description: Infraestrutura de bolão foi criada do zero (tabelas vazias); regras de download seguro e limites de escopo.
---
Meus Bolões vive dentro de /area (aba interna, sem item na barra inferior). Tabelas boloes_* nascem vazias, sem seed.
Download só de recibo real validado pelo titular; o sistema nunca gera bilhete.

**Why:** ordem do Dr. Caio: nunca fabricar comprovante, nunca afirmar aposta sem prova; venda, convite, cobrança, Asaas, apostas e números da sorte ficam desligados até comando explícito.

**How to apply:** status "registrada" só vale com comprovante ativo; download só por Bearer (nunca ?token=), 404 uniforme e auditado, auditoria antes dos bytes; posse conferida no SQL por cliente + empresa. Spec em specs/meus-boloes-area-cliente.md. Não confundir cotas com plano Prata/Ouro/Platinum/Diamond.
