# Trava de Escassez do Concierge — Arquitetura

**Caminho canônico:** `docs/concierge/ARQUITETURA.md`
**Versão:** 1.0 · 12/08/2026
**Autor:** Dr. Code · **Aprovada por:** CEO Dr. Caio
**Itens da planilha cobertos:** #74 a #86

---

## 0. Como este documento funciona

Este é o **único documento normativo** da Trava de Escassez. Carta, postagem de Slack, spec de agente e linha de planilha **citam** este arquivo — nunca repetem o conteúdo dele.

Regra de precedência, sem exceção:

> Se qualquer documento divergir deste arquivo, **este arquivo vence** e o outro documento está errado e deve ser corrigido.

Motivo: entre 10/08 e 12/08 houve quatro rodadas de retrabalho porque carta, planilha, Slack e spec carregavam versões diferentes da mesma decisão. Correções aceitas num canal se perdiam em outro. Isso acaba aqui.

**Para alterar este documento:** proposta escrita, aceite do CEO, commit, e aviso no `#padaxor-projeto` com o hash. Mudança não anunciada não vale.

---

## 1. O que a trava é, e o que ela não é

O Concierge é o canal premium de agendamento. A concierge concede uma vaga próxima como **oportunidade**. Quem aceita a oportunidade e não conclui o pagamento faz a próxima oportunidade ficar mais distante.

**Objetivo declarado pelo CEO:** que o paciente sinta a escassez real da agenda e valorize o atendimento. E que o curioso — ou o concorrente — não fique testando o funil de graça, o que esvaziaria a percepção de escassez e produziria descrédito.

**O que a trava NÃO pode fazer**, e isto é tão vinculante quanto o objetivo:

1. Não pode punir quem teve dificuldade de pagamento. Cartão recusado não é abandono.
2. Não pode ser usada como arma contra paciente legítimo por um terceiro.
3. Não pode recusar atendimento em definitivo. A via comum permanece sempre aberta.
4. Não pode soar como castigo na tela. Deve soar como critério da clínica.

Toda decisão abaixo deriva desses quatro limites.

---

## 2. Estado operacional — leia antes de agir

O sistema **não está em operação** e **nenhum paciente real foi acionado**. O uso é limitado ao CEO e a um pequeno grupo de teste.

Consequências práticas:

- Nenhum achado deste documento é incidente. Não há dado exposto, não há e-mail a reenviar, não há titular a notificar.
- Tudo aqui é **dívida a quitar antes do lançamento**, quando o conserto é barato.

**Regra de lançamento, decidida pelo CEO:**

> O Concierge não recebe paciente real antes do item **#79** (verificação de identidade) estar no ar.

Razão: o **#76** já endureceu a aplicação da trava — o backend devolve 403 e não há mais como contornar pelo frontend. Enquanto a penalidade for gravada em CPF não verificado, essa aplicação mais forte incide sobre um modelo que sabemos furado.

---

## 3. Modelo de pontuação

Substitui o contador inteiro `tentativas_falha` da versão 1.

### 3.1 Peso por desfecho

| Desfecho | Evento de origem | Peso |
|---|---|---|
| Cancelamento ativo pelo cliente | `PAYMENT_DELETED` | **+1,0** |
| Expiração sem ação | `PAYMENT_OVERDUE` | **+0,5** |
| Recusa pelo emissor do cartão | recusa de cartão | **+0,25** |
| Estorno solicitado | `PAYMENT_REFUNDED` | **+1,0** |
| Chargeback | `PAYMENT_CHARGEBACK_REQUESTED` | **+2,0** |
| Pagamento concluído | `PAYMENT_PAID` | **−1,0** |

A pontuação **nunca fica negativa**. Piso em `0,0`.

Efeito pretendido: três recusas do banco somam 0,75 e não penalizam ninguém. Três cancelamentos deliberados somam 3,0 e suspendem. A trava passa a distinguir intenção de acidente — que é o limite 1 da seção 1.

*Nota sobre o chargeback:* 2,0 leva à faixa de +30 dias com um único evento. É deliberado — contestação no cartão é sinal forte. Decisão do CEO; alterar exige o rito da seção 0.

### 3.2 Faixas

| Pontuação | Estado | Efeito na oferta |
|---|---|---|
| 0,0 – 0,9 | Oportunidade cheia | datas normais |
| 1,0 – 1,9 | Primeira quebra | **+7 dias** |
| 2,0 – 2,9 | Segunda quebra, com aviso explícito de que a próxima encerra o canal | **+30 dias** |
| ≥ 3,0 | Canal suspenso | **suspenso por 180 dias** |

