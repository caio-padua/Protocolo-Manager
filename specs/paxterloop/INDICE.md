# Índice único das SPECs — regime PAXTER Loop (Manager/PAXMED)

Regime: `.agents/skills/paxter-loop/SKILL.md` e `CODIGO-PAXTER.md` (Arts. 75 a 82). Uma SPEC por vez; sem publicar; sem cobrança; modo Gratuito.
Estados: PENDENTE, EM EXECUÇÃO, TESTADO, BLOQUEADO, HOMOLOGADO. HOMOLOGADO só com aceite do Dr. Caio em operação real; o agente nunca se atribui esse estado.
Legenda de prova: MOCK (dependências simuladas), BANCO (PostgreSQL descartável, dados sintéticos), EXTERNA (serviço real), PRODUÇÃO.

| Nº | SPEC | Estado | Prova obtida | O que ainda falta |
|---|---|---|---|---|
| 1 | Composição segura das leituras Gemini/Claude/OpenAI | TESTADO | MOCK de IA + BANCO | EXTERNA (IA real) e PRODUÇÃO não feitas; conflitos só na trilha, sem tela |
| 2 | Fluxo de exames ponta a ponta (C1/C2, conversão, evolução) | TESTADO | BANCO + MOCK: 9 testes novos; 308 de regressão | tela de unidade pendente; recuperação de presos; IA real; produção |
| 3 | Recebimento pela Área do Cliente | TESTADO | BANCO + MOCK: 10 testes novos, bug de contagem corrigido | captura de tela; JPEG/PNG sem leitura; produção |
| 4 | Anexos PDF/foto no Telegram | TESTADO | MOCK: 10 testes novos; suíte Telegram 381 testes; teste de perfil do worker corrigido (3 crons) | prova EXTERNA e banco real do anexo; produção |
| 5 | Cadastro de profissionais: Sede, Outro Local, Online, Home Care | PENDENTE | rótulo "Local externo" ainda existe | spec, compatibilidade, testes de persistência |
| 6 | Gerenciador comercial das categorias Prata/Ouro/Platinum/Diamond | PENDENTE | categorias existem sem regras comerciais | spec; valores e políticas dependem de decisão do gestor (não inventar) |

Dependências: 2 depende de 1; 3 e 4 dependem de 2; 5 e 6 são independentes das anteriores, mas só entram depois de 4.
Checkpoints: ver cada SPEC (seção "Checkpoint").
| 7 | TEX — Descritivo de Evolução de Exames (PDF único + serviço opcional) | EM EXECUÇÃO | fatias 1 e 2 (rota interna) TESTADAS em MOCK, 17 testes | 2b portal, 3 configuração/pedidos, 4 Asaas sandbox, 5 botão |

## Fila PAXMED Pessoal B2C (registrada em 16/11/2026; só inicia após o checkpoint da SPEC TEX completa)
Regra: antes de cada SPEC, auditar o que já existe (finalidade, riscos, autenticação, tenant, dados, regras, aceitação, testes). Sandbox/mocks apenas; nenhuma chamada Asaas faturável; nenhuma mensagem a pessoa real; sem publicar.

| Nº | SPEC | Estado | Depende de | Observação |
|---|---|---|---|---|
| 8 | Arquitetura multi-produto: B2B Clínicas, Instituto Pádua (paciente vinculado), B2C Pessoal; identidades isoladas, vínculos múltiplos sem duplicar pessoa; médico sem vínculo + permissão expressa não vê dado B2C; inscrição/login independentes; contrato, privacidade, direitos LGPD, exportação, exclusão/retenção | FILA | 7 | base de todas as seguintes |
| 9 | Minhas Prescrições: Prescrições do Instituto Pádua, Prescrições externas, Enviar prescrição (PDF/foto, origem "informado pelo paciente", status de verificação, sem validar por inferência, sem alterar receita original) | FILA | 8 | reaproveita upload/armazenamento existentes |
| 10 | Meus Medicamentos (autodeclarados; sugestão de IA só como NÃO VALIDADA; nunca inferir dose; distinção externo x clínica x protocolos) | FILA | 9 | |
| 11 | Lembretes de medicamentos pelo motor existente: Telegram (WhatsApp só se o backend comprovar e houver consentimento específico), fuso, deduplicação, opt-in/out, horário de silêncio, pausa, reenvio limitado, auditoria sem conteúdo clínico | FILA | 10 | WhatsApp: verificar antes de prometer |
| 12 | Planos PAXMED Pessoal e Minha Assinatura: entitlements no backend, contratos Asaas distintos (sandbox), valores R$ 19,90 / 39,90 / 69,90 e TEX R$ 79,00 apenas como PROPOSTOS, aceite prévio, inadimplência, cancelamento, acesso/exportação gratuitos mesmo suspenso | FILA | 8 | reaproveita a cobrança da SPEC 7 |
| 13 | Painel de monetização e KAIZEN: funil, uso, conversão, custo de IA por usuário, receita líquida, toggles, A/B só comercial, trilha de preços; matriz B2B/B2C/TEX | FILA | 12 | sem dado de saúde identificável |
| 7+ | TEX: escolha entre incluído no plano B2C e avulso, direito no backend, download idempotente | FILA | 7 e 12 | extensão da SPEC 7 |

