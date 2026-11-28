---
name: Cabine de Comando do CEO
description: Área /ceo/cabine com documentos persistentes, organograma calculado da regra real e documentação em docs/permissoes
---
Organograma lê o mapa de /api/ceo/permissoes/mapa, calculado de lib/papeis-acesso.ts (nunca digitar permissão na tela).
**Why:** evitar que o desenho diverja do servidor.
**How to apply:** mudou regra de papel => rodar testes e atualizar docs/permissoes/PERMISSOES-REFERENCIA.md (seções 4 e 9). Documentos: arquivo privado + tabela ceo_documentos; arquivar, nunca apagar. CEO = profissional id 6 em dev.
