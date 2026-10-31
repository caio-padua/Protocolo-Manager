---
name: Governanca/multi-clinica parada (braco pendente)
description: Pausa geral da governanca multi-clinica, com excecao expressa para seguranca do envio do guia.
---

# Braco multi-clinica / governanca: retomado com autorizacao expressa

Decisao original do CEO Dr. Caio em 20/06/2026: o escopo grande de governanca e multiclínica ficou
guardado como especificacao e nao deveria ser construido sem nova autorizacao.
Em 30/10/2026, o CEO autorizou expressamente ativar o isolamento completo entre clinicas.
Essa autorizacao retoma o isolamento e a identidade necessaria, mas nao autoriza alterar cobrancas,
tarifas ou publicar/sincronizar o sistema.

**Onde mora o escopo:** `specs/governanca-multiclinica-PENDENTE.md` (semente; retomar so por ordem
expressa do CEO). Referencia visual: Canvas ENTREGA 7 (selo "7").

**Why:** a pausa original protegia a prioridade operacional da epoca. A autorizacao posterior muda
essa prioridade para preparar o isolamento completo entre clinicas, sem reabrir cobrancas.

**How to apply:** implementar o isolamento em unidades sequenciais, com vinculos autenticados no
servidor e testes sinteticos. `empresas` representa organizacoes e `locations` representa unidades
fisicas. Nao inferir autoridade global nem usar empresaId do navegador para conceder acesso.

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
## Regra vigente

O CEO autorizou em 30/10/2026 a retomada do isolamento completo entre clinicas, com execucao sequencial.
O acesso atual deve ser preservado ate que cada cadastro profissional tenha e-mail ou CPF preenchidos.
O acesso global do proprietario deve ser vinculado explicitamente a um cadastro verificado, sem inferir
essa autoridade de um parametro do navegador.

**Why:** a troca imediata do identificador de acesso bloquearia as contas existentes sem e-mail ou CPF.

**How to apply:** manter o login atual durante a transicao; depois que o cadastro receber e-mail ou CPF,
permitir o novo identificador e deixar de aceitar o login antigo para essa conta. A troca de empresa e o
acesso global precisam ser conferidos no servidor.
