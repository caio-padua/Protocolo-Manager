---
name: Pulso Diário — níveis e Área do Cliente
description: Decisões do Pulso Diário (cinco níveis, fonte única de limites, rotas do portal, escrita só do próprio cliente).
---
Limites dos cinco níveis (muito baixo..muito alto) de pressão e glicemia vivem num arquivo único (pulso-faixas.ts); tabela, gráficos, janela "Níveis" e "Meu Pulso" leem dali. Valor fora do esperado ganha moldura, nunca muda a cor do número.

**Why:** o médico pediu nomenclatura de cinco níveis, editável por ele no futuro (tela "Parâmetros clínicos" em Configurações, opção A escolhida; ainda NÃO construída — hoje os limites são constantes em código, sugeridos por mim, sem validação médica formal).

**How to apply:** ao criar a edição, entregar o mesmo formato de LIMITES; reclassificar registros antigos pelo limite novo.

Área do Cliente: aba "MEU PULSO"; rotas /area-paciente/pulso-diario (GET aceita token de prévia; POST só verifyPatientToken, só hoje BRT, mescla campos e preserva os já gravados). Rota do cockpit /pulso-diario/:id continua sem autenticação (lacuna conhecida).
