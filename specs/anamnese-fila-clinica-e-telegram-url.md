# Opção A — proteção da fila da anamnese e endereço do webhook Telegram

## Objetivo
Restringir as duas rotas da fila a uma sessão válida de colaborador, manter o isolamento pela clínica vinculada ao profissional e registrar o webhook do Telegram usando `PUBLIC_BASE_URL` quando configurada.

## Requisitos
1. GET `/api/anamnese-portal/fila` exige `requireCollaborator` e vínculo ativo resolvido do token, sem aceitar empresa declarada pelo cliente.
2. A fila retorna somente sugestões ligadas, no banco, a clientes da clínica vinculada ao colaborador.
3. POST `/api/anamnese-portal/sugestao/:id/decidir` exige as mesmas validações.
4. A decisão é autorizada pelo vínculo entre sugestão e cliente no banco; outra clínica retorna 404 sem alterar sugestão nem itens.
5. O registro automático do webhook Telegram prioriza a origem HTTPS de `PUBLIC_BASE_URL`.
6. Em produção, a ausência de `PUBLIC_BASE_URL` permite somente o domínio permanente já configurado no Railway; nunca usa domínio temporário do Replit.
7. Em desenvolvimento, preserva o fallback do domínio temporário para facilitar a execução local.
8. Não acessar nem alterar dados clínicos reais, segredos, configurações de produção, domínio ou publicação.
9. Usar sessão assinada e banco PostgreSQL descartável nos testes; verificar 401 sem sessão, 200 com sessão autorizada e recusa entre empresas.
10. Testar a montagem da URL e manter coberto o segredo do webhook Telegram, sem chamar provedores externos.

## Falhas previstas e barreiras
| Falha | Barreira |
|---|---|
| Chamada sem sessão de colaborador | `requireCollaborator`; resposta 401 |
| Token expirado, profissional inativo ou versão de credencial antiga | validação do token e do registro ativo; resposta 401 |
| Colaborador sem clínica ativa | resolução do vínculo no banco; resposta 401/403 |
| Sugestão de outra empresa | filtro pela `empresa_id` do cliente; não listar e responder 404 ao decidir |
| Cliente sem empresa vinculada | não incluir na fila nem permitir decisão |
| `PUBLIC_BASE_URL` inválida ou sem HTTPS | falhar sem registrar webhook usando URL inválida |
| `PUBLIC_BASE_URL` ausente em produção | usar apenas `RAILWAY_PUBLIC_DOMAIN`; sem domínio permanente, não montar URL |
| Teste atinge banco compartilhado | teste usa banco PostgreSQL isolado e dados sintéticos |

## Critérios de pronto
1. Os dois caminhos da fila retornam 401 sem autenticação.
2. Clínica A vê e decide somente sugestões da clínica A; clínica B não vê nem altera os registros da clínica A.
3. A rota mantém o contrato de resposta para chamadas autorizadas.
4. O helper de URL Telegram seleciona `PUBLIC_BASE_URL` com HTTPS, rejeita configuração inválida e não usa domínio temporário em produção.
5. Testes automatizados provam as respostas e a assinatura/segredo do webhook segue validada.
6. Nenhum envio real, alteração de segredo ou configuração de provedor, deploy ou republicação é feito.

## Limites
- A opção B é somente um checklist de conferência; nenhum segredo é lido, exibido, criado ou alterado nesta execução.
- Não republicar, trocar tipo de hospedagem, editar segredos ou alterar os painéis dos provedores.
