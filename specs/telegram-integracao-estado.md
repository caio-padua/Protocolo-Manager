# Telegram — estado do trabalho (arquivo durável)

Enquadramento obrigatório: Deduplicação, autorização e isolamento seguem testados em desenvolvimento. O worker restrito agora inicia, conecta ao banco, hidrata o cofre, executa ticks e sobrevive a um reinício; nenhum repasse real foi comprovado nesta rodada porque o outbox estava vazio. Produção permanece desligada.

## Etapa atual
Etapa 7 — serviço de IA "Dúvidas e Orientações" (Etapas 3 a 6 feitas em desenvolvimento).

## Etapa 1 — Deduplicação (feita, desenvolvimento)
- Chave (chat_id, update_id), índice único parcial `ux_telegram_inbox_chat_update`; tabela de backup `telegram_inbox_messages_bkp_20261113` preservada.
- Evidência: banco descartável 14/14; teste real em desenvolvimento com 2 updates sintéticos e 10 repetições = 1 linha cada.

## Etapa 2 — 30 falhas de autorização de envio (FEITA)
| Grupo | Esperado (teste antigo) | Obtido | Causa |
|---|---|---|---|
| Todos os 30 (rotas telegram e guia) | 200/403/404 | 500 | O teste simulava o banco só para tabela de clientes; o middleware de clínica (`tenantContext`) passou, em 31/10/2026 (commit 8a8b1540), a ler profissional/vínculos/empresa no banco e a conferir `credentialVersion`. A simulação do teste ficou antiga. |

Prova de linha de base (ambiente isolado, `git archive` em /tmp com dependências ligadas):
| Versão | Resultado |
|---|---|
| 3e26a65f (30/10/2026, criação do teste) | 34 de 34 passam |
| 8a8b1540 (31/10/2026, refatoração de autenticação) | 30 falham |
| 484fe0b6, 2743c46b, f963cef0 (antes do trabalho Telegram desta sessão) | 30 falham |
Conclusão: as 30 falhas NÃO nascem da deduplicação; nasceram em 31/10/2026 por divergência entre teste e a autenticação nova.

Resultado da correção:
- Teste reescrito para o contrato atual (simulação por tabela; nenhuma recusa removida; ganhou casos novos).
- ACHADO REAL no código: o envio do guia (`resolveOnboardingClinic`) não conferia a versão da credencial; token de senha já trocada continuava enviando por até 12 horas. Corrigido (`p.credential_version = claims`), com teste em banco temporário real e no teste de isolamento.
- Duas outras suites que dependem desse SQL (`onboarding-clinic-auth`, `onboarding-envio-autorizacao`) foram ajustadas (coluna e parâmetro novos). Baseline delas: 32/32 antes; agora passam.
- Provas exigidas: autorizado envia ao paciente permitido (clínicas 5 e 7); sem token = 401; profissional sem vínculo/inativo/credencial revogada = recusado; clínica 7 selecionando clínica 5 = 403 antes de consultar cliente; cliente de outra clínica = 404; troca de clienteId/empresaId/chatId/destinatário no corpo não muda o destino (vem do cadastro da clínica do token); cabeçalho x query divergentes = 400; proprietário da plataforma escolhendo outra clínica continua restrito à consulta da clínica do vínculo.
- Resultado: isolamento 42/42; suíte `src/tests/telegram` 201 passam, 14 ignorados (banco descartável quando roda junto) — o arquivo de banco descartável passa 14/14 isolado.

## Etapa 3 — recebimento (FEITA em desenvolvimento)
| Nível | Esperado | Obtido | Passou |
|---|---|---|---|
| SMOKE | 6 entregas do mesmo update = 1 efeito | 6x HTTP 200, 1 linha `concluido` com dono | sim |
| DADO | reivindicação atômica no banco real (25 simultâneas = 1) | banco descartável 12/12 (inclui dono antigo não sobrescreve, reinício, bots distintos) | sim |
| DADO | todos os fluxos (senha, chat sem vínculo, link mágico, /start, mensagem, simultâneo, bot distinto, falha passageira) | rota 17/17 | sim |
| LOG | sem texto, token ou dado clínico | testes B2, X3, D2 verificam | sim |
Critérios documentados: falha passageira de banco/cofre = 500 + liberação (Telegram reentrega); reentrega de update em processamento = 500; concluído = 200 sem efeito; falha permanente = 200 + log; claim indisponível por erro permanente = processa sem dedupe com ERROR (a segunda defesa do inbox permanece).
Revisão independente: 1 rodada. Achados corrigidos: dono da reivindicação, ACK só depois do fechamento durável, cofre indisponível = 500, logs saneados, registro do repasse antes do 200.