### 3.3 Janela — decaimento e retorno

- **Decaimento:** −1,0 ponto a cada **90 dias** sem incidente. Job mensal.
- **Suspensão:** 180 dias, com **retorno automático ao nível 2,0** — não a zero.
- **Reset ao pagar:** parcial, −1,0 ponto. **Nunca zera.** Pagar uma vez apaga um abandono, não três.

Não existe bloqueio permanente. Foi removido por decisão do CEO: "permanente" numa clínica significa recusar atendimento a alguém que pode estar doente daqui a dois anos, e o custo de imagem disso é maior que o ganho de escassez.

### 3.4 Colunas

`score_pontos NUMERIC` e `suspensao_ate TIMESTAMPTZ NULL`.

A coluna `tentativas_falha` **permanece** — nunca é removida (Regra 5 do CEO: toda coluna nova é `ADD COLUMN`, nunca `DROP COLUMN`).

---

## 4. Identidade — a correção de fundo

### 4.1 O problema que isto resolve

Na versão 1, a penalidade era indexada por CPF digitado e **não verificado**. Isso produzia dois efeitos, ambos contrários ao objetivo:

- **O curioso contornava:** digitava outro CPF e recebia oferta limpa.
- **O paciente legítimo apanhava:** qualquer pessoa com o CPF de um paciente — dado amplamente disponível no Brasil — fazia três abandonos e o bloqueava.

Confirmado no código pelo Dr. Manus em 12/08: `concierge-penalidade.ts`, `getPenalidade(rawCpf)` aceita qualquer CPF normalizado, sem confirmação de identidade.

### 4.2 Duas camadas

**Camada 1 — antes de verificar identidade.** Fricção por sessão e dispositivo, nunca por CPF. Não é transferível a terceiros, portanto não pode virar arma. Detalhe na seção 6.

**Camada 2 — depois de verificar.** A penalidade só é gravada no CPF **após** confirmação de código enviado ao Telegram ou WhatsApp já vinculado ao paciente.

### 4.3 Invariante

> `registrarFalha()` **nunca** é chamado para um CPF cuja identidade não foi confirmada.

Sem canal vinculado, o abandono não acumula no CPF — fica apenas na fricção por dispositivo.

Esta é a mesma correção que se aplica ao acesso da Área do Paciente, hoje por CPF + data de nascimento. Os dois casos são o mesmo erro: **tratar CPF como se fosse segredo.** Item separado, fora do escopo deste documento, mas registrado aqui porque a causa é a mesma.

---

## 5. Idempotência

### 5.1 A regressão que motivou esta seção

O commit `8e7179d` implementou a dedup. O commit seguinte, `1b6c747`, removeu-a — saldo de −261/+97 linhas — e devolveu ao código o comentário *"o chamador é responsável por chamar apenas uma vez por evento de falha real"*.

Idempotência que depende do chamador não é idempotência. Sem ela, o Asaas reentrega um `PAYMENT_OVERDUE` e **uma** cobrança vencida vira três penalidades — um paciente com o cartão recusado uma única vez sai suspenso na primeira tentativa.

### 5.2 Assinatura obrigatória

```typescript
export async function registrarFalha(
  rawCpf: string | null | undefined,
  eventId: string,          // OBRIGATÓRIO — sem sobrecarga opcional
): Promise<void>
```

**`eventId` não pode ser opcional.** Um parâmetro opcional deixa vivo um caminho que incrementa sempre, e foi por esse caminho que a regressão passou. Além disso, penalidade sem origem rastreável é indefensável quando um paciente reclamar — e a defensabilidade é o motivo do redesenho inteiro.

### 5.3 Formato canônico do `eventId` — Option B (12/08/2026)

Ambos os caminhos usam o **mesmo** formato:

```
shared:{sreqId}:{asaasChargeId}:{desfecho}
```

| Caminho | Exemplo de valor |
|---|---|
| Webhook `PAYMENT_OVERDUE` | `shared:42:pay_abc123:expirado` |
| Webhook `PAYMENT_DELETED` | `shared:42:pay_abc123:cancelado` |
| Polling (status `expirado`) | `shared:42:pay_abc123:expirado` |

`payment.id` (webhook) == `asaasChargeId` (polling) — mesmo identificador Asaas.
Os dois caminhos que observam o mesmo fato produzem `event_id` idêntico.
`ON CONFLICT (event_id) DO NOTHING` no CTE deduplica atomicamente — qualquer ordem de chegada.

### 5.4 Por que `asaasChargeId` e não `updated_at`

