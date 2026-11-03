# Auditoria da identidade profissional no menu e nos documentos

## Objetivo

Determinar, para cada item do menu lateral, se a ferramenta reconhece o colaborador autenticado e, quando cria ou emite documento clínico, se deriva profissional, cliente e clínica de fontes autorizadas no servidor.

## Escopo obrigatório

1. Inventariar cada item navegável declarado no menu lateral e mapear para a rota e o componente exibido.
2. Classificar cada tela como administrativa, operacional, clínica, emissora de documento ou somente visualizadora.
3. Verificar a barreira de autenticação no navegador e no servidor; não considerar menu oculto ou `localStorage` como autorização.
4. Em fluxos clínicos, rastrear separadamente o preparador, o aprovador e o profissional que assina ou emite.
5. Verificar se clínica e cliente são conferidos por vínculos do servidor, sem confiar em identificadores enviados pelo navegador.
6. Conferir se as liberações por função e por clínica são respeitadas antes da emissão e do envio.
7. Executar somente testes sintéticos ou unitários com provedores externos simulados; não emitir documentos reais nem enviar mensagens a clientes.
8. Registrar cada tela e rota como conforme, incompleta, não conforme ou não avaliada, com evidência e limitação.

## Falhas previstas

| Gravidade | Falha | Barreira esperada |
|---|---|---|
| Crítica | Rota direta sem sessão válida | Bloqueio no servidor e no acesso à tela |
| Crítica | Navegador escolhe médico, clínica ou cliente não autorizado | Recarregar identidade e vínculo no servidor |
| Crítica | Profissional preparador aparece como médico assinante sem autorização | Separar autoria, aprovação e assinatura |
| Alta | Tela de emissão usa médico padrão/global quando há sessão autenticada | Derivar emissor da identidade validada |
| Alta | Papel global permite ação sem concessão local da clínica | Exigir as duas autorizações aplicáveis |
| Alta | Reenvio cria documento novo ou repete envio incerto | Reutilizar documento existente e exigir conferência humana |
| Média | Item do menu, rota e ferramenta de permissões não correspondem | Mapear e reconciliar os três contratos |

## Definição de conclusão da auditoria

1. Todos os itens do menu lateral têm rota e componente identificados.
2. Cada ferramenta clínica e cada rota de emissão, leitura, assinatura e reenvio têm identidade e autorização rastreadas.
3. Lacunas de código e cobertura de teste são descritas com evidência; inventário não equivale a correção.
4. Não há emissão, envio externo, mudança de dados ou alteração de permissão durante a auditoria.
5. A auditoria não declara homologação global se rotas, provas ou telas protegidas não puderem ser verificadas.

## Resultado da auditoria — 02/11/2026

### Conclusão executiva

**NÃO HOMOLOGADO.** O menu e os fluxos clínicos não aplicam uma única regra de identidade. Há fluxos seguros de prescrição e exame, mas também há telas e rotas que não exigem a identidade individual do colaborador.

### Cobertura do inventário

Foram encontrados 89 itens de navegação no menu lateral. Todos foram associados a uma rota declarada no aplicativo; o item “Perfil do Administrador” usa a rota `/professionals` com o parâmetro `selfAccess=1`.

| Verificação | Resultado |
|---|---:|
| Itens de menu inventariados | 89 |
| Itens com barreira explícita `CollaboratorGate` na rota do navegador | 26 |
| Itens sem essa barreira explícita | 63 |

A ausência de `CollaboratorGate` não prova, sozinha, que a interface de programação de aplicações (API) esteja aberta. Porém, a tela do navegador não é bloqueada de forma uniforme, e é preciso avaliar a autorização de cada rota no servidor.

### Achados prioritários

