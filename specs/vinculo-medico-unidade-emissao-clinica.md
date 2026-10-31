# Especificação — Vínculo clínico do médico principal à unidade

Data: 31/10/2026
Estado: VÍNCULO APLICADO; VALIDAÇÃO NA SESSÃO AUTENTICADA PENDENTE

## Objetivo

Restabelecer a validação clínica do cadastro médico principal na unidade de desenvolvimento onde o cadastro selecionado está ativo, mantendo a autorização explícita por unidade.

## Evidência confirmada

- Existe exatamente um cadastro ativo que reúne as condições de médico principal e proprietário da plataforma.
- Esse médico e o cadastro selecionado pertencem à mesma organização.
- A unidade do cadastro selecionado está ativa e pertence à mesma organização.
- Não existe vínculo entre esse médico e essa unidade na tabela `location_professionals`.
- O serviço de emissão exige esse vínculo explícito; o papel global de proprietário da plataforma não o substitui.

## Execução registrada

- Foi criado exatamente um vínculo no banco de desenvolvimento, com a função operacional padrão da rota administrativa.
- A consulta posterior confirmou uma relação médico-unidade, organização coincidente e unidade ativa.
- Foi gravado um evento na trilha de auditoria do colaborador.
- A conferência sem exibir o registro confirmou número médico, conselho e unidade federativa válidos para a identidade atual.
- Nenhuma receita, solicitação de exame ou mensagem foi criada ou enviada.

## Verificação automatizada

- Execução de dois arquivos de teste: 19 aprovados e 5 reprovados.
- As cinco reprovações ocorreram no arquivo `prescription-signing.test.ts`; os testes receberam 401, 403 ou 500 onde esperavam outros estados.
- A causa dessas reprovações ainda não foi isolada. Portanto, este resultado não certifica a emissão completa.
- O teste automatizado não acessou nem assinou documento de cliente real.

## Requisitos e limites

1. Criar somente o vínculo ausente entre o cadastro médico principal existente e a unidade verificada.
2. Fazer a alteração apenas no banco de desenvolvimento.
3. Não alterar o cadastro médico, o cadastro selecionado, permissões de outras unidades, empresas ou clínicas.
4. Não modificar o bloqueio de segurança nem permitir que o navegador escolha ou conceda vínculos.
5. Não criar, assinar, salvar ou enviar prescrição ou pedido de exames durante esta correção.
6. Se a identidade continuar bloqueada após atualizar a tela, interromper e investigar a causa seguinte; não ampliar o acesso.

## Falhas previstas

| Cenário | Resultado |
|---|---|
| Médico, organização ou unidade não correspondem aos dados verificados | Não gravar vínculo |
| Vínculo já existe | Não criar duplicata |
| Banco não confirma vínculo único | Não declarar correção concluída |
| A validação clínica retorna outra recusa | Preservar a recusa e investigar o próximo bloqueio |
| Requisição de emissão é tentada durante o teste | Não executar documento nem efeitos externos |

## Definição de pronto

1. Uma única relação médico-unidade foi criada no desenvolvimento. **Concluído.**
2. Consulta posterior confirma o vínculo entre os mesmos registros. **Concluído.**
3. Nenhuma outra associação ou dado clínico foi alterado. **Concluído pela operação executada.**
4. O painel de identidade deixa de apresentar a recusa após nova validação, sem emitir documento. **Pendente: a sessão autenticada do usuário não está disponível para verificação automatizada.**
5. Revisão independente e homologação clínica completa. **Pendente.**
