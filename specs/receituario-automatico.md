# Spec — Receituário Automático de Fórmulas Magistrais

**Status**: APROVADO PARA BUILD  
**Data**: 18/07/2026  
**CEO**: Dr. Caio  
**Agente**: Dr. Replit Paxter

---

## Dor resolvida

Médico fecha protocolo de 6 meses. Consulta a cada 60–90 dias. Receita de fórmula magistral
expira a cada 30 dias. Paciente liga pedindo nova receita sem passar na consulta.

**Solução**: médico pré-cadastra todas as receitas do protocolo numa linha do tempo. Sistema
assina digitalmente e entrega automaticamente no dia certo — sem intervenção humana.

---

## Conceito central

**Agenda** → N **Slots de Receita** → liberados automaticamente na data programada → entregues
por email + WhatsApp + Telegram + Google Drive + portal do cliente.

---

## Banco de dados

### Tabela `receitas_agendadas`
| Campo | Tipo | Descrição |
|---|---|---|
| id | serial PK | — |
| client_id | integer NOT NULL | FK → clients |
| protocol_id | integer | FK → protocols (opcional) |
| nome | text NOT NULL | nome da agenda |
| descricao | text | — |
| ativo | boolean default true | toggle ligar/desligar tudo |
| frequencia_padrao_dias | integer default 30 | dias entre receitas (padrão global da agenda) |
| dias_antecedencia | integer default 5 | liberar X dias antes do vencimento |
| canais_padrao | jsonb | ["email","whatsapp","telegram","drive","portal"] |
| incluir_lembrete_posologia | boolean default true | conectar ao motor de lembretes |
| empresa_id | integer | — |
| created_at | timestamp tz | — |
| updated_at | timestamp tz | — |

### Tabela `receitas_agendadas_slots`
| Campo | Tipo | Descrição |
|---|---|---|
| id | serial PK | — |
| agenda_id | integer NOT NULL | FK → receitas_agendadas CASCADE |
| client_id | integer NOT NULL | denormalizado para query rápida |
| numero_sequencia | integer default 1 | ordem dentro da agenda |
| nome | text NOT NULL | nome personalizado ou nome da fórmula |
| data_liberacao | text NOT NULL | YYYY-MM-DD (BRT) — quando o sistema libera |
| formulas | jsonb | array de SlotFormula (vide abaixo) |
| prescription_id | integer | gerado no momento da liberação |
| recipe_id | integer | — |
| pdf_url | text | link do PDF assinado |
| drive_file_id | text | ID no Google Drive |
| drive_web_view_link | text | — |
| canais | jsonb | override dos canais padrão (null = usa padrão da agenda) |
| status | text default AGUARDANDO | AGUARDANDO \| LIBERADA \| ENTREGUE \| ERRO |
| enviado_email_em | timestamp tz | — |
| enviado_whatsapp_em | timestamp tz | — |
| enviado_telegram_em | timestamp tz | — |
| enviado_drive_em | timestamp tz | — |
| erro | text | mensagem de erro na liberação |
| created_at / updated_at | timestamp tz | — |

### Tipo SlotFormula (jsonb)
```typescript
{
  nome: string;           // nome da fórmula (do catálogo ou manual)
  catalogId?: string;     // referência ao catálogo de fórmulas
  ativoPrincipal?: string;
  posologia?: string;
  dose?: string;
  via?: string;
  frequencia?: string;
  observacao?: string;
  isControlled?: boolean;
  anvisaType?: string;
}
```

---

## Backend — rotas

### Base: `/api/receituario`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/agendas` | lista agendas (filter: clientId, protocolId, status) |
| POST | `/agendas` | cria agenda |
| GET | `/agendas/:id` | detalhe da agenda com todos os slots |
| PUT | `/agendas/:id` | edita nome/frequencia/canais/ativo |
| DELETE | `/agendas/:id` | soft-delete (ativo=false) |
| GET | `/agendas/:id/slots` | lista slots da agenda |
| POST | `/agendas/:id/slots` | adiciona slot |
| PUT | `/slots/:id` | edita slot (nome, data, fórmulas, canais) |
| DELETE | `/slots/:id` | remove slot |
| POST | `/slots/:id/liberar` | força liberação manual |
| POST | `/processar` | worker diário — libera todos os slots vencidos |
| GET | `/alertas` | slots com liberação nos próximos 7 dias (Cockpit) |

