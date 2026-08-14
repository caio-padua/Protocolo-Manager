# Especificação — Aderência às Fórmulas Manipuladas na Área do Cliente

| Campo | Valor |
|---|---|
| Data | 14/08/2026 |
| Autor | Dr. Replit Paxter |
| Fase do Paxter Loop | 1 — ESPECIFICAR (esta spec **não** autoriza build) |
| Ordem do CEO | Correção de direção de 14/08/2026 (rejeitou pergunta autônoma por WhatsApp/Telegram) |
| Módulo da planilha | Área do Paciente |
| Status | AGUARDANDO MARTELO DO CEO (uma pergunta em aberto — seção 12) |

---

## 1. Objetivo (uma frase)

Dar ao paciente, dentro da Área do Cliente que já existe, uma aba onde ele vê as fórmulas
manipuladas que toma hoje e as que já tomou, marca fórmula por fórmula dentro de cada período do
dia se tomou ou não, e acompanha num mini painel todas as dúvidas que mandou e todas as respostas
que a equipe deu.

---

## 2. O que foi REJEITADO pelo CEO (não construir)

| Ideia anterior | Veredito |
|---|---|
| Bot perguntando "tomou?" pelo WhatsApp com botão de resposta | REJEITADA em 14/08/2026 |
| Bot perguntando pelo Telegram com `inline_keyboard` | REJEITADA em 14/08/2026 |
| Criar uma área/portal novo para aderência | PROIBIDO — a Área do Cliente já existe |

O canal de mensagem continua sendo **lembrete**, nunca **interrogatório**. O ato de responder
mora na tela.

---

## 3. Estado verificado do sistema hoje (fonte conferida, 14/08/2026)

| Item | Situação real | Arquivo / prova |
|---|---|---|
| Área do Cliente | Existe, rota `/area` | `artifacts/padcom/src/pages/area.tsx:115` |
| Abas declaradas | 8: INÍCIO, PROTOCOLOS, AGENDA, DOCUMENTOS, ENVIAR, DÚVIDAS, SUPORTE, EVOLUÇÃO | `area.tsx:98-110` |
| Abas com conteúdo | 6 — **DÚVIDAS e SUPORTE são botões mortos** (aparecem na barra e não renderizam nada) | `area.tsx:225-235` |
| Login do paciente | CPF + nascimento, ou CPF + senha; devolve token de portal | `area.tsx:550-593` |
| Autenticação das rotas | `verifyPortalToken` + cabeçalho `Authorization: Bearer` | `area-paciente.ts:18,44` |
| Fórmulas manipuladas | Moram em JSON dentro de `lembretes_prescricao.periodos` | `lib/db/src/schema/lembretes-prescricao.ts:18-50` |
| Períodos canônicos | 9 (JE, IM, MM, AL, IT, MT, NO, FN, CE) | `lib/lembrete-periodo.ts:189-200` |
| Fórmula "atual x passada" | **NÃO EXISTE** — só o booleano `ativo`; o JSON é sobrescrito e o passado se perde | mesmo schema |
| Tabela de aderência | **NÃO EXISTE** — zero ocorrências de aderencia/adesao no banco e na API | busca em `lib/db` e `artifacts/api-server/src` |
| CAT | **NÃO EXISTE** — zero ocorrências no código | busca em `artifacts/`, `specs/`, `docs/` |

Conclusão de arquitetura: o sistema hoje sabe **o que mandar hoje**; não sabe **o que mandou ontem**
nem **se a pessoa tomou**. Esta spec constrói exatamente essas duas memórias.

---

## 4. Glossário desta spec (toda sigla explicada)

