# PAXTER Loop — Acesso clínico delegado e aprovação médica

Data: 02/11/2026
Estado: EM ESPECIFICAÇÃO
Escopo: prescrição e pedido de exames no Cockpit
Fonte relacionada: `specs/homologacao-prescricoes-e-exames.md`

## 1. Objetivo

Permitir que profissionais autorizados preparem prescrições e pedidos de exames para conferência, enquanto somente um médico ativo, vinculado à mesma unidade e autorizado, emite e assina o documento final.

## 2. Estado confirmado antes da construção

1. A tela existente `/cadastros/governanca` administra uma matriz global de ferramenta por função. Ela não possui fila de aprovação clínica nem concessão individual por unidade.
2. A matriz atual filtra principalmente a navegação no navegador; as rotas existentes de emissão não validam essa matriz como autorização de ação no servidor.
3. `POST /prescriptions/emit` e `POST /exam-requests/emit` emitem documentos diretamente pelo médico autenticado.
4. `resolveClinicalEmitter` exige um médico ativo com registro profissional e vínculo explícito à unidade do cliente.
5. A tela de validação de exames laboratoriais é uma conferência de resultados recebidos; não é a aprovação de pedidos clínicos preparados pela enfermagem.
6. A tabela `location_professionals` representa vínculo a uma unidade; seu campo `role` não será reaproveitado como nova permissão clínica.
7. A especificação `specs/homologacao-prescricoes-e-exames.md` ainda marca a jornada clínica completa como BLOQUEADA. Esta nova funcionalidade não altera esse estado sem cumprir os critérios daquela especificação.

## 3. Decisões de arquitetura

1. Preservar `governanca.matriz` como regra global compartilhada por função, escolhida anteriormente pelo CEO.
2. Acrescentar controles individuais por unidade clínica. A permissão efetiva será a combinação da função global permitida, da concessão individual ativa e do vínculo autenticado do profissional à unidade.
3. Usar `location_id` como unidade clínica e validar também `empresa_id` em toda operação. A empresa continua sendo o limite de isolamento de dados.
4. Não inferir autoridade administrativa de cargo textual, categoria profissional, médico principal ou vínculo de agenda.
5. Identificar o proprietário global somente por `isPlatformOwner`; não inferir a partir de `isPrimaryDoctor`.
6. Reutilizar `/cadastros/governanca` como centro de gestão, com áreas distintas para matriz geral, acessos da unidade e aprovações. Não criar uma segunda tela com a mesma finalidade.
7. Persistir solicitações pendentes e usar o contador da fila como aviso dentro do sistema. Não enviar notificações externas nesta etapa.
8. Usar a autorização médica atual e os geradores/assinadores existentes para produzir o documento final. A aprovação deve registrar separadamente quem preparou e quem aprovou.
9. A aprovação não envia o documento ao cliente. A entrega por e-mail, WhatsApp ou Telegram continua sendo ação separada, explícita e sujeita às regras existentes.
10. Toda alteração de banco será aditiva. Nenhuma solicitação, documento, histórico ou dado existente será apagado.

## 4. Requisitos funcionais

### 4.1 Regras globais e por profissional

1. Acrescentar à matriz global as ferramentas `prescricao` e `pedido_exames`.
2. Acrescentar uma permissão global para gerenciar concessões clínicas locais.
3. Permitir ao proprietário global designar, por unidade, administradores locais e um médico responsável.
4. Permitir ao administrador local autorizado ligar ou desligar, por profissional e unidade, os acessos a prescrição e pedido de exames.
5. Não permitir que um administrador local conceda acesso a si mesmo, designe outro administrador ou troque o médico responsável.
6. Exigir profissional ativo e vínculo real à unidade antes de listar, conceder ou usar qualquer permissão.
7. Negar por padrão função sem mapeamento, profissional inativo, permissão global desligada, concessão local ausente ou sessão inválida.
8. Não alterar automaticamente os acessos de profissionais existentes. A concessão precisa ser feita conscientemente na tela.

### 4.2 Emissão direta por médico

1. Médico ativo com as duas camadas de permissão pode emitir diretamente em seu próprio nome.
2. O servidor determina identidade, unidade, empresa e cliente a partir da sessão e dos vínculos consultados no banco.
3. Um identificador de médico enviado pelo navegador não concede nem troca a autoria.
4. O documento identifica o médico que realizou a emissão e passa pela validação de registro e certificado já existente.

### 4.3 Preparação pela enfermagem

