# Links de exame: situação, links novos e plano de migração

## Como é hoje (verificado no código e em leitura do banco de desenvolvimento)
1. O link legado é `/api/exam-requests/file/<48 hexadecimais>`. O token fica no caminho da URL e é aleatório (24 bytes).
2. Ele é validado só por existir na tabela `exam_request_pdfs`. Não tem validade nem escopo de pessoa.
3. A data de emissão existe: coluna `created_at`. Isso permite calcular a idade de cada link legado.
4. No banco de desenvolvimento há 41 documentos (16/06/2026 a 20/11/2026); 18 têm mais de 30 dias. Esse banco pode não refletir a produção.

## O que foi implementado (aditivo; nada apagado)
1. Link novo `v1`: assinado (HMAC), escopo "exame", amarrado ao documento e à pessoa, validade padrão de 30 dias. Não carrega dado clínico.
2. Revogação: colunas novas `revogado_em` e `revogado_por` (criadas só se não existirem). Rota `POST /api/exam-requests/:id/revogar` (colaborador autenticado, módulo de exames, só cliente da própria clínica). Vale para link novo e legado. O PDF não é apagado.
3. Respostas: vencido e cancelado devolvem 410; token adulterado ou de outra pessoa, 400; documento inexistente, 404. Cada tentativa é auditada sem guardar o token.
4. Emissão: continua gerando link LEGADO enquanto a variável `EXAME_LINK_NOVO` não for `1`. Nenhum comportamento de produção mudou.

## Limite que continua
O link enviado por WhatsApp ou e-mail precisa levar o token na URL (não há como mandar cabeçalho num clique). O ganho do link novo é validade, vínculo com a pessoa e revogação, não esconder o token da URL.

## Plano de migração dos links já entregues
1. Passo 1 (sem risco): ligar `EXAME_LINK_NOVO=1` em homologação e conferir um ciclo emitir, abrir, vencer, revogar.
2. Passo 2: ligar em produção só para novas emissões. Links antigos continuam funcionando.
3. Passo 3 (decisão operacional): escolher a validade dos legados. Opção A: legado vale 90 dias a partir de `created_at`; depois exige reemissão. Opção B: legado nunca vence, só revogação manual. Opção C: reenviar link novo aos clientes com documento recente e então expirar os legados.
4. Passo 4: antes de qualquer expiração de legado, listar quantos documentos seriam afetados (consulta de leitura em produção) e avisar a equipe.

## Decisão que depende do Dr. Caio
Qual opção do passo 3 (A, B ou C) e qual validade padrão dos links novos (hoje 30 dias). Sem essa decisão, os legados continuam sem validade.
