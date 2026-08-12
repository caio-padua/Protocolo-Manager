# ESTADO ATUAL — TRAVA CONCIERGE (12/08/2026)

## CONTEXTO
- Dr. Caio deu autoridade total ao Dr. Manus como árbitro cruzado (Art. 72 Cartilha 10)
- O Dr. Manus não é pombo-correio — comunica diretamente via Slack e planilha
- Dr. Code revisou a especificação do Dr. Manus e fez 4 correções — TODAS ACEITAS

## PLANILHA — ITENS REGISTRADOS (colunas A-H, sheet "PLANILHA PRODUCAO")
| # | Item | Responsável | Status | Prioridade | Depende |
|---|---|---|---|---|---|
| 74 | Trava escassez Concierge (base) | Dr. Replit | A FAZER | P0 | — |
| 75 | Idempotência webhook Asaas | Dr. Replit | A FAZER | P0 | — |
| 76 | Guard backend concierge-request | Dr. Replit | A FAZER | P0 | — |
| 77 | Peso por desfecho + pontuação | Dr. Code | A FAZER | P1 | 75 |
| 78 | Janela + decaimento 90d + suspensão 180d | Dr. Code | A FAZER | P1 | 77 |
| 79 | Verificação por código no canal | Dr. Code | A FAZER | P1 | 75 |
| 80 | Fricção por dispositivo/sessão | Dr. Manus | A FAZER | P1 | 79 |
| 81 | Bateria de 20 casos (12 abuso + 8 idem) | Dr. Manus | A FAZER | P1 | 75,77,78,79 |
| 82 | Migrar tabela para Drizzle | Dr. Code | A FAZER | P2 | 77 |
| 83 | Tela Inteligência Comercial | Dr. Manus | A FAZER | P2 | 77,78,79 |

## CORREÇÕES DO DR. CODE À ESPECIFICAÇÃO DO DR. MANUS (todas aceitas)
1. #81 depende de #77, #78, #79 (não só #75, #79) — testes devem usar pesos fracionários
2. Fingerprint é SINAL não chave — fricção crescente (exige código), não recusa binária
3. DDL: UNIQUE(device_fingerprint, dia_brt) + dia_brt DATE para reset diário
4. Tabela nasce no schema Drizzle (não lazy fora do ORM)

## LACUNAS A REGISTRAR NA PLANILHA
- (novo #84): Frontend trata throttled — agendar.tsx precisa exibir mensagem de fricção crescente
- (novo #85): Caso de teste — fingerprint ausente + 2 dispositivos mesmo IP (falso positivo CGNAT)
- (novo #86): Revisão semântica do texto da mensagem (não soar como castigo)

## PRÓXIMOS PASSOS
1. Adicionar #84, #85, #86 na planilha
2. Atualizar dependências de #81 para incluir #77, #78
3. Atualizar dependência de #80 para incluir #79
4. Postar no Slack #padaxor-projeto com handoff claro para Dr. Replit e Dr. Code
5. Aguardar execução dos P0 (Dr. Replit) e P1 (Dr. Code)

## ARQUIVOS CHAVE
- /home/ubuntu/especificacao_dr_manus_concierge.md — especificação original (precisa ser atualizada)
- /home/ubuntu/sintese_concierge.md — síntese completa
- /home/ubuntu/avaliacao_concierge.md — avaliação técnica

## SLACK CHANNEL
- #padaxor-projeto = C0BLW5S7GQL
- Últimas mensagens já postadas:
  - Avaliação do árbitro: https://padua-01.slack.com/archives/C0BLW5S7GQL/p1786499797173799
  - Propostas fix: https://padua-01.slack.com/archives/C0BLW5S7GQL/p1785549788873949

## REGRAS DO CEO (Cartilha 10)
- Numeração única da planilha
- Item só fecha com hash de commit + caso testado
- Não atribuir ao CEO confirmações que ele não deu
- Discordância com prova é bem-vinda
- brtNow() para datas BRT, nunca new Date() cru
- CREATE TABLE IF NOT EXISTS fora do Drizzle (mas #82 existe para migrar)
- Toda coluna nova = ADD COLUMN, nunca DROP
- NUNCA DROP TABLE / TRUNCATE sem ordem escrita dupla do CEO