| Termo | Significado em português claro |
|---|---|
| CAT | Carta de Apresentação de Tratamento — documento em PDF que apresenta ao paciente o tratamento que ele acabou de aderir |
| Vigência | Período em que uma fórmula esteve valendo para o paciente: data de início e data de fim |
| Fórmula vigente | A que está valendo hoje (sem data de fim) — é a única que aceita reporte |
| Fórmula encerrada | A que já teve data de fim — aparece só para leitura, nunca aceita reporte |
| Período (janela) | Um dos 9 momentos canônicos do dia (Jejum, Início da Manhã, ..., Ceia) |
| Reporte | O ato do paciente marcar, numa fórmula de um período, se tomou ou não |
| Chave da fórmula | Texto estável derivado do nome canônico da fórmula, usado para amarrar reportes à mesma fórmula ao longo do tempo |
| IDOR | Falha em que a pessoa troca um número na chamada e enxerga o dado de outra pessoa |
| ADD COLUMN | Comando que **acrescenta** coluna à tabela sem apagar nada |

---

## 5. Requisitos exatos

### 5.1 Onde a coisa mora

| Nº | Requisito |
|---|---|
| R1.1 | A funcionalidade mora dentro de `artifacts/padcom/src/pages/area.tsx`, na Área do Cliente que já existe. É **proibido** criar rota, portal ou área nova. |
| R1.2 | Nasce **uma** aba nova, de chave `tratamento` e rótulo **MEU TRATAMENTO**. |
| R1.3 | A aba nova contém, nesta ordem vertical: (a) bloco FÓRMULAS DE HOJE, (b) bloco HISTÓRICO DE FÓRMULAS, (c) bloco MINHAS DÚVIDAS. |
| R1.4 | A aba morta **DÚVIDAS** deixa de existir na barra; seu conteúdo passa a ser o bloco (c) da aba nova. Ver pergunta em aberto na seção 12. |
| R1.5 | A aba morta **SUPORTE** permanece como está nesta onda (fora de escopo). Não é corrigida nem removida aqui. |
| R1.6 | O visual segue a skill `skill-layout-paxter` e o Art. 54 (Grade Imaginária): 5 zonas canônicas por card, posição fixa, campo vazio mostra "—". Nenhum estilo novo é inventado. |

### 5.2 Bloco (a) — FÓRMULAS DE HOJE

| Nº | Requisito |
|---|---|
| R2.1 | Lista os períodos do dia que têm fórmula, na ordem canônica (JE → CE), lendo do mesmo motor de períodos que já alimenta o lembrete. |
| R2.2 | Dentro de cada período, lista **cada fórmula separadamente**, uma linha por fórmula. Um período com três fórmulas mostra três linhas com três reportes independentes. |
| R2.3 | Cada linha mostra: nome canônico da fórmula, dose, posologia e o horário do período. Campo sem dado mostra "—". |
| R2.4 | Cada linha tem três botões de reporte, mutuamente exclusivos: **TOMEI**, **NÃO TOMEI**, **ATRASEI**. |
| R2.5 | O reporte é gravado com a chave completa: cliente + data (BRT) + sigla do período + chave da fórmula. |
| R2.6 | Reportar de novo a mesma chave **atualiza** o registro existente; nunca cria linha duplicada. |
| R2.7 | Ao escolher **NÃO TOMEI**, abre a lista de motivos da seção 5.3. O motivo é obrigatório. |
| R2.8 | O paciente pode reportar o **dia de hoje** e os **2 dias anteriores** (janela de 3 dias). Fora disso, a linha é só leitura. |
| R2.9 | Período do tipo `nao_tomar` (janela de jejum ou intervalo) **não** exibe botão de reporte; é informativo. |
| R2.10 | Só fórmula **vigente** aceita reporte. |

### 5.3 Motivos de "NÃO TOMEI" (lista fechada)

| Código | Texto na tela | Consequência interna |
|---|---|---|
| `esqueci` | Esqueci | Só estatística |
| `acabou` | Acabou o remédio | Sinaliza recompra no painel do CEO |
| `passei_mal` | Passei mal / senti algo ruim | **Alerta clínico** (ver R5.4) |
| `fora_de_casa` | Estava fora de casa | Só estatística |
| `nao_comprei` | Ainda não comprei / não manipulei | Sinaliza recompra no painel do CEO |
| `orientacao` | Fui orientado a parar | Marca para o CEO conferir a prescrição |
| `outro` | Outro motivo | Abre campo de texto livre, máximo 280 caracteres |

