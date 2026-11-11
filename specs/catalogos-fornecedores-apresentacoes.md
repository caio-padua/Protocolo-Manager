# Substâncias, apresentações e ofertas

## Objetivo

Permitir identificar fornecedores e fabricantes e associar até cinco ofertas
de aquisição ao cadastro correto, sem misturar dose ou forma e sem alterar
referências históricas.

## Regras

1. Preservar todos os menus atuais e acrescentar “Fornecedores e Fabricantes”.
2. Manter as fichas e identificadores existentes; nenhuma fusão automática.
3. Uma dose diferente exige cadastro separado; forma diferente, como ampola
   versus frasco, também exige cadastro separado. Conferir volume, via e
   composição; componentes permanecem um produto composto. A regra para
   fabricantes diferentes com os demais atributos iguais aguarda confirmação.
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

## Riscos e provas obrigatórias

| Risco | Proteção | Prova |
| --- | --- | --- |
| Duas apresentações homônimas | Identidade por composição e apresentação | Testes com doses e volumes diferentes e compostos distintos. |
| Concorrência ultrapassa cinco ofertas | Bloqueio da apresentação na transação | Gravações simultâneas em banco descartável. |
| Outra clínica acessa ou altera oferta | Autorização e escopo em toda leitura e gravação | Teste de duas clínicas e sessão ausente. |
| Custo vira valor cobrado | Campos e consumidores distintos | Comparar preços clínicos antes e depois. |
| Fusões mudam registros antigos | Sem alterações automáticas de identidade | Teste de protocolos e dados históricos preservados. |
| Tabela antiga apresentada como atual | Data e origem próprias em cada oferta | Teste de datas e aviso de valor histórico. |

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
