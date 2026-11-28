# Correção PAXTER — validação da identidade clínica no desenvolvimento

## 1. Objetivo

Eliminar o erro HTTP 500 de `GET /api/clinical-context/:clientId` causado pela ausência da tabela `clinical_access_grants` no banco de desenvolvimento.

## 2. Evidência observada

- O registro de cliente 11 pertence à unidade 8 e à empresa 5 no banco de desenvolvimento.
- A rota autenticada resolve o membro, a cliente e a unidade antes de falhar na consulta de `currentResponsibleDoctor`.
- A tabela `clinical_access_grants` não existe no banco de desenvolvimento.
- `scripts/migrations.sql` já contém a criação aditiva e os índices correspondentes.

## 3. Impacto e limites

- A ausência da tabela impede a validação e a leitura das permissões clínicas.
- A aplicação da migração cria somente a estrutura ausente; não altera clientes, médicos, empresas ou unidades.
- As novas permissões permanecem desligadas por padrão.
- Nenhuma permissão será concedida diretamente por esta correção.
- O banco de produção, emissões de documentos e mensagens a clientes ficam fora do escopo.

## 4. Falhas previstas e proteção

| Falha | Proteção |
|---|---|
| Aplicar no banco errado | Usar somente o banco Replit de desenvolvimento e confirmar os registros de escopo da unidade 8/empresa 5. |
| Conceder acesso por acidente | Executar apenas `CREATE TABLE` e índices; não inserir nem atualizar concessões. |
| Tabela criada, mas consulta continuar falhando | Confirmar tabela, colunas e índices no banco e testar a rota e os testes de identidade. |
| Usar o cliente ou a clínica do navegador como autorização | Preservar as validações do servidor e os vínculos explícitos existentes. |

## 5. Construção

Aplicar no banco de desenvolvimento somente o bloco idempotente de `clinical_access_grants` e seus três índices, conforme `scripts/migrations.sql`.

## 6. Verificação e aceite

1. Confirmar a existência da tabela e dos índices no banco de desenvolvimento.
2. Confirmar que a tabela começa sem concessões inseridas por esta correção.
3. Executar os testes existentes de identidade e emissão clínica.
4. Confirmar que não houve alteração de dados clínicos nem acesso ao banco de produção.
5. Só considerar o erro HTTP 500 resolvido; a liberação para emitir permanece condicionada às concessões clínicas e às regras globais existentes.

## 7. Resultado desta execução

- Tabela e três índices presentes no banco Replit de desenvolvimento; zero concessões inseridas.
- Cliente 11 permanece vinculada à unidade 8 e à empresa 5; o profissional proprietário está vinculado à unidade.
- `currentResponsibleDoctor(8, 5)` executou sem erro e retornou `null`, confirmando ausência de designação local.
- Matriz global permite prescrição e solicitação de exames para a função médica.
- Teste `clinical-prescription-routes.test.ts`: 12 testes aprovados.
- Nenhuma emissão, mensagem ou alteração de cadastro clínico foi feita.
- A revisão externa automatizada não estava disponível; foi feita conferência manual da migração contra o esquema e as regras de acesso.
