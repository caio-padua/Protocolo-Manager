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
