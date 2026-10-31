# Especificacao: homologacao isolada de prescricoes e pedidos de exames

Data: 30/10/2026
Estado: API SINTETICA DE RECEITAS VERIFICADA; REVISAO INDEPENDENTE PENDENTE; JORNADA CLINICA GLOBAL BLOQUEADA
Prioridade: P0 para uma primeira liberacao clinica controlada
Ordem de origem: ordem executiva recebida em 30/10/2026
Revisao de auditoria de referencia: 4eb4ca2d3103b3070b516c7d27aac155e90545bd

## 1. Objetivo

Comprovar, em uma base isolada e sem efeito clinico externo, as jornadas de
prescricao medica e solicitacao de exames, identificando e corrigindo todos os
impeditivos encontrados, sem declarar homologacao parcial como total.

## 2. Limites

1. Esta unidade abrange as duas jornadas do Cockpit: receitas e pedidos de exames.
2. Atestados e encaminhamentos nao estao autorizados nesta unidade. Nao tornar a
   identidade clinica comum a todos os emissores sem inventariar suas rotas.
3. Nao ativar licenciamento, cobranca, distribuicao comercial ou integracao nova.
4. Nao gerar documentos clinicos reais nem utilizar certificado real.
5. Nao enviar arquivos, mensagens ou contatos a pacientes, farmacias ou
   laboratorios.
6. Preservar registros existentes, documentos assinados e o historico.
   Alteracoes de banco serao aditivas; nenhuma remocao, recriacao ou limpeza
   destrutiva esta autorizada.
7. Nao usar a base principal nem copiar registros dela para testes.
8. Uma unica implementacao e sua verificacao ocorrem por vez. Nao iniciar
   agentes de implementacao paralelos nem novas tarefas automaticamente.
9. A ordem solicita que os dois nomes-modelo sejam apresentados na homologacao.
   Qualquer eventual uso dos nomes em testes deve ocorrer somente na base
   descartavel, com IDs novos, dados pessoais vazios ou evidentemente invalidos,
   sem consulta ou copia de registros da base principal.
10. Os documentos sinteticos devem conter exatamente:
    HOMOLOGACAO — DOCUMENTO DE TESTE — SEM VALIDADE CLINICA
    e nao podem aparentar uma instrucao terapeutica para dispensacao.

## 3. Arquitetura e verificacoes iniciais

### 3.1 Prescricoes

O codigo atual de `POST /prescriptions/emit` exige sessao de colaborador,
resolve o medico, cliente e clinica autorizados, recusa ID de outro medico,
localiza certificado pelo medico autenticado, assina os bytes da receita e
persiste o PDF assinado. A rota de recuperacao de PDF tambem exige colaborador
e valida a prescricao autorizada.

Uma etapa sintetica posterior comprovou seis emissoes pela rota HTTP, assinatura,
persistencia isolada e reabertura autenticada dos PDFs. Ela usa resolvedor de
identidade sintetico e nao comprova o login visual, o catalogo real nem a jornada
completa do Cockpit.

### 3.2 Pedidos de exames

`POST /exam-requests/emit` exige colaborador, resolve medico, cliente e clinica,
valida o certificado do medico autenticado antes de renderizar e assina os PDFs
antes da persistencia. A implementacao de assinatura pertence a uma unidade
anterior e nao foi reexecutada nesta etapa de receitas.

A rota tambem aceita informacoes de exames enviadas pelo navegador. A relacao
entre os identificadores escolhidos na tela e o catalogo autorizado precisa ser
verificada antes de apresentar a lista final de exames como comprovada.

Os links `/api/exam-requests/file/:token` sao acessiveis a quem possuir o token.
O registro examinado nao possui campos de vencimento ou revogacao desse link.
Eles nao podem ser apresentados como autenticamente autorizados por sessao.
A compatibilidade com links historicos precisa ser preservada e especificada
antes de uma alteracao que os invalide.

### 3.3 Emissores fora do escopo

As rotas de atestados e encaminhamentos nao usam, nas fontes examinadas,
`requireCollaborator` nem `resolveClinicalEmitter`. O painel do Cockpit ainda
inclui um medico-padrao para documentos. Essa lacuna fica registrada, mas nao
e corrigida sem uma unidade autorizada propria.

