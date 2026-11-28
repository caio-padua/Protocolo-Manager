# Prescrição: posologia fiel e acesso seguro ao documento

## Objetivo
Preservar a posologia produzida pelo fluxo clínico, evitar a repetição da
tomada na composição da fórmula e impedir o compartilhamento público de
prescrições não assinadas.

## Escopo desta etapa
1. A orientação fornecida pela prescrição é apresentada uma vez, sem inventar
   quantidade, frequência, duração ou horário e sem alterar o motor de lembretes.
2. O campo de dose não é anexado à lista de ativos quando já existe posologia.
   Uma dose que não puder ser reconhecida como repetição deve permanecer visível,
   pois ela pode conter uma informação clínica diferente.
   Se não existir posologia, conservar os campos de dose, via, frequência e período
   como uma orientação de contingência, sem duplicá-los entre ativo e orientação.
   Tornar o corpo mais legível, com respiro entre fórmulas, tipografia e cor
   consistentes para ativos e posologia, sem alterar o modelo ornamental ativo.
3. O acesso público ao arquivo da receita exige prescrição emitida e assinada,
   identificador aleatório válido, prazo vigente e integridade do arquivo.
   Receitas sem assinatura permanecem acessíveis apenas pelo caminho autenticado.
   A versão sem assinatura não deve imprimir um código que promete abrir a receita.
4. Não modificar receitas já assinadas, dados de clientes, lembretes, mensageria,
   domínios, envios externos, motor de desmembramento nem o cálculo de orçamento.

## Falhas previstas e barreiras
| Risco | Impacto | Barreira | Evidência |
|---|---|---|---|
| Dose duplicada no PDF | Orientação confusa | Uma apresentação por campo clínico | Teste de mapeamento com e sem posologia |
| Receita sem assinatura acessível publicamente | Documento não autorizado pode ser apresentado | Checar estado e assinatura da prescrição associada | Teste de link assinado, não assinado e ausente |
| Alterar mensagem ou agenda | Consequência clínica fora do escopo | Não mudar os dados nem o sincronizador | Revisar alterações e executar testes |
| Perda de dose quando não há texto de posologia | Instrução incompleta | Contingência fiel dos campos fornecidos | Teste específico |
| Documento de teste confundido com receita real | Risco clínico | Somente dados sintéticos em testes isolados | Sem emissão real ou envio |

## Critérios de conclusão
- Os casos documentados passam em testes isolados de regressão e acesso.
- Nenhum arquivo clínico existente é reemitido ou sobrescrito.
- Revisão independente e aprovação visual da nova aparência permanecem necessárias.
- A extensão para pedidos de exames e demais documentos depende de um inventário
  dos geradores, de autorização e identidade, de compartilhamento seguro e de
  verificação com certificado pessoal; não é considerada concluída nesta etapa.