## Etapa 4 — recuperação do repasse (FEITA em desenvolvimento; ver specs/telegram-repasse-outbox.md)
- Tabela aditiva `telegram_repasse_ceo` (estados: pendente, enviando, aceito_telegram, falhou, esgotado, incerto). Salvo != entregue; sem promessa de exatamente-uma-vez; incerto nunca é reenviado sozinho.
- Registro no outbox acontece ANTES do 200; reentrega de mensagem já salva refaz o registro (idempotente).
- Retomada: job a cada minuto no perfil restrito do worker existente, no workflow único `api-worker: Telegram development`. Dois ticks foram concluídos, antes e depois de um reinício; ambos encontraram zero repasses. O perfil agenda somente o outbox e não inicia outros jobs.
- Evidência: banco descartável 13/13 (concorrência 20 = 1 envio, limite de tentativas, processo caiu = incerto, cascata).
- NÃO provado ao vivo: repasse real ao chat da clínica (evitei inserir mensagem sintética no cadastro de cliente real). Entra no teste real autorizado da Etapa 6.

## Etapa 5 — configuração unificada e isolamento (FEITA em desenvolvimento)
| Nível | Esperado | Obtido | Passou |
|---|---|---|---|
| DADO | processo que NÃO hidrata o ambiente (script) lê o chat de alerta certo | script avulso resolveu o chat da clínica (final 9822) a partir do cofre, apesar de o Secret do ambiente ter formato inválido | sim |
| DADO | valor inválido nunca é usado nem troca de chat | testes: texto, curto, letras, "+" rejeitados com motivo `formato_invalido`; cofre fora = `cofre_indisponivel` | sim |
| DADO | vínculo ambíguo (mesmo chat em 2+ clientes) não escolhe cliente | rota: nada gravado no prontuário, pendência criada, 1 aviso sem texto clínico, reentrega não reavisa; banco real: 1 pendência mesmo com 15 simultâneas | sim |
| SMOKE | boot cria tabela de pendências | `telegram_vinculo_pendencias` criada no desenvolvimento | sim |
Mudanças: função única `lib/telegram-config.ts` (cofre > ambiente, validação numérica) usada pelo webhook, rota de reenvio, guarda do webhook, foto de perfil, relatório Slack e monitor do worker; o api-worker passou a hidratar o cofre no boot (mesma regra da API).
Estado real do vínculo hoje: 2 chats vinculados, sem duplicidade (cliente 44 = chat pessoal do Dr. Caio; cliente 1924 = clínica). Nada mesclado.
Chat de alerta da clínica NÃO foi trocado. Secret `PADAXOR_TELEGRAM_CHAT_ID` do ambiente continua com valor inválido (decisão do Dr. Caio corrigir na tela de Configurações; o sistema agora o ignora com motivo explícito).

## Etapa 6 — lembretes no Telegram pelo motor existente (FEITA em desenvolvimento; produção desligada)
Motor reaproveitado: `executarLembretesPeriodo` (lib/lembrete-periodo), mesmo cron de 1 minuto do api-worker (Job 2). Nenhum cron novo.
| Nível | Esperado | Obtido | Passou |
|---|---|---|---|
| DADO | cada janela leva só os períodos dela (a das 18:00 não repete abertura nem doses da manhã) | `periodosDaJanela` + testes; antes o motor passava TODOS os períodos em toda janela e a abertura usava o primeiro (manhã) | sim |
| DADO | texto por dia da semana, por período, semana do mês; versículo só no sábado | mensagens reais do catálogo geradas para seg 07:00, seg 18:00, sáb 18:00, qua 11:00: aberturas diferentes por período; versículo só no sábado | sim |
| DADO | canal Telegram só quando liberado e vinculado | modo `desligado` (padrão), `lista`, `ligado`; lista ilegível = desligado; sem chat = WhatsApp; 14 testes do motor | sim |
| DADO | sem token não conta como entregue; 403 vira FALHOU com código curto; 2 ticks na mesma janela = 1 envio | testes | sim |
| DADO | mensagens motivacionais continuam nos dias úteis e de sábado; versículo aparece somente no sábado (BRT) | teste sintético dedicado do montador + conferência de leitura do catálogo real para sexta e sábado | sim |
| LOG | execução AUTOMÁTICA real | Job 2 do worker executado isolado (mesmo agendamento `* * * * *`): às 03:05:01 BRT, janela 03:05, tick sozinho enviou 1 mensagem; `lembrete_envios` id 306 = ENVIADO; log de mensagens id 166 via=telegram status=sent | sim |
Envio real: 1 mensagem, texto NÃO clínico ("MENSAGEM DE TESTE DO SISTEMA"), ao chat autorizado da cliente 1924 (contato do Dr. Caio). Não confirmei visualmente a chegada (API do Telegram aceitou; Dr. Caio pode conferir no aparelho).
Ajustes de teste para a prova (todos revertidos): autorização de lembrete (registro de teste em `dispatch_log`, apagado), chaves `lembrete.telegram.*` (apagadas), lembrete 54 da cliente 1924 (mantido DESATIVADO como evidência, junto com os envios). Cliente 44 não foi tocado (sem autorização de lembrete, nada saiu para ela).
Correção extra: a saudação do modelo simples usava a hora do servidor (UTC); agora usa Brasília (`lib/brt`).
Achados para o Dr. Caio (não alterei conteúdo do catálogo): (a) período "Almoço" usa saudação "Boa tarde" mesmo às 11:00; (b) a frase de status do Dr. Caio varia por dia da semana, então manhã e noite do mesmo dia repetem essa frase; (c) o perfil restrito de desenvolvimento processa só repasses; o Job 2 de lembretes não foi ativado nele para evitar disparos a clientes.
Para ligar em produção (só com o comando "100%"): gravar `lembrete.telegram.modo` = `lista` (testes) ou `ligado`, e cada cliente precisa de autorização de lembrete recorrente válida.