## 4. Requisitos funcionais

### 4.1 Continuar a consulta sem redigitar as identidades

1. Autenticar o medico de teste e abrir o Cockpit.
2. Selecionar um cliente-modelo uma vez.
3. Confirmar que a aba Prescricao deriva o cliente e o medico do contexto
   autenticado, e nao de nomes ou identificadores confiados ao navegador.
4. Ir para Exames sem escolher novamente cliente ou medico.
5. Repetir com o segundo cliente-modelo.
6. Trocar de cliente, sessao ou clinica e confirmar que editores, selecoes,
   consultas pendentes e respostas atrasadas nao atravessam o contexto.
7. Erro de rede ou de revalidacao preserva rascunho sem liberar emissao usando
   autorizacao antiga.

### 4.2 Prescricoes

Para cada cliente-modelo, selecionar tres formulacoes sinteticas existentes no
catalogo isolado, conferir substancias, dose, unidade, via, frequencia e
orientacao e gerar tres receitas pelo motor regulatorio normal.

#### Unidade de execucao atual: seis receitas sinteticas

Esta etapa verifica somente a emissao por servidor e a persistencia de seis
receitas, sem declarar concluida a jornada visual do Cockpit.

1. Usar somente PostgreSQL descartavel criado para o teste; nenhum acesso a
   `DATABASE_URL` ou a registros da base principal.
2. Criar dois clientes-modelo com os nomes exatos da ordem, identificadores novos
   e dados de contato vazios; criar medico e clinica sinteticos.
3. Emitir tres formularios sinteticos por cliente pela rota normal, usando um
   documento separado por formulacao e sem substancias ou orientacoes terapeuticas.
4. Incluir em cada PDF a frase exata `HOMOLOGAÇÃO — DOCUMENTO DE TESTE — SEM VALIDADE CLÍNICA`.
   O aviso deve ficar visualmente destacado e o documento sintetico nao pode
   herdar orientacoes padrao que sugiram avaliacao ou tratamento clinico.
5. Confirmar a assinatura criptografica, os registros de receita e itens, a
   recuperacao autenticada do historico e a igualdade dos bytes recuperados.
6. Simular falhas antes e durante a geracao e confirmar ausencia de registros
   parciais. A protecao contra repeticao/idempotencia segue sem comprovacao nesta
   unidade e continua bloqueando uma liberacao clinica.
7. Substituir por simulacoes todas as integracoes externas e confirmar zero
   envios, uploads ou chamadas a pacientes, farmacias e laboratorios.
8. Registrar separadamente qualquer limitacao de catalogo, interface,
   certificado real ou revisao independente que esta unidade nao consiga provar.

Os PDFs finais devem:

1. Conter a indicacao de homologacao da secao 2.
2. Identificar o medico de teste e o cliente-modelo correspondentes.
3. Ser assinados pelo motor criptografico existente com certificado sintetico
   proprio daquele medico.
4. Ser validados criptograficamente, persistidos e recuperados pelo historico.
5. Preservar os bytes originais assinados na recuperacao.
6. Confirmar no registro e no arquivo a mesma formula, dose e autoria.
7. Nao chamar canais de envio, farmacia, armazenamento externo ou serviço real.

### 4.3 Pedidos de exames

Para cada cliente-modelo, gerar exatamente tres operacoes independentes:

1. Uma solicitacao laboratorial contendo quatro conjuntos distintos do catalogo.
2. Uma solicitacao de imagem contendo tres exames.
3. Uma solicitacao de imagem contendo mais dois exames.

Usar somente itens identificados no catalogo de homologacao isolado. Guardar os
identificadores e nomes efetivamente lidos do catalogo. Nao inventar itens nem
declarar codigos que nao tenham sido consultados na fonte de teste.

Os exames de imagem permanecem individuais quando a regra existente exige um
PDF por exame. Os pedidos de sangue respeitam o agrupamento existente. O
historico deve ligar cada arquivo a sua operacao e ao medico, clinica e cliente.

Cada PDF usa o motor existente, recebe a indicacao de homologacao e passa pela
mesma validacao de emissor e assinador PAdES por medico usada na receita.
PAdES significa assinatura digital incorporada ao PDF.
Qualquer falha de identidade, certificado, assinatura, gravacao ou verificacao
interrompe a persistencia como documento assinado e bloqueia os envios externos.