1. Profissional de enfermagem autorizado pode preparar uma prescrição ou pedido de exames e enviar para conferência.
2. A preparação cria uma solicitação persistente `pendente`, associada ao profissional preparador, cliente, unidade e empresa verificados.
3. Antes da aprovação, a solicitação não gera documento assinado, não consome numeração regulatória e não chama canais externos.
4. Se a unidade não tiver médico responsável ativo, a solicitação é bloqueada com orientação clara.
5. Enfermeiro ou outra função não médica não pode aprovar, assinar nem emitir diretamente, mesmo alterando o pedido HTTP.

### 4.4 Aprovação pelo médico responsável

1. A fila mostra solicitações da unidade sob responsabilidade médica atual, sem depender de um identificador enviado pelo navegador.
2. Cada item permite conferir cliente, unidade, profissional preparador, tipo de documento e conteúdo integral antes da ação.
3. O médico responsável pode aprovar e emitir ou rejeitar com motivo obrigatório.
4. O médico que aprova é o médico emissor e signatário do documento final.
5. Trocar o médico responsável encaminha as pendências ainda não decididas ao responsável atual sem apagar os eventos anteriores.
6. A aprovação é individual; uma ação em um item não aprova itens ocultos ou não conferidos.
7. Clique duplo, requisição repetida ou concorrência não podem emitir duas vezes. Se o resultado ficar incerto, a tela deve exigir conferência e nunca repetir automaticamente.
8. Uma solicitação aprovada ou rejeitada mantém trilha de autoria, decisão, data e resultado; não existe ação de apagar.

### 4.5 Histórico e notificação interna

1. A fila persistida é a fonte de verdade da notificação; a navegação mostra a quantidade de pendências do médico responsável.
2. A lista é atualizada após abrir a tela e por atualização periódica limitada.
3. Estados de carregamento, fila vazia, erro de consulta, solicitação pendente, aprovada e rejeitada são distintos.
4. A pessoa que preparou pode consultar o estado da própria solicitação, sem acessar pedidos de outros profissionais ou unidades.
5. Os documentos emitidos permanecem acessíveis no histórico clínico já existente, com o médico signatário e o profissional preparador identificáveis.

## 5. Modelo de autorização

```text
Matriz global da função
        +
Concessão individual por unidade
        +
Profissional ativo e vínculo à unidade
        +
Cliente ativo da mesma empresa e unidade
        ↓
Médico: emissão própria  |  Enfermagem: solicitação pendente
        ↓
Médico responsável confere e assina
```

1. A autorização global compartilhada não mistura clientes, profissionais ou documentos entre empresas.
2. O `empresa_id` e o `location_id` são verificados no servidor em cada leitura e escrita.
3. Administrador local não pode ampliar o limite definido na matriz global.
4. Médico responsável não recebe acesso aos demais documentos de outra unidade apenas por ser médico.
5. CEO global e médico responsável são papéis distintos, mesmo quando a mesma pessoa exerce ambos.

## 6. Impacto e dependências

1. Banco: novas tabelas aditivas para concessões por unidade, solicitações de aprovação e eventos imutáveis; índices para escopo, fila e idempotência.
2. Contrato de API: novas operações documentadas primeiro em `lib/api-spec/openapi.yaml`, com geração dos clientes e validadores.
3. Servidor: rotas de autorização clínica, submissão, consulta, aprovação e rejeição; emissão atualizada para bloquear usuários sem concessão efetiva.
4. Cockpit: envio de rascunho para enfermagem e emissão própria para médicos; cliente selecionado continua sendo a fonte atual.
5. Governança: matriz global mantida e ampliada; área por unidade restrita a proprietário global ou administrador local explicitamente designado.
6. Menu: contador de pendências para o médico responsável, sem expor conteúdo clínico em notificações ou logs.
7. Assinatura: apenas certificado associado ao médico que efetivamente aprova pode assinar.
8. Histórico: associar documento final à solicitação, ao preparador e ao aprovador, preservando os contratos atuais.
9. Efeitos externos: testes com armazenamento e provedores simulados; aprovação não dispara e-mail, WhatsApp ou Telegram.
10. Fora de escopo: atestados, encaminhamentos, cobranças, licenciamento comercial, sincronização com GitHub e envio real a clientes.

## 7. Falhas previstas e barreiras

