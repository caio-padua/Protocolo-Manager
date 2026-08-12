================================================================================
CARTA TECNICA — PARA DR. MANUS (Engenheiro Autonomo de Missoes)
De: Dr. Replit Paxter (Plataforma Replit — Repositorio Protocolo-Manager)
Assunto: Handoff completo da sessao 12/08/2026 — Trava de Escassez do Concierge
Data: 12/08/2026
================================================================================

DR. MANUS,

Esta carta documenta tudo que foi construido nesta sessao, o estado atual do
sistema de penalidades do Concierge, as decisoes em aberto e os proximos passos
arquitetados. Leia antes de qualquer execucao.

================================================================================
1. CONTEXTO DO SISTEMA
================================================================================

O Concierge e o canal premium de agendamento do sistema PADCOM / Protocolo-Manager.
O cliente paga uma taxa para ter acesso prioritario a datas de consulta.

PROBLEMA QUE A TRAVA RESOLVE:
  Clientes estavam fazendo reservas Concierge e cancelando sem pagar,
  liberando a vaga para outros e voltando para tentar outra data melhor.
  Isso e comportamento oportunista que prejudica clientes serios.

SOLUCAO IMPLEMENTADA — TRAVA DE ESCASSEZ:
  Cada falha (cancelamento, expiração, chargeback) acumula penalidade.
  A penalidade afasta as datas disponiveis no futuro.

  Falhas | Efeito
  -------|--------
  0      | Oferta normal
  1      | Datas +7 dias
  2      | Datas +30 dias
  >=3    | bloqueado_permanente = true

================================================================================
2. O QUE FOI CONSTRUIDO (commits desta sessao)
================================================================================

ARQUIVO: artifacts/api-server/src/lib/concierge-penalidade.ts  [NOVO]
  - Funcao getPenalidade(cpf): retorna {tentativas_falha, bloqueado_permanente}
  - Funcao registrarFalha(cpf): incrementa contador, marca bloqueado se >=3
  - Funcao calcularPenalidadeDias(n): retorna 0/7/30/Infinity
  - Tabela criada lazy: CREATE TABLE IF NOT EXISTS concierge_penalidades
  STATUS: ENTREGUE E FUNCIONANDO

ARQUIVO: artifacts/api-server/src/routes/scheduling.ts  [MODIFICADO]
  - GET /scheduling/concierge-offer?cpf= aplica offset de datas pela penalidade
  - Retorna {blocked: true} quando bloqueado_permanente = true
  - Hook de polling: quando sreq vira 'expirado' ou 'cancelado', chama registrarFalha
  STATUS: ENTREGUE E FUNCIONANDO

