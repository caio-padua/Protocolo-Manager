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
- O arquivo do cabeçalho recebido incorpora o símbolo e o nome do Instituto
  Pádua à imagem de fundo. O pacote não inclui o símbolo dourado isolado:
  seu recorte ou reconstrução não deve ser confundido com a arte original.
- A tela atual salva sua configuração visual no modelo ativo compartilhado e
  o seletor de clínica não é persistido nessa configuração. Isolar identidade
  e autorização por clínica antes de disponibilizar a personalização real.
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
- Ainda não há cadastro isolado de identidade na tela, nem carregamento do
  símbolo do Instituto, nem código de verificação com login nesta implementação.
- A prova não contém assinatura digital, não é documento clínico e não demonstra
  a emissão pelo gerador principal de receituário ou pelos demais documentos.
- A verificação física da impressão e a revisão independente ainda não ocorreram.
- A verificação de tipos geral do servidor está com erros anteriores fora dos
  arquivos alterados; não usar essa verificação como evidência de aprovação.

## Critérios para homologação

Todos os requisitos acima implementados e testados, isolamento por clínica,
prova visual e física em tamanho real, assinatura conferida e verificação
autorizada do documento correto, revisão independente e evidência vinculada.
Sem isso, manter estado **em construção**, sem ativação clínica.
