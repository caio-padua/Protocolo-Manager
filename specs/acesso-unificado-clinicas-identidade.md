# Acesso unificado à identidade pelo cadastro de clínicas

## Objetivo

Permitir configurar a identidade da empresa a partir de Clínicas & Locais,
preservando a separação entre local de atendimento e empresa.

## Requisitos

1. Cada cartão mantém a ação visível Editar; a edição permite acessar a identidade da empresa vinculada.
2. O vínculo é obtido de fonte autenticada; nunca atribuir empresa por nome ou por padrão.
3. Empresa sem vínculo conhecido ou sem acesso apresenta aviso explícito, sem gravar ou escolher por suposição.
4. Utilizar o editor empresarial existente, sem copiar identidade; avisar que é compartilhada por seus locais.
5. Manter acesso, regras de permissão e indisponibilidade em produção da identidade de teste.
6. Organizar a navegação da edição e o cabeçalho sem rolagem horizontal; não ocultar campos, conteúdo ou erros.
7. Preservar salvar do local, formulário, agendas, identidade, dados existentes e histórico.
8. O trabalho não ativa o modelo de teste na emissão clínica nem altera receitas existentes.

## Impacto e falhas previstas

| Gravidade | Falha | Barreira e teste |
| --- | --- | --- |
| Crítica | Exibir identidade de empresa errada | Cruzar localização por identificador em resposta autenticada e bloquear ausência ou erro. |
| Alta | A troca de local mantém identidade anterior | Remontar editor por empresa e não reutilizar dados entre locais. |
| Alta | Confundir falha de rede com falta de vínculo | Mensagem distinta e opção de tentar novamente. |
| Alta | Salvar identidade aciona formulário de local | Ações de identidade são botões explícitos, sem submissão do formulário de local. |
| Alta | Campos inacessíveis em telas pequenas | Testar navegação em computador e celular, sem cortar conteúdo ou esconder erros. |

## Pronto

Testes de navegação, vínculo correto, erro de leitura, ausência de vínculo, isolamento, edição e regressão,
com dados sintéticos; captura nos tamanhos relevantes; revisão independente conforme as regras vigentes.
O fluxo real autenticado e o uso clínico só serão afirmados com evidência própria.

## Bloqueios identificados durante a construção

- O mecanismo de seleção e gravação de empresa para um local sem vínculo confirmado não foi implementado.
  O vínculo interfere em autorização clínica e um valor nulo também possui interpretação legada;
  a seleção não deve alterar esse comportamento sem revisão de impacto e testes de segurança.
- As seções foram divididas e a barra horizontal foi removida do cabeçalho empresarial,
  mas a rolagem vertical continua disponível em telas pequenas e em formulários extensos.
  Não considerar atendida a solicitação de eliminar todas as barras.
- A prévia automatizada não efetua autenticação real, e a revisão independente ainda não foi realizada.

## Correção pontual autorizada: consultório Lemos

Em desenvolvimento, transferir somente a empresa do consultório Lemos para
Instituto Lemos. A empresa e o cadastro do profissional permanecem separados:
o profissional continua no Instituto Pádua e mantém sua associação ao local,
conforme a proposta apresentada ao responsável, que decidiu manter o cadastro
profissional no Pádua. Antes de manter essa associação, é necessária decisão
explícita sobre a consequência de acesso encontrada na auditoria abaixo.

Antes de gravar, confirmar o local, as duas empresas ativas e independentes, a
empresa anterior, o profissional associado, a ausência de código semântico
emitido, de clientes associados ao local, de permissões clínicas e de atendimentos
para os recursos do local. Condições divergentes interrompem a operação.
Preservar agendas, sequências, profissionais, históricos e todas as demais linhas.
Não criar ou apagar empresas nem enviar mensagens, receitas ou cobranças.
Depois da mudança, conferir os dados de empresa, profissional, vínculo e agenda.
Essa correção não comprova isolamento completo nem altera a produção.

### Bloqueio de acesso entre empresas

O vínculo profissional-local é usado para autorizar a seleção da empresa do
local no contexto autenticado. A lista de clientes usa esse contexto para
filtrar por empresa e não exige a mesma concessão específica da prescrição.
Portanto, transferir o local mantendo o vínculo pode dar ao profissional acesso
à lista de clientes do Instituto Lemos, inclusive clientes futuros, ainda que
ele permaneça cadastrado no Pádua e não receba permissão de prescrição.
Não alterar o vínculo antes de explicar esse efeito e obter decisão específica;
não confundir nenhuma das duas permissões com isolamento integral comprovado.

Decisão do responsável: manter o cadastro do profissional no Pádua e permitir
que ele acesse a lista de clientes do Instituto Lemos por sua associação ao
consultório. Essa decisão não autoriza criar permissão de prescrição nem
atribuir acesso de outros profissionais.

### Resultado da correção pontual

- Ambiente de desenvolvimento: atualizada somente a empresa do local de 5 para 2,
  após conferir as condições dentro de uma transação; nenhuma linha foi apagada.
- Conferência posterior: local associado ao Instituto Lemos, profissional ativo
  ainda cadastrado no Instituto Pádua, vínculo profissional-local preservado,
  um recurso de agenda do local preservado e nenhuma concessão clínica local.
- As empresas permanecem independentes e não há vínculo na árvore empresarial
  envolvendo o Instituto Lemos.
- A associação permite selecionar a empresa conforme o código atual; o acesso
  autenticado do profissional e a interface após login não foram testados.
- Revisão independente não realizada; esta correção não homologa isolamento
  multiempresa e não ativa o modelo documental na emissão de receitas.
