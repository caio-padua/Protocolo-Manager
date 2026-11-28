# SPEC 21 — PAXMED INDICA (programa de indicação para SOFTWARE; nome provisório)

Estado: FILA (NÃO IMPLEMENTADO). Registrada em 16/11/2026. Depende da SPEC 8 (identidade Member) e da SPEC 12/17 (assinaturas e preços).
Natureza: indicação de uso de SOFTWARE; nunca ato médico, consulta, exame, prescrição, medicamento ou encaminhamento clínico.
Regras desta SPEC: TUDO configurável e DESATIVADO por padrão. Valores são hipóteses sujeitas a margem econômica e a revisão jurídico-tributária; não são padrão implementado. O percentual de 50% foi retirado: o proprietário não se lembra da intenção original; ele não é regra, não gera repasse e fica só na conversa histórica como assunto não definido.

## 1. Modalidades
| Nº | Modalidade | Hipótese de benefício (rascunho, desligada) |
|---|---|---|
| 1 | Member para Member (link ou código voluntário, sem importar contatos) | R$ 10,00 de crédito para cada lado após confirmação do 2º pagamento; no máximo 3 bônus por assinante por ano |
| 2 | Clínica para clínica (pessoa jurídica que contrata licença) | R$ 200,00 de crédito de licença após duas mensalidades recebidas |
| 3 | Médico para médico (convite ao uso do SaaS B2B, com landing e origem) | Sem remuneração por ato médico; sem acesso a cadastro clínico |
| 4 | Clínica oferece Member aos seus pacientes | Trial configurável de 30 dias ou licença corporativa por assentos; proibida remuneração pessoal ao médico ou à clínica por adesão, encaminhamento ou venda de medicação, produto ou fórmula |
| 5 | Member para família (convite a novo usuário) | Conta independente; compra de plano opcional; nenhum acesso a conteúdo de terceiros |

## 2. Requisitos de sistema
Código de indicação único e com validade; atribuição de origem com opt-in; janela de atribuição configurável; estados convite, cadastro, pagamento, aprovado, crédito, cancelado; bloqueio de autoindicação, duplicidade, fraude e estorno; teto de desconto e custo máximo de aquisição; registro de consentimento; webhook Asaas idempotente (crédito nunca liberado pelo navegador); crédito de assinatura separado de qualquer comissão, que fica proibida por padrão para encaminhamento médico, exame, consulta, prescrição ou compra de medicamento. Sem dado de saúde em rastreamento; sem publicidade por condição médica; sem lista de prontuários a parceiros.

## 3. Telas
- Member: "Indique o PAXMED" (convites enviados, estados, créditos).
- Superadmin (PAXMED · NEGÓCIOS > Convites e Indicações): configuração das hipóteses (desligadas), KPIs de indicação, taxa de conversão, CAC, payback, receita líquida, churn e custo de incentivos, sem dado clínico.

## 4. Conformidade a verificar antes de qualquer liberação em produção
LGPD art. 11; Código de Ética Médica (Res. CFM 2.217/2018, arts. 68 e 69); Res. CFM 2.336/2023; Código de Defesa do Consumidor; normas tributárias. Nada aqui é afirmado como validado juridicamente.

## 5. Fluxo de teste (sintético)
Visitante abre `/member` -> cadastro independente de clínica -> e-mail validado em modo teste -> login -> painel -> convida por link -> convidado se cadastra com consentimento -> pagamento em sandbox/mock -> webhook validado cria crédito só se as regras (ligadas no teste) permitirem. Limites: sem e-mail real nem gateway real; o que for simulado é declarado MOCK.

## 6. Decisões pendentes
Valores de crédito, tetos, janela de atribuição, CAC máximo, contrato e tratamento tributário do crédito.
