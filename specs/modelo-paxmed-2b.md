# Modelo PAXMED 2B para documentos clínicos

## Objetivo

Aplicar o modelo visual 2B, versão 1.1, aos documentos do Instituto Pádua,
sem alterar dados clínicos, assinatura, decisões regulatórias ou a marca de
outras clínicas.

## Requisitos

1. Cabeçalho com a arte fornecida do Instituto Pádua e títulos dinâmicos;
   rodapé com as três imagens em ouro escovado, endereço e paginação real.
2. Manter as imagens proporcionais, transparentes e sem efeitos adicionais.
3. A margem inferior do conteúdo deve preservar 44 milímetros acima da base;
   os blocos clínicos e a assinatura nunca devem invadir o rodapé.
4. Páginas devem ser carimbadas uma única vez, depois da paginação e antes da
   assinatura digital. Não modificar o arquivo assinado.
5. O código de resposta rápida deve apontar para a cópia correta do documento
   assinado ou para página de verificação real, com controle de acesso.
   Endereço genérico ou fictício não comprova verificação.
6. A identidade do Instituto Pádua não pode ser aplicada a outras clínicas.
7. O modelo não deve ser ativado globalmente nem em produção; homologação em
   ramificação própria, com demonstração sintética explicitamente identificada.
8. Integrar também os demais motores clínicos identificados no pacote, após
   mapear seus consumidores e preservar assinaturas e regras regulatórias.
9. Testar documentos de uma, duas, três e dez páginas, texto comprido,
   assinatura, falhas de acesso e integridade após assinatura. A conferência
   física impressa e a leitura com dispositivo não serão alegadas sem execução.

## Impacto e riscos conhecidos

- A fábrica compartilhada também produz atestados e encaminhamentos: a opção
  de homologação deve ser explícita, não mudar esses geradores por padrão.
- Em 07/11/2026, o responsável definiu que o símbolo, o nome e o endereço
  pertencem à clínica e devem ser configurados em “Faixas do Receituário”.
  O Instituto Pádua deve usar esse mesmo caminho, como uma clínica licenciada.
  Não gravar sua identidade no modelo compartilhado de outras clínicas.
- Em 07/11/2026, o responsável esclareceu que o símbolo enviado pela clínica
  e o respectivo nome são substituíveis, mas devem assumir automaticamente o
  dourado do Modelo 2B. Preservar desenho e proporções da marca de origem;
  conservar o arquivo original e não deformá-lo ou redesenhá-lo.
- O responsável reforçou que a transformação não pode depender da cor de
  entrada: símbolos brancos, pretos ou coloridos devem receber o mesmo
  tratamento quando tiverem a mesma forma e transparência. Comprovar a cadeia
  de envio, salvamento do original e leitura tratada em ambiente isolado,
  confrontando pixels de entrada e saída e produzindo evidência visual.
- O envio atualmente aceita apenas arquivos PNG com transparência, até dois
  megabytes; imagens totalmente opacas ou com fundo incorporado não têm
  separação segura de forma e fundo e não devem ser declaradas convertidas.
  O teste de cor não equivale à aprovação visual do relevo escovado ou à
  integração com os documentos reais.
- O arquivo do cabeçalho recebido incorpora o símbolo e o nome do Instituto
  Pádua à imagem de fundo. O pacote não inclui o símbolo dourado isolado; há no
  projeto uma imagem isolada transparente do mesmo desenho enviado pelo
  responsável, adequada como original para aplicação da cor definida.
- Uma imagem sem transparência ou com fundo não identificável não deve ser
  transformada silenciosamente em um retângulo dourado. Orientar a pessoa e
  recusar o uso inadequado, sem remover o original nem simular sucesso.
- A tela atual salva sua configuração visual no modelo ativo compartilhado e
  o seletor de clínica não é persistido nessa configuração. Isolar identidade
  e autorização por clínica antes de disponibilizar a personalização real.
- Cadastro do Modelo 2B: identificação, endereço e referência ao arquivo
  original devem pertencer à unidade clínica e à empresa corretas. A edição
  exige profissional ativo com permissão efetiva de administração da unidade;
  uma categoria ou um identificador enviado pelo navegador não são prova de
  permissão. Cada gravação precisa preservar a configuração anterior até a
  nova imagem ser validada e armazenada com sucesso.