| Falha | Barreira obrigatória | Evidência |
|---|---|---|
| Enfermeiro chama diretamente a rota de emissão | Negação no servidor antes de assinatura ou persistência | Requisição proibida retorna 403 e nenhuma linha é criada |
| Médico tenta emitir por outro profissional | Identidade do emissor deriva da sessão | Teste com identificador forjado é recusado |
| Cliente pertence a outra unidade ou empresa | Revalidar vínculo do cliente e membro da unidade | Recusa antes de PDF, assinatura, envio ou persistência |
| Administrador inventa uma unidade no navegador | Buscar unidade e autorização do ator no banco | Recusa para unidade não gerenciada |
| Administrador concede acesso a si mesmo ou troca responsável | Campos administrativos protegidos no servidor | Tentativa recebe 403 e dados permanecem iguais |
| Médico responsável ausente, inativo ou sem vínculo | Bloquear submissão ou aprovação e explicar o impeditivo | Nenhum documento final é criado |
| Certificado inválido ou ausente | Validar titularidade antes da emissão | Sem assinatura nem registro final |
| Clique duplo ou concorrência | Transição condicional e chave idempotente persistida | Um único documento final e um único evento de emissão |
| Banco falha durante emissão | Transação mantém solicitação e documentos coerentes | Consulta confirma ausência de documento parcial |
| Resposta de rede se perde após emissão | Consultar estado persistido; nunca emitir novamente automaticamente | Repetição devolve resultado existente ou estado para conferência |
| Acesso local é revogado durante aprovação | Revalidar concessão antes da decisão | A aprovação é recusada; histórico permanece |
| Erro ao carregar fila | Exibir erro, não “nenhuma pendência” | Teste de falha de API e estado visual correspondente |
| Categoria desconhecida | Negar por padrão | Requisição recebe 403 sem efeito colateral |
| Dados sensíveis aparecem em logs | Registrar apenas IDs técnicos e resultado | Inspeção dos logs sintéticos sem conteúdo clínico |

## 8. Testes e homologação

1. Usar exclusivamente banco descartável, profissionais e clientes sintéticos, certificado sintético e canais externos simulados.
2. Testar a emissão direta autorizada por médico.
3. Testar preparação autorizada de receita e pedido de exames por enfermagem.
4. Testar aprovação e rejeição pelo médico responsável.
5. Testar troca de responsável com pendências existentes.
6. Testar função sem mapeamento, concessão desligada, unidade errada, empresa errada, cliente errado, sessão ausente, expirada e revogada.
7. Testar tentativa de alterar a identidade do emissor, aprovar como enfermagem, autoelevar administrador e aprovar pedido de outra unidade.
8. Testar repetição, clique duplo, duas aprovações simultâneas, falha do banco e resposta HTTP perdida após persistência.
9. Confirmar que o histórico registra preparador e signatário distintos quando aplicável.
10. Confirmar zero mensagens, uploads ou contatos reais.
11. Conferir o modo celular e computador e os controles principais da tela.
12. Executar revisão independente sequencial sobre o código e a matriz de falhas antes da homologação.
13. Manter a jornada clínica global como BLOQUEADA até também cumprir os bloqueios da especificação relacionada de homologação de receitas e exames.

## 9. Definição de pronto desta funcionalidade

1. As permissões globais e locais são aplicadas no servidor, não apenas no menu.
2. Médico autorizado emite sob a própria identidade.
3. Enfermagem autorizada só cria pendência, nunca emite ou assina.
4. Médico responsável vê, confere, aprova ou rejeita apenas solicitações da unidade autorizada.
5. Repetição e concorrência não criam documentos duplicados.
6. Dados e histórico persistem e ficam isolados por empresa, unidade, cliente e profissional.
7. Testes sintéticos cobrem caminhos autorizados e proibidos, falhas e efeitos externos iguais a zero.
8. Revisão independente sequencial não deixa impeditivos.
9. A interface é verificada em celular e computador; se o ambiente não permitir tela autenticada, a homologação fica explicitamente BLOQUEADA.
10. Nenhum resultado deste escopo, isoladamente, declara o sistema pronto para atendimento clínico real.

## 10. Sequência do PAXTER Loop

1. DESENHAR e ESPECIFICAR — este documento e a inspeção das rotas existentes.
2. PREVER FALHAS — revisar a matriz antes de tocar banco ou emissão.
3. CONSTRUIR — executar uma única unidade por vez, atualizando esta especificação quando surgir impeditivo.
4. REVISAR — parar a implementação e solicitar revisão independente sequencial.
5. TESTAR — aplicar testes de contrato, persistência, autorização, repetição, interface e efeitos externos.
6. HOMOLOGAR — somente com evidência dos requisitos aplicáveis e sem impeditivos.
7. APRENDER — registrar apenas regras duráveis, sem salvar histórico de implementação na memória.
