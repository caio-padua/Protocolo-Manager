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

## Direção solicitada — resumo clínico na mesma faixa de identidade

1. Usar uma única matriz azul para identificação e resumo: foto maior, nome e
   dados básicos à esquerda; resumo clínico à direita, na mesma altura.
2. Posicionar documento, nascimento, telefone e e-mail abaixo do nome. Reposicionar
   o seletor único fora do espaço reservado ao resumo, sem duplicá-lo.
3. Abrir e fechar as informações por controles horizontais, como uma cortina ou
   sanfona. Repetir o clique no mesmo controle deve fechá-lo.
4. Não incluir atalhos adicionais para abrir Protocolo ou Cadastro: a aba
   Protocolos e a ação Editar cadastro já existem.
5. Representar comorbidades, protocolo atual, adesão às fórmulas, pressão arterial
   e frequência cardíaca; preservar estados neutros para dados não consultados.
6. Manter visões para mensagens e imagens. A visão de imagens prevê fotos de frente,
   lado direito, lado esquerdo e costas, organizadas por data, adição pela equipe e
   envio pela Área do Cliente. Na prévia, nenhuma dessas ações altera dados reais.
7. Preservar a régua e todas as ferramentas existentes, o cliente selecionado e
   os controles acessíveis por teclado e por toque.
8. No computador, manter foto e nome na mesma posição vertical ao abrir ou
   recolher cada cortina. Ações equivalentes devem ter dimensões e acabamento
   consistentes.
9. Na prévia de imagens, representar a seleção de datas e o histórico sem criar
   datas fictícias; controles dependentes de registros ainda não consultados
   permanecem indisponíveis.

### Fontes localizadas e limites

| Fonte | Encontrado no código | Limite a verificar antes da integração |
| --- | --- | --- |
| IHE, ramo `ver-l2-dr-claude`, `FichaCockpit.tsx` | Rótulo “Comorbidades” | A ficha consultada contém opções demonstrativas e seleciona “Nenhuma” por padrão; isso não prova o estado clínico de uma pessoa. |
| IHE, ramo `ver-l2-dr-claude`, `monitoramentoPaciente.ts` | Acompanhamento por fórmula com categorias de aderência; sinais vitais por data e horários | Confirmar a versão em uso, os vínculos reais das fórmulas, a autorização e a correspondência segura de identidades entre sistemas. |
| Manager, `pulso-diario.ts` e `AcompanhamentoDiarioPanel.tsx` | Leituras de pressão por cliente, dia e período; a tela consulta leituras recentes | O esquema consultado não registra frequência cardíaca e o painel não calcula média de pressão. A captura de respostas pelo WhatsApp é indicada como futura no código; o valor padrão de origem não comprova o recebimento de mensagem. |
| Manager, `nursing-assessments.ts` | Avaliação de enfermagem com pressão, frequência cardíaca e adesão geral | São campos da avaliação de enfermagem; não há evidência aqui de acompanhamento por fórmula nem de medições domiciliares. |
| Manager, `TelegramPanel.tsx` | Histórico de mensagens por cliente | Montar o painel atual dispara a marcação como lidas; uma visão passiva não deve alterar esse estado sem considerar esse efeito. |
| Manager, `client-photo.ts` | Foto de perfil e histórico | Ainda não foi confirmada uma galeria clínica com ângulos e datas; não confundir foto de perfil com fotos de acompanhamento. |

### Cuidados da futura integração

- Identidade, permissão e isolamento por clínica devem ser verificados em cada
  consulta; números de identificação de sistemas diferentes não são prova de
  que se trata do mesmo cliente.
- Não transformar doença sugerida, dado ausente, falha de consulta ou valor
  demonstrativo em diagnóstico confirmado ou resultado normal.
- Distinguir a média das medições de pressão ao longo de um período da pressão
  arterial média usada como medida clínica. Definir fonte, período, horário,
  quantidade de leituras e cálculo antes de exibir qualquer resultado.
- Fotos clínicas exigem acesso restrito, vínculo correto ao cliente, preservação
  de arquivos, data e ângulo. Não aplicar automaticamente o recorte quadrado da
  foto de perfil a fotos corporais.
- A prévia não confirma que dados, envios, imagens ou integrações reais estejam
  funcionando. A implementação requer especificação de contratos, revisão e
  testes de segurança e persistência em ambiente isolado.

## Direção solicitada — idade, classificação e plano

1. Imediatamente acima do nome, apresentar apenas “CÓDIGO CLIENTE: número”,
   preservando a tipografia e a posição da identificação. A idade em anos, meses
   e dias fica abaixo do nome, sem o rótulo visível “IDADE” e sem pontos separadores.
2. Abaixo da foto, mostrar um retângulo da mesma largura: um quarto à esquerda
   para a classificação interna de A a E e três quartos para o plano de adesão.
   A faixa mostra somente a letra e o nome do plano; descrições podem existir para
   acessibilidade, sem acrescentar rótulos visíveis.
3. O responsável definiu a classificação inicial E e o plano inicial Bronze para
   os clientes. A prévia ilustra esses valores somente em cadastros fictícios.
   Sem cliente selecionado, usar estados neutros. No sistema real, inicializar e
   persistir pelo fluxo autorizado, preservando valores já atribuídos; falha de
   consulta não pode ser apresentada como E ou Bronze.
