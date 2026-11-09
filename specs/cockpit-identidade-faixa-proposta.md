# Cockpit da Consulta — proposta de faixa de identidade

## Objetivo

Apresentar o cliente escolhido uma única vez em uma faixa de identificação
clara e consistente ao longo das ferramentas do Cockpit da Consulta.

## Etapa autorizada nesta entrega

Criar uma proposta visual isolada, comparada com o cabeçalho existente, para
computador e celular. A proposta não altera dados clínicos, cadastros, permissões,
rotas ou o aplicativo real e não demonstra integração com o banco de dados.

## Referências verificadas

1. Imagem da Support Clinic fornecida pelo responsável: foto, identificação e
   contato agrupados no início do prontuário.
2. Cabeçalho e abas reais do Cockpit no Padcon Conect.
3. Uma versão do Cockpit do Integrative Health Engine, no ramo
   `ver-l2-dr-claude`: cabeçalho de identificação e ficha clínica em seções.
   Essa versão contém partes de demonstração, que não devem ser tratadas como
   funcionalidades reais nem copiadas como dados clínicos.

## Requisitos

1. A proposta deriva dos componentes existentes, sem apagar ou substituir a
   referência atual no quadro.
2. A identidade usa os campos comprovadamente disponíveis no contrato atual:
   nome, identificador, documento, data de nascimento, telefone, e-mail e foto
   quando existirem. Campos ausentes têm indicação neutra.
3. Manter o seletor de cliente existente, as abas e as ações Editar, Drive e
   Protocolo. Não introduzir um segundo seletor nem remover ferramentas.
4. Preservar a linguagem visual Paxter e priorizar leitura, contraste, alinhamento,
   clareza e navegação no computador e no celular.
5. Não apresentar um estado clínico como confirmado quando não houver fonte real
   para ele. A tela atual exibe "SEM ALARME" de forma fixa; a proposta não deve
   repeti-lo como se fosse uma conclusão clínica.
6. A prévia isolada usa apenas dados fictícios e identifica explicitamente que
   não altera nem consulta o cadastro real.
7. Na futura integração, preservar a identidade do cliente da rota, os controles de
   acesso e os impedimentos para trocar de cliente ou aba durante uma operação.
   Uma resposta tardia ou falha de acesso nunca deve exibir o cliente anterior.
8. A futura integração deve usar `photoUrl` quando houver foto, pois este é o
   campo exposto pelo contrato de cliente atualmente examinado.

## Falhas previstas

| Falha | Risco | Barreira |
| --- | --- | --- |
| Nome ou foto do cliente anterior após uma troca | Identidade incorreta | Preservar a identidade da rota e validar resposta antes de exibir dados |
| Indicador de alarme não ligado a uma fonte clínica | Falsa segurança clínica | Estado neutro ou ausência do indicador até existir fonte verificável |
| Dado pessoal ausente ou muito longo | Campo vazio, truncamento ou quebra do alinhamento | Rótulo fixo, valor neutro e tratamento de textos longos |
| Faixa alta ou controles inacessíveis no celular | Ferramenta clínica inacessível | Comparar e testar com largura de celular e rolagem funcional |
| Confusão entre prévia e sistema real | Conclusão incorreta de que a alteração está ativa | Identificar dados fictícios e informar que a integração é etapa posterior |

## Evidências para a etapa visual

1. Prévia da referência atual e proposta provenientes de componentes do projeto.
2. Capturas legíveis da proposta em computador e celular, sem erros de execução.
3. Inspeção de contraste, alinhamento, ferramentas visíveis e ausência de dados
   clínicos presumidos.
4. Informar separadamente que a aplicação real não foi modificada nem homologada.

## Linhas vermelhas

Não modificar motores de cálculo, prescrição, agendamento ou emissão.
Não excluir menus, telas ou cadastros. Não alterar dados reais nem enviar mensagens.
