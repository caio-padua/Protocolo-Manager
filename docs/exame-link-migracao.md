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

## Atualização: política de transição preparada (desenvolvimento; NÃO ativada)
Decisão delegada ao Dr. Caio: prazo de 90 dias contado da ATIVAÇÃO da política, não da emissão antiga.
1. Sem registro de ativação, nenhum legado vence (estado atual de produção, inalterado).
2. A ativação é explícita: `POST /api/exam-requests/politica-legado/ativar` com `{"confirmar":"ATIVAR_POLITICA_LEGADO"}`, só dono da plataforma. Grava data, prazo e autor em `app_settings` (chave `exame.link.legado.politica`). Só grava uma vez (segunda chamada: 409 e a data original é preservada). Consulta: `GET /api/exam-requests/politica-legado`.
3. Documento sem data de criação: o relógio dele é o da ativação, então nada é presumido. Registro ilegível = sem política (não vence ninguém por engano).
4. Sem endereço de contato: a reemissão nunca envia mensagem; o acesso novo só volta na resposta da sessão autenticada do próprio cliente.
5. Paciente autenticado: `GET /api/area-paciente/exames/documentos` (só os seus, sem código nem PDF) e `POST /api/area-paciente/exames/documentos/:id/acesso` (gera link novo de 30 dias; documento de outro cliente = 404; documento revogado pela clínica = 403).
6. Link vencido pela política responde 410 com orientação de entrar no aplicativo.
7. Correção de log: o endereço `/api/exam-requests/file/<código>` não era mascarado nos logs; agora é.

### Impacto e plano antes de qualquer implantação (isto não autoriza publicação)
| Passo | Ação | Quem | Risco |
|---|---|---|---|
| 1 | Publicar o código com a política desligada | Dr. Caio autoriza | Nenhum: comportamento igual |
| 2 | Consulta de leitura em produção: quantos documentos legados e quantos sem data | Agente, leitura | Nenhum |
| 3 | Avisar a clínica e orientar clientes a usar o aplicativo para reabrir exames | Dr. Caio | Mensagem real exige autorização |
| 4 | Ligar `EXAME_LINK_NOVO=1` em produção | Dr. Caio | Novos links passam a vencer em 30 dias |
| 5 | Ativar a política (POST acima). Começa a contar 90 dias | Dr. Caio | Após 90 dias, links antigos viram 410 |
| 6 | Antes do dia 90: reconferir contagem e decidir prorrogação | Dr. Caio | Prorrogar exige nova decisão e mudança de código |

Limitação: a política grava a data, mas não há rota de prorrogação nem de desativação (de propósito, para a data ser auditável). Reverter exige intervenção direta no banco, com ordem escrita.
