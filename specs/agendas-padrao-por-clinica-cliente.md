# Agendas padrão do cliente por clínica

## Objetivo
Oferecer uma agenda padrão de enfermagem e uma médica, selecionadas entre recursos reais ativos da clínica de origem, sem confundir empresa, local e agenda.

## Requisitos
1. Filtrar a lista de locais pela clínica selecionada e validar o vínculo no servidor.
2. Oferecer separadamente todas as agendas ativas da clínica com os tipos cadastrados `enfermagem` e `medico`; não inferir pelo nome.
3. Persistir uma escolha por tipo, ainda que as agendas pertençam a locais diferentes da mesma clínica, sem alterar a preferência múltipla já existente.
4. Para os clientes atuais do Instituto Pádua, preencher somente valores vazios com a agenda local de enfermagem e a agenda local do médico Caio Pádua confirmadas pelo responsável; preservar dados e preferências anteriores.
5. Permitir alterar e reler as escolhas; não reservar horários, criar eventos, alterar agendamentos nem mudar a empresa que protege o prontuário.
6. Não expor nem aceitar agendas de empresa não autorizada; clínica de origem diferente da empresa da sessão é informativa, não concede acesso a dados de outra empresa.
7. Falha de leitura, seleção desatualizada ou alteração simultânea deve preservar a escolha anterior e comunicar o problema.
8. Guardar os padrões da clínica para sugeri-los em novos cadastros, sem fixar identificadores ou nomes no código.

## Falhas previstas
* Recurso desativado, tipo incorreto, local de outra clínica ou acesso sem sessão: recusar gravação.
* Alteração concorrente de clínica ou das agendas: recusar com conflito e solicitar recarga.
* Trocar a clínica com vínculos antigos não deve apagar nem transferir escolhas silenciosamente.
  Quando forem incompatíveis, o cadastro informa e permite limpar explicitamente os campos e as preferências anteriores.
* Opções em cache após troca de sessão ou recusa de acesso não devem ser exibidas; a leitura precisa ser novamente autorizada.
* Qualquer alteração de uma das agendas compara também a versão conhecida da outra.
* Dados reais recebem apenas preenchimento explicitamente autorizado e transacional; testes com banco isolado.

## Pronto
Campos disponíveis na criação e edição; listas e gravação validam clínica e tipo; escolhas resistem à releitura; clientes elegíveis preenchidos com preservação de dados anteriores; testes e revisão independente; tela conferida em computador e celular.

## Limites
Não alterar o cálculo de orçamento ou os motores de agenda, nem excluir menus, clientes, escolhas existentes ou compromissos.
