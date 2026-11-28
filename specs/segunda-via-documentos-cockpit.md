# Especificação — segunda via segura de documentos do Cockpit

## 1. Objetivo

Permitir que um cliente solicite, acompanhe e receba uma cópia segura de um documento já emitido pelo Cockpit, pelo Telegram ou com apoio da equipe, sem alterar a emissão original.

O mesmo registro deve mostrar a solicitação, a elegibilidade, a cobrança quando aplicável, a revisão humana e o resultado da entrega.

## 2. Decisões confirmadas pelo CEO

1. Cliente em tratamento vigente tem direito à segunda via sem cobrança.
2. Cliente sem tratamento vigente não recebe segunda via gratuita.
3. A exceção PaxMed Members exige assinatura ativa verificada e pagamento em dia.
4. A autenticação no App do Cliente, um nível comercial ou uma alegação do próprio cliente não provam assinatura PaxMed Members.
5. Para cliente sem direito gratuito, a taxa administrativa inicial sugerida é R$ 15,00 e deve ser editável.
6. Não se cobra quando o documento original não foi encontrado e validado.
7. A fila deve exibir o valor cobrado, o estado do pagamento, a data de emissão original e a data da solicitação da segunda via.
8. Deve existir um controle próprio para exigir validação humana. Ligado, exige aprovação humana; desligado, permite liberação automática somente depois de todas as verificações obrigatórias.
9. A política de segunda via não reutiliza o controle de validação de exames.

## 3. Estado atual verificado

1. A tela “Pedidos dos clientes” (`/pedidos-medicos`) já trata pedidos pagos de receita e exames, mas a tabela `client_medical_requests` restringe os tipos a esses dois pedidos.
2. A Central de Auditoria registra comunicações; ela não é a fonte de verdade para cobrança, direito à segunda via ou entrega de documento.
3. O sistema já guarda documentos emitidos de receitas, pedidos de exames, atestados e encaminhamentos. Eles devem ser recuperados em seus bytes originais.
4. Protocolos e alguns documentos de tratamento são gerados para envio, mas o registro de emissão não guarda o arquivo original de maneira recuperável. Esses arquivos precisam passar a ser preservados antes de serem oferecidos para futuras segundas vias.
5. Documentos assinados têm estado e hash próprios; uma solicitação de assinatura pendente não é um documento emitido.
6. Não foi encontrada fonte implementada que comprove assinatura PaxMed Members e pagamento em dia. Até existir uma fonte verificável, o estado de Member é “não verificado”; o sistema não concede gratuidade, não cobra automaticamente e encaminha para conferência humana.
7. O fim da vigência é verificável somente quando o protocolo do cliente tem estado ativo, data inicial e data final válidas. Datas ausentes ou contraditórias resultam em conferência humana, nunca em cobrança ou liberação automática.
8. O estado operacional conhecido do webhook do Asaas não é evidência suficiente para confirmar pagamentos. A liberação paga exige consulta de leitura ao provedor ou outra confirmação verificável e registrada.

## 4. Escopo de documentos

O catálogo deve incluir todos os documentos clínicos destinados ao cliente que as ferramentas do Cockpit emitem:

| Tipo | Fonte original exigida | Regra de recuperação |
|---|---|---|
| Prescrição e receitas | Receita emitida vinculada à prescrição | Estado emitido, assinatura válida quando exigida, cliente e clínica iguais, arquivo e hash íntegros |
| Pedido de exames | Arquivo emitido do pedido | Cliente, clínica, profissional, estado e bytes originais conferidos |
| Atestado e encaminhamento | Arquivo emitido do documento | Estado emitido, profissional, cliente e clínica conferidos |
| Protocolo e RAS FAP | Arquivo exato gravado na emissão oficial | Não reconstruir a partir do protocolo atual; emissão antiga sem arquivo recuperável segue para equipe |
| Carta de Tratamento | Arquivo exato gravado na emissão oficial | Prévia não vale como emissão; salvar o arquivo antes de confirmar ou enviar |
| Documento assinado ou consentimento | Arquivo privado vinculado à solicitação concluída e ao hash assinado | Somente assinatura concluída; nunca liberar envelope pendente |

Os tipos presentes no inventário do Cockpit que não tenham uma fonte original imutável e verificável devem aparecer como indisponíveis para liberação automática e ser encaminhados à equipe. Não se cria uma cópia regenerada para preencher essa lacuna.

