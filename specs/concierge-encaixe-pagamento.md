# Spec — Concierge: Pagamento do Encaixe + Narrativa de Escassez (porta de entrada do paciente)

Status: RASCUNHO (aguardando o CEO travar o VALOR da taxa e confirmar o modelo de disponibilidade).
Data: 30/06/2026. Dono: Dr. Replit Paxter. Decisao do CEO: Opcao A (cobranca no nome do paciente).

## Objetivo (uma frase)
Transformar o passo "Via Concierge" da jornada do Dr. Caio numa experiencia de pagamento impecavel
(navy/ouro, estilo Hermes) que cobra um valor no nome do paciente, confirma o encaixe e, em seguida,
conta uma narrativa honesta de escassez de agenda com poucos horarios reais e um canal de "concierge
luta pelo seu horario".

## Estado atual (verificado no codigo — sem fantasia)
| Item | Existe hoje? | Detalhe |
|---|---|---|
| Escolha Via Concierge x Fila Comum | SIM | `agendar.tsx` (DrCaioFlow), passo 2 |
| Pagamento do concierge | PARCIAL | Botao abre um LINK externo do Asaas (pagina hospedada); nao tem PIX QR embutido nem chave CNPJ |
| PIX QR embutido na tela | NAO | `asaasCreateCharge` so devolve `invoiceUrl`; nao chama `GET /payments/{id}/pixQrCode` |
| PIX copia-e-cola estatico (chave CNPJ) | NAO | Nenhum gerador de BR Code/EMV no repo |
| Webhook marca "pago" | SIM | `POST /asaas/webhook` (PAYMENT_CONFIRMED/RECEIVED -> status `paid`), mas sem efeito colateral |
| Tela apos pagamento (horarios/escassez) | NAO | Hoje so mostra "nossa equipe entrara em contato" |
| Negociacao de horario (paciente propoe dia/periodo) | PARCIAL | Preferencias sao capturadas ANTES, salvas em `scheduling_requests`; nao ha resposta/contraoferta |
| Agenda publica do Dr. Caio | NAO | Dr. Caio e excluido dos profissionais com agenda (`isPrimaryDoctor:false`) |
| Guarda dev x producao para cobranca real | NAO | Base URL padrao = producao; risco de cobrar de verdade em teste |

## Linhas vermelhas (dinheiro — inegociaveis)
1. NUNCA disparar cobranca REAL em ambiente de desenvolvimento/teste. Em dev, modo demonstracao (mock),
   sem criar charge real no Asaas. So liga de verdade na publicacao (producao).
2. NUNCA logar token/segredo do Asaas nem dados pessoais do paciente.
3. Reembolso integral se a clinica nao confirmar o encaixe (promessa ja escrita na UI) — manter.
4. Escassez HONESTA: mostrar somente horarios reais oferecidos pela clinica. Proibido "despejar" muitos
   horarios so para parecer disponivel; proibido inventar horario que nao existe.
5. Nao tocar no motor de orcamento/desmembramento nem em rotas de calculo.

## Requisitos exatos
R1. Passo de pagamento "porta de entrada" redesenhado no padrao navy/ouro (skill-layout-paxter), elegante
    e classico, sem nada que gere antipatia (alinhamento, tipografia classica, simbolo de vidro 3D).
R2. Opcao A — cobranca no NOME do paciente: ao confirmar Via Concierge, cria a cobranca vinculada ao
    paciente (nome + CPF), valor = taxa concierge (a definir), e entra no Financeiro automaticamente.
R3. Formas de pagamento exibidas na propria tela (todas):
    R3a. PIX QR dinamico (Asaas) com codigo copia-e-cola — concilia sozinho pelo webhook.
    R3b. PIX copia-e-cola ESTATICO da chave CNPJ 63.865.940/0001-63 (BR Code/EMV gerado offline) — para
         quem confia mais em pagar direto ao CNPJ; conciliacao manual pelo Financeiro.
    R3c. Cartao de credito e Boleto (via pagina hospedada do Asaas, billingType UNDEFINED).
R4. Apos pagamento CONFIRMADO (webhook), o paciente entra na tela "Concierge em acao":
    R4a. Mensagem honesta: a equipe vai organizar a agenda para o horario mais proximo, podendo remanejar
         pacientes antigos para abrir espaco; isso leva um tempo ("em ate X" — definir).
    R4b. Quando a clinica liberar, aparecem POUCOS horarios reais (ex.: quarta de manha; sexta a tarde),
         deixando a escassez evidente e verdadeira.
R5. Botao "As datas disponiveis nao me atendem": paciente escolhe dia da semana + periodo + horario ideal;
    o sistema registra como pedido para o concierge "lutar pelo horario"; se conseguir, libera para ele.
R6. Conciliacao: somente o caminho Asaas (R3a/R3c) avanca a narrativa automaticamente; o PIX estatico
    (R3b) fica "aguardando confirmacao do Financeiro" ate baixa manual (honestidade no status).
R7. Origem dos horarios (R4b): curadoria MANUAL pelo concierge (Dr. Caio nao tem agenda publica). A clinica
    abre 2 a 4 janelas reais por pedido. [DEFAULT proposto — confirmar com o CEO.]

## Fluxo (blueprint)
```
Paciente escolhe "Via Concierge"
   -> Tela de PAGAMENTO (navy/ouro): PIX QR Asaas | PIX copia-e-cola CNPJ | Cartao | Boleto
   -> Paga
   -> Webhook Asaas confirma (PAYMENT_CONFIRMED)        [PIX estatico: baixa manual do Financeiro]
   -> Tela "CONCIERGE EM ACAO" (a equipe esta remanejando a agenda; aguarde ate X)
   -> Clinica libera POUCAS janelas reais  ----> Paciente aceita um horario -> ENCAIXE CONFIRMADO
                                           \
                                            -> "As datas nao me atendem" -> paciente propoe dia/periodo/horario
                                                  -> Concierge luta pelo horario -> conseguiu? libera : reembolsa
```

## Casos extremos
1. Pagamento nao confirma (abandono): pedido fica "aguardando pagamento"; nao mostra horarios.
2. PIX estatico pago mas sem baixa: status honesto "aguardando confirmacao", nunca "confirmado".
3. Webhook duplicado: idempotente (ver memoria webhook-assinatura-idempotencia).
4. Chave Asaas de producao em dev: guarda bloqueia charge real (modo demo).
5. Concierge nao consegue encaixe: dispara reembolso integral (promessa da UI).
6. Paciente fecha a aba e volta: retoma pelo CPF/telefone, ve o status atual.

## Definicao de PRONTO
- Tela de pagamento navy/ouro validada por screenshot (claro e escuro), com as 4 formas visiveis.
- PIX QR dinamico e copia-e-cola da chave CNPJ funcionando (QR le e paga em homologacao).
- Em dev nenhuma cobranca real e criada (modo demo comprovado).
- Apos confirmacao, tela "Concierge em acao" -> poucas janelas reais -> aceite OU pedido de outro horario.
- Reembolso previsto quando nao ha encaixe.
- architect aprova requisito por requisito; comunicacao final em Densidade B.

## Decisoes pendentes do CEO (Fase 1 do loop)
D1. VALOR da taxa concierge (so o CEO sabe). BLOQUEIA o build.
D2. Tempo "X" da tela "Concierge em acao" (sugestao: nao prender o paciente; mostrar "em ate algumas horas"
    e tambem avisar por WhatsApp/e-mail quando as janelas abrirem). Confirmar.
D3. Modelo de disponibilidade (R7): curadoria manual (default) x agenda dedicada do Dr. Caio. Confirmar.