### 5.4 Bloco (b) — HISTÓRICO DE FÓRMULAS

| Nº | Requisito |
|---|---|
| R3.1 | Lista as fórmulas **encerradas** do paciente, da mais recente para a mais antiga. |
| R3.2 | Cada item mostra: nome da fórmula, dose, período em que era tomada, data de início e data de fim, no formato brasileiro (dd/mm/aaaa). |
| R3.3 | Item encerrado é **somente leitura**: nenhum botão de reporte, em nenhuma circunstância. |
| R3.4 | Fórmula encerrada exibe o selo textual "ENCERRADA EM dd/mm/aaaa". |
| R3.5 | Sem histórico, o bloco mostra o estado vazio: "Você ainda não tem fórmulas encerradas." |

### 5.5 Bloco (c) — MINHAS DÚVIDAS (mini painel do paciente)

| Nº | Requisito |
|---|---|
| R4.1 | Botão **ENVIAR DÚVIDA** abre campo de texto de até 1.000 caracteres. |
| R4.2 | A dúvida pode ser enviada solta ou amarrada a uma fórmula (o botão de dúvida existe também dentro da linha de cada fórmula vigente). |
| R4.3 | O histórico lista **todas** as dúvidas do paciente, da mais recente para a mais antiga, com data e hora BRT. |
| R4.4 | Cada dúvida mostra **todas** as respostas que a equipe deu, em ordem cronológica, com data e hora. |
| R4.5 | Dúvida sem resposta exibe o selo "AGUARDANDO RESPOSTA". |
| R4.6 | A resposta mostra o **nome do profissional** que respondeu. Nunca mostra identificador interno. |
| R4.7 | O paciente **não** pode editar nem apagar dúvida já enviada (Regra de Ouro — nunca destruir). |
| R4.8 | Enviar dúvida notifica o CEO pelo motor de envio que já existe. Nenhum canal novo é criado. |

### 5.6 Memória de vigência (a peça que hoje não existe)

| Nº | Requisito |
|---|---|
| R5.1 | Nasce a tabela `formula_vigencia`: uma linha por fórmula que o paciente teve, com `inicio_em` e `fim_em` (`fim_em` nulo = vigente). |
| R5.2 | A tabela é alimentada **por observação** da sincronização que já grava `lembretes_prescricao.periodos`: fórmula que aparece e não tem vigência aberta → abre; fórmula que sumiu do JSON e tem vigência aberta → fecha com a data de hoje. |
| R5.3 | A sincronização existente **não é reescrita**. É acrescentado um passo ao final dela, que só lê o JSON e escreve na tabela nova. |
| R5.4 | A chave da fórmula é derivada do nome canônico com a função `semAcento` da biblioteca `@workspace/posologia`, em minúsculas, sem pontuação. Mesma fórmula com grafia diferente cai na mesma chave. |
| R5.5 | Toda alteração de banco é `ADD COLUMN` / `CREATE TABLE`. Nenhum `DROP`, nenhum `TRUNCATE`, nenhum `db push` em tabela populada. |

### 5.7 Alerta clínico

| Nº | Requisito |
|---|---|
| R6.1 | Três reportes com motivo `passei_mal` para a **mesma** fórmula em janela de 7 dias acendem alerta no painel do CEO. |
| R6.2 | O alerta reusa o padrão de LINHA VERMELHA que já existe na Anamnese V2. Nenhum padrão visual novo. |
| R6.3 | O alerta **não** é enviado ao paciente. É informação interna da clínica. |

### 5.8 CAT — Carta de Apresentação de Tratamento

