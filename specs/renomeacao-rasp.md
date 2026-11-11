# Renomeação de apresentação: RAS para RASP

## Objetivo

Exibir o nome RASP nas telas, documentos novos e comunicações, preservando a tipografia existente e o funcionamento dos registros anteriores.

## Requisitos

1. Onde o nome visível era RAS, apresentar RASP; onde era RAS FAP, apresentar RASP FAP.
2. Atualizar cabeçalhos e faixa lateral do documento físico, documento individual, nomes de novos arquivos, botões, telas, mensagens, assunto e anexo de e-mail.
3. Manter fonte, tamanho, peso, cor e organização visual; medir o texto adicional e evitar sobreposição.
4. Preservar rotas, chaves, tabelas, identificadores e contratos usados por registros e integrações anteriores.
5. Não editar arquivos anteriormente emitidos, dados de clientes, permissões, doses, reservas ou comportamento de envio.
6. Esta mudança de nome não acrescenta procedimentos ou consultas ao modelo clínico.
7. Preservar documentos jurídicos já emitidos e identificadores formais persistidos.
8. Atualizar os dois modelos jurídicos salvos encontrados, limitando a mudança aos três trechos de nome comunicados ao responsável; manter as demais palavras, o formato e os códigos internos.
9. No banco de desenvolvimento, conferir os modelos e suas impressões digitais antes da atualização, guardar uma cópia dos originais fora do controle de versão e atualizar os dois em uma única operação com proteção contra alterações simultâneas.
10. Na matriz de responsabilidades da equipe, apresentar RASP sem renomear a chave única usada pela semeadura e criar responsabilidade duplicada.

## Impactos e falhas previstas

| Falha | Consequência | Barreira e evidência |
|---|---|---|
| Substituição global de identificadores | Perda de acesso a registros, integrações ou histórico | Alterar somente textos apresentados; revisar diferenças e rotas existentes. |
| Título maior sobreposto às marcas | Documento ilegível | Preservar fonte e medir o texto nos cinco temas; renderizar documento sintético. |
| Nome antigo em comunicação | Inconsistência na emissão ou no reenvio | Testar corpo e anexos, nomes de arquivo, alertas e busca direcionada. |
| Visualização envia e-mail | Entrega não autorizada | Manter separação das rotas de consulta e envio; executar testes existentes. |
| Documento anterior alterado | Assinatura ou histórico comprometido | Não migrar nem reescrever arquivos anteriores. |
| Modelo jurídico mudou durante a conferência | Edição de terceiro sobrescrita | Exigir impressão digital esperada em ambos os modelos; se divergir, não alterar nenhum. |

## Critérios

- Testes isolados e de regressão de documentos, mensagens e separação de envio executados.
- Documento sintético gerado nos cinco temas com o novo título e a dose prescrita sem volume.
- Preservação da tipografia verificada no gerador e por inspeção visual.
- Limitações de teste autenticado e de revisão independente informadas sem declarar homologação indevida.
