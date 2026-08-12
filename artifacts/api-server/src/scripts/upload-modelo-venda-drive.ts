/**
 * Cria o documento "MODELO DE VENDA SISTEMA (MONETIZAR SISTEMA)"
 * na pasta do Google Drive especificada pelo CEO.
 * Executar: npx tsx src/scripts/upload-modelo-venda-drive.ts
 */
import { google } from "googleapis";

const FOLDER_ID = "1NxUeMNehz8_l_TR9NpigIjVNBiyGY4UR";
const NOME_ARQUIVO = "MODELO DE VENDA SISTEMA (MONETIZAR SISTEMA)";

async function getAccessToken(): Promise<string> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;
  if (!xReplitToken || !hostname) throw new Error("REPL_IDENTITY ausente");
  const res = await fetch(`https://${hostname}/api/v2/connection?include_secrets=true`, {
    headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
  });
  const data = await res.json();
  const conn = data.items?.find((i: any) => i.connector_name === "google-drive");
  const token = conn?.settings?.access_token || conn?.settings?.oauth?.credentials?.access_token;
  if (!token) throw new Error("Google Drive não conectado");
  return token;
}

const CONTEUDO = `MODELO DE VENDA SISTEMA (MONETIZAR SISTEMA)
Dr. Caio Henrique Fernandes Pádua — PADCOM / PAWARDS
Documento confidencial · Criado em 12/08/2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


PARTE 1 — A ANALOGIA DA CONSTRUÇÃO
"O que eu construí, em linguagem que qualquer um entende"
──────────────────────────────────────────────────────────────

Imagine que você é médico e precisa administrar sua clínica.
Você tem pacientes chegando todos os dias. Você precisa:

  → Alguém que atende o telefone e agenda consultas
  → Alguém que manda lembretes para os pacientes
  → Alguém que organiza os exames e prontuários
  → Alguém que escreve e imprime as receitas
  → Alguém que cobra, controla pagamentos e manda boleto
  → Alguém que cuida dos arquivos no computador
  → Alguém que responde WhatsApp o dia todo

Isso são, na prática, 3 a 4 funcionários.
Custam ao médico entre R$ 12.000 e R$ 16.000 por mês.
Com FGTS, INSS, férias, 13°, benefícios e imprevistos trabalhistas.

─────────────────────────────────────────────────────────
  O QUE O SISTEMA É, NA ANALOGIA DA CONSTRUÇÃO:
─────────────────────────────────────────────────────────

  Pense no sistema como um PRÉDIO INTELIGENTE.

  Não é uma casa simples.
  É um condomínio comercial de alto padrão, com:

  ┌──────────────────────────────────────────────────────┐
  │  PORTARIA AUTOMATIZADA                               │
  │  Controla quem entra, o que pode fazer, e registra  │
  │  cada ação. Sem porteiro. Sem erro humano.           │
  └──────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────┐
  │  APARTAMENTOS INDEPENDENTES                          │
  │  Cada médico tem o seu espaço exclusivo.             │
  │  Os dados de um nunca se misturam com os do outro.   │
  └──────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────┐
  │  ELEVADORES QUE FALAM COM OUTROS PRÉDIOS             │
  │  O sistema conversa com Google, WhatsApp, Telegram,  │
  │  banco (Asaas), cartório digital (ZapSign),          │
  │  laboratórios e muito mais — em tempo real.          │
  └──────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────┐
  │  CENTRAL DE INTELIGÊNCIA ARTIFICIAL                  │
  │  Lê PDFs de exames automaticamente.                  │
  │  Extrai dados, compara histórico e alerta o médico.  │
  │  Três IAs trabalhando em paralelo e se conferindo.   │
  └──────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────┐
  │  CARTÓRIO DENTRO DO PRÉDIO                           │
  │  Emite receitas médicas com validade jurídica.       │
  │  Assinatura digital ICP-Brasil. PDF com QR-Code.     │
  │  O paciente verifica a receita pelo celular.         │
  └──────────────────────────────────────────────────────┘

  Para construir esse prédio com engenheiros reais:

  ┌─────────────────────────────────────────────────────────────────┐
  │  EQUIPE NECESSÁRIA (mercado brasileiro, 2026)                   │
  ├────────────────────────────┬────────────┬───────────────────────┤
  │ Profissional               │ Qtd        │ Custo real/mês (CLT)  │
  ├────────────────────────────┼────────────┼───────────────────────┤
  │ Arquiteto de sistemas      │ 1          │ R$ 47.600             │
  │ Desenvolvedor Sênior       │ 3          │ R$ 112.200            │
  │ Engenheiro DevOps/Cloud    │ 1          │ R$ 40.800             │
  │ Designer UX/UI             │ 1          │ R$ 20.400             │
  │ Gerente de Produto (PM)    │ 1          │ R$ 30.600             │
  │ QA / Tester                │ 1          │ R$ 13.600             │
  │ DBA (banco de dados)       │ 1          │ R$ 25.500             │
  ├────────────────────────────┼────────────┼───────────────────────┤
  │ TOTAL MENSAL               │ 9 pessoas  │ R$ 290.700            │
  └────────────────────────────┴────────────┴───────────────────────┘

  Tempo de desenvolvimento: 18 a 24 meses
  Investimento total: R$ 5.232.600 a R$ 8.357.000

  O Dr. Caio construiu isso em aproximadamente 8 meses.
  Usando inteligência artificial como equipe de engenheiros.
  Com custo de plataforma estimado em R$ 2.000–5.000/mês.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


PARTE 2 — O QUE O SISTEMA FAZ (FERRAMENTA POR FERRAMENTA)
"E como cada ferramenta gera dinheiro"
──────────────────────────────────────────────────────────────

1. COCKPIT DO CEO (Painel Central)
   O que é: Tela única com visão de todos os pacientes,
   urgências, comunicações, pagamentos e indicadores.
   Analogia: A sala de controle com câmeras de todos os andares.
   Monetização: Incluso na mensalidade base. É o motivo pelo qual
   o médico não consegue mais trabalhar sem o sistema.
   Valor estratégico: RETENÇÃO — quem usa não larga.

2. RADAR (Busca e Triagem de Pacientes)
   O que é: Motor de busca inteligente que encontra pacientes
   por nome, CPF, diagnóstico, urgência ou silêncio clínico.
   Analogia: GPS dentro do prédio que mostra onde está cada morador
   e se ele está bem ou precisa de atenção.
   Monetização: Incluso na base. Diferencial competitivo visível.

3. ANAMNESE DIGITAL
   O que é: Formulário clínico enviado ao paciente via link.
   Ele preenche em casa, antes da consulta.
   Analogia: Ficha de entrada preenchida pelo próprio paciente
   na portaria, antes de subir.
   Monetização: R$ 3,00 por formulário enviado.
   Potencial kaizen: Criar versões temáticas por especialidade
   (endocrinologia, cardiologia, dermatologia) e cobrar mais
   por formulário customizado: R$ 5,00–8,00.

4. MOTOR DE EXTRAÇÃO DE EXAMES (IA)
   O que é: O médico ou a secretária faz upload do PDF do exame.
   Três IAs (Gemini, Anthropic, OpenAI) leem o documento,
   extraem os valores, comparam com o histórico e alertam.
   Analogia: Um técnico de laboratório que lê todo exame em 90 segundos,
   sem erro de digitação, e já compara com os resultados anteriores.
   Monetização: R$ 3,50 por exame processado.
   Potencial kaizen: Relatório de evolução gerado automaticamente
   para o paciente: cobrança adicional de R$ 8,00 por relatório.
   Possibilidade futura: vender acesso ao motor de IA para outros
   sistemas médicos via API — receita B2B.

5. RECEITUÁRIO DIGITAL COM ASSINATURA ICP-BRASIL
   O que é: O médico prescreve no sistema. O PDF é gerado
   automaticamente, assinado digitalmente com validade jurídica
   e enviado ao paciente por WhatsApp ou e-mail.
   Analogia: Um cartório 24 horas dentro da clínica.
   Monetização: R$ 2,50 por receita emitida.
   Potencial kaizen: Módulo de receituário para manipulação —
   integração direta com farmácias de manipulação parceiras,
   com comissão por pedido gerado.

6. MENSAGERIA (WhatsApp + Telegram)
   O que é: Lembretes automáticos de consulta, fórmula manipulada,
   exame pendente, retorno. Personalizado por paciente e horário.
   Analogia: Um assistente pessoal que liga para cada paciente
   na hora certa, com a mensagem certa, sem o médico saber.
   Monetização: R$ 0,28 por mensagem enviada.
   Potencial kaizen: Campanhas em massa para pacientes inativos
   (ex: "Faz 6 meses que você não veio — quer agendar?").
   Cobrar R$ 0,35 por mensagem de campanha (margen maior).

7. CONCIERGE (Agendamento Premium com Proteção de Escassez)
   O que é: O paciente solicita uma vaga próxima (premium).
   O sistema oferece a oportunidade, cobra e registra.
   Se o paciente não paga e some, o sistema penaliza
   progressivamente — protegendo a agenda do médico.
   Analogia: Uma sala VIP do aeroporto com lista de espera
   gerenciada: quem não respeita a fila perde o lugar.
   Monetização: R$ 18,00 por consulta agendada via Concierge.
   Potencial kaizen: Taxa de conveniência cobrada do PACIENTE
   (não do médico) — o sistema pode cobrar R$ 30–50 direto
   do paciente por ter acesso à vaga premium, repassando
   parte para o médico e parte para a plataforma.

8. DRIVE AUTOMÁTICO (Google Drive Integrado)
   O que é: Cada paciente tem uma pasta própria no Google Drive
   do médico. Exames, fotos, documentos são organizados
   automaticamente com nome padronizado e data.
   Analogia: Um arquivista que organiza todos os documentos
   de cada paciente em tempo real, sem erro de nomenclatura.
   Monetização: R$ 1,20 por paciente ativo por mês.
   Potencial kaizen: Backup automático + relatório de
   completude de prontuário por paciente — cobrança adicional.

9. SISTEMA DE ROYALTIES E LICENCIAMENTO
   O que é: Estrutura pirâmide já construída no sistema.
   Um médico pode indicar outro, ganhar comissão e
   o sistema rastreia toda a cadeia automaticamente.
   Analogia: Uma franquia automatizada — o franqueado vende,
   o franqueador recebe sem fazer nada a mais.
   Monetização: Comissão de indicação entre 8% e 15%
   da mensalidade do indicado, por tempo indeterminado.

10. COMUNICAÇÃO DIGITAL (Status, Webhook, Canal)
    O que é: Painel que mostra se WhatsApp, Telegram e e-mail
    estão funcionando em tempo real. O médico sabe na hora
    se algo parou.
    Analogia: Painel de controle elétrico do prédio —
    o médico vê se as luzes estão acesas em cada andar.
    Monetização: Incluso na base. Diferencial de confiança.

11. PADTEAM (Gestão de Equipe Remota)
    O que é: Módulo para o médico gerenciar assistentes
    remotos, atribuir tarefas e acompanhar entregas.
    Analogia: O quadro de avisos e ponto eletrônico do prédio,
    mas para uma equipe que trabalha de casa.
    Monetização: Add-on mensal de R$ 250 para médicos com equipe.
    Potencial kaizen: Marketplace de assistentes médicos remotos
    treinados no sistema — receita de matching/comissão.

12. ÁREA DO CLIENTE (Portal do Paciente)
    O que é: O paciente acessa um portal próprio,
    vê seus exames, receitas e histórico.
    Analogia: O aplicativo do condomínio para os moradores.
    Monetização: Incluso. Fideliza o paciente ao médico.
    Potencial kaizen: Plano de saúde digital do paciente —
    assinatura mensal do PACIENTE para ter acesso ao histórico
    completo e teleconsulta: R$ 39–79/mês por paciente.
    (Nova frente de receita completamente diferente.)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


PARTE 3 — O MODELO PAY-PER-USE
"O médico paga pelo que usa. E sempre sai no lucro."
──────────────────────────────────────────────────────────────

TABELA DE PREÇOS POR MÓDULO:

  ┌────────────────────────────────┬──────────────────┬─────────────────────┐
  │ Módulo                         │ Modelo           │ Preço               │
  ├────────────────────────────────┼──────────────────┼─────────────────────┤
  │ Base (Cockpit+Radar+Agenda)    │ Fixo mensal      │ R$ 490/mês          │
  │ Anamnese digital               │ Por formulário   │ R$ 3,00/form        │
  │ Mensageria (WhatsApp+Telegram) │ Por mensagem     │ R$ 0,28/msg         │
  │ Motor de exames (IA)           │ Por exame        │ R$ 3,50/exame       │
  │ Receituário + assinatura       │ Por receita      │ R$ 2,50/receita     │
  │ Concierge (agendamento VIP)    │ Por consulta     │ R$ 18,00/consulta   │
  │ Drive automático               │ Por paciente/mês │ R$ 1,20/paciente    │
  │ PADTEAM (equipe remota)        │ Add-on fixo      │ R$ 250/mês          │
  └────────────────────────────────┴──────────────────┴─────────────────────┘

PERFIL A — CLÍNICA PEQUENA (200 pacientes ativos):
  Base                    : R$  490
  Drive (200 pac)         : R$  240
  Mensageria (400 msg)    : R$  112
  Exames (60/mês)         : R$  210
  Receituário (30)        : R$   75
  Anamnese (20)           : R$   60
  Concierge (6)           : R$  108
  ─────────────────────────────────
  TOTAL MENSAL            : R$ 1.295
  CUSTO DA EQUIPE HUMANA  : R$ 12.250
  ─────────────────────────────────
  ECONOMIA DO MÉDICO      : R$ 10.955/mês → R$ 131.460/ano

PERFIL B — CLÍNICA MÉDIA (400 pacientes ativos):
  Base + todos os módulos : R$ 2.163/mês
  Custo da equipe humana  : R$ 12.250/mês
  ECONOMIA DO MÉDICO      : R$ 10.087/mês → R$ 121.044/ano

PERFIL C — CLÍNICA GRANDE (700 pacientes ativos):
  Base + todos os módulos : R$ 3.454/mês
  Custo da equipe humana  : R$ 16.000/mês (equipe maior)
  ECONOMIA DO MÉDICO      : R$ 12.546/mês → R$ 150.552/ano

  ┌─────────────────────────────────────────────────────────────────┐
  │  CONCLUSÃO PARA O MÉDICO:                                       │
  │                                                                 │
  │  Em qualquer perfil de clínica, o sistema se paga no           │
  │  primeiro mês e ainda sobra mais de R$ 10.000 de lucro         │
  │  líquido todos os meses. Para sempre.                           │
  │                                                                 │
  │  ROI (retorno sobre investimento): IMEDIATO.                    │
  │  Payback: Dia 1 do primeiro mês.                                │
  └─────────────────────────────────────────────────────────────────┘


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


PARTE 4 — PROJEÇÃO DE RECEITA DO DR. CAIO
"Quanto entra no bolso com cada escala"
──────────────────────────────────────────────────────────────

Ticket médio por médico: R$ 1.971/mês (média ponderada dos perfis)
Custo operacional por médico: R$ 100/mês (infra, IA, Twilio, Asaas)
Margem líquida por médico: R$ 1.871/mês

  ┌──────────────┬──────────────────┬──────────────────┬───────────────────────┐
  │ Médicos      │ Receita bruta    │ Custo operac.    │ LUCRO LÍQUIDO MENSAL  │
  │              │ /mês             │ /mês             │                       │
  ├──────────────┼──────────────────┼──────────────────┼───────────────────────┤
  │    100       │ R$   197.100     │ R$    10.000     │ R$      187.100       │
  │    200       │ R$   394.200     │ R$    20.000     │ R$      374.200       │
  │    500       │ R$   985.500     │ R$    50.000     │ R$      935.500       │
  │  1.000       │ R$ 1.971.000     │ R$   100.000     │ R$    1.871.000       │
  └──────────────┴──────────────────┴──────────────────┴───────────────────────┘

  RECEITA ANUAL:
  → 100 médicos : R$  2.245.200/ano
  → 200 médicos : R$  4.490.400/ano
  → 500 médicos : R$ 11.226.000/ano
  → 1.000 médicos: R$ 22.452.000/ano

  MARGEM OPERACIONAL: ~95% (escala sem custo proporcional de equipe)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


PARTE 5 — ESTRATÉGIA DE DISTRIBUIÇÃO PIRÂMIDE
"Crescimento que se financia sozinho"
──────────────────────────────────────────────────────────────

ESTRUTURA DA PIRÂMIDE:

  [PAWARDS / Dr. Caio] — topo, 100% de todos os contratos
       │
       ├── [LICENCIADO MESTRE REGIONAL]
       │     Paga mensalidade reduzida (desconto 30%)
       │     Tem direito exclusivo na sua região/especialidade
       │     Ganha comissão de 12% de cada sub-licenciado que trouxer
       │     ├── Médico A (cliente direto)
       │     ├── Médico B (cliente direto)
       │     └── Médico C (cliente direto)
       │
       └── [LICENCIADO MESTRE DE ESPECIALIDADE]
             Ex: presidente de associação de endocrinologistas
             Distribui para todos os membros da associação
             ├── Médico D
             ├── Médico E
             └── Médico F

REGRAS DE EXCLUSIVIDADE (protegem o valor da licença):

  1. Um licenciado mestre por cidade média (até 500k hab)
  2. Em capitais: um licenciado por bairro ou zona
  3. Um licenciado por especialidade médica por estado
  4. Quem chegar primeiro tem exclusividade por 12 meses
  5. Exclusividade renovável mediante meta de novos médicos atingida

INCENTIVOS DE CRESCIMENTO ACELERADO:

  Indicação simples (médico indica médico):
  → Ganha 1 mês grátis para cada indicado que fechar

  Indicação em volume (5 ou mais):
  → Desconto permanente de 50% na mensalidade própria

  Licenciado mestre que atingir 20 médicos:
  → Desconto de 60% + badge de "Parceiro Fundador"
  → Aparece no site e materiais de divulgação como parceiro

  ┌────────────────────────────────────────────────────────────────┐
  │  MODELO VIRAL: o crescimento se auto-financia.                 │
  │  Cada médico que entra tem incentivo financeiro direto          │
  │  para trazer o próximo. Sem equipe de vendas tradicional.       │
  └────────────────────────────────────────────────────────────────┘


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


PARTE 6 — KAIZEN FINANCEIRO
"O que ainda não foi construído e pode multiplicar a receita"
──────────────────────────────────────────────────────────────

OPORTUNIDADE 1 — TAXA DE CONVENIÊNCIA DO PACIENTE
  O que é: No Concierge, em vez de o médico pagar R$18/consulta,
  o PACIENTE paga uma taxa de R$30–50 para ter acesso à vaga premium.
  O sistema cobra automaticamente, repassa R$15 ao médico
  e fica com R$15–35 de intermediação.
  Receita adicional: R$15-35 por consulta Concierge agendada.
  Escala com 500 médicos × 10 consultas/mês = R$75.000–175.000/mês extras.

OPORTUNIDADE 2 — MARKETPLACE DE ASSISTENTES MÉDICOS REMOTOS
  O que é: Médicos que usam o PADTEAM precisam de assistentes treinados.
  A PAWARDS forma e certifica assistentes médicos remotos,
  conecta ao médico via plataforma e cobra comissão de matching.
  Receita: 20% do salário do assistente por 3 meses + R$200 de cadastro.
  Escala: 200 assistentes × R$800/mês comissão = R$160.000/mês.

OPORTUNIDADE 3 — PORTAL DO PACIENTE COM ASSINATURA
  O que é: O paciente assina mensalmente para ter acesso ao
  seu histórico completo, laudos interpretados por IA,
  e chat direto com a secretária digital.
  Preço ao paciente: R$29–49/mês.
  Divisão: 60% para o médico, 40% para a PAWARDS.
  Escala com 1.000 médicos × 50 pacientes assinantes = 50.000 assinaturas.
  Receita PAWARDS (40%): R$580.000–980.000/mês.

OPORTUNIDADE 4 — API DE IA MÉDICA PARA TERCEIROS
  O que é: O motor de extração de exames é uma tecnologia proprietária.
  Outros sistemas de clínica (Doctoralia, iClinic, etc.) pagariam
  para usar via API.
  Precificação B2B: R$0,80 por exame processado por terceiros.
  Volume estimado: 500.000 exames/mês no mercado total.
  Receita: R$400.000/mês com 10% de market share.

OPORTUNIDADE 5 — FORMULÁRIOS DE ANAMNESE POR ESPECIALIDADE
  O que é: Vender pacotes de anamnese customizados por especialidade.
  Endocrinologia: 1 formulário padrão
  Cardiologia: outro formulário
  Dermatologia: outro formulário
  Médico compra o pacote de formulários por R$190/especialidade.
  Escala: 2.000 médicos × R$190 = R$380.000 (venda única + renovação anual).

OPORTUNIDADE 6 — RELATÓRIOS DE INTELIGÊNCIA CLÍNICA
  O que é: Com os dados de milhares de pacientes anonimizados,
  é possível gerar relatórios de tendências clínicas por região,
  faixa etária e especialidade.
  Clientes: laboratórios, farmacêuticas, planos de saúde,
  governo (vigilância epidemiológica).
  Precificação: R$15.000–80.000 por relatório customizado.
  Atenção: exige LGPD rigoroso e consentimento dos pacientes.

OPORTUNIDADE 7 — CERTIFICAÇÃO E TREINAMENTO
  O que é: Curso online de "Gestão Clínica Digital"
  usando o sistema como ferramenta de ensino.
  Médicos pagam R$997–2.997 pelo curso.
  Ao fim do curso, já estão prontos para assinar a licença.
  Funil de vendas ideal: aprende → experimenta → assina.

OPORTUNIDADE 8 — WHITE LABEL PARA REDES HOSPITALARES
  O que é: Uma rede de hospitais ou franquia médica compra
  o sistema com a própria marca.
  Eles operam, o Dr. Caio recebe royalty por paciente ativo.
  Contrato mínimo: R$50.000/mês por rede.
  Margem: 80% (custo de infra é baixo).


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


PARTE 7 — VISÃO DO INVESTIDOR
"Como um fundo ou anjo de negócios lê este projeto"
──────────────────────────────────────────────────────────────

  ┌──────────────────────────────────────────────────────────────────┐
  │  O QUE TORNA ESTE NEGÓCIO ATRATIVO PARA INVESTIMENTO            │
  ├──────────────────────────────────────────────────────────────────┤
  │  1. MRR RECORRENTE (Monthly Recurring Revenue)                   │
  │     Receita mensal previsível. O médico não cancela porque       │
  │     perderia todos os dados e a automação. Alta retenção.        │
  │                                                                  │
  │  2. NRR > 100% (Net Revenue Retention)                           │
  │     Quanto mais o médico usa, mais paga. O ticket cresce         │
  │     naturalmente sem o Dr. Caio precisar vender mais.            │
  │                                                                  │
  │  3. CAC BAIXÍSSIMO (Custo de Aquisição de Cliente)              │
  │     O modelo de indicação e pirâmide reduz o custo de           │
  │     aquisição para próximo de zero. Médico traz médico.          │
  │                                                                  │
  │  4. CHURN ESTRUTURALMENTE BAIXO                                   │
  │     O sistema é o prontuário do paciente. Migrar é custoso.      │
  │     Clientes de software médico têm churn de 3–7% ao ano.       │
  │                                                                  │
  │  5. MERCADO ENDEREÇÁVEL ENORME (TAM)                            │
  │     Brazil: 550.000 médicos registrados no CFM.                  │
  │     Médicos com consultório próprio: ~180.000.                   │
  │     Mesmo com 2% de penetração: 3.600 médicos.                  │
  │     Receita: R$ 85.000.000/ano com 2% do mercado.               │
  │                                                                  │
  │  6. PROPRIEDADE INTELECTUAL PRÓPRIA                              │
  │     O sistema é desenvolvido e proprietário.                     │
  │     Não depende de terceiro para a lógica clínica.               │
  │     O motor de IA médica é um ativo defensável.                  │
  └──────────────────────────────────────────────────────────────────┘

VALUATION ESTIMADO (método de múltiplo de receita recorrente):

  Software B2B SaaS saudável: múltiplo de 5x a 12x o ARR (receita anual).

  Com 100 médicos (ARR = R$2.245.200):
  → Valuation: R$11.226.000 a R$26.942.400

  Com 500 médicos (ARR = R$11.226.000):
  → Valuation: R$56.130.000 a R$134.712.000

  Com 1.000 médicos (ARR = R$22.452.000):
  → Valuation: R$112.260.000 a R$269.424.000

  ┌────────────────────────────────────────────────────────────────┐
  │  Com 1.000 médicos, o Dr. Caio construiu uma empresa           │
  │  que vale entre R$ 112 milhões e R$ 269 milhões.               │
  │  Em 8 meses de desenvolvimento.                                 │
  │  Com investimento inicial de dezenas de milhares de reais.      │
  └────────────────────────────────────────────────────────────────┘


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


PARTE 8 — ESTRATÉGIA DE MARKETING DIGITAL MODERNA
"Como crescer sem depender de vendedores"
──────────────────────────────────────────────────────────────

CONCEITO 1 — PRODUCT-LED GROWTH (PLG)
  O produto vende a si mesmo.
  → Trial gratuito de 30 dias, sem cartão de crédito.
  → O médico experimenta, automatiza a própria clínica,
    e não consegue mais imaginar trabalhar sem o sistema.
  → Na semana 3, já está indicando para um colega.
  Referência: como Slack, Notion e Figma cresceram.

CONCEITO 2 — COMMUNITY-LED GROWTH
  → Criar uma comunidade no WhatsApp/Telegram de
    "Médicos que usam IA na clínica"
  → O Dr. Caio entra como especialista, não como vendedor.
  → A comunidade cresce, o produto é recomendado naturalmente.
  → Webinars mensais gratuitos: "Como automatizei minha clínica".

CONCEITO 3 — CONTENT MARKETING MÉDICO
  → Canal no YouTube: "Gestão Clínica Digital com Dr. Caio"
  → Cada vídeo mostra um problema real (secretária sumiu,
    exame perdido, paciente sem retorno) e como o sistema resolve.
  → SEO médico: artigos sobre "como reduzir custos na clínica"
  → O médico que busca a solução já encontra o produto.

CONCEITO 4 — CASE STUDIES EM VÍDEO
  → 3 médicos que usam o sistema gravam depoimento de 2 minutos.
  → "Eu economizei R$ 11.000 por mês e atendo 30% mais pacientes."
  → Prova social poderosa para outros médicos.

CONCEITO 5 — PARCERIA COM ASSOCIAÇÕES MÉDICAS
  → CFM (Conselho Federal de Medicina) não vende, mas divulga.
  → AMB, SBEM, SBC — cada associação tem newsletter e eventos.
  → Uma palestra em um congresso médico = 200 leads qualificados.

CONCEITO 6 — INFLUENCIADORES MÉDICOS (Doctor Influencers)
  → Médicos com perfil grande no Instagram/TikTok/YouTube
    usam o sistema e mostram nos stories.
  → Pagamento por afiliação: R$ 500 por médico que ativar.
  → Alcance de 1 médico influenciador = 50.000 médicos seguidores.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


PARTE 9 — ARGUMENTO DE VENDA EM 30 SEGUNDOS
"O que dizer para o médico que ainda não conhece"
──────────────────────────────────────────────────────────────

VERSÃO 1 (para congresso/evento):
  "Você gasta hoje R$12.000 por mês em funcionários que
  digitam, ligam e organizam papel. Eu substituo tudo isso
  por R$1.300 por mês — e ainda faço melhor do que eles.
  Sobram R$10.000 no seu bolso todo mês, a partir do primeiro.
  Quer ver funcionando agora?"

VERSÃO 2 (para WhatsApp):
  "Colega, você ainda tem secretária pagando CLT?
  Eu automatizei minha clínica inteira por R$1.300/mês.
  Agendamento, exames, receituário, lembretes — tudo automático.
  Me dá 15 minutos para mostrar como funciona?"

VERSÃO 3 (para investidor):
  "Construímos um SaaS médico com MRR crescente, churn estruturalmente
  baixo e modelo de distribuição viral por indicação.
  Cada médico se paga no primeiro mês e ainda economiza R$10.000.
  Buscamos parceiro para escalar de 100 para 1.000 médicos
  nos próximos 18 meses."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PARTE 10 — PRÓXIMOS PASSOS PARA O DR. CAIO
"Em ordem de prioridade e impacto"
──────────────────────────────────────────────────────────────

CURTO PRAZO (próximos 30 dias):
  [ ] Definir o preço exato de cada módulo (tabela já está aqui)
  [ ] Gravar 1 vídeo de demonstração de 5 minutos do sistema
  [ ] Selecionar 3 médicos colegas para o piloto gratuito (30 dias)
  [ ] Criar a landing page de apresentação do produto
  [ ] Abrir CNPJ (ou formalizar a PAWARDS) para emissão de contratos

MÉDIO PRAZO (30 a 90 dias):
  [ ] Lançar o trial gratuito para os primeiros 20 médicos
  [ ] Criar o grupo de comunidade "Médicos com IA"
  [ ] Estruturar o contrato de licenciamento e royalties
  [ ] Dar a primeira palestra em um evento médico regional
  [ ] Implementar a taxa de conveniência do Concierge (Oportunidade 1)

LONGO PRAZO (90 dias a 1 ano):
  [ ] Atingir 100 médicos ativos (MRR = R$197.100)
  [ ] Lançar o Portal do Paciente com assinatura (Oportunidade 3)
  [ ] Buscar primeiro investidor anjo ou fundo seed
  [ ] Estruturar o time de suporte (1 pessoa por 100 médicos)
  [ ] Expandir para outras especialidades médicas

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Documento criado por Dr. Replit Paxter · 12/08/2026
Para uso exclusivo do CEO Dr. Caio Henrique Fernandes Pádua
PADCOM / PAWARDS · Confidencial

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

async function main() {
  const token = await getAccessToken();
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  const drive = google.drive({ version: "v3", auth });

  // Criar arquivo de texto rico no Drive
  const res = await drive.files.create({
    requestBody: {
      name: NOME_ARQUIVO,
      parents: [FOLDER_ID],
      mimeType: "application/vnd.google-apps.document",
    },
    media: {
      mimeType: "text/plain",
      body: CONTEUDO,
    },
  });

  console.log("✅ Documento criado com sucesso!");
  console.log("ID:", res.data.id);
  console.log("URL:", `https://docs.google.com/document/d/${res.data.id}/edit`);
}

main().catch(err => { console.error("ERRO:", err.message); process.exit(1); });