- Arquivos novos devem ser enviados diretamente ao armazenamento por endereço
  temporário, com controle de autoria da tentativa; o servidor valida os bytes
  recebidos antes de associá-los à clínica. A tentativa não pode usar o arquivo
  de outra clínica nem publicar arquivos privados em uma rota genérica.
- Verificações mínimas do cadastro: ausência de login, sessão expirada,
  clínica errada, permissão insuficiente, imagem inválida, arquivo ausente,
  falha de armazenamento, gravações concorrentes, atualização e recarga.
- A escolha expressa para acesso ao documento é login obrigatório. A sessão,
  o vínculo com a clínica, a permissão de visualizar o documento e a identidade
  do arquivo assinado precisam ser verificados no servidor. O código, por si
  só, não deve conceder acesso; compatibilidade de acesso para profissionais
  externos deve ser conferida antes da ativação.
- A rota existente de documentos de exames utiliza token e entrega o arquivo a
  quem o possui. Isso, por si só, não comprova o controle de acesso exigido
  para o novo verificador. A integração clínica não pode presumir equivalência.
- O receituário possui outro gerador e fluxo de assinatura; a alteração visual
  da fábrica não garante que o receituário real tenha sido migrado.
- A prova sintética pode mostrar espaço de verificação ainda não habilitado,
  claramente identificado; não pode apresentar um endereço falso como válido.
- O arquivo entregue após assinatura não pode ser regravado ou carimbado.
- É proibido enviar mensagens reais, alterar prontuários ou produzir documentos
  clínicos reais em testes.

## Estado atual

- Existe uma prova visual sintética para pedido de exames e um gerador alternativo
  de receita. A arte fixa do Instituto é usada somente nessa prova, nunca como
  identidade configurável de outra clínica. Nenhuma rota clínica ativa a prova.
- Em desenvolvimento, há um cadastro independente de identidade por unidade na
  tela de faixas; a imagem original do Instituto, seu nome e endereço foram
  configurados sem substituir configurações existentes. A imagem original está
  no armazenamento privado e o dourado é aplicado para exibição. A paleta foi
  amostrada do símbolo fornecido; não equivale a recriar o relevo da imagem.
- O cadastro e suas rotas ficam indisponíveis em produção. A identidade salva
  ainda não alimenta o cabeçalho e o rodapé dos geradores clínicos.
- Ainda não existe o código de verificação com login nesta implementação.
- A prova não contém assinatura digital, não é documento clínico e não demonstra
  a emissão pelo gerador principal de receituário ou pelos demais documentos.
- Houve testes automatizados com sessão e dados sintéticos simulados, conferência
  do registro de desenvolvimento e do original armazenado, e prova da tela com
  servidor simulado em computador e celular. O fluxo completo na tela com sessão
  real, a concorrência com banco isolado e o uso clínico ainda não foram provados.
- Em 07/11/2026, teste isolado percorreu a emissão de endereço de envio, envio
  de arquivo, gravação da identidade e leitura do símbolo para três entradas
  de mesma forma e transparência: preto, branco e duas cores. O banco e o
  armazenamento eram simulados; as imagens douradas retornadas tiveram pixels
  e transparência iguais entre si, e cada original foi preservado. Também foi
  testada a recusa de imagem com fundo totalmente opaco. Esses testes não
  comprovam o fluxo da tela autenticada real nem equivalência visual exata com
  o ouro escovado do modelo aprovado.
- A verificação física da impressão e a revisão independente ainda não ocorreram.
- A verificação de tipos geral do servidor está com erros anteriores fora dos
  arquivos alterados; não usar essa verificação como evidência de aprovação.

## Critérios para homologação

Todos os requisitos acima implementados e testados, isolamento por clínica,
prova visual e física em tamanho real, assinatura conferida e verificação
autorizada do documento correto, revisão independente e evidência vinculada.
Sem isso, manter estado **em construção**, sem ativação clínica.