A especificação anterior usava `row.updated_at` como discriminador de reativação.
`scheduling_requests` não possui coluna `updated_at`. O discriminador correto é `asaasChargeId`:

- Muda exatamente quando uma nova cobrança é criada no Asaas — o mesmo evento que separa dois vencimentos reais do mesmo pedido.
- É semanticamente mais preciso: identifica qual cobrança venceu, não apenas quando algo mudou.
- Em produção, todo `sreq` concierge com status `expirado` tem `asaasChargeId` preenchido.
- O fallback `?? "nocharge"` cobre desenvolvimento sem charge criada.

**`updated_at` não será adicionado a `scheduling_requests`.** Decisão registrada: 12/08/2026.

### 5.5 Implementação

CTE atômico: dedup do evento e UPSERT da pontuação num único SQL. `ON CONFLICT DO NOTHING` na tabela de eventos; se a dedup não retornar linha, o UPSERT da pontuação não dispara.

Tabela `concierge_webhook_eventos`, com `event_id` como chave primária.

### 5.6 Guard do polling (Caso 9A) — REMOVIDO em 12/08/2026

**Decisão:** Guard removido — a PRIMARY KEY do `eventId` compartilhado torna a verificação prévia redundante e introduz corrida fora do CTE.

**Motivo:** `jaTemEventoParaSreq(sreqId)` verificava se já existia **qualquer** evento para o `sreq` antes de chamar `registrarFalha`. Com o formato `shared:{sreqId}:{chargeId}:{desfecho}`, dois eventos legítimos do mesmo sreq (ex.: `OVERDUE` seguido de `CHARGEBACK`) têm `event_id` distintos — a PK não conflita, ambos devem registrar. O guard cortava o segundo evento **antes do CTE**, engolindo a penalidade silenciosamente. Código que só pode errar e nunca acertar, sai.

**O CTE é suficiente:** `ON CONFLICT (event_id) DO NOTHING` garante atomicamente que o mesmo fato não duplica — sem race condition, sem roundtrip extra.

Os guards das linhas **495** e **915** apenas consultam `getPenalidade` e bloqueiam o Concierge. **Não penalizam, e estão corretos.** Não mexer neles.

### 5.7 Colunas de auditoria em `concierge_webhook_eventos`

Adicionadas via `ADD COLUMN IF NOT EXISTS` em `ensureEventosTable()` (12/08/2026):

| Coluna | Tipo | Propósito |
|---|---|---|
| `scheduling_request_id` | `INTEGER` | Qual sreq gerou o evento — base para índice único futuro sobre o fato |
| `desfecho` | `TEXT` | Saída da auditoria: valor que estava embutido no `event_id` |
| `asaas_event_id` | `TEXT` | `payment.id` do Asaas — satisfaz o Invariante 1 (origem rastreação) |

**Por que separadas do `event_id`:** o `event_id` é chave de dedup, não de consulta. Separar os campos garante que a auditoria não dependa de parsear a string da chave.

---

## 6. Fricção por dispositivo — versão normativa

> **Atenção:** circulam duas versões deste item. A versão com "limite de 5 ofertas por dispositivo/dia (fingerprint + IP + cookie)" está **revogada**. Vale apenas o que está abaixo.

### 6.1 Por que a versão anterior foi revogada

Das três fontes de fingerprint propostas, duas são fornecidas pelo navegador do próprio visitante — o header `X-Device-Fingerprint` e o cookie `device_id`. Trocar o header a cada requisição ou limpar cookies é trivial. O curioso determinado passa; quem não faz nada disso é o paciente comum.

E o degrau de fallback é pior: sem o header, o sistema cai no IP. No Brasil, a operadora móvel coloca milhares de assinantes atrás do mesmo IP por CGNAT. Cinco ofertas por dia por IP significa paciente barrado porque cinco desconhecidos da mesma operadora abriram a página antes dele.

Isso reproduz, uma camada acima, o mesmo erro do CPF: contorna quem tem intenção, atinge quem não tem.

### 6.2 Regras normativas