ARQUIVO: artifacts/api-server/src/routes/asaas.ts  [MODIFICADO]
  - Hook em PAYMENT_OVERDUE: busca sreq pelo externalReference, registra falha
  - Hook em PAYMENT_DELETED: idem
  - Hook em PAYMENT_REFUNDED: idem
  - Hook em PAYMENT_CHARGEBACK_REQUESTED: idem (task #157)
  STATUS: ENTREGUE E FUNCIONANDO

ARQUIVO: artifacts/padcom/src/pages/agendar.tsx  [MODIFICADO]
  - Stage 'oferta': painel vermelho quando bloqueado_permanente
  - Banner ambar com dias de penalidade quando parcialmente penalizado
  - Aviso nos botoes de cancelar sobre acumulo de penalidade
  STATUS: ENTREGUE E FUNCIONANDO

TABELA NO BANCO (criada lazy, fora do Drizzle schema):
  CREATE TABLE IF NOT EXISTS concierge_penalidades (
    id SERIAL PRIMARY KEY,
    cpf TEXT NOT NULL UNIQUE,
    tentativas_falha INTEGER DEFAULT 0,
    bloqueado_permanente BOOLEAN DEFAULT FALSE,
    ultima_falha_at TIMESTAMPTZ,
    criado_at TIMESTAMPTZ DEFAULT NOW()
  );
  AVISO: nao usar db push. Tabela existe no banco de producao.

TASKS MERGEADAS NESTA SESSAO:
  #144 — Testes da trava de escassez          commit: 312f507
  #146 — Painel CEO para ver/resetar          commit: 9bed3c5
  #149 — Reset CEO ponta a ponta              commit: 9305755
  #150 — Audit log ao resetar                 commit: 75a0469
  #151 — CPF nao pedido duas vezes no reset   commit: 92421b2
  #152 — Webhook Asaas dispara penalidade     commit: b05883f
  #157 — CHARGEBACK_REQUESTED penaliza        commit: ee99e8f

================================================================================
3. PROBLEMAS CONHECIDOS E RISCOS
================================================================================

RISCO 1 — IDEMPOTENCIA DO WEBHOOK (CRITICO) — Task #158
  O Asaas pode reenviar o mesmo evento webhook em retentativas.
  Sem idempotencia, cada reenvio incrementa uma penalidade no mesmo CPF.
  Ex: uma cobrança expirada gera 3 reenvios = 3 penalidades indevidas.

  SOLUCAO PROPOSTA (Kaizen K-003):
    Adicionar coluna penalidade_registrada BOOLEAN DEFAULT FALSE em scheduling_requests.
    Antes de chamar registrarFalha(), verificar se ja e TRUE.
    Se sim: retornar 200 com {skipped: 'already_penalized'}.
    Se nao: setar TRUE e entao chamar registrarFalha().

  URGENCIA: ALTA — corrigir antes de qualquer teste com webhook real do Asaas.

RISCO 2 — BLOQUEIO SO NO FRONTEND (#159)
  O bloqueio permanente e verificado apenas no frontend (agendar.tsx).
  Um cliente bloqueado poderia contornar indo direto para a API.
  O backend POST /scheduling/concierge-request NAO verifica bloqueio ainda.
  
  SOLUCAO: adicionar guard no inicio da rota:
    const pen = await getPenalidade(cpf);
    if (pen.bloqueado_permanente) return res.status(403).json({error:'bloqueado'});

RISCO 3 — SEM NOME DO PACIENTE NA TELA DE PENALIDADES (#160, #162)
  A tabela exibe CPF mascarado mas nao o nome.
  O CEO nao sabe quem e sem buscar no cockpit.
  
  SOLUCAO: JOIN com clients por CPF no GET /api/concierge-penalidades.

RISCO 4 — CHARGEBACK DE PAGAMENTO COMUM (#161)
  O hook em PAYMENT_CHARGEBACK_REQUESTED busca o externalReference no banco.
  Se o pagamento for de uma compra comum (nao Concierge), nao vai encontrar sreq
  e nao vai penalizar. Mas precisa ser CONFIRMADO em teste.

RISCO 5 — CRESCIMENTO DA TABELA DE IDEMPOTENCIA (#165)
  Se a tabela de eventos processados crescer indefinidamente, vai degradar.
  Sugestao: job diario que apaga eventos com mais de 90 dias.

================================================================================
4. DECISOES EM ABERTO (AGUARDANDO CEO)
================================================================================

DECISAO A — RESET AUTOMATICO AO PAGAR?
  Pergunta: quando o cliente paga o Concierge com sucesso, as tentativas_falha
  devem ser zeradas automaticamente?
  Estado atual: penalidade e permanente, pagar nao zera.
  CEO ainda nao confirmou. NAO alterar finalizeConciergeBooking sem confirmacao.

DECISAO B — ESCOPO DA INTELIGENCIA COMERCIAL
  O CEO quer uma tela /inteligencia unificando:
  - Funil Concierge (leads por etapa)
  - Leads anonimos da vitrine (vitrine_leads)
  - Eventos do guia digital
  CEO declined formulario de escopo, prefere confirmar por chat.
  Aguardar confirmacao antes de construir.

================================================================================
5. COMO AUDITAR O TRABALHO DESTA SESSAO
================================================================================

1. Verificar commits:
   git log --oneline 1c8d16e..HEAD

2. Testar motor de penalidade via API:
   curl "$API/scheduling/concierge-offer?cpf=12345678900"
   Esperado: {blocked:false, datas:[...]} ou {blocked:true}

3. Verificar tabela no banco:
   psql $DATABASE_URL -c "SELECT * FROM concierge_penalidades LIMIT 5;"

4. Testar webhook Asaas manualmente:
   curl -X POST "$API/webhooks/asaas" \
     -H "Content-Type: application/json" \
     -d '{"event":"PAYMENT_OVERDUE","payment":{"id":"pay_test","externalReference":"sreq_123"}}'
   Esperado: falha registrada para o CPF do sreq_123

5. Verificar painel CEO:
   Navegar para /penalidades-concierge no sistema.
   Deve exibir tabela de CPFs bloqueados e botao de reset.

================================================================================
6. PROXIMOS 10 PASSOS (em ordem de prioridade)
================================================================================

PASSO 1 — Fechar idempotencia do webhook (Task #158) — URGENTE
  Ver Risco 1 acima. Adicionar guard penalidade_registrada.

PASSO 2 — Bloquear no backend tambem (Task #159)
  Guard em POST /scheduling/concierge-request.

PASSO 3 — Nome do paciente na tela (Tasks #160, #162)
  JOIN com clients no GET /api/concierge-penalidades.

PASSO 4 — PaxterClientSelector na tela de penalidades (Task #156)
  Substituir prompt() pelo componente canonico.
  Skill em: .agents/skills/skill-paxter-client-selector/SKILL.md

PASSO 5 — Penalidade no historico do paciente (Task #153)
  Bloco no cockpit exibindo data, tipo de falha, quem resetou.

PASSO 6 — Confirmar reset via modal (Task #154)
  Teste end-to-end: bloquear cliente, resetar pelo painel CEO, verificar desbloqueio.

PASSO 7 — Confirmar CHARGEBACK sem sreq nao penaliza (Task #164, #161)
  Teste com payload de chargeback sem externalReference valido.

PASSO 8 — Limpar tabela de idempotencia (Task #165)
  Job diario: DELETE FROM concierge_penalidades_eventos WHERE created_at < NOW()-'90d'.

PASSO 9 — Tela /inteligencia (Kaizen K-004)
  Aguardar confirmacao do CEO sobre escopo.

PASSO 10 — Atualizar schema OpenAPI para cpf em concierge-offer (Kaizen K-001)
  Permite voltar ao hook gerado em agendar.tsx em vez de fetch manual.

================================================================================
7. REGRAS INVIOLAVEIS DO CEO
================================================================================

  1. NUNCA DROP TABLE / TRUNCATE sem ordem escrita dupla do CEO.
  2. Tela obsoleta = fora do menu, arquivo intacto.
  3. concierge_penalidades foi criada lazy (fora do Drizzle). Nao usar db push.
  4. Penalidade e permanente (pagar nao zera) ate CEO confirmar o contrario.
  5. Toda coluna nova = ADD COLUMN. Nunca DROP COLUMN.
  6. BRT centralizado: usar brtNow() de lib/brt.ts. Nunca new Date() cru.
  7. createClientSafe() para novas rotas de cliente (empresa_id=5, location_id=8).

================================================================================
8. ONDE ESTA TUDO
================================================================================

  Repositorio:    https://github.com/caio-padua/Protocolo-Manager
  Handoff docs:   docs/HANDOFF-DR-CODE-MANUS.md
  Cartas:         cartas/
  Specs:          specs/
  Memoria:        .agents/memory/MEMORY.md
  Skills:         .agents/skills/

  HEAD atual:     git log --oneline -5

================================================================================
RESUMO EM 1 LINHA: Trava de escassez do Concierge entregue de ponta a ponta;
idempotencia do webhook Asaas (Task #158) e o risco mais critico — resolver antes
de qualquer teste com webhook real.
================================================================================
