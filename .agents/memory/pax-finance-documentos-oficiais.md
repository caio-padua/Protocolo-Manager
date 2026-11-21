---
name: PAX FINANCE documentos oficiais
description: Upload por slot (CNPJ, certidão JUCESP, contrato) com extração determinística, sensíveis cifrados e aplicação confirmada.
---
- Um arquivo por slot; extração por `pdftotext -raw` (limpo); digitalizado vai por visão de IA e a transcrição passa por normalizarTranscricao (markdown/negrito/tabela) antes do mesmo leitor.
- CPF/RG/nascimento/endereço residencial ficam cifrados (cofre AES-GCM) e mascarados; revelar só CEO, auditado; texto enviado à IA sai mascarado.
**Why:** o CEO exigiu todos os dados importados, sem exceção, mas protegidos.
**How to apply:** dado novo = campo em ROTULOS (documentos-calc.ts); aplicar exige confirmação humana e recusa CNPJ/razão divergente; nunca apagar (substituir).
- Teste de PDF sintético: linhas largas são cortadas fora da página; quebrar em ~100 caracteres.
- Teste preexistente da fundação reclama de coluna cnpj em fin_related_party (não é desta entrega).
- Médico responsável técnico (clínico) NÃO é sócio, administrador nem responsável jurídico/financeiro: fica só no cadastro informativo (rtNome/rtCrm), com campo editável na tela. Nunca em fin_partner; papel responsavel_tecnico fora do enum de novas pessoas. **Why:** correção explícita do CEO. **How to apply:** não inferir papel societário de cargo clínico.
- CNAE: catálogo oficial IBGE (1.332) em fin_cnae_catalogo, semeado idempotente na 1ª consulta; saúde (≈81) vem primeiro, "outras áreas" por opção; empresa edita principal e secundárias e a mudança volta o cadastro a rascunho. Administrador = proprietária (dono_nome/responsavel_legal_nome), não o campo de profissional.