| Nº | Requisito |
|---|---|
| R7.1 | CAT é um documento PDF que apresenta ao paciente o tratamento que ele acabou de aderir, no mesmo padrão visual do protocolo premium já aprovado (capa com foto do médico, subcapa biográfica, assinatura PAdES). |
| R7.2 | O CAT é emitido **automaticamente** no evento de adesão a tratamento. A definição exata do evento é a pergunta em aberto da seção 12. |
| R7.3 | A emissão é **idempotente**: a chave é (cliente, tratamento, versão do tratamento). O mesmo tratamento nunca gera dois CAT nem dois e-mails. |
| R7.4 | Existe **botão autônomo de reenvio** na ficha do cliente, dentro do sistema, para o CEO reenviar o CAT a pedido. O reenvio **reusa** o PDF já emitido; não gera documento novo. |
| R7.5 | O CAT leva o QR de verificação, conforme o Art. 63 do Código Paxter. |
| R7.6 | O CAT sai pelo motor único de envio branded ("Hermes Paxter", Art. 66). Nenhuma rota monta a mensagem à mão. |
| R7.7 | O CAT aparece na aba DOCUMENTOS da Área do Cliente, junto com os demais documentos. |

### 5.9 Segurança

| Nº | Requisito |
|---|---|
| R8.1 | Toda rota nova do paciente exige `verifyPortalToken` e **deriva o `client_id` do token**, nunca do corpo nem da URL (anti-IDOR). |
| R8.2 | Toda rota nova de leitura ou resposta pela equipe exige `requireCollaborator`. |
| R8.3 | Nenhum dado clínico trafega em canal de terceiro; a mensagem de aviso leva só o convite para abrir a Área do Cliente. |
| R8.4 | Data e hora sempre de `lib/brt.ts`. Nunca `new Date()` cru. |

---

## 6. Modelo de dados proposto

| Tabela | Colunas principais | Por que existe |
|---|---|---|
| `formula_vigencia` | `id`, `cliente_id`, `chave_formula`, `nome_canonico`, `dose`, `periodo_sigla`, `inicio_em`, `fim_em`, `created_at` | Separa fórmula atual de fórmula passada — hoje o passado se perde |
| `formula_adesao_evento` | `id`, `cliente_id`, `chave_formula`, `periodo_sigla`, `data_ref` (DATE BRT), `status` (`tomou`/`nao_tomou`/`atrasou`), `motivo`, `observacao`, `origem`, `created_at`, `updated_at` — único em (`cliente_id`,`chave_formula`,`periodo_sigla`,`data_ref`) | Guarda o reporte, um por fórmula por período por dia |
| `paciente_duvida` | `id`, `cliente_id`, `texto`, `chave_formula` (opcional), `criada_em` | A pergunta do paciente |
| `paciente_duvida_resposta` | `id`, `duvida_id`, `profissional_id`, `texto`, `respondida_em` | Cada resposta da equipe, em thread |
| `cat_emissao` | `id`, `cliente_id`, `tratamento_ref`, `versao`, `arquivo_drive_id`, `emitido_em`, `reenvios` — único em (`cliente_id`,`tratamento_ref`,`versao`) | Trava de idempotência do CAT |

Armadilha registrada na memória e que **vale aqui**: no PostgreSQL o valor nulo **não** colide em
índice único. O índice único de `formula_adesao_evento` só funciona porque as quatro colunas da
chave são obrigatórias. Nenhuma delas pode ser nula.

---

## 7. Blueprint do fluxo

```
LEMBRETE (motor atual, sem mudanca)
  Twilio/WhatsApp + espelho Telegram, 1 mensagem POR JANELA
        |
        v
  Mensagem leva convite: "abra Meu Tratamento"
        |
        v
PACIENTE ABRE /area  ->  aba MEU TRATAMENTO
        |
        +--> (a) FORMULAS DE HOJE  -> reporte por formula/periodo -> formula_adesao_evento
        |                                   |
        |                                   +-- motivo passei_mal x3/7d --> ALERTA no Cockpit
        |                                   +-- motivo acabou/nao_comprei --> sinal de recompra
        |
        +--> (b) HISTORICO DE FORMULAS (somente leitura)  <- formula_vigencia (fim_em preenchido)
        |
        +--> (c) MINHAS DUVIDAS -> paciente_duvida -> avisa CEO (motor Hermes)
                                        ^
                                        +-- equipe responde no Cockpit -> paciente_duvida_resposta


ADESAO A TRATAMENTO (evento — ver secao 12)
        |
        v
  cat_emissao (idempotente)  ->  PDF CAT  ->  Hermes Paxter  ->  paciente
        |
        +--> aparece na aba DOCUMENTOS
        +--> botao REENVIAR CAT na ficha do cliente (reusa o mesmo PDF)
```