### 4.4 Repeticao segura e efeitos externos

1. A execucao de teste tem provedores de mensagem e farmaceuticos simulados e
   acessos a armazenamento externo bloqueados.
2. Os testes provam zero tentativas a destinatarios reais, nao apenas a resposta
   visual "nao enviado".
3. Repeticao de requisicao, clique duplo, tempo excedido e resposta perdida nao
   podem causar criacao ou entrega duplicada.
4. Cada efeito deve ser rastreavel a um contexto autenticado e a uma operacao.
5. Falha depois de emissao, mas antes da confirmacao, deve preservar resultado
   incerto para conferencia humana; nunca reenviar automaticamente.

## 5. Autorizacao e isolamento negativos

Demonstrar o caminho autorizado e recusar, antes de gerar ou enviar:

1. Cliente pertencente a outra clinica.
2. professionalId injetado pelo navegador diferente do medico autenticado.
3. Sessao inexistente, adulterada, expirada ou revogada.
4. Tentativa de recuperar PDF de outra clinica, medico ou cliente.
5. Documento com vinculo divergente entre PDF, registro e cliente selecionado.
6. Uso de token de compartilhamento vencido ou revogado, caso esse contrato seja
   estabelecido e implementado nesta unidade.
7. Falha de banco, assinatura, armazenamento ou canal externo.

## 6. Falhas previsiveis e respostas obrigatorias

| Falha | Resposta requerida |
|---|---|
| Certificado ausente, titular incorreto, chave divergente ou expirado | Impedir emissao antes de salvar, numerar ou entregar |
| Falha criptografica ou PDF adulterado | Rejeitar documento; nunca marcar como assinado |
| Cliente alterado enquanto consulta esta pendente | Ignorar a resposta antiga e apagar qualquer selecao antiga |
| Clinica ou sessao alterada | Revalidar o escopo; limpar autorizacao e resultado antigos |
| Catalogo vazio ou item inativo | Impedir envio e explicar qual selecao precisa ser revista |
| Falha de rede apos a gravacao | Consultar o historico e a operacao existente; nao repetir automaticamente |
| Envio parcialmente aceito | Registrar cada canal e exigir conferencia antes de nova tentativa |
| Erro na migracao ou divergencia de contrato | Bloquear a homologacao; nao substituir ou eliminar registros |

## 7. Sequencia de implementacao e verificacao

Sem executar etapas em paralelo:

1. ESPECIFICACAO: congelar as jornadas, os contratos atuais e os bloqueadores.
2. UNIDADE A: assinatura sintetica dos pedidos de exames foi implementada e
   testada em etapa anterior; esta execucao nao a reabriu.
3. UNIDADE B: seis PDFs sinteticos de receita foram gerados, assinados,
   persistidos e recuperados por API nesta execucao.
4. REVISAO B: obrigatoria antes de avancar; esta pendente porque a ferramenta de
   revisor independente esta indisponivel neste modo.
5. PROXIMA UNIDADE, apos revisao: completar os bloqueios de catalogo, historico,
   repeticao segura e jornadas visuais, uma unidade por vez.
6. HOMOLOGAR: assinalar cada requisito como satisfeito, falhou, nao testado ou
   bloqueado. Apenas todos satisfeitos permitem HOMOLOGADA.
7. APRENDER: registrar evidencias e recomendacoes, sem declarar validado o
   certificado pessoal do CEO ou o uso clinico real.

## 8. Requisitos para uma base de teste

1. Usar processo PostgreSQL novo, com diretorio temporario exclusivo e sem
   credenciais ou dados da base de desenvolvimento ou producao.
2. Usar IDs gerados nessa base e nunca copiar um identificador de usuario real.
3. Usar certificado A1 autoassinado criado para o medico sintetico; nao reutilizar
   arquivo, senha, CPF, assinatura ou chave pessoal.
4. Enviar para endpoints locais de teste com mocks de Gmail, WhatsApp, Telegram,
   Drive, farmacia e qualquer provedor.
5. Preservar capturas sem dados clinicos reais e sem informar senha, token ou
   material criptografico secreto.
