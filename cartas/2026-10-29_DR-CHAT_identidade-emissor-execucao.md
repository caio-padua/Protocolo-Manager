# Ao Dr. Chat e equipe - identidade do emissor clinico

Data: 29/10/2026.
Autor: Dr. Replit Paxter.
Estado: PRIMEIRA ENTREGA IMPLEMENTADA E TESTADA EM AMBIENTE DE DESENVOLVIMENTO; NAO HOMOLOGADA PARA ATENDIMENTO.

## Solicitacao

O proprietario autorizou corrigir a repeticao de cliente e medico no Cockpit,
com sincronizacao do GitHub para revisao independente.
Publicar esta carta nao significa envia-la a uma conversa externa, nem
receber aprovacao do Dr. Chat, Dr. Code ou Dr. Manus.

## Alvo da primeira entrega

Especificacao: specs/identidade-emissor-clinico.md.
Sessao autenticada -> profissional ativo -> vinculo com local/empresa ->
cliente autorizado -> contexto comum para receitas e pedidos de exames.
Nao aceitar nome ou registro enviados pelo navegador como autoridade.
Nao presumir UF profissional pelo endereco da clinica.

## Situacao antes das alteracoes

- Prescricao do Cockpit envia nome e CRM fixos.
- Pedido de exames aceita identificador profissional opcional do navegador.
- Sessao ja contem professionalId, mas emissoes nao o usam uniformemente.
- Contexto global de tenant ainda e legado; nao sera usado como prova de vinculo.

## Limites

Esta primeira entrega nao homologa certificado digital, assinatura, rascunhos
persistentes ou toda a plataforma multi-clinica.
Nao autoriza emissao real, mensagens, cobrancas ou publicacao em producao.

## 1. Conclusao para a revisao independente

1.1. Ha uma primeira correcao executada e verificavel; NAO foi declarado que o sistema inteiro esta pronto.
1.2. O pedido de revisao foi divulgado no canal Slack #padaxor-projeto:
https://padua-01.slack.com/archives/C0BLW5S7GQL/p1793304114902099 .
1.3. Isso NAO significa que o Dr. Chat, Dr. Code ou Dr. Manus receberam a carta na propria conversa, a leram ou a aprovaram.
1.4. A revisao independente do arquiteto da plataforma inicialmente reprovou a copia fixa de e-mail para um medico particular.
1.5. Removemos o destinatario fixo da chamada nova e o destinatario padrao do motor.
1.6. A revisao final ainda precisa ser confrontada com o commit definitivo desta carta.

## 2. Arquitetura implementada nesta entrega

| Camada               | Fonte autorizada                         | Verificacao ou saida                                     |
|----------------------|------------------------------------------|----------------------------------------------------------|
| Sessao               | Token do colaborador validado no servidor| Identificador do profissional, nao nome enviado pela tela|
| Profissional         | Cadastro no banco                        | Ativo, medico, CRM e unidade federativa explicita         |
| Cliente              | Cadastro no banco                        | Ativo, com empresa e clinica definidas                    |
| Vinculo              | Tabela local-profissional                | Vinculo direto com a clinica do cliente                   |
| Empresa              | Empresa da clinica e do cliente          | Ambas iguais; nunca valor fixo ou querystring             |
| Contexto compartilhado| Rota protegida /api/clinical-context/:clientId | Nome e registro corretos, indicador de pendencia |
| Receitas             | Contexto validado                        | Valores canonicos gravados; identificadores do motor      |
| Pedidos de exames    | Contexto validado                        | Nome e registro no PDF, identificadores persistidos       |

2.1. Arquivos centrais: `artifacts/api-server/src/lib/clinical-emitter.ts`,
`artifacts/api-server/src/routes/prescriptions.ts` e
`artifacts/api-server/src/routes/exam-requests.ts`.
2.2. A rota de contexto e as duas rotas de emissao agora exigem autenticacao do colaborador.
2.3. A identidade do medico solicitante e sempre resolvida pela sessao; identificador divergente recebido do navegador e rejeitado.
2.4. Dados de nome, contato e registro usados na receita sao substituidos pelo cadastro verificado antes de persistir.
2.5. Empresa e clinica nao derivam do papel de administrador nem do padrao historico do proprietario.
2.6. Nao se presume "SP" pelo endereco da clinica; se a unidade federativa nao esta explicitamente no registro do medico, a receita nao e emitida.
2.7. O pedido de exames permite a unidade federativa pendente, mas exige CRM valido e medico habilitado no local; revisar exigencia formal antes da homologacao.
2.8. A copia visual da receita recebe explicitamente os identificadores de medico e clinica; o motor tem outros chamadores antigos ainda nao auditados.
2.9. Os dois atalhos antigos de emissao agora exigem sessao, identificador numerico do cliente e o mesmo vinculo clinico; deixaram de aceitar paciente livre e nao remetem copia implicita.
2.10. O endereco antigo `/api/receituario/assinar-imagem-pdf` foi temporariamente suspenso com resposta 503 para usuarios autenticados (401 para anonimos); o codigo foi preservado, sem executar imagem, assinatura, upload ou envio.

