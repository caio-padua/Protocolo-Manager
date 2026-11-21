---
name: PAX FINANCE em espera
description: Decisao do CEO - PAX FINANCE so comeca depois que toda a anamnese estiver implementada; auditoria e sequencia ja prontas.
---
PAX FINANCE esta em STANDBY. Nao implementar nada ate o Dr. Caio dizer que a anamnese terminou.

**Why:** o CEO quer terminar toda a anamnese (V2, ponte com o motor, 3 etapas de IA) antes de abrir o financeiro.

**How to apply:** ao retomar, partir da auditoria de 20/11/2026 (somente leitura): ja existe Asaas (cobranca, NFS-e sem guarda local, conciliacao, transferencias), empresas com campos fiscais, ai_usage_log, exam_documents como molde de fila de documentos. Nao existe livro-caixa, contas a pagar, impostos, guarda de nota, leitura de documento financeiro, nem "Maia" no codigo.
Sequencia: 1 fundacao isolada (esquema fin_*, centavos inteiros, empresa_id) > 2 cadastro fiscal por CNPJ > 3 livro-caixa > 4 ponte Asaas somente leitura > 5 guarda de nota > 6 fila de documentos > 7 IA com modo protegido > 8 impostos > 9 telas > 10 spin-off.
Duvidas abertas: D1 mesmo banco com esquema proprio ou banco separado; D2 conta Asaas por CNPJ; D3 o que e "Maia"; D4 fornecedor de IA permitido; D5 quem valida regra tributaria; D6 NFS-e so via Asaas ou direta.
Risco: rotas financeiras atuais possivelmente sem filtro por clinica (verificar antes de reaproveitar); payments.amount e real.
