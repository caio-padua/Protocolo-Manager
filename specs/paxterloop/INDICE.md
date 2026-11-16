# Índice único das SPECs — regime PAXTER Loop (Manager/PAXMED)

Regime: `.agents/skills/paxter-loop/SKILL.md` e `CODIGO-PAXTER.md` (Arts. 75 a 82). Uma SPEC por vez; sem publicar; sem cobrança; modo Gratuito.
Estados: PENDENTE, EM EXECUÇÃO, TESTADO, BLOQUEADO, HOMOLOGADO. HOMOLOGADO só com aceite do Dr. Caio em operação real; o agente nunca se atribui esse estado.
Legenda de prova: MOCK (dependências simuladas), BANCO (PostgreSQL descartável, dados sintéticos), EXTERNA (serviço real), PRODUÇÃO.

| Nº | SPEC | Estado | Prova obtida | O que ainda falta |
|---|---|---|---|---|
| 1 | Composição segura das leituras Gemini/Claude/OpenAI | TESTADO | MOCK de IA + BANCO | EXTERNA (IA real) e PRODUÇÃO não feitas; conflitos só na trilha, sem tela |
| 2 | Fluxo de exames ponta a ponta (C1/C2, conversão, evolução) | TESTADO | BANCO + MOCK: 9 testes novos; 308 de regressão | tela de unidade pendente; recuperação de presos; IA real; produção |
| 3 | Recebimento pela Área do Cliente | TESTADO | BANCO + MOCK: 10 testes novos, bug de contagem corrigido | captura de tela; JPEG/PNG sem leitura; produção |
| 4 | Anexos PDF/foto no Telegram | EM EXECUÇÃO | código escrito (lib telegram-anexo-exame + ligação no webhook), tsc limpo, SEM teste novo | teste em banco descartável, spec, revisão |
| 5 | Cadastro de profissionais: Sede, Outro Local, Online, Home Care | PENDENTE | rótulo "Local externo" ainda existe | spec, compatibilidade, testes de persistência |
| 6 | Gerenciador comercial das categorias Prata/Ouro/Platinum/Diamond | PENDENTE | categorias existem sem regras comerciais | spec; valores e políticas dependem de decisão do gestor (não inventar) |

Dependências: 2 depende de 1; 3 e 4 dependem de 2; 5 e 6 são independentes das anteriores, mas só entram depois de 4.
Checkpoints: ver cada SPEC (seção "Checkpoint").