## 5. Fluxo do cliente

1. O cliente pede a segunda via pelo Telegram ou com ajuda da equipe.
2. O servidor identifica o cadastro pelo vínculo único do Telegram ou por uma sessão autenticada do próprio cliente; nome ou documento informado no texto não é prova de identidade.
3. O assistente localiza apenas documentos emitidos para aquele cliente e clínica.
4. Se houver mais de um documento possível, pergunta o tipo ou a data. Não escolhe o mais recente por conta própria.
5. O cliente vê o tipo do documento, sua data original e, quando necessário, a taxa aplicável antes de confirmar.
6. O servidor confirma a existência, estado, identidade, clínica e integridade do arquivo original.
7. Se for gratuito, o cliente confirma que deseja receber a cópia.
8. Se houver taxa, o cliente confirma explicitamente o valor antes de a cobrança ser criada.
9. O pagamento é confirmado por leitura verificável do provedor; aviso enviado ou cobrança aceita não significam pagamento.
10. Quando exigida, a equipe aprova a liberação.
11. O PaxMed entrega o arquivo por link privado de curta duração ou pelo canal seguro suportado.
12. O Cockpit registra o resultado como enviado, falhou ou incerto. Resultado incerto bloqueia repetição automática.

## 6. Regra de elegibilidade e cobrança

1. **Tratamento vigente:** protocolo do cliente no escopo da clínica, estado `active`, data inicial menor ou igual à data atual de Brasília e data final maior ou igual à data atual de Brasília. Qualquer campo necessário ausente ou inválido produz “conferência humana”.
2. **PaxMed Members:** só concede gratuidade quando uma fonte de assinatura verificada comprova estado ativo e pagamento atual. A fonte ainda não existe no código; até a integração, o caso fica em conferência humana.
3. **Sem direito gratuito:** pode haver taxa somente depois que um documento emitido específico foi encontrado, validado, apresentado ao cliente e aceito pelo cliente.
4. **Documento não encontrado:** não cobrar, não gerar boleto ou cobrança, não liberar; registrar a razão e encaminhar à equipe.
5. **Valor:** R$ 15,00 como valor inicial editável. O valor é copiado para o pedido no momento da confirmação e não muda retroativamente se a configuração for editada.
6. **Cobrança desativada ou fonte de pagamento indisponível:** registrar a solicitação para revisão; não simular pagamento nem liberar documento.
7. **Toggle de validação humana:** ligado por padrão. Desligá-lo remove apenas a etapa de aprovação humana; não remove identidade, escopo, consentimento, validade, integridade, verificação de Membership, confirmação do pagamento ou bloqueio de resultado incerto.

## 7. Registro e interface do Cockpit

1. Adicionar uma seção “Segundas vias” à tela “Pedidos dos clientes”, sem alterar ou remover o fluxo atual de receita e exames.
2. Mostrar filtros e estados separados para solicitação, direito gratuito, cobrança, pagamento, validação, entrega e resultado incerto.
3. Mostrar nome do cliente dentro do escopo autorizado, tipo e identificador interno do documento, data original de emissão, data de solicitação, valor congelado no pedido, estado do pagamento, responsável pela revisão e canal de entrega.
4. Permitir editar a taxa e controlar a cobrança, a segunda via e a validação humana mediante autorização de CEO confirmada no servidor.
5. Adicionar ao Cockpit do cliente o histórico das solicitações e entregas daquele cliente e da clínica atual.
6. Registrar alterações de configuração e decisões humanas com autor e data.
7. Nunca mostrar link privado, token, arquivo PDF ou dados de outro cliente na fila geral.
8. Guardar datas de exibição em horário de Brasília. A data original do documento não é substituída pela data de emissão da segunda via; a data da solicitação é um campo separado.

## 8. Arquitetura e limites

1. Usar uma tabela própria de solicitações de segunda via. Não ampliar a restrição de `client_medical_requests`, que representa outro fluxo pago.
2. Armazenar na solicitação apenas referências, datas, estados, hash e dados de auditoria necessários; não copiar o PDF clínico para a tabela de pedidos.
3. Guardar novas emissões oficiais de protocolo e Carta de Tratamento em armazenamento privado antes de confirmar o envio. Se a preservação falhar, interromper o envio externo.
4. Para documentos antigos sem arquivo original, encaminhar à equipe; nunca reemitir a partir do cadastro mutável.
5. Manter confirmação explícita do cliente, reivindicação atômica do pedido e idempotência para evitar cobranças ou entregas duplicadas.
6. Seguir a autenticação, o isolamento por clínica e a autorização profissional já usados pelo Cockpit.
7. Não chamar uma inteligência artificial para tomar decisão de direito, cobrança, assinatura, validade do documento ou aprovação clínica. A inteligência artificial pode reconhecer a intenção e conduzir a conversa, mas o servidor decide pelos dados verificados.
8. Desenvolvimento e testes não enviam mensagens, PDFs ou cobranças reais e não alteram configuração de produção.