6. Encerrar a base temporaria pela rotina de limpeza do proprio teste, somente
   apos confirmar seu caminho dentro de `/tmp`.
7. Nunca rodar a suite contra banco configurado pelo arquivo de ambiente do
   usuario sem prova de que o processo isolado esta usando apenas o teste.

## 9. Criterios de homologacao

| Evidencia | Passa quando |
|---|---|
| Comandos HTTP | Sucesso autorizado e recusas com os codigos esperados, sem efeitos externos |
| Persistencia | Registros sinteticos existem no PostgreSQL temporario e sobrevivem a consulta |
| Assinatura | ByteRange e conteudo CMS conferidos; adulteracao e rejeitada |
| Recuperacao | PDF reaberto preserva bytes, assinatura e autoria originais |
| Contexto visual | Cliente e medico corretos herdados entre abas, em desktop e celular |
| Isolamento | Respostas velhas e identidades cruzadas nao substituem o cliente atual |
| Repeticao | Operacao repetida nao duplica persistencia ou envio |
| Logs | Erros conhecidos tem resultado honesto e nao expoem credenciais nem dados pessoais |
| Revisao | Diff e casos de falha revisados. Revisor externo indisponivel deve ser declarado |
| Escopo | Nenhum envio real e nenhuma alteracao da base principal |

Aprovacao de testes unitarios ou captura simulada, sozinha, nao homologa a
jornada de ponta a ponta. Falta de verificacao completa implica BLOQUEADO.

## 10. Evidencia executada em 30/10/2026

### 10.1 Resultado da etapa de receitas

1. O build do servidor de API terminou com sucesso.
2. Passaram 24 testes em dois arquivos: 14 testes de assinatura e emissao e
   10 testes de rotas de prescricao.
3. A etapa integrada criou seis prescricoes por HTTP, usando os dois nomes-modelo,
   tres formularios sinteticos para cada um e um PostgreSQL descartavel.
4. Os seis PDFs foram assinados com certificado autoassinado do medico sintetico,
   validados por `pdfsig` como integridade da assinatura valida, e recuperados
   com os mesmos bytes gravados.
5. A leitura do PDF confirmou o aviso exato, o titulo "DOCUMENTO DE TESTE" e a
   ausencia do texto clinico padrao de formulacao personalizada e avaliacao.
6. A consulta autenticada do historico retornou cada receita e seus itens.
7. Uma falha injetada na geracao do PDF reverteu toda a transacao, sem deixar
   prescricoes, itens ou receitas parciais.
8. Uma identidade sintetica sem certificado e um cliente de outra clinica foram
   recusados antes de persistir.
9. Os metodos de e-mail, armazenamento e mensageria foram simulados; a etapa nao
   enviou mensagens nem arquivos a pacientes, farmacias ou laboratorios.
10. Os seis arquivos de evidência estao em
    `generated-artifacts/paxter-prescription-homologation/`.

### 10.2 Limites da evidencia

1. Esta etapa nao selecionou formularios do catalogo clinico real; os itens foram
   sinteticos e informados pelo teste.
2. A identidade foi fornecida por um resolvedor sintetico; nao foi validado o
   login visual do medico nem a jornada completa do Cockpit.
3. O historico foi consultado por rota no mesmo banco temporario; nao foi feito
   teste de reinicio ou restauracao de banco.
4. Repeticao de clique/requisicao, resultado incerto e idempotencia nao foram
   homologados.
5. Assinatura autoassinada comprova integridade criptografica no teste, nao a
   confianca, validade juridica ou revogacao de um certificado real.
6. A rota de exames continua sem assinatura criptografica comprovada. As telas
   de exames, atestados e encaminhamentos nao foram homologadas nesta etapa.
7. Nenhum fluxo foi testado visualmente; o servidor principal nao foi reiniciado
   para evitar que o boot tocasse a base de desenvolvimento.
8. A verificacao global de TypeScript falhou com 190 diagnosticos em 56 arquivos;
   nenhum aponta para os arquivos alterados nesta etapa. O build e os testes
   direcionados passaram.
9. A revisao independente obrigatoria nao ocorreu: a ferramenta de revisor
   separado esta indisponivel neste modo. Isso impede declarar a unidade
   HOMOLOGADA, embora os testes direcionados tenham passado.

