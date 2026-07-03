# Spec — Pós-pagamento do agendamento: cadastro + e-mail de chegada + triagem + acesso do paciente

Status: ESPECIFICAR (Paxter Loop — Fase 1). NÃO autoriza build; aguarda "pode buildar" do CEO.
Data: 03/07/2026. Dono: Dr. Replit Paxter. Origem: pedidos verbais do CEO Dr. Caio nesta conversa.
Specs irmãs (ler junto): `concierge-encaixe-pagamento.md` (cobrança/PIX/webhook/NF) e
`acompanhamento-e-area-paciente.md` (porta única `/area`, categorias, desejo implícito).

## Objetivo (uma frase)
Quando o paciente conclui o agendamento, o sistema conserta a tela final, cria (ou reconhece) o
cadastro dele, envia um e-mail de chegada com login e senha provisória (troca obrigatória no 1º
acesso) e um link para acompanhar o status do pagamento — distinguindo paciente novo de já cadastrado.

## Estado atual (VERIFICADO no código — sem fantasia)
| Item | Existe hoje? | Detalhe verificado |
|---|---|---|
| Tela "pago/confirmando" no passo de pagamento | NÃO | `agendar.tsx` (stage "pay") só trata "gerar", "aguardando", "vencido/cancelado"; não há estado próprio de "pago" |
| Sucesso após pagar | FRÁGIL | Só aparece `SuccessState` SE `confirmConcierge()` (PATCH) der certo logo após o pagamento |
| Recuperação se o PATCH falhar | NÃO | Em falha, cai em `errorMsg` e o cliente fica sem saída (efeito "a tela some") |
| Persistência do fluxo | NÃO | Estado vive só em memória; trocar para o app do banco no celular e voltar pode zerar tudo |
| Cadastro do cliente no ato do agendamento | NÃO | Cria só `scheduling_requests` (nome/cpf/email/telefone); NÃO grava em `clients` |
| E-mail de chegada ao paciente | NÃO | Nenhum e-mail é disparado no agendamento |
| Triagem paciente novo x já cadastrado | NÃO | Nada cruza o CPF com `clients` na hora de agendar |
| Login e senha de verdade do paciente | NÃO | Só `clients.validationPassword` (senha do protocolo) + código do dia; entrada em `/area` é por CPF + data de nascimento |
| Link de status de pagamento | PARCIAL | Existe `GET payment-status` (usado no polling), mas não há página/link para o paciente conferir depois |
| Webhook Asaas marca "pago" | SIM | `POST /asaas/webhook` (exige segredo `asaas.webhookToken`, hoje AUSENTE) |

## Linhas vermelhas (inegociáveis)
1. NUNCA enviar senha DEFINITIVA por e-mail. Só senha provisória de uso único + troca obrigatória no 1º acesso.
2. Senha do paciente SEMPRE guardada com hash forte (bcrypt/argon2). NUNCA texto puro. NUNCA em log.
3. NUNCA logar segredo, token, senha ou PII (dado pessoal) do paciente.
4. Mensagens de erro GENÉRICAS na entrada (não revelar se o CPF existe — anti-enumeração), como já é no portal.
5. Em desenvolvimento/teste, NENHUMA cobrança real e NENHUM e-mail real disparado sem guarda de ambiente (modo demo).
6. Não tocar no motor de orçamento/desmembramento nem em rotas de cálculo. Não mudar horários fabricados do fluxo Dr. Caio.
7. Reaproveitar a porta única `/area` (spec acompanhamento) — não criar uma segunda porta de paciente.

## Requisitos exatos

### Bloco A — Consertar a tela que some (defeito, construir primeiro)
R1. Criar estado visual próprio de "pago/confirmando" no passo de pagamento: ao detectar pago, mostrar
    confirmação clara ("Pagamento recebido — confirmando seu horário...") em vez de continuar em "aguardando".
R2. Se a confirmação final (`confirmConcierge`/PATCH) falhar, mostrar recuperação explícita (botão
    "Recuperar meu agendamento" que reexecuta a confirmação) — nunca deixar tela vazia/sem saída.
R3. Persistir o mínimo do fluxo (requestId, accessToken, slot escolhido, payStatus) de forma resistente a
    troca de app/recarregamento no celular, para retomar de onde parou. [DEFAULT: `sessionStorage`.]
R4. Ao concluir de verdade, a tela final do concierge deixa de dizer "equipe entrará em contato" e passa a
    confirmar: horário reservado + pagamento recebido + "enviamos seu acesso por e-mail".

### Bloco B — Cadastro + triagem (novo x já cadastrado)
R5. No agendamento, cruzar o CPF com `clients`:
    - Não existe → cria cadastro novo (nome, CPF, e-mail, telefone) e marca `triagem = "novo"`.
    - Existe → usa o cadastro atual e marca `triagem = "retorno"`.
R6. A triagem fica visível para a clínica (na solicitação/ficha), para saber na hora da consulta se é
    paciente novo ou retorno.
R7. Cadastro idempotente: reagendar/pagar de novo com o mesmo CPF NÃO cria cliente duplicado.

### Bloco C — E-mail de chegada + status de pagamento
R8. Ao pagamento CONFIRMADO (concierge), disparar e-mail de chegada ao paciente contendo:
    (a) confirmação de que o cadastro foi feito (ou reconhecido), (b) o horário reservado,
    (c) o acesso (ver Bloco D), (d) um link para acompanhar o STATUS DO PAGAMENTO.
