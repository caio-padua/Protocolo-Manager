---
name: Exames — classificações e código semântico
description: Categorias/subgrupos/modalidades do catálogo vêm de tabela própria; código semântico de 5 blocos existe nos dados mas a tela de cadastro não o usa.
---
- Classificações (categoria, subgrupo, modalidade, material/setor) ficam em `catalogo_exame_classificacoes`, semeada dos valores já usados; desativar nunca altera exames. Criada sob demanda na rota, fora do Drizzle.
- Código semântico real (246 de 280 exames): `EXAM` + área(4) + grau(4: GBAS/GINT/GSOF/SGRD/GAMP) + abreviação(4) + sequência(4), guardado em codigo_semantico e b1..b4/seq. Nenhuma spec escrita encontrada; a tela de cadastro ainda pede `codigo_exame` digitado à mão.
- Existem 3 estilos de código coexistindo e categorias duplicadas por grafia; unificação depende de aprovação do Dr. Caio.
**Why:** evitar criar novo padrão sem decisão. **How to apply:** ler esta nota antes de gerar ou validar códigos de exame.

## Regra do código semântico recuperada (23/11/2026)
- Fonte oficial: planilha "Nomenclatura Universal PADCOM V4.0" (01_regra_universal.csv, repo IHE, ramo replit-agent): B1 domínio + B2 área + B3 grade + B4 nick + SEQ 4 dígitos. Estava só no IHE, nunca no Manager.
- Cadastro de exame novo agora gera o código no servidor (área + grade escolhidas; nick derivado do nome), sob trava de transação. Exames legados continuam com código digitado.
**Why:** o Dr. Caio pediu que o sistema gere o código após nome e classificação.
