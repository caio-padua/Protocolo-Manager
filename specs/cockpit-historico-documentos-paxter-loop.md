# PAXTER LOOP — Histórico de documentos do Cockpit

**Data:** 01/11/2026  
**Estado:** ESPECIFICAÇÃO — implementação ainda não iniciada  
**Escopo:** rota atual `/cockpit/:clientId/:aba`  
**Execução:** sequencial, uma unidade por vez; sem envios reais durante os testes

## 1. Objetivo

Oferecer um histórico recolhível e coerente para cada tipo de documento clínico emitido dentro do Cockpit. Cada documento existente deve poder ser aberto, baixado e reenviado de forma explícita, com o paciente, profissional, clínica, destinatário e canal conferidos.

A Prescrição foi aprovada pelo CEO como referência tipográfica do Cockpit. A organização funcional de cada ferramenta permanece própria. A seleção e busca de cliente não serão alteradas.

## 2. Inventário confirmado

| Ferramenta | Estado atual confirmado | Mudança necessária |
|---|---|---|
| Prescrições | O histórico aparece antes do formulário e oferece confirmação de destinatário e canal para envio. A lista não oferece, por item, os PDFs da receita. | Mover o histórico para o fim da tela; recolher por controle acessível; mostrar os arquivos da prescrição e permitir abrir, baixar e reenviar o documento já emitido. |
| Pedidos de Exames | O histórico já lista documentos, permite seleção e envio confirmado por canais e mostra operações pendentes. | Recolher por controle acessível; acrescentar abertura e download por documento sem enfraquecer autorização, reserva, auditoria ou proteção contra reenvio incerto. |
| Atestados | Há histórico, PDF e link do Drive. As rotas de leitura e PDF não aplicam autenticação individual nem conferência clínica local. | Proteger todas as operações; filtrar pelo cliente autorizado; incluir controle recolhível e abrir, baixar e reenviar apenas o PDF já emitido. |
| Encaminhamentos | Há histórico, PDF e link do Drive. As rotas de leitura e PDF não aplicam autenticação individual nem conferência clínica local. | Proteger todas as operações; filtrar pelo cliente autorizado; incluir controle recolhível e abrir, baixar e reenviar apenas o PDF já emitido. |

Não foi encontrada uma ferramenta de emissão de Laudos nesta rota do Cockpit. Laudos de laboratório recebidos não serão tratados como documentos emitidos pelo médico. A existência de outra ferramenta de laudo será reportada como lacuna, sem criar uma nova ferramenta nesta entrega.

## 3. Requisitos de interface

1. Um controle independente por tipo de documento, fechado por padrão.
2. Usar o padrão Paxter `ToggleWell`, com rótulo claro, estado acessível e área de toque adequada para celular.
3. A lista só deve carregar quando aberta; erro de consulta nunca deve ser apresentado como histórico vazio.
4. A seção de Prescrições emitidas ficará depois de todo o conteúdo de emissão da Prescrição.
5. Cada documento terá ações visíveis e separadas: **Abrir**, **Baixar** e **Reenviar PDF emitido**.
6. A ação de reenviar não será acionada ao abrir a lista ou o arquivo. Ela exigirá a escolha explícita de um destinatário, canal e confirmação final.
7. Os canais disponíveis devem respeitar os contatos autorizados e existentes: e-mail, WhatsApp e Telegram. Um canal indisponível não pode aparecer como opção válida.
8. E-mail recebe o PDF anexado; WhatsApp e Telegram recebem um link aleatório, restrito ao mesmo PDF e válido por sete dias.
9. Ao trocar o cliente, a lista, os documentos selecionados, o destinatário, a confirmação e o resultado anterior devem ser limpos. Respostas atrasadas do cliente anterior não podem preencher a tela.
10. Abrir o documento deve usar a sessão autenticada e abrir em nova aba. Baixar deve ser uma ação distinta, com nome de arquivo legível.
11. Manter a tipografia e o vocabulário visual já aprovados para o Cockpit, sem alterar o seletor de clientes.

## 4. Requisitos de segurança e integridade clínica

1. Exigir sessão válida de colaborador para listar, ler, criar, editar, emitir, abrir, baixar e reenviar Atestados e Encaminhamentos.
2. Antes de qualquer operação clínica, conferir no servidor o vínculo do médico autenticado com o cliente e a clínica ativa usando a fonte clínica vigente. O identificador de clínica recebido do navegador não concede acesso.
3. Derivar a identidade do cliente, do médico e da clínica dos registros autorizados no servidor. Rejeitar divergência de identificador profissional ou de cliente.
4. A listagem deve exigir o cliente do Cockpit e retornar somente os documentos comprovadamente pertencentes a esse cliente. Não oferecer listagem ampla sem cliente.
5. Um registro antigo sem `clientId` ou sem vínculo verificável não pode ser associado por nome, telefone ou CPF. Bloquear sua abertura e registrar a limitação.
6. Acesso por identificador de documento deve repetir a autorização; não basta o documento ter sido retornado por uma consulta anterior.
7. A visualização e o download não devem gerar nem alterar documentos. Mostrar apenas documentos emitidos e persistidos; rascunhos não podem ser apresentados como emitidos.
8. Reenviar significa transmitir o mesmo PDF já emitido. Não reemitir, alterar, assinar novamente nem substituir o documento.
9. Registrar profissional, cliente, clínica, documento, canal, destinatário validado, horário e resultado por tentativa, sem colocar conteúdo clínico em logs genéricos.
10. Resultados incertos, falhas depois do início do envio e respostas perdidas devem permanecer para conferência humana. Não permitir repetição automática ou por uma nova chave que contorne uma operação pendente.
11. Os caminhos permitidos e proibidos devem ser testados com provedores simulados. Os testes não podem chamar WhatsApp, Telegram, e-mail real, farmácias ou clientes.
12. Preservar todos os registros existentes. Nenhuma exclusão, limpeza, substituição de banco ou mudança de cobrança faz parte desta especificação.
13. O link público de compartilhamento deve usar token aleatório não enumerável, consultar somente o documento e o tipo vinculados ao token, recusar links expirados e não armazenar em cache.

