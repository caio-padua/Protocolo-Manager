# Substâncias, apresentações e ofertas

## Objetivo

Permitir identificar fornecedores e fabricantes e associar até cinco ofertas
de aquisição ao cadastro correto, sem misturar dose ou forma e sem alterar
referências históricas.

## Regras

1. Preservar todos os menus atuais e acrescentar “Fornecedores e Fabricantes”.
   O cadastro principal é a tela de Substâncias existente: acrescentar nela os
   campos, variantes e ofertas faltantes, preservando suas informações clínicas.
   Se houver outra tela de cadastro criada anteriormente, preservá-la visível no
   menu e manter ambos os pontos ligados aos mesmos dados, sem duplicar fichas.
2. Manter as fichas e identificadores existentes; nenhuma fusão automática.
3. Uma dose total diferente exige cadastro separado; forma diferente, como
   ampola versus frasco, também exige cadastro separado. Uma concentração
   diferente, por si só, não exige outro cadastro quando a dose total e a forma
   são iguais: os volumes e concentrações ficam em apresentações distintas
   dentro da ficha. Conferir via e composição; componentes permanecem um
   produto composto. Ofertas pertencem à apresentação exata, nunca a outra
   concentração somente por terem dose total igual. Fabricantes diferentes
   para uma apresentação idêntica usam a mesma ficha, com ofertas separadas.
4. Cada oferta pertence à apresentação, fornecedor e clínica autorizada.
   Máximo de cinco ofertas por apresentação, também validado no servidor.
5. Guardar custos por unidade e embalagem, quantidade, moeda, fonte e data;
   custos nunca sobrescrevem preços de venda, saldos ou lotes.
6. Permitir cinco linhas editáveis na ficha, com fornecedores reais em seletor.
7. Cadastro sem evidência mantém razão social, identificação fiscal e papel
   fabricante pendentes; Formedica é origem identificada, não fabricante presumido.
8. Confrontar as três tabelas quando chegarem; apresentação ou composição
   ambígua vai para conferência, sem importação automática.
9. A tabela Formedica de 2022 é histórica; diferenças como melatonina em
   miligramas versus unidades internacionais impedem conciliação automática.
10. Sem publicação, envio a terceiros, compra, alteração de estoque ou reinício
    de servidor potencialmente destrutivo.
11. Implantes absorvíveis e não absorvíveis (silásticos) são distintos; subtipo
    ausente não pode ser adivinhado. Composições ADEK diferentes não são
    agrupadas apenas por compartilhar o nome.

## Riscos e provas obrigatórias

| Risco | Proteção | Prova |
| --- | --- | --- |
| Duas apresentações homônimas | Identidade por composição e apresentação | Testes com doses e volumes diferentes e compostos distintos. |
| Mesma dose total, concentrações diferentes | Cadastro comum, apresentações distintas | Testar 100 mg em 2 mL e 100 mg em 4 mL sem trocar suas ofertas. |
| Concorrência ultrapassa cinco ofertas | Bloqueio da apresentação na transação | Gravações simultâneas em banco descartável. |
| Outra clínica acessa ou altera oferta | Autorização e escopo em toda leitura e gravação | Teste de duas clínicas e sessão ausente. |
| Custo vira valor cobrado | Campos e consumidores distintos | Comparar preços clínicos antes e depois. |
| Fusões mudam registros antigos | Sem alterações automáticas de identidade | Teste de protocolos e dados históricos preservados. |
| Tabela antiga apresentada como atual | Data e origem próprias em cada oferta | Teste de datas e aviso de valor histórico. |

## Cadastro de fornecedores — primeiro componente persistente

- Os fornecedores pertencem à clínica autenticada; nunca aceitar clínica enviada
  pelo navegador. Somente o proprietário da plataforma cadastra ou altera.
- Razão social, identificação fiscal, endereço, telefone, contatos, sítio e
  papéis de fornecedor e fabricante podem permanecer desconhecidos.
- Nome duplicado na mesma clínica, desconsiderando maiúsculas e espaços nas
  pontas, é recusado sem sobrescrever. Em outra clínica o cadastro é separado.
- Gravação e histórico são uma transação; edição usa versão para não sobrescrever
  mudanças simultâneas. Não excluir registros: inativar mantendo histórico.
- O histórico deve apontar ao fornecedor da mesma clínica por chave composta e
  ao profissional existente; a função interna também verifica profissional
  ativo e proprietário. A futura rota ainda deve validar a sessão e a clínica.
- Importações expressamente autorizadas pelo proprietário podem ser realizadas
  pelo agente; seu histórico identifica o agente e a autorização, sem registrar
  uma sessão médica que não existiu. Escritas pela tela mantêm o profissional.
- Esta etapa não cria ofertas, importa linhas, altera estoque nem afirma que uma
  empresa fabrica um produto. O acesso pelo menu depende das demais camadas.
- A próxima camada de acesso valida sessão e identifica clínica e profissional
  exclusivamente pelo contexto autenticado. Leituras e escritas de fornecedores
  são restritas ao proprietário; estrutura ausente devolve erro explícito.
- Testar sessão ausente, sessão de outra clínica, usuário sem gestão, duplicata,
  gravação, releitura, atualização concorrente e integridade da auditoria em
  banco descartável. Instalar no desenvolvimento apenas após validar a migração;
  não executar seeds, apagar cadastros ou publicar.

## Primeira etapa: leitura verificável das transcrições