1. O fingerprint é **sinal de suspeita**, não chave de bloqueio. Ordena, não nega.
2. **Nunca aplicar limite por IP isolado.** IP só vale combinado com outro sinal estável.
3. **Fricção crescente, não recusa binária.** Da 6ª oferta do dia em diante para dispositivo não verificado, exigir confirmação de código no canal (item #79) em vez de recusar. Quem é paciente confirma em vinte segundos; quem é curioso não quer se identificar, e é por isso que para.
4. Teto rígido apenas contra automação: **50 por dia**, nunca contra pessoa.
5. Dispositivo com identidade verificada não sofre limite.
6. A fricção **nunca grava penalidade no CPF**. Ela desacelera; não pune.

### 6.3 Contrato de resposta

```typescript
export interface DeviceThrottleResult {
  allowed: boolean;
  remaining: number;
  throttled: boolean;            // teto rígido antiautomação (50/dia)
  requiresVerification: boolean; // fricção: pede código do canal
  message?: string;
}
```

### 6.4 Tabela

```sql
CREATE TABLE IF NOT EXISTS device_offer_limits (
  id SERIAL PRIMARY KEY,
  device_fingerprint TEXT NOT NULL,
  dia_brt DATE NOT NULL,
  offer_count INTEGER NOT NULL DEFAULT 0,
  first_offer_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_offer_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (device_fingerprint, dia_brt)
);
```

`UNIQUE` composto resolve dois defeitos de uma vez: a corrida de escrita — duas requisições simultâneas criavam duas linhas e a contagem passava a depender de qual o `SELECT` pegasse — e o reset diário, que sem data na chave nunca acontecia, deixando o dispositivo limitado para sempre.

Incremento por `INSERT ... ON CONFLICT (device_fingerprint, dia_brt) DO UPDATE`, atômico.

`dia_brt` usa `brtNow()` de `lib/brt.ts`. Nunca `new Date()` cru (Regra 6 do CEO).

**Esta tabela nasce no schema do Drizzle.** `concierge_penalidades` é exceção histórica, criada fora do ORM, e o item #82 existe para corrigi-la — não para servir de precedente.

---

## 7. Texto na tela

O limite 4 da seção 1 é vinculante: a mensagem soa como critério da clínica, não como castigo.

**Revogado:** *"Você já gerou várias ofertas hoje. Aguarde até amanhã ou entre com sua conta para continuar."* — soa como advertência e promete uma "conta" que não existe, já que o paciente entra por CPF e data de nascimento.

**Normativo:** *"Para seguir com a reserva, confirme seu contato — enviamos um código para o seu WhatsApp."*

Informa, não acusa, e conduz à ação seguinte.

O item **#86** revisa todos os textos da trava contra esse critério.

---

## 8. Bateria de testes

A bateria **não é um item no fim da fila**. É a porta de saída de cada entrega do P1. Nenhum item é marcado CONCLUÍDO sem o bloco correspondente verde.

| Bloco | Casos | Valida | Roda depois de |
|---|---|---|---|
| **#81-A** | 8 casos de idempotência sobre desfechos de cartão | #75 | #75 |
| **#81-B** | 8 casos de CPF e pontuação (1 a 8) + caso 21 (guard) + faixas do #74 | #74, #76, #77, #78, #79 | #79 |
| **#81-C** | 4 casos de dispositivo (9 a 12) + #85 (fingerprint ausente + CGNAT) | #80 | #80 |

### 8.1 Por que os 12 viraram 8 + 4

Os casos 9 a 12 dependem do **#80**. Executá-los antes faz falhar por ausência de funcionalidade, não por defeito — e suíte que falha por ausência ensina a equipe a ignorar vermelho, o pior hábito que uma bateria pode criar.

Os casos 1 a 8 dependem do **#79**, porque o #79 muda *quando* `registrarFalha` é chamado.

### 8.2 Valores esperados do bloco A, já com pesos

| # | Evento | 1ª entrega | Reentrega | Pontuação final |
|---|---|---|---|---|
| 13 | `PAYMENT_OVERDUE` | +0,5 | não re-registra | **0,5** |
| 14 | `PAYMENT_DELETED` | +1,0 | não re-registra | **1,0** |
| 15 | `PAYMENT_REFUNDED` | +1,0 | não re-registra | **1,0** |
| 16 | `PAYMENT_CHARGEBACK_REQUESTED` | +2,0 | não re-registra | **2,0** |
| 17 | `PAYMENT_OVERDUE` ×3 reentregas | +0,5 | +0, +0 | **0,5** |
| 18 | `DELETED` + `REFUNDED` (eventos distintos) | +1,0 e +1,0 | — | **2,0** |
| 19 | `OVERDUE` depois `PAID` | +0,5 depois −1,0 | — | **0,0** (piso) |
| 20 | `PAID` sem evento anterior | −1,0 | — | **0,0** (piso) |

O caso 18 é o que prova que a chave de idempotência é o **evento** e não o pedido: dois eventos distintos no mesmo `scheduling_request` devem somar. Um booleano por pedido faria este caso resultar 1,0 e falhar.

### 8.3 Caso 21 — cobertura do #76

CPF suspenso faz `POST /scheduling/requests` com `path=concierge` e recebe **403 `CONCIERGE_BLOCKED`**.

O #76 hoje está marcado CONCLUÍDO sem nenhum teste automatizado. Existe um `curl` manual de conferência, e verificação manual não sobrevive à refatoração seguinte — foi exatamente assim que o #75 caiu.

### 8.4 Testes semânticos

Não somam à contagem, porque não são determinísticos. Três perguntas, feitas sobre o texto real da tela:

1. O paciente entende **por que** está esperando mais?
2. Ele entende que a via comum continua aberta?
3. A mensagem soa como critério da clínica ou como castigo?

A terceira decide se a escassez valoriza o atendimento ou queima a reputação.

---

## 9. Ordem de execução

| # | Quem | Item | Porta de saída |
|---|---|---|---|
| 1 | Dr. Replit | **#75** idempotência, `eventId` obrigatório | — |
| 2 | Dr. Manus | **#81-A** | valida #75 · nada avança sem verde |
| 3 | Dr. Code | **#77** peso por desfecho | — |
| 4 | Dr. Code | **#78** janela, decaimento, suspensão | — |
| 5 | Dr. Code | **#79** verificação por código no canal | — |
| 6 | Dr. Manus | **#81-B** | valida #74, #76, #77, #78, #79 |
| 7 | Dr. Manus | **#80** fricção por dispositivo (seção 6) | — |
| 8 | Dr. Manus | **#81-C** + **#85** | valida #80 |
| 9 | Dr. Replit | **#84** frontend trata `throttled` e `requiresVerification` | — |
| 10 | — | **#82** Drizzle · **#86** semântica · **#83** Inteligência Comercial | — |

**Marco de lançamento:** após o passo 6, o Concierge pode receber paciente real.

---

## 10. Invariantes — o que nunca pode acontecer

Estas sete afirmações devem ser verdadeiras em qualquer estado do sistema. Violação é defeito, não preferência.

1. Nenhuma penalidade é gravada sem `eventId` rastreável.
2. Nenhuma penalidade é gravada em CPF de identidade não verificada.
3. Nenhum limite é aplicado por IP isolado.
4. A pontuação nunca fica negativa.
5. Não existe bloqueio permanente — apenas suspensão de 180 dias.
6. A via comum permanece sempre acessível, em qualquer estado de penalidade.
7. Nenhum dado clínico trafega em canal de mensagem; a mensagem avisa e leva à área logada.

---

## 11. Regras de processo

Herdadas da Cartilha do CEO, aplicáveis a este escopo:

1. Item só fecha com **hash de commit + saída de teste colada**. Relato em prosa não fecha item.
2. "Commitado" não é "entregue" — só fecha quando a fonte que a equipe consulta mostra o valor novo.
3. Numeração única: a da planilha. Não inventar sequência paralela.
4. Não atribuir ao CEO confirmações que ele não deu.
5. Discordância com prova é bem-vinda e já mudou decisões — o furo C da auditoria de 10/08 foi retirado assim, e o Dr. Manus corrigiu erro próprio em 12/08.
6. Toda coluna nova é `ADD COLUMN`. Nunca `DROP COLUMN`. Nunca `DROP TABLE` ou `TRUNCATE` sem ordem escrita dupla do CEO.
7. Tela obsoleta sai do menu; o arquivo permanece.

---

## 12. Pendência estrutural

A bateria validar cada entrega é a decisão certa, mas hoje ela é **um agente rodando testes quando alguém pede**.

A regressão do #75 aconteceu entre dois commits do mesmo autor, no mesmo arquivo, em minutos. Nenhuma revisão — humana ou por agente — pega isso de forma confiável, porque ninguém está olhando naquele intervalo.

O gancho já existe na planilha: **#73**, endpoint de verificação de tarefas no padrão do `/api/padaxor/dicionario/verificar`. Está como P2.

**Proposta ao CEO:** subir o #73 para P1, rodando o bloco #81-A a cada push, com item impedido de fechar enquanto o endpoint não devolver verde. Enquanto isso não existir, a Regra 1 da seção 11 depende de disciplina — e disciplina falhou quatro vezes seguidas entre 10 e 12 de agosto.

*Status: aguardando decisão do CEO.*

---

## 13. Histórico

| Data | Mudança |
|---|---|
| 12/08/2026 | Versão 1.0. Consolida a revisão do Dr. Code de 12/08, a especificação do Dr. Manus (#80, #81, #83) com as quatro correções aceitas, a correção do alvo da regressão (polling linha 789, não o guard) e as decisões A, B e C do CEO. Revoga a versão de fricção por dispositivo com limite de 5/dia e fallback por IP. |