---

## 8. Casos extremos a tratar

| Nº | Situação | Comportamento obrigatório |
|---|---|---|
| C1 | Paciente sem nenhuma fórmula | Bloco (a) mostra estado vazio, não erro |
| C2 | Período com duas fórmulas e o paciente reporta só uma | A outra fica pendente, sem inventar valor |
| C3 | Paciente clica duas vezes em TOMEI | Atualiza a mesma linha; nunca duplica |
| C4 | Paciente troca TOMEI por NÃO TOMEI | Sobrescreve o status e exige o motivo |
| C5 | Fórmula encerrada e depois retomada | Abre vigência **nova**; a antiga continua fechada e visível no histórico |
| C6 | Duas fórmulas com nomes quase iguais | A chave derivada de `semAcento` deve separá-las; se colidirem, a colisão é resolvida no nome canônico, nunca com "chute" |
| C7 | Reporte na virada da meia-noite | A data de referência é a data BRT do período, não a hora do clique |
| C8 | Paciente tenta reportar dia 10 dias atrás | Bloqueado pela janela de 3 dias (R2.8) |
| C9 | Token do portal expirado no meio do reporte | Devolve 401 e a tela pede login de novo, sem perder o texto digitado |
| C10 | Paciente inativo (`status != active`) | Área abre em leitura; reporte bloqueado |
| C11 | CAT disparado duas vezes pelo mesmo evento | A trava de idempotência impede o segundo e-mail |
| C12 | CAT com o arquivo já apagado do Drive | O reenvio falha com mensagem honesta; **não** gera PDF novo silenciosamente |
| C13 | Equipe responde duas vezes a mesma dúvida | As duas respostas aparecem, em ordem; nenhuma é sobrescrita |
| C14 | Dúvida enviada e o cliente sem canal cadastrado | A dúvida é gravada; o aviso ao CEO informa o canal indisponível, sem fingir envio |
| C15 | Sincronização do lembrete roda duas vezes no mesmo dia | A abertura/fechamento de vigência é idempotente por (cliente, chave, vigência aberta) |

---

## 9. Definição de PRONTO

Conforme o Art. 69 do Código Paxter, cada nível abaixo é obrigatório e vai para a resposta ao CEO
em tabela Nível / Esperado / Obtido / Passou.

| Nível | Prova exigida |
|---|---|
| SMOKE | Chamada real devolve 200 em: listar fórmulas de hoje, gravar reporte, listar histórico, enviar dúvida, listar dúvidas |
| DADO | O banco mostra a linha em `formula_adesao_evento`, em `formula_vigencia` e em `paciente_duvida` |
| VISUAL | Captura de tela da aba MEU TRATAMENTO no **celular e no desktop** (Art. 52), com os três blocos |
| LOG | Log do servidor sem erro inesperado durante o fluxo completo |
| IDEMPOTÊNCIA | Reportar duas vezes a mesma chave produz **uma** linha; emitir CAT duas vezes produz **um** e-mail |
| SEGURANÇA | Chamada com o token de um paciente tentando ler dado de outro devolve 401/403 |
| REVISÃO | O `architect` confere requisito por requisito desta spec e aprova sem pendência |

---

## 10. Linhas vermelhas (violar reprova a entrega)

