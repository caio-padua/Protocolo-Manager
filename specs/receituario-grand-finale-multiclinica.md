# Receituário Grand Finale com identidade clínica variável

## Objetivo

Aplicar o modelo visual enviado ao receituário existente sem atribuir dados de
uma clínica ou profissional a outra pessoa.

## Contrato

1. A prescrição real, a demonstração e as continuações usam o mesmo desenho,
   sem criar outro motor para doses, fórmulas, roteamento ou autorização.
2. Nome, símbolo, endereço e contatos da clínica vêm da identidade empresarial
   do contexto clínico autorizado; nunca dos pixels da arte original.
3. O nome, registro e rubrica do emitente vêm do profissional autorizado.
4. Preservar integralmente o quadro atual de assinatura digital, tanto o visual
   quanto o funcionamento. Não substituir pelo quadro de exemplo da arte.
   A indicação de assinatura deve refletir o certificado e o resultado reais.
5. A assinatura criptográfica é feita depois de desenhar o documento completo;
   o arquivo não pode ser alterado após a assinatura.
6. Receituário comum e especial compartilham o modelo, mas preservam os campos
   obrigatórios e particularidades existentes de cada um. No especial, os
   quadros existentes do comprador e do fornecedor ficam lado a lado, ancorados
    na parte inferior da área do conteúdo, abaixo da faixa do certificado.
   Os quadros inferiores reproduzem a moldura dos superiores e a mesma faixa
   ornamental atrás deles, sem apagar os campos do comprador e da farmácia.
    O bloco atual do certificado permanece íntegro acima dos quadros na receita
    especial; no receituário comum, sua posição inferior não muda.
    Os quadros especiais e suas letras diminuem proporcionalmente, sem cortar
    campos, para liberar espaço às fórmulas; textos continuam legíveis.
    Se o conteúdo não couber na área disponível, continua na página seguinte.
    A amostra solicitada utiliza nome e símbolo oficiais do Instituto Pádua
    explicitamente; o motor não deve impor essa identidade a outras empresas.
7. Uma receita longa pagina sem perder textos e sem sobrepor o certificado;
   cada página identifica a clínica e o documento corretamente.
8. A falta de identidade válida, símbolo ou dados indispensáveis não pode
   substituir silenciosamente a clínica pelo Instituto Pádua.
9. Preservar os modelos históricos, as ferramentas e seus menus; não enviar,
   emitir ou gravar documentos reais para executar testes de regressão.

## Fontes e impacto

- Integração clínica: o identificador empresarial e o emitente vêm exclusivamente
  do contexto clínico autorizado; a identidade é carregada antes de qualquer
  gravação ou consumo de numeração. Ausência ou inconsistência deve bloquear.
- Identificar e preservar número regulatório, tipo da receita e acesso protegido
  ao documento, inclusive em continuações; assinar somente após toda a composição.
- A prova sintética permanece separada da operação: não retirar sua restrição
  para permitir assinatura ou dados reais. Criar caminho clínico explícito e
  testar isolamento de clínicas, assinatura e rotas antes de ativar.
- Bloqueio identificado: o motor antigo usa um endereço público diferente do
  acesso protegido da emissão principal. Não rotular essa consulta pública como
  protegida, nem ativar parcialmente um botão com modelo diferente de outro.
- O caminho experimental permanece restrito a testes até vincular empresa e
  emitente ao contexto autorizado, validar origem do acesso, testar as duas
  rotas e a demonstração e resolver os casos de numeração regulatória.
- Construir primeiro uma prova isolada, sem ativar o modelo em emissão clínica;
  só trocar as rotas após os testes de identidade, conteúdo e assinatura.
- O preenchimento das caixas de identidade deve caber integralmente; dados que
  excedam o espaço precisam de tratamento explícito, sem corte silencioso.
- A área útil da arte é menor que a do modelo anterior. Calcular paginação com
  os limites reais desta arte, inclusive na continuação e no receituário especial.
- Arquivo colorido: prova de referência, com dados pessoais de exemplo.
- Arquivo base e imagem: incluem nome e símbolo da clínica, marca d'água,
  rubrica e dados de um médico e código ilustrativo; não são neutros.
- Produtores: gerador de receita, rota clínica de prescrição e demonstração.
- Há também rotas de receituário que passam pelo motor de modelos, o qual
  escolhe entre duas renderizações; elas não podem ficar com outro visual.
- No motor de modelos, os valores fixos de clínica e endereço como alternativa
  foram removidos; verificar os demais caminhos e evitar substituição silenciosa
  por dados de outra empresa.
- Consumidores: visualização, documento assinado, histórico e entrega existente.
- Identidade: carregada pela empresa do contexto autorizado; a autoria continua
  ligada ao profissional validado e ao certificado correspondente.
- Não trocar dados persistidos, destinatários, validações ou contratos clínicos.

## Falhas previstas

| Gravidade | Falha | Barreira | Evidência |
| --- | --- | --- | --- |
| Crítica | Clínica ou médico da arte aparecem em outra empresa | Remover todos os pixels e textos específicos antes de compor dados reais | Documento de duas clínicas e profissionais distintos, inclusive marca d'água e rodapé |
| Crítica | Rubrica ou código de exemplo parecem assinatura real | Não incorporar imagem de exemplo; usar bloco existente de certificado e código real | Documento sem certificado e documento assinado sinteticamente |
| Crítica | Dados clínicos somem, se sobrepõem ou são cortados | Medir linhas e reservar assinatura e rodapé; paginar de forma segura | Fórmulas longas, múltiplas páginas e caracteres acentuados |
| Alta | Assinatura é quebrada após compor | Desenhar tudo antes da assinatura e verificar bytes finais | Verificação independente da integridade do arquivo |
| Alta | Arte não está disponível no ambiente de execução | Usar recurso persistente, versionado e validado; falhar explicitamente | Teste com recurso ausente e execução do pacote gerado |
| Alta | Receita especial perde campos obrigatórios | Preservar os campos do corpo já existentes | Comparar receita comum e especial |
| Alta | Teste altera prontuário ou envia documento | Usar dados sintéticos em ambiente isolado, sem serviços externos | Verificar ausência de chamadas de escrita ou envio reais |

## Pronto

Revisão independente sequencial, inspeção visual de todas as páginas e testes
isolados dos casos acima passam; demonstração e emissão utilizam o mesmo modelo;
nenhum nome, símbolo, assinatura ou código de outra clínica permanece na arte.
Na ausência dessas evidências, manter a emissão anterior e declarar bloqueio.
