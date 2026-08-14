# CARTA PARA DR. CODE
# Assunto: Aderencia as Formulas Manipuladas — Aba MEU TRATAMENTO

Data: 14/08/2026
De: Dr. Replit Paxter
Para: Dr. Code
Protocolo: START S4 (handoff tecnico com schema + rotas)

---

## 1. CONTEXTO

O CEO ordenou a construcao da aba MEU TRATAMENTO dentro da Area do Cliente
que ja existe (/area). A spec completa esta em specs/aderencia-area-cliente.md.
Este carta detalha o que Dr. Code deve construir no backend e no banco.

## 2. O QUE JA EXISTE E NAO DEVE SER TOCADO

| Artefato | Localizacao | O que faz |
|---|---|---|
| Motor de lembrete | artifacts/api-server/src/lib/lembrete-periodo.ts | Dispara mensagens por janela/periodo |
| Montador rico | artifacts/api-server/src/lib/mensageria-opus.ts | Monta a mensagem com catalogo editavel |
| Template simples | artifacts/api-server/src/lib/lembrete-templates.ts | Fallback quando Opus falha |
| Schema de lembretes | lib/db/src/schema/lembretes-prescricao.ts | Tabela lembretes_prescricao e lembrete_envios |
| Rotas de lembretes | artifacts/api-server/src/routes/lembretes.ts | GET /api/lembretes/:clienteId/preview ja existe |
| Area do Cliente | artifacts/padcom/src/pages/area.tsx | 8 abas declaradas; DUVIDAS e SUPORTE sao botoes mortos |

REGRA DE OURO: nunca reescrever o motor de lembretes. So acrescentar.

## 3. O QUE DR. CODE DEVE CONSTRUIR

### 3.1 Banco de dados (somente ADD COLUMN / CREATE TABLE)

```sql
-- Tabela 1: vigencia de cada formula por paciente
CREATE TABLE IF NOT EXISTS formula_vigencia (
  id              SERIAL PRIMARY KEY,
  cliente_id      INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  chave_formula   TEXT    NOT NULL,
  nome_canonico   TEXT    NOT NULL,
  dose            TEXT,
  periodo_sigla   TEXT    NOT NULL,
  inicio_em       DATE    NOT NULL,
  fim_em          DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_vigencia_aberta
  ON formula_vigencia (cliente_id, chave_formula, periodo_sigla)
  WHERE fim_em IS NULL;
-- ATENCAO: NULL nao colide em unique (ver memoria postgres-null-unique-idempotencia.md)
-- O indice PARTIAL (WHERE fim_em IS NULL) garante 1 vigencia aberta por chave

-- Tabela 2: reporte de aderencia
CREATE TABLE IF NOT EXISTS formula_adesao_evento (
  id              SERIAL PRIMARY KEY,
  cliente_id      INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  chave_formula   TEXT    NOT NULL,
  periodo_sigla   TEXT    NOT NULL,
  data_ref        DATE    NOT NULL,
  status          TEXT    NOT NULL CHECK (status IN ('tomou','nao_tomou','atrasou')),
  motivo          TEXT,
  observacao      TEXT,
  origem          TEXT    NOT NULL DEFAULT 'area_cliente',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, chave_formula, periodo_sigla, data_ref)
);

-- Tabela 3: duvidas do paciente
CREATE TABLE IF NOT EXISTS paciente_duvida (
  id              SERIAL PRIMARY KEY,
  cliente_id      INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  texto           TEXT    NOT NULL CHECK (length(texto) <= 1000),
  chave_formula   TEXT,
  criada_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela 4: respostas da equipe
CREATE TABLE IF NOT EXISTS paciente_duvida_resposta (
  id              SERIAL PRIMARY KEY,
  duvida_id       INTEGER NOT NULL REFERENCES paciente_duvida(id) ON DELETE CASCADE,
  profissional_id INTEGER NOT NULL REFERENCES professionals(id),
  texto           TEXT    NOT NULL,
  respondida_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela 5: controle idempotente do CAT
CREATE TABLE IF NOT EXISTS cat_emissao (
  id              SERIAL PRIMARY KEY,
  cliente_id      INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tratamento_ref  TEXT    NOT NULL,
  versao          TEXT    NOT NULL DEFAULT '1',
  arquivo_drive_id TEXT,
  emitido_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reenvios        INTEGER NOT NULL DEFAULT 0,
  UNIQUE (cliente_id, tratamento_ref, versao)
);
```

