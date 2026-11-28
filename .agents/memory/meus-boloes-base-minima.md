---
name: Meus Bolões — base mínima e regras de isolamento
description: Infraestrutura de bolão foi criada do zero (tabelas vazias); regras de download seguro e limites de escopo.
---
Meus Bolões vive dentro de /area (aba interna, sem item na barra inferior). Tabelas boloes_* nascem vazias, sem seed.
Download só de recibo real validado pelo titular; o sistema nunca gera bilhete.

**Why:** ordem do Dr. Caio: nunca fabricar comprovante, nunca afirmar aposta sem prova; venda, convite, cobrança, Asaas, apostas e números da sorte ficam desligados até comando explícito.

**How to apply:** status "registrada" só vale com comprovante ativo; download só por Bearer (nunca ?token=), 404 uniforme e auditado, auditoria antes dos bytes; posse conferida no SQL por cliente + empresa. Spec em specs/meus-boloes-area-cliente.md. Não confundir cotas com plano Prata/Ouro/Platinum/Diamond.

## Automação de comprovantes (14/11/2026)
Recibo entra em QUARENTENA (boloes_recebimentos), a IA só transcreve, o casamento é código determinístico (1 candidata = sugerida; 0 ou 2+ = fila humana). Só vira comprovante do cliente após aprovação humana ou regra automática por clínica, DESLIGADA por padrão. Pagamento (informativo), registro (exige comprovante ativo) e entrega são estados separados.

**Why:** o CEO proibiu documento fictício e presumir API/login da CAIXA; canal oficial ainda indefinido, amostras reais de recibo ainda não vistas.

**How to apply:** todo caminho de anexar passa por anexarComprovante (lib/boloes-gestao); gestor = admin da clínica via isGestorDaEmpresa; robô só vigia pasta do Drive configurada pela clínica (api-worker, 5 min). Spec em specs/boloes-comprovantes-automacao.md. Testes: boloes-casamento, boloes-gestao-banco-isolado (mockar boloes-leitura e clinical-access), e2e boloes-central-e-cliente.
