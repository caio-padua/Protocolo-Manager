# Vínculo obrigatório na emissão de prescrições

## Objetivo
Impedir novas prescrições órfãs e recuperar vínculos históricos inequívocos.

## Diagnóstico
As duas chamadas a useEmitPrescription omitem clientId; o contrato aceita o
campo, mas a rota grava null e pula a sincronização dos lembretes.

## Regras
- Ambas as telas enviam o identificador selecionado.
- Antes de qualquer gravação ou envio, validar o identificador na empresa atual.
- Sem identificador, procurar CPF normalizado ou e-mail sem espaços externos e
  sem diferença de caixa. Exigir um único candidato; CPF divergente impede
  resgate por e-mail. Nunca casar nome.
- Vínculo ausente, inválido ou ambíguo retorna 422 com orientação visível.
- O identificador resolvido alimenta persistência, lembretes e alertas.
- Todos os dados de identidade/contato fornecidos precisam corresponder ao
  cadastro, mesmo com ID explícito; contato não cadastrado exige atualização
  do cadastro antes da emissão. Reenvio aplica a mesma regra e escopo de empresa.
- Backfill idempotente altera somente client_id nulo, dentro da mesma empresa,
  sem apagar dados ou disparar mensagens. Colisões ficam intactas e contabilizadas.
- Executar o backfill no banco de desenvolvimento e no post-merge; não acessar
  nem alterar produção nesta tarefa.

## Verificação
Testes do resolvedor (ID, CPF, e-mail, conflitos, isolamento e ausência),
build do servidor, execução do SQL em transação com fixtures e verificação
de contagens agregadas. Nenhum teste envia receita ou mensagem real.

## Resultado da verificação
- 18 testes do resolvedor aprovados, incluindo divergência de contato sem CPF.
- 4 testes HTTP aprovados: bloqueio antes de gravar/enviar, prescrição de outra
  empresa, CPF ambíguo e contato divergente no reenvio.
- Backfill no desenvolvimento recuperou 6 vínculos e preservou 3 não resolvidos.
- Fixtures SQL em tabelas temporárias confirmaram isolamento de empresa,
  normalização, colisões, preservação de vínculos existentes e idempotência.
- Servidor compilou e iniciou; POST real sem identificação retornou 422.
- Tela de prescrição renderizada; emissão real não executada para evitar
  envio de documentos e mensagens aos pacientes.
- Backfill conectado ao post-merge; nenhuma alteração em produção.