## 3. Interface da primeira entrega

3.1. Em `PrescricaoFormulasPanel.tsx` e `PedidosExamesPanel.tsx`, cliente, medico e clinica aparecem em bloco somente de leitura.
3.2. Foi removido o seletor opcional de medico do pedido de exames no Cockpit.
3.3. Sem sessao ou com vinculo invalido, o painel mostra erro e nao habilita o botao principal de emissao.
3.4. Em prescricao, ausencia de unidade federativa tambem impede a emissao.
3.5. O endereco antigo `/prescricao?clientId=N` redireciona para `/cockpit/N/prescricao`; a pagina independente sem parametro permanece e nao foi homologada visualmente.
3.6. A mensagem de sucesso nao afirma mais, sem conferir o retorno, que todos os arquivos foram enviados a farmacia.
3.7. Os dois botoes alternativos de receituario visual no Cockpit estao desabilitados e identificados como pendentes de homologacao; o caminho principal permanece sujeito ao porteiro.

## 4. Evidencias executadas, com seus limites

4.1. `pnpm --filter @workspace/api-server exec vitest run src/tests/clinical-emitter.test.ts src/tests/clinical-prescription-routes.test.ts src/tests/clinical-legacy-routes.test.ts src/tests/prescription-client.test.ts --reporter=dot`: 56 testes passaram em 4 arquivos.
4.2. Os testes de rotas usam objetos sinteticos e banco/provedores simulados; verificam as rejeicoes e os valores efetivamente passados a gravacao e ao PDF, NAO uma receita assinada real.
4.3. `pnpm --filter @workspace/padcom run build`: compilacao da interface passou, com alertas preexistentes de chaves duplicadas em `preview-validacao.tsx` e tamanho do pacote.
4.4. O fluxo de inicio do servidor compilou e iniciou apos reiniciar a rotina gerenciada `artifacts/api-server: API Server`.
4.5. Pedidos anonimos reais ao servidor de desenvolvimento deram resposta 401 nas tres rotas: contexto, emissao de receita e emissao de pedido de exames.
4.6. A captura do Cockpit sem login mostrou a mensagem de autenticacao necessaria; nao ha captura de sessao clinica assinada.
4.7. `pnpm --filter @workspace/api-server run typecheck` registrou 201 diagnosticos globais; entre eles, incompatibilidade preexistente em `prescriptions.ts` na passagem de formulas para o motor.
4.8. Nao foi produzido PDF clinico real, nao foi enviado e-mail, mensagem ou cobranca de teste, e nao houve publicacao de producao.
4.9. A revisao separada inicialmente identificou um risco de vazamento pelo destinatario de copia fixa; uma segunda passagem aprovou o escopo limitado de identidade depois da correcao. Isso nao e aprovacao clinica nem aprovacao dos outros agentes.
4.10. A mesma revisao apontou a rota antiga de assinatura de imagem como pendencia critica; a suspensao foi aplicada depois daquela passagem e deve ser novamente testada/revisada.

## 5. Pendencias bloqueantes para uso com clientes reais

5.1. Confirmar no cadastro de cada medico a unidade federativa explicita do CRM e o vinculo com a clinica e empresa de cada cliente.
5.2. Auditar todos os demais caminhos de receituario, geracao visual e envio; recuperar a rota de assinatura de imagem SOMENTE apos reconstruir seu contrato seguro.
5.3. Validar assinatura digital real e impedir a indicacao de "assinado" quando o certificado estiver ausente ou invalido.
5.4. Separar geracao, assinatura e envio com confirmacao expressa por canal; o fluxo antigo de receitas ainda tem disparos automaticos de lembrete e WhatsApp de farmacia.
5.5. Preservar rascunho em caso de falha de emissao; executar ensaio com dados sinteticos no ambiente escolhido e teste assinado supervisionado, antes de qualquer atendimento.
5.6. Cobrir clinicas, profissionais e clientes reais com verificacao autorizada e sem expor dados pessoais nesta carta.
5.7. Manter SupportHealth como sistema principal ate aceite clinico explicito; esta entrega isolada nao e uma ordem de migracao.

## 6. Perguntas objetivas a Dr. Chat e equipe

6.1. Qual a exigencia juridica e tecnica minima de identificacao do CRM no pedido de exames digital neste fluxo?
6.2. A emissao deve, por padrao, apenas gerar rascunho e arquivo; quais envios exigem confirmacao separada?
6.3. Qual o criterio de aceite para receita controlada, certificado e numero SNCR antes da primeira utilizacao?
6.4. Qual ordem de homologacao clinica dos caminhos antigos permite reduzir risco sem retirar o SupportHealth?

RESUMO EM 1 LINHA: contexto autenticado e comprovacoes sinteticas foram entregues; a operacao clinica continua bloqueada ate homologacao, assinatura e auditoria de envios.
