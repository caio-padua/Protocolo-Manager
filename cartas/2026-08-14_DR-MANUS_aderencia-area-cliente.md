# CARTA PARA DR. MANUS
# Assunto: Aderencia as Formulas Manipuladas — Arquitetura e Auditoria

Data: 14/08/2026
De: Dr. Replit Paxter
Para: Dr. Manus
Protocolo: START S3 (handoff de arquitetura para auditoria/validacao)

---

## 1. CONTEXTO E MISSAO

O CEO ordenou a construcao da funcionalidade de aderencia as formulas manipuladas
dentro da Area do Cliente (/area). Dr. Manus recebe esta carta para:
(a) auditar a arquitetura proposta
(b) validar os casos de teste da spec
(c) propor kaizen adicionais com a profundidade que o CEO exige

A spec completa esta em specs/aderencia-area-cliente.md.
A carta para Dr. Code (backend) esta em cartas/2026-08-14_DR-CODE_aderencia-area-cliente.md.

## 2. DESCOBERTAS IMPORTANTES DO MOTOR EXISTENTE

O motor de mensageria de formulas JA EXISTE e esta em producao:

| Componente | Arquivo | Funcao |
|---|---|---|
| Motor rico (Opus) | lib/mensageria-opus.ts | Monta mensagem com catalogo: saudacao por periodo, dia da semana, versiculo sabado |
| Template simples | lib/lembrete-templates.ts | Fallback: saudacao + blocoPrescricaoPeriodos + assinatura |
| Bloco de prescricao | blocoPrescricaoPeriodos() em lembrete-templates.ts | Lista periodos com emoji: ⬛ por periodo, 🟩 = tomar, 🟨 = nao tomar |
| Dispatch | lib/lembrete-periodo.ts | Le lembretes_prescricao, verifica janela, envia WhatsApp + espelho Telegram |
| Schema | lib/db/src/schema/lembretes-prescricao.ts | Tabelas lembretes_prescricao e lembrete_envios |

FORMATO REAL DA MENSAGEM (confirmado via GET /api/lembretes/44/preview, 14/08/2026):

```
Boa tarde!

CAIO, tudo bem?

O Dr. Caio esta contente com sua evolucao e acompanha cada passo do seu progresso.

Hoje e *sexta-feira* — estamos na *segunda semana do mes — o ritmo ja esta construido*.

Neste momento do almoco, quando a refeicao alimenta o corpo, as formulas somam...

Quero lembra-lo das formulas do *almoco*:

⬛ *Periodo:* _Almoco_
🟩 *Programado* para administrar:

🟩 *Formula Reposicao Mineral Base*
   Magnesio — 200 mg
   Horario: 11h00
   Pensada para reposicao basica
   Posologia: 1 dose, via oral, no almoco

⬛ *Periodo:* _Noite_
🟩 *Programado* para administrar:
...

💬 *O Dr. Caio costuma dizer:* o melhor remedio da medicina integrativa e constancia + equilibrio nutricional.
```

O link formula <-> periodo esta em lembretes_prescricao.periodos (JSONB):
cada LembretePeriodoJson tem { sigla: "AL", nome: "Almoco", tipo: "tomar", formulas: [...] }

## 3. CONTEXTO DO ESTADO ATUAL DA AREA DO CLIENTE

- Rota: /area (App.tsx redireciona /portal -> /area)
- Abas: INICIO, PROTOCOLOS, AGENDA, DOCUMENTOS, ENVIAR, DUVIDAS (morta), SUPORTE (morta), EVOLUCAO
- DUVIDAS e SUPORTE aparecem na barra de navegacao MAS nao tem conteudo renderizado
- Nao existe nenhuma tabela de aderencia, vigencia de formula, duvidas de paciente ou CAT no banco

## 4. ARQUITETURA APROVADA (Dr. Replit -> CEO, 14/08/2026)

```
MOTOR DE LEMBRETE (sem toque)
  |-> mensagem WhatsApp/Telegram com bloco de formulas por periodo
  |
  v
PACIENTE ABRE /area -> aba MEU TRATAMENTO
  |
  +-- (a) FORMULAS DE HOJE
  |     Periodos da lembretes_prescricao.periodos
  |     Cada formula: botao TOMEI / NAO TOMEI (+ motivo) / ATRASEI
  |     Gravacao em formula_adesao_evento (unique: cliente+chave+sigla+data_ref)
  |     Janela: hoje + 2 dias anteriores (fora = somente leitura)
  |
  +-- (b) HISTORICO DE FORMULAS
  |     formula_vigencia WHERE fim_em IS NOT NULL
  |     Somente leitura; selo "ENCERRADA EM dd/mm/aaaa"
  |
  +-- (c) MINHAS DUVIDAS
        Botao ENVIAR DUVIDA -> paciente_duvida
        Cada duvida lista as respostas em paciente_duvida_resposta
        Avisa CEO via Telegram (PADAXOR_TELEGRAM_CHAT_ID)

VIGENCIA DE FORMULA (passo adicional na sync existente):
  lembretes_prescricao.periodos -> formula_vigencia
  Abre vigencia nova quando formula aparece; fecha quando sumiu

ADESAO AO TRATAMENTO:
  Evento de adesao -> cat_emissao (idempotente) -> PDF CAT -> Hermes Paxter
  Botao de reenvio na ficha do cliente
```

## 5. AUDITORIA QUE DR. MANUS DEVE FAZER

1. Validar os 15 casos extremos da secao 8 da spec
2. Confirmar que o indice parcial (WHERE fim_em IS NULL) resolve o problema
   de NULL em UNIQUE (ver memoria postgres-null-unique-idempotencia.md)
3. Confirmar que o passo de vigencia e idempotente (rodar 2x = mesma saida)
4. Validar que motivo='passei_mal' 3x em 7 dias dispara alerta sem bloquear o fluxo
5. Testar IDOR: token do paciente A nao pode ler dados do paciente B
6. Confirmar que a janela de 3 dias e calculada em BRT (lib/brt.ts), nao UTC
7. Confirmar que o CAT nao e gerado duas vezes para o mesmo evento de adesao

## 6. SUGESTOES KAIZEN ADICIONAIS (Dr. Manus deve avaliar)

Alem das 8 sugestoes ja na spec (K1-K8), Dr. Manus pode propor:

K9 - Bateria de testes de regressao para o motor de aderencia inteiro
K10 - Relatorio semanal de aderencia consolidada para o CEO (todos os pacientes)
K11 - Integracao do score de aderencia no Radar de Foco
K12 - Push de incentivo (via Hermes, nao interrogatorio autonomo) quando aderencia cai < 50%

## 7. O QUE DR. MANUS NAO DEVE FAZER

- Tocar o motor de lembretes (montarMensagemOpus, blocoPrescricaoPeriodos)
- Criar uma area ou portal novo (tudo mora na /area existente)
- Mandar mensagem autonoma de aderencia pelo WhatsApp/Telegram (rejeitado pelo CEO)
- Usar db push em tabela populada

## 8. PERGUNTAS EM ABERTO PARA O CEO

(Ver secao 12 da spec) — A unica pergunta nao respondida e:
"O que define 'o paciente aderiu a um tratamento' para disparar o CAT?"
Opcoes A (protocolo validado), B (aceite na Area do Cliente), C (primeiro reporte).
Default recomendado: A.
CEO deve responder antes de Dr. Code construir a logica do CAT.

---

RESUMO EM 1 LINHA: auditar a arquitetura de 5 tabelas + 9 rotas + 1 passo de sync,
validar os 15 casos extremos e confirmar que o motor de lembretes existente nao e tocado.