| Nº | Linha vermelha |
|---|---|
| L1 | Nunca criar área, portal ou rota de paciente nova — ordem direta do CEO em 14/08/2026 |
| L2 | Nunca perguntar aderência por WhatsApp ou Telegram — direção rejeitada pelo CEO |
| L3 | Nunca tocar `/api/budgets/calculate` nem o motor de desmembramento |
| L4 | Nunca reescrever o motor de lembretes; apenas acrescentar um passo de leitura ao final |
| L5 | Nunca `DROP`, `TRUNCATE` ou `db push` em tabela populada — só `ADD COLUMN` / `CREATE TABLE` |
| L6 | Nunca permitir reporte em fórmula encerrada |
| L7 | Nunca derivar `client_id` do corpo ou da URL — só do token verificado |
| L8 | Nunca montar mensagem de marca à mão; sempre pelo motor Hermes (Art. 66) |
| L9 | Nunca usar `new Date()` cru para data exibida ou gravada — sempre `lib/brt.ts` |
| L10 | Nunca apagar dúvida, resposta ou vigência — Regra de Ouro |

---

## 11. Kaizen — sugestões próprias do Dr. Replit Paxter

Cada uma é proposta, **não** está autorizada, e cada uma vira item próprio na planilha.

| Nº | Sugestão | Por que vale |
|---|---|---|
| K1 | Semáforo de aderência por paciente no Cockpit do CEO (verde ≥ 80%, âmbar 50–79%, vermelho < 50%, cinza sem dado nos últimos 7 dias) | Sem um lugar onde o CEO bate o olho, o dado entra e ninguém usa |
| K2 | Motivo estruturado no "não tomei" (já embutido em R5.3) | Transforma "não tomou" em ação: `acabou` é venda, `passei_mal` é clínica |
| K3 | Alerta de 3× `passei_mal` em 7 dias (já embutido em R6.1) | Segurança do paciente; hoje esse sinal se perde |
| K4 | Aviso de recompra: cruzar dias de vigência com a quantidade dispensada e avisar "seu frasco acaba em X dias" | Evita a interrupção silenciosa, que é a principal causa de abandono |
| K5 | Link curto assinado no lembrete que já sai, abrindo a Área do Cliente **já na fórmula daquele período** | Respeita a ordem do CEO (o canal continua lembrete) e tira o atrito de achar a linha |
| K6 | Dúvida repetida 3× vira sugestão de resposta padrão para o CEO aprovar | É a aba DUVIDAS_BASE que o CEO já tinha desenhado na planilha ATENAS |
| K7 | Registro de quem respondeu e em quanto tempo (tempo de resposta médio) | Mede a qualidade do atendimento sem ninguém preencher relatório |
| K8 | Exportar a aderência do período para dentro do PDF de acompanhamento clínico | O dado vira prova na consulta, não só número na tela |

---

## 12. Pergunta em aberto (um martelo só)

**O que exatamente é "o paciente aderir a um tratamento", o evento que dispara o CAT automático?**

| Opção | Definição do gatilho | Consequência |
|---|---|---|
| A (recomendada) | Quando um tratamento **entra em vigência** para o paciente: um protocolo é validado ou um conjunto novo de fórmulas passa a valer | O CAT chega junto com o começo real do tratamento; encaixa direto na tabela de vigência desta spec |
| B | Quando o paciente **confirma na Área do Cliente** que vai seguir o tratamento (botão "aceito iniciar") | Adesão vira ato explícito do paciente, mas exige uma tela de aceite que hoje não existe |
| C | Quando o **primeiro reporte** de qualquer fórmula do tratamento é registrado | O CAT chega depois do início; documento de apresentação atrasado |

Default recomendado: **A**.

---

## 13. Rastreio na planilha de produção

Os itens desta spec entram na planilha `PLANILHA PRODUCAO` com módulo **Área do Paciente**, coluna I
("Para que serve") preenchida em linguagem do CEO e coluna J preenchida, conforme
`docs/PROTOCOLO-PLANILHA.md`.

---

RESUMO EM 1 LINHA: alvo escrito da aba MEU TRATAMENTO na Área do Cliente — fórmulas de hoje com
reporte por fórmula dentro de cada período, histórico de fórmulas encerradas só para leitura, mini
painel de dúvidas e respostas, memória de vigência que hoje não existe e CAT automático idempotente
com botão de reenvio.