Prioridade de execução: concluir SPEC 7 (fatias 2 a 5) -> 8 -> 9 -> 10 -> 11 -> 12 -> 13 -> SPECs 5 e 6 (ordem anterior mantida, após 13 salvo ordem do gestor).

## Fila PAXMED MEMBER + PAXMED CONECTA (registrada em 16/11/2026; executa após o checkpoint da SPEC TEX e sem interromper a SPEC em curso)
Nomes aprovados: PAXMED MEMBER (assinatura B2C de organização pessoal da saúde); PAXMED CONECTA (diretório de parceiros e biblioteca de conteúdos); menu administrativo "Empresas Parceiras"; tela do cliente "Parceiros & Conteúdos".
Regras permanentes de todas as SPECs abaixo: publicidade e catálogo DESATIVADOS por padrão e "não publicar por padrão"; nenhuma publicidade em receituário, laudo ou tela de prescrição; nenhum dado de saúde (exames, prescrições, perfil) usado em filtro, ranking, publicidade ou compartilhado com anunciante; sem comissão por prescrição ou indicação; sem medicamento manipulado/fórmula personalizada no catálogo; sem criar CNPJ, subconta, split ou conta Asaas; pagamento de produto direto ao CNPJ/checkout do parceiro só quando comprovadamente permitido; sandbox/mocks; valores são propostas internas editáveis, não médias de mercado; item que exigir API externa sem acesso fica BLOQUEADO.

| Nº | SPEC | Estado | Depende de | Aceite objetivo (resumo) |
|---|---|---|---|---|
| 14 | Parceiros (Empresas Parceiras): cadastro de múltiplos CNPJs em rascunho, razão social/fantasia, categoria, contatos, identidade visual, licença/AFE e responsável técnico, documentos com vencimento, status pendente/aprovado/suspenso, vínculo com pessoa jurídica recebedora, contratos, campanha, histórico auditável, perfis e isolamento por tenant; outra empresa do proprietário sem misturar faturamento do Instituto | FILA | 8 | CRUD com permissão e tenant; pendência de documento bloqueia publicação; CNPJ validado por dígito; nenhuma credencial |
| 15 | Conteúdo e publicidade: painel (título, resumo, fontes, autor, revisão, banner, vídeo expansível, duração, links, patrocínio); moderação e verificação de alegações; carrossel de 4 a 5 parceiros configuráveis; "Parceiros & Conteúdos" com rótulo "Publicidade", filtros por tema (não por saúde), atalhos sem confusão de autoria; "Prescrições externas" separada | FILA | 14 e 9 | desativado por padrão; só aprovado aparece; rótulo obrigatório; player tela cheia; mobile; filtros sem dado clínico; nenhum conteúdo inventado |
| 16 | Conformidade regulatória do catálogo: classificação regulatória, comprovante, "não publicar por padrão"; bloqueio de magistral, fórmula personalizada e "baixa dosagem = isento"; oficinal só após revisão do farmacêutico e do advogado; política interna com RDC 67/2007, RDC 96/2008 art. 36, RDC 243/2018, IN 28/2018, CFM arts. 68 e 69, LGPD art. 11 §4 | FILA | 14 | tentativa de cadastrar magistral é recusada; sem prova, produto fica rascunho; texto jurídico marcado "a validar por advogado" |
| 17 | Comercial: catálogo de planos versionado e editável, inicialmente inativo para cobrança: Member Essencial R$ 19,90, Plus R$ 39,90, Premium R$ 69,90, TEX avulso R$ 79,00; parceiro Básico R$ 299, Destaque R$ 699, Premium R$ 1.290/mês, peça publicitária R$ 490 por campanha; propostas Kaizen (educação por assinatura/curso, cofre familiar R$ 14,90 por perfil com opt-in, relatórios de adesão); moeda, contrato, flags, limites, histórico; relatórios financeiros por B2B, Member, TEX e publicidade; isolamento financeiro por CNPJ; Asaas só sandbox | FILA | 12 e 14 | preço editável com versão; sem cobrança real; credor por cobrança; relatório sem dado pessoal de saúde; gratuito essencial preservado |

Ordem: 7 (TEX) -> 8 -> 9 -> 10 -> 11 -> 12 -> 14 -> 15 -> 16 -> 17 -> 13 (Kaizen consolida tudo) -> 5 -> 6. Regressão obrigatória em cada SPEC: TEX, Telegram, exames e prescrições.