4. O estudo dos Círculos PAXTER em `specs/acompanhamento-e-area-paciente.md`
   descreve Bronze, Ouro, Platina e Noir; a Vitrine Pública apresenta esses nomes
   em uma página demonstrativa. A apresentação, isoladamente, não comprova
   adesão ou pagamento de um cliente.
5. No IHE, o cadastro consultado possui `planoAcompanhamento` com Diamante, Ouro,
   Prata e Cobre, e atribui Cobre como padrão. Não equiparar automaticamente essa
   lista aos Círculos nem tratar o padrão como assinatura contratada.
6. A avaliação numérica existente em `client-ratings.ts` não comprova a regra
   comercial A a E solicitada. A progressão da nota poderá gerar descontos e o
   plano poderá oferecer privilégios. Critérios, valores e benefícios ainda não
   foram definidos; não inferi-los nem associar automaticamente nota e plano.
7. A integração futura da idade deve usar a data de nascimento autorizada e o
   calendário da clínica, com testes para nascimento ausente, inválido ou futuro,
   virada do mês, ano bissexto e aniversário. Não exibir idade incorreta como zero.
8. Na prévia, quem nasceu em 29/02 completa mais um ano em 28/02 nos anos não
   bissextos. Essa é a convenção do cálculo demonstrativo, não uma política clínica
   aprovada; confirmar a regra apropriada antes da integração real.
9. Retirar a instrução “Abra uma seção; clique novamente para recolher” sob o
   resumo clínico, preservando a identificação geral de que a tela é uma prévia.
10. Retirar os títulos visíveis “CONTEXTO CLÍNICO” e “Resumo clínico” acima da
    grade e levar os botões para o espaço liberado. Preservar o botão “RESUMO”,
    o conteúdo das áreas, a identificação acessível e o aviso geral de prévia.

## Direção solicitada — abreviação do nome na faixa

1. Na prévia, mostrar o nome completo sempre que couber na largura disponível.
2. Quando não couber, abreviar os nomes pela inicial, começando pelo penúltimo
   e seguindo para a esquerda, até caber; preservar o último nome por extenso.
3. Preservar as partículas de ligação, como “de”, “da” e “dos”, sem tratá-las
   como nomes. Não alterar o valor cadastrado nem a identificação do cliente.
4. Se mesmo a forma abreviada não couber, manter uma única linha e indicar o
   corte com reticências. Manter o nome completo acessível ao leitor de tela,
   ao apontar e ao clicar ou tocar no nome, sem deslocar a faixa.
5. Recalcular ao trocar de cliente, alterar a largura ou terminar o carregamento
   da fonte. Aumentar o espaço deve permitir o retorno ao nome completo.
6. Conferir nomes curtos, longos, com acentos, partículas e uma única palavra,
   além de redimensionamento e troca de cliente, em dados fictícios. A prévia
   não conecta a regra ao cadastro real nem comprova sua integração ao sistema.

| Falha prevista | Proteção |
| --- | --- |
| Abreviar antes de ser necessário ou cortar o sobrenome | Medir o espaço real e preservar a última palavra |
| Ocultar a identidade completa | Exibir reticências e permitir consultar o nome completo sem alterar a faixa |
| Nome anterior após troca de cliente ou mudança de largura | Recalcular para o nome e para o tamanho atuais |
| Confundir demonstração com cadastro real | Manter o aviso de prévia e não gravar nomes |

## Direção solicitada — três visualizações com o mesmo cliente

1. Na prévia do Cockpit 2, manter as visões por abas e por telas e acrescentar
   a ficha contínua como terceira visão, sem substituir as propostas anteriores.
2. Reutilizar os painéis demonstrativos da ficha contínua já existente, com as
   doze ferramentas, abertura individual, expansão e recolhimento gerais.
3. A faixa superior, a régua e as três visões compartilham a mesma seleção;
   trocar ou limpar o cliente não pode manter a identidade anterior na ficha.
4. A ficha usa a largura disponível: em telas estreitas, seus conteúdos passam
   a uma coluna e os controles continuam acessíveis, sem mudar dados reais.
5. Respeitar os temas claro e escuro da prévia. Não sugerir que os campos
   demonstrativos consultam, gravam ou executam ações clínicas.
6. Conferir os três modos, os controles, a troca de cliente e a ficha em computador
   e celular. A integração com o aplicativo real permanece fora desta prévia.
7. A régua deve rolar apenas na horizontal para revelar a ferramenta escolhida.
   A rolagem vertical pertence à navegação até o painel; não pode ser desfeita
   quando a seleção ou o foco do teclado muda.
8. Destacar a ferramenta mais visível na ficha, inclusive quando o fim da página
   impede que o painel escolhido chegue ao topo da tela.

### Verificação da prévia em 09/11/2026

1. Seis testes determinísticos passaram para a abreviação de nomes.
2. Cento e cinquenta verificações no navegador passaram em cinco larguras,
   incluindo troca e limpeza de cliente, três modos e ficha em coluna no celular.
3. A navegação até Protocolos foi conferida no computador e no celular após a
   correção da rolagem; sete verificações de teclado também passaram.
4. A verificação geral de tipos do ambiente de prévias falhou em arquivos de
   outras prévias, `client-tabs/ModeloA.tsx` e `receituario-especial/AF1.tsx`.
5. Esta evidência cobre somente a prévia isolada. Não houve integração ao
   aplicativo real nem revisão independente; não há homologação da operação.
