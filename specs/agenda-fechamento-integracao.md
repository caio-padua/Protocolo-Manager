# Fechamento da integração da agenda

## Autorização e escopo
O responsável determinou concluir o trabalho iniciado: importação já concluída não será repetida como limpeza.
Google permanece somente leitura, inclusive no histórico; clientes, documentos e cobranças não serão alterados em testes.

## Entrega única
1. Consumir compromissos reais no motor existente, preservando blocos e percentual.
2. Bloquear toda a duração sobreposta, inclusive séries, exceções, dia inteiro e compromissos pessoais do titular explicitamente vinculado.
3. Bloqueio não é consulta: sai da capacidade vendável, não aumenta a ocupação clínica; bloco totalmente bloqueado não prende o bloco seguinte.
4. Oferta concierge não pode fabricar vagas quando o motor não libera.
5. Gravação e remarcação revalidam sob a mesma trava transacional usada pela atualização da origem.
6. Atualizar Google por leitura paginada e incremental; marcador expirado refaz leitura, nunca limpeza de sessões.
7. Persistir falha, última atualização e cancelamentos locais; nenhuma alteração ou mensagem no Google.
8. Expedientes e exceções só são gravados por proprietário autenticado ou concessão administrativa explícita da clínica; parâmetros globais permanecem exclusivos do proprietário.
9. Secretaria pode solicitar alteração exata de expediente; administrador autorizado aprova a solicitação persistida, não um booleano do navegador.
10. Reutilizar telas atuais; controles reais para atualização, titular pessoal e autorização; não abrir expedientes por suposição.

## Falhas e barreiras
| Risco | Barreira | Teste |
|---|---|---|
| Sobreposição parcial, almoço e dia inteiro | Intervalos semiabertos e expediente real | Motor determinístico com horários sintéticos |
| Série cancelada ou ocorrência movida | Originais preservados e exclusão do originalStartTime | Transformação sintética e projeção futura |
| Rede falha na última página | Só gravar lote completo e marcador na mesma transação | Provedor sintético com falha |
| Duas reservas na mesma vaga | Trava de agenda e reconsulta antes da gravação | Transação e regressão dos chamadores |
| Secretaria altera regra diretamente | Concessão verificada no servidor a cada escrita | Acesso negado, clínica errada, pedido já decidido |
| Aprovação aplicada a estado diferente | Comparação antes/depois na transação | Pedido desatualizado não aplicado |
| Título pessoal vazado | Resposta neutra para terceiros | Contrato e teste de privacidade |
| Origem indisponível | Estado explícito e recusa de novas reservas com cache vencido | Falha sintética |

## Critérios
Testes específicos, compilação das bibliotecas, inicialização dos serviços e captura da interface.
Teste de interface com respostas sintéticas não comprova login real nem escrita em serviço externo.
Revisão independente seguirá as ferramentas disponíveis; não presumir homologação.