| Prioridade | Evidência verificada | Consequência |
|---|---|---|
| Crítica | `usePermissoes()` define acesso total quando não há colaborador identificado; o `Layout` não redireciona toda sessão ausente ou inválida; somente 26 dos 89 itens têm `CollaboratorGate` explícito. | A permissão visual do menu não pode ser tratada como autenticação. A identidade precisa ser exigida no servidor em cada operação protegida. |
| Crítica | `POST /dieta/emitir-pdf` e `POST /dieta/enviar-pdf-email`, em `artifacts/api-server/src/routes/dieta-pdf.ts`, não usam `requireCollaborator`. A emissão procura um profissional global marcado como principal e fixa `EMPRESA_ID = 5`; a rota de e-mail usa o cadastro do cliente para o destino. | O documento não deriva o autor da pessoa autenticada e a rota de envio não exige sessão individual. Não foi chamada durante esta auditoria. |
| Crítica | `GET /cockpit/:clientId` e `GET /cockpit/:clientId/pdf`, em `artifacts/api-server/src/routes/cockpit.ts`, não usam `requireCollaborator`. Sem identidade válida, `tenantContextMiddleware` mantém o contexto legado da empresa 5; em desenvolvimento, a autenticação básica pode ser desativada se as credenciais de ambiente não estiverem configuradas. | Dados consolidados do cliente podem ser consultados sem identidade profissional nominal nesse contexto. |
| Alta | As rotas de gestão e processamento de agendas em `artifacts/api-server/src/routes/receituario.ts` ficam protegidas por token de colaborador, mas não aplicam a permissão clínica global e local usada na emissão direta. `POST /receituario/processar` chama o processamento recorrente. | Um colaborador autenticado pode alcançar operações de agenda e processamento sem a mesma validação específica de autorização clínica. |
| Alta | `artifacts/api-server/src/routes/document-templates.ts` expõe operações de criação, edição e desativação sem `requireCollaborator`; a rota `/arsenal/modelos` também não está dentro do `CollaboratorGate`. | Modelos de atestado e encaminhamento podem ser alterados sem identidade individual do colaborador. |
| Alta | Atestados e encaminhamentos autenticam o colaborador e usam `resolveClinicalEmitter`, que valida profissional médico ativo e vínculo explícito à unidade do cliente. Essas rotas, porém, não chamam `clinicalToolAccess`; essa política cobre somente prescrição e pedido de exames. | A identidade do médico é conferida, mas as liberações globais e locais da Governança não são aplicadas nesses dois tipos de documento. A preparação por profissional não médico para aprovação médica também não aparece nesses fluxos. |
| Alta | `POST /protocols/:id/emit-document` exige colaborador e confere o vínculo à clínica, mas imprime o profissional armazenado no protocolo e registra separadamente quem autorizou a emissão. A rota pode enviar e-mail e gravar no Google Drive, sem uma verificação explícita de administrador ou de médico aprovador. | Autor do pedido, profissional impresso e pessoa que acionou a entrega são papéis diferentes; a regra de quem pode liberar essa entrega não está demonstrada como equivalente à Governança. |

### Fluxos com proteção coerente encontrada no código

1. A emissão direta de prescrição em `/prescriptions/emit` exige token individual, autorização global e local para a ferramenta, vínculo do colaborador à unidade do cliente e identidade médica conferida no servidor.
2. A emissão direta de pedido de exames em `/exam-requests/emit` aplica a mesma cadeia e rejeita o identificador de médico enviado pelo navegador quando diverge do colaborador autenticado.
3. Os pedidos enviados para conferência passam pelo fluxo de aprovação clínica; o médico revisor é validado como responsável atual da unidade.
4. A emissão direta pelo motor de receituário em `/receituario/emitir-prescricao` e a assinatura visual homologada também consultam autorização clínica e identidade do colaborador.
5. A criação, leitura e alteração de conjuntos pessoais de exames exigem colaborador e revalidam o vínculo clínico do cliente.
6. Atestados e encaminhamentos usam a identidade do colaborador e os dados do cliente carregados no servidor, não os nomes livres enviados pelo navegador. A lacuna é de permissão e de aprovação delegada, não de derivação básica da identidade.

### Testes executados

1. Seis conjuntos de testes focados em identidade clínica, política de acesso, emissão, aprovação e entrega: **105 aprovados e 1 reprovado**, em 106 testes.
2. O teste reprovado é `clinical-delivery-routes.test.ts`: ele lê a primeira condição SQL da lista e espera encontrar a relação com a clínica; essa primeira condição corresponde à consulta da identidade profissional. O código também contém a filtragem por vínculo na clínica. O teste, portanto, não prova por si só uma quebra de autorização; a asserção de ordem da consulta está desatualizada ou frágil.
3. A execução integral do conjunto do servidor de interface de programação de aplicações, com 83 arquivos, registrou **1.103 aprovados, 68 reprovados e 1 ignorado**. Houve falhas em sete conjuntos: isolamento de mensagens do Telegram, administração do Concierge, área de exames, assinatura de prescrições, documento premium de protocolos, ativação de lembretes e entrega clínica.
4. Os testes de identidade e envio inspecionados substituem banco e provedores por simulações. Nenhuma chamada a cliente, emissão real ou envio externo foi executado por esta auditoria.

### Limites e evidência ausente

1. A auditoria mapeou os 89 itens do menu e verificou a barreira visual comum e os fluxos clínicos de maior risco; não executou uma prova de invasão ou uma bateria individual de interface para cada uma das 89 telas.
2. A tela autenticada não foi validada visualmente nesta sessão. O navegador de captura disponível não compartilha a sessão do usuário.
3. Não foram consultados nem alterados registros reais do banco de desenvolvimento; não foi certificada a situação atual de cada vínculo e liberação cadastrados.
4. A autenticação básica do perímetro, quando habilitada, é uma credencial compartilhada e não substitui a identidade nominal do colaborador.

### Fechamento do PAXTER Loop

| Etapa | Estado |
|---|---|
| Desenhar e especificar o escopo da auditoria | Concluída |
| Prever falhas e definir limites sem efeitos externos | Concluída |
| Construir correções | Não executada; esta etapa foi somente de auditoria |
| Revisão independente sequencial | Pendente |
| Testar | Executado; há testes focados aprovados e uma reprovação, além de falhas no conjunto integral |
| Homologar | Bloqueada pelos achados e pela revisão independente pendente |

Nenhum arquivo de aplicação, registro de cliente, permissão, documento ou configuração foi alterado. Esta etapa acrescenta somente este registro de auditoria.