R9. Página/link de status de pagamento: abre por token seguro (sem login), mostra honestamente
    "pago" ou "aguardando" (nunca "confirmado" antes da baixa). Reaproveitar `payment-status`.
R10. E-mail no padrão de marca (E-mail Paxter v2: fundo navy "terno"; se listar itens, em TABELA). Português.

### Bloco D — Acesso do paciente (login + senha, troca no 1º acesso)
R11. Login do paciente = CPF. [DEFAULT — confirmar.]
R12. Paciente NOVO (ou existente SEM senha ativa): gerar senha provisória de uso único; o e-mail de chegada
     traz login (CPF) + senha provisória + link para `/area`.
R13. No 1º acesso com a senha provisória, a `/area` OBRIGA a definir uma nova senha antes de qualquer outra
     ação (flag `mustChangePassword`).
R14. Paciente JÁ CADASTRADO COM senha ativa: o e-mail NÃO gera senha nova; traz "entrar/recuperar acesso".
R15. A entrada por CPF + data de nascimento (já existente em `/area`) continua funcionando; a senha é um
     MÉTODO ADICIONAL de acesso, não uma substituição. [DEFAULT — confirmar.]
R16. Autenticação leve na própria tabela `clients` (campos novos: `passwordHash`, `mustChangePassword`,
     e um token de definição de senha com validade). NÃO usar provedor externo de login (paciente não é
     usuário da plataforma; sistema é single-tenant). [DECISÃO DE ARQUITETURA — confirmar.]

## Fluxo (blueprint)
```
Paciente paga (PIX concierge)
   -> Webhook/polling confirma "pago"
   -> Tela: "Pagamento recebido — confirmando seu horário..."   (R1)
   -> Triagem por CPF: novo? cria cadastro : usa existente        (R5/R6)
   -> Gera senha provisória (se aplicável)                        (R12/R14)
   -> Confirma o horário (PATCH)                                  (R2 recupera se falhar)
   -> E-mail de chegada: cadastro + horário + acesso + link status (R8/R9)
   -> Tela final: reservado + pago + "acesso enviado por e-mail"  (R4)

1º acesso do paciente em /area com senha provisória
   -> OBRIGA trocar a senha (mustChangePassword)                  (R13)
   -> entra na Área do Paciente
```

## Casos extremos
1. Pagamento não confirma (abandono): sem cadastro-por-pagamento, sem e-mail, sem senha; solicitação fica "aguardando".
2. Confirmação final falha após pago: dinheiro entrou mas horário não gravou → tela de recuperação (R2) + a clínica vê pendência.
3. CPF já existe com dados divergentes (e-mail/telefone novos): NÃO sobrescrever cegamente; atualizar só o que a clínica permitir. [Decisão — default: manter cadastro, registrar contato novo à parte.]
4. Webhook duplicado: idempotente (ver memória webhook-assinatura-idempotencia).
5. E-mail inválido/ausente: cadastro é feito, mas registra que o e-mail de chegada não pôde ser enviado (a clínica vê o alerta).
6. Senha provisória expirada: paciente pede reenvio; não trava.
7. Colisão de CPF na triagem (dois cadastros): nunca vincular por match ambíguo; escalar para a clínica.
8. Via Comum (grátis) sem pagamento: definir se também gera cadastro+acesso. [Decisão D-Via abaixo.]

## Definição de PRONTO
- Pagar (concierge) leva a "pago/confirmando" e depois à tela final correta (R1/R4) — screenshot claro e escuro.
- Falha na confirmação mostra recuperação, nunca tela vazia (R2) — reproduzido.
- Pagar cria/acha cadastro por CPF e marca novo/retorno, sem duplicar (R5/R6/R7) — conferido no banco.
- E-mail de chegada chega com cadastro + horário + acesso + link de status (R8/R9/R10) — e-mail real conferido (homologação).
- 1º acesso com senha provisória obriga trocar a senha (R11/R12/R13) — reproduzido.
- Já cadastrado recebe "entrar/recuperar", sem senha nova (R14) — reproduzido.
- Senhas com hash; nenhum segredo/PII em log; erros genéricos na entrada (linhas vermelhas 1-4).
- architect aprova requisito por requisito; comunicação final em Densidade B.

## Decisões pendentes do CEO (Fase 1 — confirmar antes do build)
D1. Login do paciente = CPF (R11). Alternativa: e-mail. DEFAULT recomendado: CPF.
D2. Senha é método ADICIONAL, mantendo CPF + data de nascimento (R15). DEFAULT: adicional (não remove o atual).
D3. Autenticação leve na tabela `clients` sem provedor externo (R16). DEFAULT: sim (single-tenant).
D4. Via Comum (grátis) também gera cadastro + e-mail + acesso, ou só o fluxo pago (concierge)?
    DEFAULT recomendado: gerar cadastro + acesso em QUALQUER agendamento confirmado; o e-mail pago inclui
    status de pagamento, o grátis não.
D5. Onde o e-mail de chegada leva o "acesso": para `/area` (porta única). DEFAULT: `/area`.
D6. Ordem de construção: Bloco A (defeito) primeiro, isolado, para o senhor voltar a testar pagamento
    hoje; depois B, C, D. DEFAULT recomendado: sim (A primeiro).