## 9. Falhas previstas e barreiras

| Falha | Consequência | Barreira |
|---|---|---|
| Telegram ausente, duplicado ou trocado | Documento pode chegar a outra pessoa | Exigir vínculo único e atual antes de consultar e novamente antes de entregar |
| Cliente homônimo ou clínica diferente | Exposição de dados clínicos | Usar identificador interno e escopo da clínica; nunca buscar por nome aproximado |
| Vigência sem data final confiável | Cobrança ou gratuidade incorreta | Estado “conferência humana”, sem cobrança ou envio automático |
| Member sem assinatura ou pagamento verificável | Benefício concedido sem prova | Estado “não verificado”; sem gratuidade e sem cobrança automática |
| Documento ausente ou sem emissão comprovada | Cobrança por algo inexistente | Encontrar e validar o arquivo antes de apresentar preço ou criar cobrança |
| Arquivo alterado ou gerado novamente | Cópia pode divergir do original | Hash do arquivo original e recusa em caso de divergência |
| Aprovação humana desativada | Liberação indevida por configuração | Toggle nunca ignora as demais verificações; mudança fica auditada |
| Webhook não recebido | Pagamento pode ficar pendente | Consultar o provedor em modo de leitura; indisponibilidade mantém bloqueado |
| Resposta do envio perdida | Reenvio pode duplicar o documento | Marcar resultado incerto e exigir conferência humana |
| Operador de outra clínica acessa a fila | Acesso cruzado | Conferir clínica no servidor em cada leitura e ação |

## 10. Testes e evidências

1. Testar cada tipo de documento com dados sintéticos, cobrindo arquivo existente, ausente, alterado, não emitido e de outra clínica.
2. Testar tratamento dentro e fora da vigência, ausência de datas, Member verificado/pago e Member indisponível.
3. Testar preço editável, congelamento do valor no pedido, consentimento antes de cobrar e bloqueio sem documento válido.
4. Testar aprovação humana ligada/desligada e comprovar que desligá-la não ignora as demais travas.
5. Testar pagamento pendente, pago por consulta verificada, estorno, webhook repetido e indisponibilidade do provedor.
6. Testar confirmação do cliente, recusa, expiração, concorrência e resposta de envio incerta, sem transporte real.
7. Testar isolamento por cliente e clínica, autorização de CEO e registros de auditoria.
8. Conferir a interface da fila e do Cockpit do cliente em computador e celular. Não remover autenticação para obter captura.
9. Rodar testes focados, iniciar as aplicações alteradas e conferir os registros de execução.
10. Fazer revisão independente sequencial e fechar toda falha impeditiva antes de concluir.

## 11. Fora do escopo

1. Criar a plataforma ou a cobrança recorrente de PaxMed Members; esta tarefa somente consome uma fonte verificável quando ela existir.
2. Enviar documentos, cobranças ou mensagens a clientes reais durante construção e homologação.
3. Regenerar, editar, assinar ou substituir um documento já emitido.
4. Aprovar automaticamente conteúdo clínico, renovar tratamento ou recomendar dose por inteligência artificial.

## 12. Critérios de conclusão

1. Todos os pedidos e resultados da segunda via ficam visíveis na fila existente e no histórico do cliente.
2. Valor, data original e data da solicitação são distintos, editáveis onde permitido e preservados no histórico.
3. Regras de vigência, Membership, taxa, consentimento, pagamento e validação humana são aplicadas no servidor.
4. Nenhum documento é cobrado ou enviado sem original existente, identidade e clínica válidas.
5. Entrega automática só ocorre quando a validação humana está desligada e todos os demais controles passaram.
6. Arquivos originais são preservados com integridade e acesso privado; lacunas históricas são encaminhadas à equipe.
7. Testes, revisão independente, inicialização e verificação visual cumprem a seção 10.
