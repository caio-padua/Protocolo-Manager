# Retorno ao paciente com envio ainda aguardando resposta

## Objetivo
Comprovar o contrato de A → B → A durante o POST de envio de A, sem recuperar autorização nem reenviar automaticamente.

## Requisitos
1. Cobrir sucesso e erro tardios em `e2e/exam-request-idempotency.spec.ts`, tanto no cockpit real quanto na mesma instância pelo harness de testes.
2. Interceptar todas as APIs, usar somente pacientes, profissionais, documentos e credenciais sintéticos e manter o POST de A pendente até A ser reaberto.
3. Navegar sem recarga, comprovar B visível e então A visível antes de liberar a resposta. Comparar o nó do painel para distinguir remontagem de mudança de props.
4. Em B e no retorno a A, a seleção de documentos e a autorização devem estar zeradas; o envio permanece desabilitado. A preferência de canal na mesma instância não é autorização.
5. No cockpit, o painel original foi desmontado: nem recibo nem erro tardio devem reaparecer ao reabrir A. Consultar o histórico é a forma de conferir o envio.
6. Na mesma instância, o guard compara paciente e profissional atuais, não a geração da navegação. Ao retornar a A antes da resposta, o recibo de sucesso de A pode aparecer, ou o erro tardio de A com orientação de conferência. Isso não restaura documentos selecionados nem consentimento. O recibo é resultado da operação anterior, não prova de entrega nem permissão para repetir.
7. Após a resposta e uma atualização manual do histórico, exigir exatamente um POST no cenário inteiro. Nenhuma consulta automática da operação por POST, recuperação de consentimento ou reenvio é permitido.
8. No cockpit, exigir nova seleção de documento, canal e autorização; na mesma instância, exigir nova seleção e autorização, mesmo se a preferência de canal permanecer.

## Casos extremos e pronto
Respostas não podem ser escondidas por cancelamento do fetch. Observar mudanças transitórias no painel, esperar o processamento da resposta e os renders, e verificar o estado final. Os quatro cenários circulares e os testes existentes do arquivo devem passar.

## Linhas vermelhas
Não alterar o guard, o motor de envio, autenticação, APIs de produção ou persistência. O harness continua sendo uma entrada de teste, nunca uma rota publicada. Sem pacientes, credenciais ou provedores reais.
