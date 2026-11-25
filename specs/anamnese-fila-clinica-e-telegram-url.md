# Proteção da fila da anamnese e endereço do webhook Telegram

## Objetivo
Restringir a fila de validação da anamnese a colaborador autenticado da clínica vinculada e registrar o webhook do Telegram usando `PUBLIC_BASE_URL` quando configurada.

## Requisitos
1. GET `/api/anamnese-portal/fila` exige colaborador autenticado e clínica resolvida a partir do vínculo profissional ativo.
2. A fila retorna somente sugestões ligadas a clientes cuja `empresa_id` seja a clínica autenticada.
3. POST `/api/anamnese-portal/sugestao/:id/decidir` exige as mesmas validações.
4. A decisão e a atualização dos itens só ocorrem quando a sugestão pertence a cliente da clínica autenticada; ausência ou outra clínica retorna 404 sem alteração.
5. O registro automático do webhook Telegram usa primeiro a origem HTTPS de `PUBLIC_BASE_URL`; sem ela, preserva o fallback existente para Railway e domínio de desenvolvimento.
6. Não acessar nem alterar dados clínicos reais, segredos, configurações de produção, domínio ou publicação.
7. Testar recusa sem autenticação e isolamento entre duas clínicas sintéticas.

## Falhas previstas e barreiras
| Falha | Barreira |
|---|---|
| Chamada sem sessão de colaborador | `requireCollaborator`; resposta 401 |
| Colaborador sem clínica ativa | resolução do vínculo autenticado; resposta 401/403 |
| Sugestão de outra empresa | filtro pela `empresa_id` do cliente; não listar e responder 404 ao decidir |
| Cliente sem empresa vinculada | não incluir na fila nem permitir decisão |
| `PUBLIC_BASE_URL` inválida ou sem HTTPS | falhar sem registrar webhook usando URL inválida |
| `PUBLIC_BASE_URL` ausente | manter o fallback de domínio já usado pelo sistema |
| Teste atinge banco compartilhado | testes usam banco PostgreSQL isolado e dados sintéticos |

## Critérios de pronto
1. Os dois caminhos da fila retornam 401 sem autenticação.
2. Clínica A vê e decide somente sugestões da clínica A; clínica B não vê nem altera os registros da clínica A.
3. A rota mantém o contrato de resposta para chamadas autorizadas.
4. O helper de URL Telegram seleciona `PUBLIC_BASE_URL` com HTTPS, rejeita configuração inválida e preserva fallback sem a variável.
5. Testes automatizados e smoke test local passam.
6. Nenhum deploy ou alteração de configuração de produção é feito.

## Limites
- Não republicar, trocar tipo de hospedagem, editar segredos ou alterar os painéis dos provedores.
- A revisão independente e a homologação ficam pendentes se o revisor dedicado estiver indisponível.
