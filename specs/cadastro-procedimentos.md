# Cadastro de procedimentos

## Objetivo e limites

### Atualização automática de informações herdadas da substância

- Cada campo herdado deve registrar a apresentação exata e sua proveniência.
- Alterações no cadastro da apresentação devem refletir nos campos que
  continuarem vinculados a ela; um produto composto permanece uma apresentação.
- Alterações manuais não podem ser sobrescritas silenciosamente. A interface
  deve distinguir campo vinculado de campo personalizado e permitir voltar à
  origem de forma explícita.
- A dose sugerida alterada deve exigir nova conferência clínica antes de uso.
  Ausência de dados ou unidade ambígua nunca deve gerar valor fabricado.
- Produtos removidos, falhas de consulta, alterações simultâneas, uma alteração
  durante a edição e apresentações com nomes iguais exigem tratamento explícito.
- Protocolos, prescrições e documentos já emitidos preservam o conteúdo
  clínico registrado; não reemitir ou alterar documentos automaticamente.
- Testar o ciclo completo de alteração do catálogo e releitura do procedimento,
  persistência, vários procedimentos, várias clínicas, dose composta, entrada
  ausente, revisão manual e concorrência em ambiente isolado.
- Os campos atualmente copiados são nome, duração e dose. Identificar sua
  origem por apresentação e campo, sem inferir a origem de registros antigos.
  A leitura obtém o valor atual da origem; uma dose alterada ou ausente fica
  pendente de conferência, não autorizada para uso clínico. Os demais dados da
  apresentação continuam no cadastro original e são consultados pelo vínculo.
- No salvamento, verificar a origem e os valores dentro de transação; se a
  substância mudou desde a conferência, rejeitar com mensagem para rever. A
  retirada ou edição manual de um campo desliga apenas aquele vínculo. O estado
  anterior e os protocolos já emitidos permanecem preservados.

### Retificação de 11/11/2026: categoria, áreas de atuação e cargo

#### Regra obrigatória de Saúde

- As categorias exibem profissões: Médico, Enfermeiro, Farmacêutico e Biomédico pertencem à área de atuação Saúde.
- Saúde é obrigatória para essas categorias, sem impedir outras áreas de atuação.
- Associar Saúde aos profissionais do Instituto Pádua dessas categorias sem alterar categoria, cargo, acesso, agenda ou outros vínculos.
- Não reativar vínculos desativados anteriormente sem conferência; não inferir categoria de cadastros sem categoria.
- Para novos cadastros e alterações pela aplicação, apresentar Saúde automaticamente e validar a exigência no servidor.
- Se Saúde estiver ausente ou inativa no catálogo, impedir a gravação com mensagem clara.
- Farmácia pode ser cadastrada como categoria não médica, sem criar profissional, registro de conselho ou permissões.
- Testar criação e edição, múltiplas áreas, dados incompletos, a preservação de outras áreas e o isolamento entre clínicas.

O cadastro deve distinguir: categoria profissional (ex.: Biomedicina), áreas
de atuação (ex.: Saúde, Administrativo, Financeiro, Gestão), cargo e perfil de
acesso. Um profissional pode atuar em várias áreas. A escolha de uma categoria
ou área não altera automaticamente cargo nem permissões. A classificação antiga,
usada também pela autorização, permanece preservada.

Criar categorias no catálogo compartilhado existente, com autorização de
proprietário, evitando duplicatas por nome normalizado e sem criar profissionais.
Novas áreas de atuação e seus vínculos são aditivos; só uma ação explícita
de pessoa autorizada vincula áreas a um profissional. Não migrar nem inferir
áreas de pessoas já cadastradas. A categoria continua conectada aos consumidores
existentes, incluindo o cadastro de procedimentos, sem criar outra lista falsa.
Profissionais para procedimentos continuam filtrados por empresa e local.

Falhas previstas: confundir categoria com perfil de acesso; dupla criação
simultânea; apagar histórico ao trocar áreas; permitir escrita sem autorização;
exibir categorias ainda indisponíveis no servidor; presumir especialização que
não existe. Testar com banco descartável, duas clínicas e sessões sintéticas.
Nenhum dado clínico, profissional real, agenda ou evento é alterado em testes.

### Retificação de 11/11/2026: profissionais necessários

Regras informadas pelo médico: aplicação de substância em enfermagem; implante
em medicina e enfermagem; consulta e procedimento estético em medicina. São
regras de referência, não um botão de categoria chamado consulta. O formulário
oferece categorias profissionais reais e permite combinar pelo menos três
categorias distintas, com alternativas dentro de cada categoria.
Não escolher profissionais, local ou agenda sem confirmação; implante mantém
a validação existente no servidor.

Consulta é um procedimento, não uma categoria profissional. Retirar os cartões
fixos do formulário e não preencher silenciosamente a classificação antiga.
Cada necessidade registra área profissional ativa, local ativo pertencente à
empresa da sessão e uma ou mais alternativas profissionais ativas que possuam
vínculo explícito com o local e com a área. Alternativas do mesmo grupo são OU;
grupos diferentes são E. Mostrar as agendas efetivamente vinculadas ao par
profissional/local, ou ausência de vínculo. Não criar agenda nem reserva.

