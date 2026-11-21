---
name: Anamnese — seletor sem opções vira texto
description: pergunta LISTA/MULTISELECAO sem opcoes no banco cai para campo de texto; sexo vem do cadastro
---
Pergunta declarada como lista/múltipla escolha mas com `opcoes` nulo é desenhada como caixa de texto (controls.tsx degrada de propósito).
**Why:** o CEO notou que seletores "viraram texto escrito"; eram 8 perguntas sem opções no banco (Q012, Q013, Q014, A07, Q020, Q040, Q041, Q042).
**How to apply:** ao criar pergunta de escolha, gravar `opcoes` junto; `aplicarSeletoresFaltantes` (script aplicar-catalogo-integrado) só preenche onde está vazio. Sexo biológico vem do cadastro (não editável); identidade de gênero é pergunta própria. Opções propostas aguardam revisão clínica.
