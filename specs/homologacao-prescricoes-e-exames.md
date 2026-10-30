# Especificacao: homologacao isolada de prescricoes e pedidos de exames

Data: 30/10/2026
Estado: EM ESPECIFICACAO
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

Os testes existentes comprovam partes dessas regras com identidade e certificado
sinteticos. Ainda nao comprovam, nesta ordem, duas jornadas visuais completas
com seis prescricoes, persistencia isolada e reabertura de todos os arquivos.

### 3.2 Pedidos de exames

`POST /exam-requests/emit` exige colaborador e resolve o vinculo entre medico,
cliente e clinica. Em seguida, gera e persiste os PDFs, mas a rota atualmente
nao chama o assinador criptografico. Este e um bloqueador P0 confirmado.

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

1. ESPECIFICAR: congelar as jornadas, os contratos atuais e os bloqueadores.
2. UNIDADE A: garantir assinatura criptografica dos pedidos de exames com
   certificado sintetico por medico; provar recusa antes de persistir.
3. REVISAR E TESTAR A: revisar o diff e testar a unidade A antes de avancar.
4. UNIDADE B: corrigir vinculos e recuperacao dos documentos de exame, mantendo
   compatibilidade com registros existentes e tokens historicos.
5. REVISAR E TESTAR B antes de avancar.
6. UNIDADE C: compor a matriz executavel de duas jornadas em Cockpit, envolvendo
   seis receitas e seis operacoes de exames, com PDFs individuais conforme a
   regra de agrupamento.
7. REVISAR E TESTAR C antes de avancar.
8. HOMOLOGAR: assinalar cada requisito como satisfeito, falhou, nao testado ou
   bloqueado. Apenas todos satisfeitos permitem HOMOLOGADA.
9. APRENDER: registrar evidencias e recomendacoes, sem declarar validado o
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

## 10. Relatorio final obrigatorio

Ao final, listar a revisao exata, diff, todos os comandos e seus resultados,
IDs dos clientes-modelo somente da base descartavel, documentos por tipo,
identificadores do catalogo de homologacao, verificacao criptografica,
recuperacao byte a byte, provas de isolamento e tentativas externas iguais a
zero. Separar os testes executados dos nao executados e expor cada bloqueio.

Nao declarar que o prazo, quantidade de testes ou integracao no GitHub substitui
um criterio de aceite. Nao afirmar homologacao pessoal, assinatura real, entrega
real ou liberacao clinica a partir de dados exclusivamente sinteticos.

## 11. Melhorias fora do bloqueio imediato

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