---

## Frontend — página principal

**Rota**: `/receituario-automatico`  
**Menu**: Arsenal Clínico → "Receituário Automático" (ícone Calendar)

### Estrutura da tela

```
HEADER panel-3d
  ├── bevel-3d "RECEITUÁRIO AUTOMÁTICO"
  └── KPIs screen-3d: Agendas Ativas / Slots Aguardando / Liberados este Mês / Próxima Liberação

BARRA DE AÇÕES
  ├── btn-3d "Nova Agenda"
  └── btn-3d-soft "Processar Agora" (força o worker)

SELETOR DE CLIENTE (field-engraved search)
  └── lista de agendas do cliente

AGENDA CARD (panel-3d por agenda)
  ├── bevel-3d: nome da agenda + protocolo
  ├── concave-3d: frequência / canais / ativo toggle
  └── LINHA DO TEMPO (slots ordenados por data)
      └── SLOT (panel-3d-sub por slot)
          ├── faixa lateral 4px (verde=liberada, amber=próxima, gray=aguardando, red=erro)
          ├── número de sequência (concave-3d)
          ├── nome personalizado
          ├── data de liberação
          ├── fórmulas (pills)
          ├── canais (icons)
          ├── status badge
          └── botões: btn-3d-soft Editar | Liberar Agora
```

### Modal "Nova Agenda"
1. Selecionar cliente → carregar protocolos
2. Nome da agenda (pré-preenche com nome do protocolo)
3. Frequência padrão entre receitas (slider ou input)
4. Dias de antecedência (D-5 = libera 5 dias antes do vencimento)
5. Canais padrão (checkboxes)
6. Toggle: incluir lembrete de posologia no motor de mensageria

### Modal "Novo Slot / Editar Slot"
1. Nome personalizado (ou assumir nome da fórmula)
2. Data de liberação (datepicker + calculadora: "D+30 da receita anterior")
3. Próxima receita em X dias (atalho para pré-calcular a próxima data)
4. Seletor de fórmulas (busca no catálogo de fórmulas magistrais do banco)
5. Override de canais (ou manter padrão da agenda)
6. Campo de observação

---

## Alerta no Cockpit da Consulta

Novo painel `ReceituarioAlertaPanel` no Cockpit:
- Lista slots com `data_liberacao` entre hoje e D+7
- Cards com: nome da receita, data, status, btn "Liberar Agora"
- Se vazio: mensagem "Nenhuma receita programada para os próximos 7 dias"

---

## Integração com Mensageria

Quando `incluirLembretePosologia = true` e um slot é liberado:
1. Atualizar o `lembretesPrescricaoTable` do cliente com os períodos/fórmulas do slot
2. Conectar ao worker de lembretes existente (já envia por WhatsApp/Telegram)

---

## Integração com Google Drive

Ao liberar um slot:
1. Gerar PDF assinado (reutilizar motor de assinatura ICP-Brasil)
2. Fazer upload na pasta `PROTOCOLOS/` do cliente no Drive
3. Salvar `drive_file_id` e `drive_web_view_link` no slot

---

## Área do Cliente (`/area`)

Nova seção "Minhas Receitas":
- Lista todos os slots com status=LIBERADA ou ENTREGUE do cliente
- Botão "Baixar PDF" para cada receita disponível

---

## Worker diário

Rota: `POST /api/receituario/processar`
- Chamado pelo cron às 06:00 BRT (agendado no boot do server)
- Busca todos os slots com status=AGUARDANDO e `data_liberacao <= hoje`
- Para cada slot:
  1. Gera prescrição (usa motor existente de `prescription_items`)
  2. Gera PDF + assina ICP-Brasil
  3. Faz upload no Drive
  4. Envia email
  5. Envia WhatsApp
  6. Envia Telegram
  7. Atualiza status → ENTREGUE
  8. Se `incluirLembretePosologia`: sincroniza motor de lembretes

---

## Decisões do CEO (registrar)

- Fórmulas vêm do catálogo existente (não redigitar)
- Nome do slot: pode usar nome da fórmula ou nome personalizado
- Frequência: global na agenda + override por slot (tempo para a próxima)
- Antecedência: configurável (padrão D-5)
- Canais: email + WhatsApp + Telegram + Drive + portal (todos ou subset)
- Toggle ativo por agenda inteira E por slot
- Integração com motor de lembretes de posologia: opcional por agenda