### 3.2 Rotas do portal do paciente (todas com verifyPortalToken)

```
GET  /api/area-paciente/meu-tratamento/formulas-hoje
     -> lista periodos do dia com formulas + status de aderencia (data = hoje BRT)

POST /api/area-paciente/meu-tratamento/reportar
     body: { chave_formula, periodo_sigla, data_ref, status, motivo?, observacao? }
     -> upsert em formula_adesao_evento

GET  /api/area-paciente/meu-tratamento/historico
     -> formula_vigencia WHERE fim_em IS NOT NULL, ordenado por fim_em DESC

GET  /api/area-paciente/meu-tratamento/duvidas
     -> lista paciente_duvida com respostas embutidas, ordem criada_em DESC

POST /api/area-paciente/meu-tratamento/duvidas
     body: { texto, chave_formula? }
     -> INSERT em paciente_duvida, avisa CEO via sendTelegram(PADAXOR_TELEGRAM_CHAT_ID)
```

### 3.3 Rotas do CEO (todas com requireCollaborator)

```
POST /api/cockpit/:clientId/duvidas/:duvida_id/responder
     body: { texto }
     -> INSERT em paciente_duvida_resposta

GET  /api/cockpit/:clientId/aderencia/semaforo
     -> retorna: verde (>= 80%), ambar (50-79%), vermelho (< 50%), cinza (sem dado 7d)

GET  /api/cockpit/:clientId/cat/lista
     -> lista cat_emissao do cliente

POST /api/cockpit/:clientId/cat/reenviar/:cat_id
     -> usa o arquivo_drive_id existente, incrementa reenvios, envia pelo motor Hermes
```

### 3.4 Passo adicional na sincronizacao de lembretes

Nao reescrever o motor. Acrescentar ao final de sincronizarLembretePrescricao()
(artifacts/api-server/src/lib/lembrete-periodo.ts) um passo que:
1. Le o JSON de periodos atual do banco
2. Para cada formula no JSON, deriva chave via semAcento(nome).toLowerCase().replace(/[^a-z0-9]/g,'')
3. Abre vigencia na formula_vigencia se nao existe aberta para (cliente_id, chave, periodo_sigla)
4. Fecha vigencias abertas de formulas que nao aparecem mais no JSON (set fim_em = hoje BRT)
5. O passo e idempotente: rodar 2x no mesmo dia nao cria nem fecha nada de novo

### 3.5 Alerta clinico

Se 3 ou mais reportes com motivo='passei_mal' para a mesma (cliente_id, chave_formula)
nos ultimos 7 dias: INSERT em uma tabela de alertas clinicos ou notificacao no Cockpit.
Reutilizar o padrao LINHA VERMELHA da Anamnese V2 (ja existe).

## 4. REGRAS DE SEGURANCA

- verifyPortalToken -> deriva client_id SO do token, nunca do body
- requireCollaborator em toda rota do CEO
- data e hora: SEMPRE lib/brt.ts, nunca new Date() cru
- NULL nao colide em UNIQUE (ver memoria postgres-null-unique-idempotencia.md)
- Indice parcial (WHERE fim_em IS NULL) para vigencia aberta

## 5. LINHAS VERMELHAS

- NUNCA reescrever montarMensagemOpus nem templateLembretePrescricao
- NUNCA criar area ou portal novo: so a /area existente
- NUNCA db push em tabela populada: so SQL bruto com ADD COLUMN / CREATE TABLE
- NUNCA dropar nada
- NUNCA derivar client_id do body
- NUNCA new Date() cru para data exibida ou gravada

## 6. DEFINICAO DE PRONTO

Ver spec specs/aderencia-area-cliente.md secao 9 (tabela SMOKE/DADO/VISUAL/LOG).
Retornar com tabela preenchida Nivel|Esperado|Obtido|Passou.

---

RESUMO EM 1 LINHA: construir as 5 tabelas SQL, as 9 rotas do portal/CEO e o passo
de sincronizacao de vigencia, sem tocar no motor de lembretes existente.
