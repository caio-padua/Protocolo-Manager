# Transferência das agendas e importação do arquivo

## Objetivo

Transferir a agenda existente e os dezesseis locais do Instituto Pádua para o
Instituto Paluzze; depois importar a agenda enviada para o Instituto Pádua.

## Requisitos

1. Preservar os compromissos e seus vínculos originais durante a transferência.
2. Não transferir prontuários, protocolos ou cadastros de clientes por inferência.
3. Após a transferência, a agenda antiga pertence ao Paluzze; a importada,
   ao Pádua, com suas cores originais.
4. As duas empresas não podem modificar o mesmo evento externo por acidente.
5. A importação precisa preservar eventos, datas, horários, fuso, recorrências
   e exceções, e deve poder ser repetida sem multiplicar compromissos.
6. Preservar os eventos da conta Google; a transferência não autoriza removê-los.
7. Restringir dados e operações à empresa e ao profissional autorizado. Não
   presumir que toda a equipe possa ver a agenda pessoal.
8. Registrar no cadastro do Pádua a conta Google solicitada e o identificador
   da sua agenda principal, sem confundir esse registro com importação ou
   visualização dos compromissos.

## Fontes e efeitos verificados

- Dezesseis locais estão vinculados ao Pádua no ambiente de desenvolvimento.
- O local Instituto Pádua é referência de 3.682 cadastros de clientes;
  outro local da transferência é referência de um cadastro. Transferir os
  locais sem ajustar os vínculos faria esses cadastros do Pádua apontarem para
  locais do Paluzze.
- Alguns locais possuem vínculos de profissionais não proprietários. O vínculo
  ao local pode conceder acesso à empresa à qual ele pertence.
- Existem 245 sessões da empresa, todas vinculadas a clientes e protocolos
  dessa empresa; 781 aplicações de substâncias estão ligadas a essas sessões.
- Cinquenta e oito sessões possuem identificador de evento Google; cinquenta e
  sete desses identificadores correspondem diretamente a eventos do arquivo.
- A agenda atual encontra calendários por nome do local sem filtrar empresa e
  pode escolher a conta Google primária quando nenhum calendário é informado.
- Alguns recursos de agenda não identificam empresa. Há rotas que criam,
  alteram ou removem eventos Google e que usam esses recursos.
- O arquivo enviado contém nove calendários e 3.475 componentes de evento.
  Um componente recorrente pode representar mais de uma ocorrência.

## Riscos e barreiras necessárias

| Risco | Barreira |
| --- | --- |
| Migrar sessões expõe prontuários ou protocolos de outra empresa | Separar propriedade da agenda e propriedade clínica; validar acesso nas duas. |
| Evento da transferência é o mesmo evento presente no arquivo | Isolar identidades e impedir escrita cruzada, sem apagar no Google. |
| Calendário sem empresa usa a conta primária por padrão | Exigir destino validado para cada empresa antes de qualquer escrita. |
| Calendário pessoal fica acessível a toda a clínica | Acesso restrito; não presumir autorização da equipe. |
| Importação repete eventos ou perde recorrências e exceções | Identidade estável por calendário, evento e ocorrência; testar reimportação. |
| O vínculo de profissional ao local concede acesso a outra empresa | Revisar os efeitos de permissão antes de alterar os vínculos. |
| Mudanças parciais deixam compromissos ou locais no lugar errado | Executar transferência apenas após as barreiras, com transação e conferência. |

## Pronto

- Os dezesseis locais e toda a agenda anterior aparecem no Paluzze.
- A agenda enviada aparece no Pádua com cores e eventos corretamente importados.
- Os dados clínicos continuam vinculados à empresa correta.
- Edição ou sincronização de uma empresa não altera a agenda da outra.
- Repetição da importação não duplica eventos.
- Verificação em ambiente isolado, confirmação dos dados e revisão visual
  demonstram o resultado sem alterar eventos reais durante os testes.

## Linhas vermelhas

Não apagar ou sobrescrever eventos do Google; não excluir dados; não alterar
clientes ou protocolos de empresa sem autorização específica; não modificar
`/api/budgets/calculate` ou o motor de cálculo.
