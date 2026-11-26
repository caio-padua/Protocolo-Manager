# Permissões — Fatia 2: autorização no servidor por papel e clínica

Objetivo: o servidor nega (403) ou exige login (401) conforme o papel do profissional NA clínica da sessão.

## Regras
1. Papéis vêm de `professional_papeis_empresa` para (profissional da sessão, clínica resolvida pelo `tenantContext`). Nunca do corpo, da consulta ou do token.
2. Papéis da mesma clínica se somam; papéis de outra clínica não valem. Sem linha na clínica = negado (fail-closed). Falha de banco = 403.
3. CEO (dono da plataforma) mantém acesso total.
4. Rota protegida sem sessão = 401.

## Matriz (ler = GET/HEAD/OPTIONS; escrever = demais métodos)
| Domínio | Rotas | Ler | Escrever |
|---|---|---|---|
| Prescrição | prescriptions, prescription-formulas, prescription-protocols, receituario, sncr | médico | médico |
| Prontuário e sigilo | prontuario, mega-anamnese, exames-lab, exam-requests, exam-sets, evolucao-exames, exames-avulsos, cockpit, clinical-documents, atestados, encaminhamentos, dieta, treino, antropometria, nursing-assessments, clinical-context, radar-clinico, clients/:id/avaliacoes e fotos-corpo | médico, enfermagem | médico, enfermagem |
| Custos de fornecedor | fornecedores, fornecedor-catalogos, matriz-fornecedores, precificacao | administrador, financeiro | administrador, financeiro |
| Financeiro e notas fiscais | payments, financial-goals, reconciliation, pax-finance, asaas, budgets | administrador, financeiro, recepção | administrador, financeiro |
| Equipe | padteam (tudo); escrita em professionals e professionals/:id | administrador | administrador |

Exceções públicas por desenho: `/asaas/webhook`, `/exam-requests/file/:token`.

## Decisões pendentes (CEO)
- Administrador não médico fica SEM acesso ao prontuário (sigilo por padrão; o plano não diz).
- Profissionais sem linha de papéis (ids 9, 10, 11, 16, 18, 19, 20, 24, 25) ficam bloqueados nos domínios acima até receberem papel.
- Domínios fora da matriz (agenda, estoque, comunicação, orçamentos-catálogo etc.) seguem como antes; ficam para a auditoria.