## 5. Impacto previsto

- A experiência do Cockpit ficará mais previsível e reduzirá o espaço ocupado por históricos extensos.
- A leitura clínica ficará mais segura porque Atestados e Encaminhamentos deixarão de depender apenas de identificadores sequenciais e da guarda genérica.
- A adição de reenvio cria efeitos externos; por isso, destinatário, canal, auditoria, idempotência e tratamento de resultado incerto são condições de liberação, não melhorias opcionais.
- O estado atual não prova que todos os documentos existentes têm cliente, clínica e profissional vinculados de forma suficiente. Registros sem prova permanecerão bloqueados, não serão “consertados” por aproximação.

## 6. Falhas previstas e resposta exigida

| Falha prevista | Resposta obrigatória |
|---|---|
| Sessão ausente, expirada ou revogada | Recusar a operação sem retornar o documento. |
| Cliente de outra clínica ou médico sem vínculo ativo | Recusar antes de listar, abrir, baixar, emitir ou enviar. |
| Identificador do navegador divergente do registro | Recusar e registrar a tentativa sem expor conteúdo. |
| Registro histórico sem vínculo de cliente verificável | Não abrir nem reenviar; mostrar estado de conferência, sem inferir a identidade. |
| Link de compartilhamento expirado | Retornar acesso negado sem revelar se outro documento ou cliente existe. |
| Falha ao carregar histórico | Exibir erro e opção de tentar novamente; não afirmar que está vazio. |
| PDF ausente ou documento não emitido | Bloquear abrir, baixar e reenviar; não regenerar silenciosamente. |
| Destinatário ausente ou contato alterado | Pedir nova conferência; não reaproveitar confirmação anterior. |
| Clique duplo, tempo excedido ou resposta perdida | Bloquear repetição automática e consultar o histórico da operação. |
| Falha de canal ou aceitação sem entrega confirmada | Registrar o resultado real, canal a canal, sem afirmar entrega. |
| Troca de cliente enquanto a consulta está pendente | Ignorar a resposta antiga e limpar seleção e confirmação anteriores. |
| Falha em teste que poderia enviar uma mensagem real | Falhar fechado e impedir a execução do teste. |

## 7. Sequência de execução — sem paralelismo

1. **Especificar e congelar o contrato:** manter este documento atualizado; confirmar a fonte de auditoria, os contratos de PDF e os testes que já existem.
2. **Unidade A — acesso seguro a Atestados e Encaminhamentos:** autenticação, vínculo profissional-cliente-clínica, filtros por cliente e bloqueios de leitura/escrita/arquivo. Testar permitido, sem sessão e combinação não autorizada.
3. **Revisar a Unidade A:** revisão independente antes de avançar. Se não houver revisor independente, registrar como BLOQUEADA; revisão própria não substitui esta etapa.
4. **Unidade B — reenvio do PDF existente:** selecionar canal e destinatário, confirmação explícita, auditoria e idempotência para Atestados e Encaminhamentos. Não fazer reemissão. Usar provedores simulados.
5. **Revisar a Unidade B:** resolver todos os bloqueadores antes da interface final.
6. **Unidade C — interface e arquivos:** mover Prescrições ao fim; recolher os quatro históricos; implementar abertura, download e reenvio por documento, respeitando os contratos existentes de Prescrição e Exames.
7. **Revisar a Unidade C:** procurar regressões de acesso, estado do cliente, duplicação de envio e divergência visual entre celular e computador.
8. **Homologar:** rodar testes dirigidos, compilação e inicialização; conferir as capturas em celular e computador. A demonstração autenticada só será declarada visualmente verificada se a sessão de teste autorizada estiver disponível.
9. **Aprender:** registrar apenas decisões e lacunas que precisem orientar trabalho futuro.

## 8. Critérios de conclusão

1. Os quatro históricos listados na seção 2 estão recolhidos por padrão e abrem/fecham por controles acessíveis.
2. O histórico de Prescrições está no fim da ferramenta.
3. Cada documento emitido tem ações separadas de abrir e baixar.
4. Reenvio do PDF exige documento emitido, sessão válida, cliente e clínica autorizados, destinatário, canal e confirmação.
5. Testes demonstram acesso autorizado e rejeição de acesso anônimo, cliente incorreto, clínica incorreta e documento fora do escopo.
6. Testes demonstram que a troca de cliente limpa estado e que operação incerta não dispara novo envio automaticamente.
7. Testes simulados demonstram zero mensagens reais e registro dos resultados por canal.
8. Link compartilhado funciona antes de sete dias e falha depois de expirado; link nunca permite trocar o identificador do documento.
9. Falhas de consulta não aparecem como listas vazias.
10. Interface passa a revisão visual Paxter em celular e computador, incluindo alinhamentos e áreas de toque.
11. A revisão independente e todas as verificações exigidas pelo PAXTER Loop estão concluídas. Sem isso, o estado final é BLOQUEADO ou PARCIAL, nunca “100%”.

## 9. Fora de escopo

- Criar uma ferramenta de Laudos que não existe na rota atual.
- Alterar a busca ou o seletor de clientes.
- Alterar outros módulos, o licenciamento, cobranças ou integrações comerciais.
- Enviar mensagens reais durante testes ou homologação.
- Reescrever motores de Prescrição e Exames que já possuem autorização e despacho próprios.