Portanto, esta evidencia confirma uma unidade tecnica sintetica da API de
receitas. Ela nao autoriza atendimento clinico real nem muda o estado
HOMOLOGACAO GLOBAL BLOQUEADA.

## 11. Relatorio final obrigatorio

Ao final, listar a revisao exata, diff, todos os comandos e seus resultados,
IDs dos clientes-modelo somente da base descartavel, documentos por tipo,
identificadores do catalogo de homologacao, verificacao criptografica,
recuperacao byte a byte, provas de isolamento e tentativas externas iguais a
zero. Separar os testes executados dos nao executados e expor cada bloqueio.

Nao declarar que o prazo, quantidade de testes ou integracao no GitHub substitui
um criterio de aceite. Nao afirmar homologacao pessoal, assinatura real, entrega
real ou liberacao clinica a partir de dados exclusivamente sinteticos.

## 12. Melhorias fora do bloqueio imediato

| Prioridade | Recomendacao | Razao |
|---|---|---|
| Indispensavel agora | Identidade do medico, clinica e cliente no emissor e em cada PDF | Previne autoria e prontuario incorretos |
| Indispensavel agora | Verificacao criptografica e bloqueio se assinatura falhar | Previne documento sem autoria criptografica apresentada como assinado |
| Indispensavel agora | Persistencia, recuperacao e protecao contra repeticao | Previne perda ou duplicacao de documentos |
| Curto prazo | Revisao pelo medico em lote com confirmacao de prescricoes e exames | Reduz erros de selecao sem dispensar a revisao clinica |
| Curto prazo | Historico por linha do tempo dentro do Cockpit | Facilita reabrir documentos sem navegar entre modulos |
| Curto prazo | Tela de estado do certificado pessoal | Distingue ausente, invalido, vencido e validado |
| Comercial futuro | Revisao global de multiempresa, cadastro governado e cobranca | Exige inventario, politica de operacao e unidade separada |
| Comercial futuro | Validacao de cadeia e revogacao de certificado pessoal em ambiente de atendimento | Requer integracao e validacao real separada; certificado sintetico nao basta |

## 13. Estado verificado em 30/10/2026

### Unidade anterior — assinatura de pedidos de exames

1. A emissao de exames exige que o medico autenticado seja um medico ativo,
   tenha CRM e unidade federativa cadastrados, esteja vinculado a clinica do
   cliente e apresente certificado pertencente ao proprio CPF.
2. A verificacao do certificado ocorre antes de gerar o PDF, gravar o pedido ou
   chamar um canal de envio.
3. O PDF de exames passa pelo assinador criptografico ja usado nas receitas.
   O tipo e os identificadores do medico, cliente, clinica e empresa ficam nos
   metadados assinados. O motivo da assinatura identifica solicitacao de exames.
4. O fluxo conserva o motivo antigo da assinatura das receitas.
5. A evidencia da unidade anterior exercitou seis operacoes sinteticas para dois clientes-modelo:
   quatro itens laboratoriais agrupados por cliente, tres e depois dois itens de
   imagem separados. Isso produz doze arquivos assinados, nao quatorze.
6. Os PDFs de teste sao persistidos em PostgreSQL temporario, recuperados pela
   rota do arquivo e comparados byte a byte. O teste valida o CMS, a faixa de
   bytes e a identidade sintetica do certificado. CMS significa mensagem
   criptografica assinada.
7. Todos os PDFs da operacao sao assinados antes da primeira gravacao; a
   persistencia usa uma transacao. Um teste faz a segunda gravacao falhar e
   confirma que a transacao deixa o banco sem os novos arquivos.
8. O teste recusa um vinculo entre clinicas e um certificado invalido antes de
   qualquer persistencia. Os canais de envio permanecem simulados e com zero
   chamadas.

### Evidencias da unidade anterior