## Revisão de retomada — 13/11/2026 (prioridade de autorização, testes e lembretes)
- Autorização e isolamento revalidados: 24 arquivos / 361 testes passaram, incluindo os testes das rotas Telegram e guia; as recusas de clínica, cliente, credencial e token adulterado continuam cobertas.
- O teste do Cockpit agora também confirma que uma mensagem humana pausa o atendimento automático daquele cliente; a lógica de autorização e o destino do envio não foram alterados.
- Banco temporário isolado: deduplicação 14/14, reivindicação 11/11, encaminhamento/outbox 15/15 e concorrência de lembretes 13/13. Nenhum desses testes escreveu no banco da aplicação.
- Teste automatizado adicional confirma que a mensagem motivacional permanece na sexta e no sábado, e que o versículo só aparece no sábado no fuso de Brasília.
- Execução de leitura do catálogo real, sem envio: catálogo disponível; frase motivacional detectada na sexta e no sábado; versículo ausente na sexta e presente no sábado.
- Compilação do api-worker aprovada. A API respondeu `GET /api/brt` com HTTP 200 e as tabelas aditivas do Telegram estão presentes no banco de desenvolvimento.
- As chaves de modo do Telegram não estão gravadas em `app_settings`; pela regra do código, o modo permanece `desligado`. Nenhum envio real foi feito nesta retomada e nada foi ativado em produção.
- Retomada contínua do outbox: inicialização do banco e do cofre, dois ticks sem erro, reinício e instância única foram comprovados no workflow de desenvolvimento. Doze suítes focadas passaram (189 testes), incluindo 134 testes de autorização e isolamento; os testes de fluxo usaram dados sintéticos e transporte simulado.
- Limite ainda aberto: não houve repasse real, pois o outbox estava vazio; não foi necessário enviar teste aos contatos autorizados. O modo de lembretes segue desligado em `app_settings`, produção não foi tocada e o perfil restrito não executa o Job 2.
- A revisão independente continua pendente neste modo; portanto, o estado permanece BLOQUEADO para homologação e a próxima etapa não foi iniciada.
- Nos logs revisados, a API estava ativa; há avisos recorrentes de atualização da Agenda, fora deste escopo. Não declaro o log global sem avisos.

## Próxima ação
Etapa 7: serviço de IA "Dúvidas e Orientações" (somente orientações aprovadas; transferência humana pausa a IA; nunca recria prescrição).

### Etapa 7 — tela administrativa parcial (13/11/2026)
- Tela de administração criada em `/comunicacao/duvidas-orientacoes`, com rota protegida por `CollaboratorGate`, biblioteca de orientações e estado de atendimento humano.
- Não foi criado motor de mensageria, envio, geração documental ou agendamento; os botões usam somente as rotas já existentes.
- Evidências e limites da interface estão em `specs/duvidas-orientacoes.md`.
- A tela ainda não passou pela revisão independente obrigatória: o recurso de revisor está indisponível neste modo. Não declarar homologada.
- A captura sem sessão redireciona ao login; não houve homologação visual autenticada.
- Documentos e agenda permanecem fora desta entrega; a especificação funcional desses fluxos não foi localizada, portanto nenhuma ação foi inferida.

## Pendências conhecidas
- Etapas 7 e 8 não concluídas: IA (7), queixas clínicas (8).
- Tela para resolver as pendências de vínculo ambíguo ainda não existe (hoje a pendência é consultável no banco e avisa o chat de alerta).
- O outbox tem retomada contínua comprovada no workflow restrito de desenvolvimento; lembretes seguem no único Job 2 do worker completo e permanecem sem ativação em desenvolvimento nesta rodada.
- Repasse real do outbox ao chat de alerta ainda sem prova ao vivo.
- Nada publicado em produção.