O anexo de texto recebido é fonte de trabalho, não comprova por si só a exatidão
dos documentos originais. Preservar o texto de cada linha, os dados de preço e
embalagem exatamente como informados, sua origem e a data disponível. Validar
a aritmética das linhas Farmatec em centavos, sem concluir identidade clínica.
As demais tabelas não terão preço unitário calculado nem fabricante atribuído
por suposição. Uma linha com estrutura inválida ou preço incoerente interrompe
o processamento; não publicar uma contagem parcial como importação.

A preparação não grava o banco nem vincula ofertas automaticamente. A migração,
as permissões, a identidade clínica e as cinco ofertas por apresentação ainda
precisam de implementação e prova antes da carga efetiva.

## Enriquecimento autorizado das variantes Farmatec

O manifesto de 126 candidatos inclui identificador legado, nome e dose como
eram na leitura, mais dose total, volume, forma, vias, embalagem e custos da
fonte. A falta de forma e volume estruturados no cadastro legado não impede
uma nova variante documentada: a tabela pode fornecer esses atributos para a
própria variante, sem atribuí-los ao cadastro antigo nem presumir que todas as
suas apresentações anteriores sejam do mesmo fabricante.

Antes da gravação, conferir os dados do manifesto contra a transcrição original
da linha e conferir identificador, nome e dose do legado novamente na transação,
com bloqueio da linha durante a validação. Conferir homônimos, composição,
contradições e unicidade; separar somente os casos não demonstrados. Gravar
origem, página, linha, informação original de vias, embalagem e custos em
centavos, sem alterar estoque nem preço de venda. A data 29/09/2025 vem do
nome do arquivo e não prova preço vigente. A chave de origem é única por
clínica e documento; repetir a importação não duplica nem sobrescreve edição
humana. Não transformar a conferência de identidade em licença para apagar,
agrupar ou reclassificar registros históricos.

Exemplo obrigatório: identificador 202, ácido alfa-lipoico, 10 mg em 2 mL;
origem Farmatec, página 1, linha 5, ampola, caixa com 10, custo unitário
R$ 5,00 e caixa R$ 50,00. A ausência de apresentação estruturada no registro
legado deve continuar reconhecida; os dados pertencem à variante nova.
Relatar quantidades inseridas, atualizadas, ignoradas e pendentes com consultas
posteriores à gravação. A comparação atual em leitura mostrou 126 identificadores,
nomes e textos de dose exatos; isso não é gravação nem revisão semântica completa.

### Persistência de variantes e ofertas

- Variante pertence à clínica e ao identificador de substância legado; dose
  total, forma, volume e vias são próprios da variante. A identificação da
  origem não afirma o fabricante do registro legado.
- A oferta aponta para a variante e para o fornecedor da mesma clínica, com
  chave única de fonte por clínica, número de posição de 1 a 5 e unicidade da
  posição por variante. Assim o banco impede mais de cinco ofertas mesmo em
  concorrência. Cada posição é atribuída sob bloqueio da variante.
- A variante guarda concentração, composição e subtipo de implante quando
  conhecidos; valores ausentes nunca provam equivalência. Mudanças de variante
  e oferta devem ter histórico e versão, sem reatribuir vínculo silenciosamente.
  Página, linha, documento e embalagem original são armazenados na oferta.
- Valores de aquisição são centavos inteiros, sem acesso a campos de preço
  clínico ou estoque; registrar a embalagem, texto integral e origem. O custo
  histórico não é promovido a valor atual. A igualdade entre custo unitário
  multiplicado pela quantidade e custo da embalagem é uma verificação da
  transcrição Farmatec, não uma regra geral: embalagens podem ter desconto.
  Fontes novas não substituem
  automaticamente uma oferta revisada; importação repetida é ignorada e qualquer
  divergência da origem já gravada é encaminhada à conferência.
- Ler os itens do manifesto e confrontar cada campo com a linha da transcrição;
  bloquear o registro legado, validar novamente o identificador, nome e dose
  antes de inserir e impedir corrida. Se a apresentação legada trouxer dados
  estruturados contraditórios, ou for um composto, pedir conferência. Campos
  desconhecidos do legado não são alterados nem considerados confirmação da
  forma de todos os seus produtos.
- Guardar uma observação de que vias pertencem à fonte comercial e não
  autorizam prescrição ou agendamento; prevalece a decisão clínica existente.

## Identificação antes da reconciliação

O primeiro comparador recebe atributos explicitamente estruturados; ele não
extrai dose ou identidade clínica de nomes, porcentagens ou textos incompletos.
Nome não reconhecido como igual e dose, forma ou composição desconhecidas geram
conferência, nunca equivalência presumida. Mesma ficha não implica mesma
apresentação: para reutilizar uma apresentação, dose, forma, composição,
volume, concentração e vias precisam estar completos e corresponder. O
comparador não vincula produtos e não altera o banco.
Quando a concentração puder ser lida inequivocamente como quantidade por
mililitro de um produto de componente único, verificar também se concentração
multiplicada pelo volume corresponde à dose total. Contradição ou concentração
que não puder ser verificada impedem a identificação automática da apresentação.
As vias aceitas precisam ser códigos individuais conhecidos; delimitadores não
podem fazer uma única via parecer duas. Comparar quantidades de concentração
normalizadas, não a grafia de zeros ou espaços do texto.
Unidades inválidas e entradas com composição incompleta também exigem
conferência; a identificação automática requer uma declaração explícita de que
a composição informada está completa. O nome da substância também depende de
identidade confirmada na origem; palavras que indicam ausência e formas fora do
vocabulário reconhecido não provam identidade. Esse marcador precisa ser validado
pelo futuro fluxo autorizado; a função isolada não prova quem o confirmou.
