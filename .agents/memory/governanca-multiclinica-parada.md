---
name: Governanca/multi-clinica parada (braco pendente)
description: Pausa geral da governanca multi-clinica, com excecao expressa para seguranca do envio do guia.
---

# Braco multi-clinica / governanca: PARADO de proposito

Decisao do CEO Dr. Caio em 20/06/2026: o escopo grande (SaaS multi-clinicas, Centro de Comando,
Area do Colaborador com RBAC por papel+escopo, validacao opcional de agendamento) esta GUARDADO
como spec mas NAO deve ser construido agora.
Essa pausa geral permanece vigente, ressalvada a autorizacao restrita abaixo.

**Onde mora o escopo:** `specs/governanca-multiclinica-PENDENTE.md` (semente; retomar so por ordem
expressa do CEO). Referencia visual: Canvas ENTREGA 7 (selo "7").

**Why:** construir esse braco agora desviaria do foco combinado — operacionalizar AINDA HOJE o
auto-reagendamento da cliente (`specs/auto-reagendamento-cliente.md`). O CEO priorizou entregar o
operacional antes de abrir a frente arquitetural.

**How to apply:** se uma sessao futura cogitar implementar org layer / RBAC por escopo / centro de
comando / validacao por funcionario, confirmar com o CEO ANTES — esta pausado, nao esquecido. A
arquitetura escolhida (camada Organizacao acima de `locations`, isolamento por `organization_id`,
RBAC = pessoa+papel+escopo, app unico de colaborador) ja esta decidida; nao re-litigar do zero.

## Excecao autorizada em 29/10/2026: envio seguro do guia

O proprietario autorizou expressamente retomar apenas a seguranca entre clinicas no envio do guia.
Isso permite a correcao minima necessaria do vinculo autenticado entre colaborador e clinica nesse fluxo, a verificacao de pertencimento do cliente e o bloqueio de combinacoes sem autorizacao.
Nao autoriza reabrir o projeto inteiro de licenciamento, centro de comando, permissoes gerais ou cobrancas.

**Why:** A mensagem do guia precisa identificar a clinica correta sem permitir envio de dados ou marca de outra clinica a partir de parametros controlados pelo navegador.

**How to apply:** Resolver a clinica a partir de acesso autenticado e vinculo verificado no servidor; parametros de clinica servem apenas para conferir uma selecao autorizada, nunca para conceder acesso.
Na ausencia de autorizacao verificavel ou diante de cliente de outra clinica, bloquear antes de chamar os canais de envio.
Conferir o caminho autorizado, combinacoes proibidas e ausencia de contexto sem disparar mensagens clinicas reais como teste.
A autorizacao de escopo nao comprova implementacao nem envio de resposta a uma conversa de tarefa isolada.
## Exceção autorizada: isolamento do envio do Guia Digital

O responsável pelo produto autorizou em 29/10/2026 corrigir o vínculo entre colaborador e clínica no fluxo do Guia Digital, incluindo os bloqueios de envio entre empresas.

**Why:** o produto será comercializado para outras clínicas; apresentar uma marca diferente ou permitir contatos entre bases não é aceitável.

**How to apply:** essa autorização cobre identificar a clínica pela associação real do colaborador, carregar seus próprios clientes e conferir essa associação no envio do guia; não equivale a concluir a governança multiclínica de todas as ferramentas.
## Exceção restrita autorizada em 29/10/2026

O CEO autorizou somente a correção de segurança no envio do guia: vincular o colaborador à clínica autenticada, validar o pertencimento do cliente e bloquear combinações não autorizadas antes de enviar.

**Why:** a clínica informada pelo navegador não pode conceder acesso; a autorização não reabre licenciamento nem permite alterar cobranças.

**How to apply:** manter a correção local ao envio do guia e verificar caminhos permitidos e proibidos com os provedores de mensagens simulados, sem mensagens reais aos clientes.