| Verificacao | Resultado |
|---|---|
| `vitest run src/tests/prescription-signing.test.ts` | 13 testes aprovados na execucao anterior; 14 nesta etapa |
| `vitest run src/tests/exam-workspace.test.ts` | 31 testes aprovados |
| `vitest run src/tests/clinical-emitter.test.ts` | 23 testes aprovados |
| `vitest run src/tests/clinical-prescription-routes.test.ts` | 10 testes aprovados |
| `pnpm --filter @workspace/api-server run build` | Compilacao aprovada |
| `pnpm --filter @workspace/api-server run typecheck` | Nao aprovado: 190 diagnosticos em 56 arquivos; nenhum aponta para os arquivos alterados nesta etapa |

O teste de exame usa rotulos propositalmente sinteticos e uma identidade
autenticada simulada. Somente os PDFs sao gravados no PostgreSQL temporario; a
relacao de cliente, medico e clinica ainda nao foi exercitada como uma jornada
real completa sobre esse banco. Os itens sinteticos nao comprovam o catalogo
clinico existente.

### Unidade atual — seis prescricoes sinteticas

Os resultados completos da etapa atual estao na secao 10. Em resumo: seis PDFs
assinados e recuperados por rota em PostgreSQL descartavel; 24 testes passaram;
uma falha de geracao reverteu toda a transacao; e as integracoes externas foram
simuladas. O aviso de teste foi destacado e o texto clinico padrao foi removido
dos PDFs sinteticos.

### Bloqueios que impedem a homologacao global

1. A etapa atual comprovou somente a API de receitas com identidade sintetica;
   nao comprovou o login visual, o catalogo real, nem as jornadas completas de
   prescricoes e exames no Cockpit.
2. A lista real de itens do catalogo de exames nao foi carregada e verificada
   nesta homologacao.
3. O identificador de exame enviado pelo navegador ainda nao e conferido contra
   uma linha ativa do catalogo no servidor.
4. O link publico de arquivo de exame continua sem vencimento ou revogacao.
   Tokens historicos nao foram alterados.
5. As jornadas visuais, a troca de cliente enquanto uma requisicao esta
   pendente, a trilha temporal completa e tentativas duplicadas nao foram
   aprovadas por um teste de ponta a ponta.
6. A assinatura sintetica prova integridade criptografica dos bytes e
   correspondencia do titular de teste. Nao prova a cadeia de confianca,
   revogacao, validade regulatoria ou adequacao clinica de um certificado real.
7. A revisao por um segundo agente nao ocorreu porque a ferramenta de revisor
   independente esta indisponivel neste modo.
8. Atestados e encaminhamentos continuam fora desta ordem e nao estao liberados
   por esta mudanca.
9. O fluxo visual do aplicativo nao foi atualizado nem confirmado em uma
   visualizacao autenticada. A verificacao desta unidade foi feita pelas rotas
   HTTP e pelo PDF recuperado, sem acessar uma sessao clinica real.

Por esses motivos, a conclusao honesta desta entrega e: API DE RECEITAS
VERIFICADA EM TESTES SINTETICOS; REVISAO INDEPENDENTE PENDENTE; JORNADA CLINICA
COMPLETA BLOQUEADA.

## 14. Reexecucao local em 31/10/2026

1. A primeira reexecucao de `clinical-prescription-routes.test.ts` terminou com
   4 testes aprovados e 6 falhas, todas recebendo 403 antes dos efeitos esperados.
2. A leitura do fluxo mostrou que `requireCollaborator` consulta o profissional
   autenticado antes de `resolveClinicalEmitter`, mas os casos autorizados do
   teste nao reservavam uma resposta sintetica para essa consulta.
3. A falha era do arranjo de dados do teste, nao uma alteracao da regra da rota:
   o teste agora fornece primeiro a resposta sintetica da autenticacao.
4. Nova execucao de `clinical-prescription-routes.test.ts`: 10 de 10 testes
   aprovados, incluindo bloqueios de identidade, UF e cliente de outra empresa,
   e caminho autorizado; geracao e envio continuam simulados.
5. Execucao de `exam-workspace.test.ts`: 31 de 31 testes aprovados em PostgreSQL
   temporario; integracoes externas permanecem simuladas.
6. Nenhuma base principal, dado real, paciente real ou canal externo foi usado.
7. Essas evidencias cobrem rotas e persistencia sintetica, nao o fluxo visual
   autenticado no Cockpit. A revisao independente continua pendente; por isso,
   a jornada clinica completa segue bloqueada para homologacao e uso real.