Preservar tipo histórico anterior; novos registros usam tipo antigo nulo. Não
deduzir área, autorização, agenda ou dose por nome, via ou concentração.
Dose textual separada pode ser sugerida apenas quando o campo de dose padrão
contiver quantidade e unidade de massa ou unidades internacionais inequívocas,
sem volume, razão, porcentagem ou múltiplos componentes; sempre revisável.
Ao editar, manter históricos de requisitos e preservar produtos originais.
Implante requer confirmação das áreas médica e de enfermagem, sem inferir pela
via intramuscular. Validar vínculos e autorização também no servidor, na mesma
transação. Um produto composto segue sendo um único produto.

Falhas impeditivas: gravação cruzada entre empresas; categoria ou local inativo;
profissional sem vínculo; dose confundida com concentração; alteração de
requisitos antigos por outro usuário; estrutura ausente; servidor antigo.
Provar com dados sintéticos e banco descartável; não reiniciar servidor que
executa sementes em dados existentes. A interface não deve alegar que está
integrada ao agendamento. O Corpo Clínico permite atribuir área existente;
criação de nova área não foi encontrada no cadastro existente.

Acrescentar a tela e a entrada de menu "Procedimentos" sem retirar, ocultar ou
alterar as entradas existentes. Procedimento descreve o ato; substância é o
produto já cadastrado. Consultas não exigem substância ou dose. As equipes não
são deduzidas da classificação atual: consulta é um procedimento, e um
procedimento médico pode precisar apenas de médico. A reserva conjunta fica
para outra etapa. Implantes precisam de
médico e enfermagem. Não inferir equipe pela via.

O cadastro novo é independente do fluxo de protocolo e agenda: não reserva
horários, não cria eventos, não muda o catálogo, não altera protocolos e não
afirma que essas integrações já funcionam.

## Dados e segurança

- Procedimento pertence à clínica identificada pela sessão profissional.
- A clínica efetiva é identificada na tela, inclusive quando a lista está vazia.
- Nome, requisitos profissionais explícitos, descrição opcional e duração obrigatória para
  procedimento ativo/agendável, em segundos inteiros, com edição em minutos.
- Ao vincular o primeiro produto, sugerir nome seguro e duração do cadastro
  apenas em campos ainda não editados. Nunca sobrescrever edição manual.
- Exigir confirmação da dose prescrita após selecionar produtos ou alterar
  a dose, inclusive quando a dose foi sugerida; sem dose, confirmar a ausência.
- Retirar dose, concentração e volume eventualmente presentes no nome sugerido;
  manter a identidade exata do produto e permitir procedimento sem produto.
- Guardar segundos em coluna aditiva; preservar a coluna antiga e os registros.
  Sem a estrutura nova, falhar com mensagem clara, sem converter dados antigos.
- Enviar a credencial da sessão atual nas chamadas protegidas de leitura e
  escrita, sem flexibilizar autenticação nem permissões. Conservar formulário
  em falhas de validação, sessão, rede ou servidor.
- A interface não deve gravar enquanto o servidor não confirmar suporte a
  segundos exatos; exibir pendência sem esconder a lista nem outros menus.
- Produtos associados por identidade exata do catálogo existente, sem cópia,
  e sem obrigatoriedade para consultas.
- Enquanto não houver procedimento cadastrado para um produto, o catálogo
  existente permanece navegável na própria tela: mostrar produtos como
  produtos, nunca como procedimentos já cadastrados ou agendáveis.
  A escolha explícita inicia o formulário com o produto exato e suas sugestões;
  nenhuma equipe, agenda, dose ambígua ou ato clínico é criada por inferência.
  Não substituir um formulário preenchido em andamento ao escolher um produto.
- Quando vários produtos são escolhidos, não sugerir uma única dose para todos.
  Ao retornar a somente um produto, recuperar a sugestão inequívoca desse produto,
  sem sobrescrever dose editada pelo profissional.
- Abrir os detalhes para distinguir apresentações homônimas; o vínculo salvo
  corresponde ao identificador escolhido e conserva os componentes do produto.
- Em produto composto, apresentar as quantidades na ordem dos componentes
  identificáveis no nome, separadas por sinal de adição e com as unidades
  originais de cada um. Não converter unidades nem presumir a dose administrada.
  Se algum valor, unidade ou ordem for ambíguo, não sugerir uma composição
  parcial. A dose sugerida deve ser conferida pelo profissional antes de salvar.
- Leituras exigem sessão e empresa autenticadas; escritas são restritas ao
  proprietário da plataforma, conforme a proteção do catálogo compartilhado.
- Toda edição filtra a empresa no servidor. Inativar preserva o registro e os
  vínculos; não há exclusão física. Não semear dados ou alterar registros antigos.
- O armazenamento é aditivo. Uma indisponibilidade do banco gera erro visível,
  não uma lista vazia apresentada como sucesso.

## Falhas previstas e provas

- Recusar entrada inválida, requisito profissional ausente ou produto inexistente.
- Recusar acesso sem sessão e acesso cruzado entre clínicas.
- Gravar procedimento e vínculos na mesma transação; falha não salva parcialmente.
- Testar criar, editar, consultar e inativar em banco descartável com dados
  sintéticos e verificar que produtos originais não são alterados.
- Verificar que todos os menus anteriores continuam no código e o novo endereço
  está protegido. Conferir a tela autenticada em computador e celular quando
  disponível; sem essa prova, não declarar homologação visual.
- Executar revisão independente após a construção, sem alterar regras da agenda.
- Cobrir segundos exatos, duração ausente, nome manual, produto de múltiplos
  componentes como único vínculo, criação autenticada e recusa sem permissão.
- Não reiniciar serviços com rotinas que escrevem dados, executar seeds, operar
  dados reais em testes, publicar, enviar mensagens nem iniciar o próximo bloco.
