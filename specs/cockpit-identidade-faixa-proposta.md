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
3. Manter o seletor de cliente existente, as abas e as ações Editar e Drive.
   Retirar o atalho de protocolo da faixa superior das propostas, preservando
   a aba Protocolos e o acesso ao seu gerador. Não remover ferramentas.
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

## Terceira visualização — ficha expandida inspirada no IHE

### Objetivo e escopo

1. Preservar as duas propostas já apresentadas e preparar uma terceira visualização.
2. No computador e no notebook, apresentar controles de demonstração para alternar
   entre abas, painéis e ficha contínua, preservando a seleção do cliente.
3. Na ficha contínua, mostrar ferramentas em blocos amplos, abertos e alinhados
   verticalmente, com conteúdo ilustrativo visível e identificado como prévia,
   não apenas cartões-resumo; permitir expandir e recolher os blocos.
4. Manter um único cliente selecionado em toda a demonstração.
5. A terceira prévia é destinada ao computador e ao notebook; no celular, informar
   essa limitação. A navegação do aplicativo real permanece inalterada.
6. Usar a linguagem visual Paxter e os componentes e ferramentas existentes como
   referência, sem inventar marca, dados clínicos ou funcionalidades conectadas.
7. A terceira visualização é uma prévia isolada, identificada como tal, com dados
   fictícios exclusivamente visuais e sem conexões ou alterações no aplicativo.

### Fonte consultada e limite de fidelidade

Foi consultada a versão do repositório Integrative Health Engine no ramo
`ver-l2-dr-claude`, em `artifacts/clinica-motor/src/components/cockpit/FichaCockpit.tsx`,
além de uma captura correspondente. A ficha organiza seções completas em coluna,
cada uma podendo ser recolhida; a prescrição inclui uma ferramenta extensa.
Há conteúdo demonstrativo nessa versão. Não foi confirmado que ela corresponde à
versão mais recente em uso no outro projeto.

### Falhas previstas e verificação

| Falha | Barreira na prévia |
| --- | --- |
| Trocar ou limpar o cliente e manter o anterior em outro bloco | Uma seleção compartilhada; sem cliente, todos os campos pessoais ficam vazios |
| Exibir cartões de atalho no lugar das ferramentas abertas | Conteúdo de cada bloco visível na própria seção expandida |
| Confundir dados fictícios ou controles demonstrativos com ação clínica | Identificação permanente da prévia e ausência de conexões reais |
| Comprimir a visão ampla no celular | Avisar que a prévia é destinada ao computador e ao notebook |
| Destruir a comparação solicitada | Preservar os quadros e componentes das propostas anteriores |
| Afirmar paridade exata com uma versão desconhecida | Identificar a versão de referência consultada e seu limite |

Conferir a apresentação em computador e celular e os controles de visualização,
expansão, recolhimento e seleção de cliente que existirem na prévia.
A integração das ferramentas, permissões e dados reais não é demonstrada por esta
etapa e não pode ser considerada homologada a partir da prévia.

## Ajuste aprovado — faixa deslizante e ações da identidade

1. Usar a régua deslizante aprovada no Cockpit 3 como padrão visual das ferramentas
   nas três propostas, com ordem e rótulos consistentes, seleção visível e acesso
   a todas as ferramentas quando não couberem na largura disponível.
2. Reorganizar Editar cadastro e Pastas do Drive em posições estáveis, com botões
   de mesmo tamanho e alinhamento vertical; sem cliente, as ações ficam indisponíveis.
3. Retirar apenas o atalho superior de protocolo nas propostas; manter a aba
   Protocolos e a entrada para o gerador. Não alterar a referência do sistema atual.
4. Na prévia, as ações informam que são demonstrativas e não alteram cadastros nem
   criam, compartilham ou acessam arquivos reais.
5. Na futura integração, Editar deve preservar a abertura da edição cadastral.
   Drive deve preservar a operação existente de estrutura de pastas: a rota também
   tenta criar uma planilha e pode compartilhar a pasta com o cliente.
6. O padrão aprovado é de apresentação. A integração no aplicativo real, suas
   permissões e o comportamento completo do gerador ainda exigem verificação própria.
