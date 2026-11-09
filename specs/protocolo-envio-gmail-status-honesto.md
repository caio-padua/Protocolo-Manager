# Protocolo: conexão Gmail e informação de entrega

Estado: em construção; não homologa agendamentos nem outros canais.

## Objetivo

Usar a integração Gmail existente do ambiente para consulta e envio, sem
interpretar falha de acesso como ausência de e-mail do cliente. Na emissão,
informar o estado real do Drive e o motivo conhecido de não enviar e-mail.

## Impacto

O transporte Gmail é compartilhado por documentos e avisos clínicos. Manter
o formato MIME existente, anexos, destinatário informado pelo chamador e retorno
honesto. Não adicionar reenvio automático: resposta perdida pode indicar entrega
já realizada. Preservar emissão, histórico e estados de auditoria.

## Falhas previstas e barreiras

| Falha | Barreira e teste |
|---|---|
| E-mail cadastrado e Gmail indisponível | Identificar serviço indisponível, não culpar cadastro. |
| Sem e-mail | Dizer que falta cadastro, sem tentar envio. |
| Resposta de envio perdida | Não repetir automaticamente; resultado incerto. |
| Provedor recusa ou retorna erro | Não informar sucesso; registrar motivo seguro. |
| Drive falhou | Não dizer que o arquivo foi salvo. |
| Anexos ausentes ou MIME alterado | Testar encaminhamento do conteúdo e anexos existentes. |
| Conta Google diferente | Usar a integração configurada; não mudar conta por inferência. |
| Enfermeiro atribuído por acaso | Usar apenas o profissional indicado no protocolo ou na sessão, conforme o caso. |
| Via subcutânea confundida com endovenosa | Preservar a via cadastrada; não atribuir via desconhecida a endovenosa. |
| Convite com sessões não reservadas | Não enviar convite de calendário se alguma sessão não tiver recurso e duração reservados. |

## Homologação

Teste isolado de transporte e emissão, revisão independente, inspeção da tela,
verificação do serviço em execução e registros. Uma consulta ao perfil confirma
conexão, mas não prova entrega. Envio real só é comprovado após resultado da
operação autorizada; não repetir uma operação com resultado incerto.

## Pendências de segurança conhecidas

O histórico de envios ainda não distingue de forma estruturada uma recusa
de um resultado incerto, e os fluxos de reenvio não possuem a mesma reserva
durável usada para pedidos de exames. Não considerar o fluxo homologado até
tratar e testar esses estados, inclusive com chamadas concorrentes.
