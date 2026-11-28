# Debounce, IA leve de intenção e Sinapses (Tronco/Ramificação)

## O que muda
1. WhatsApp: mensagens seguidas do mesmo contato esperam 4 s (teto 12 s) e viram uma entrada. Todas ficam registradas na Central; as anteriores recebem `agrupada`.
2. IA leve: só devolve uma palavra de lista fechada (intenção). Nunca escreve texto ao cliente. Falha ou resposta fora da lista = regras atuais.
3. Pergunta inédita não clínica: registrada em `atendimento_perguntas_ineditas` (estado pendente) para curadoria humana. Não gera resposta automática.
4. Sinapses: 6 troncos e ramos em `lib/atendimento-taxonomia.ts`; colunas `tronco`/`ramo` em `telegram_faq_aprendidas`; isolamento por `empresa_id`.
5. Cérebro Global: nada compartilhado entre clínicas nesta etapa.

## Falhas previstas
| Falha | Tratamento |
|---|---|
| Reinício durante a espera | varredura a cada 60 s retoma `aguardando_agrupamento` com mais de 15 s |
| Resposta dupla | UPDATE ... RETURNING atômico reivindica o grupo |
| Mensagem clínica | nunca vai à IA nem ao registro |
| Dado pessoal na pergunta | filtro bloqueia gravação e envio ao provedor |
| IA indisponível | cai nas regras, custo registrado |

## Testes
SMOKE (workers), DADO (tabelas e colunas), LOG: ver relatório final. Teste automático de Evolution roda sem espera (`NODE_ENV=test` ou `EVOLUTION_AGRUPAMENTO_MS=0`).
