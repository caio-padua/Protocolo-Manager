# Spec — Estoque v2 (Paxter Loop)
Data: 19/06/2026 | CEO escolheu: Opção C (3 faixas, sem campo Ideal)

## Objetivo
Redesenhar a tela de Estoque com: (A) quantidade+Ajustar no fim da coluna; (B) 3 faixas de cor com Estoque Máximo; (C) mini-dashboard com seletor no topo; (D) nome composto (Nome + mg + volume); (E) campos novos no cadastro de substâncias.

## 3 faixas de status (Opção C)
| Status | Condição | Cor |
|---|---|---|
| CRÍTICO | qty = 0 | Vermelho (#DC2626) |
| BAIXO | 0 < qty ≤ minimumStock | Âmbar (#F59E0B) |
| NORMAL | minimumStock < qty ≤ maximumStock (ou max null) | Verde (#16A34A) |
| ACIMA DO MÁX | qty > maximumStock (e max não nulo) | Violeta (#7C3AED) |

## Alterações por camada

### 1. DB Schema
- `stock_items`: ADD `maximum_stock` (real, nullable) — sem default obrigatório
- `substances`: ADD `concentration_mg` (text, nullable) + `volume_ampola` (text, nullable)
- Migration: `pnpm --filter @workspace/db run push`

### 2. API — `stock.ts`
- `formatStockItem`: novo status enum `critical | low | normal | overflow | expired`
  - qty = 0 → critical
  - qty > 0 && qty ≤ minimumStock → low
  - qty > maximumStock (max não nulo) → overflow
  - resto → normal
- Response adiciona: `maximumStock`, `substanceMg`, `substanceVolume`

### 3. OpenAPI + codegen
- `StockItem`: adicionar `maximumStock` (number, nullable), `substanceMg` (string, nullable), `substanceVolume` (string, nullable)
- Status enum: `critical | low | normal | overflow | expired`
- `CreateStockItemBody`: adicionar `maximumStock`
- Rodar codegen após editar spec

### 4. Frontend — `stock/index.tsx`
- **Card layout**: TUDO em coluna vertical:
  - Barra de cor ESQUERDA = STATUS color (não substância)
  - Nome: ● (dot substância color) + substanceName + mg + volume
  - MetaFields: Mínimo, Máximo (novo, mostra "—" se null), Lote, Validade
  - ÚLTIMO item da coluna: bloco côncavo Quantidade + botão Ajustar (lado a lado)
- **Seletor top panel**: 3 tabs pill — ABAIXO DO MÍN | DENTRO DO PADRÃO | ACIMA DO MÁX
  - Badge com contagem em cada tab
  - Mostra lista filtrada das substâncias naquele estado

### 5. SubstanceEditSheet
- Adicionar 2 campos na seção "Básico": `concentrationMg` (text input, "Concentração (mg)") + `volumeAmpola` (text input, "Volume da Ampola (mL)")

### 6. Fora do escopo desta sprint
- Interligação automática estoque ↔ prescrição/orçamento (decremento automático ao confirmar sessão) → follow-up dedicado
- Atualização dos dados de todas as substâncias → o CEO preenche via SubstanceEditSheet após os campos existirem

## Linhas vermelhas
- Payload de save `{id, data:{quantity}}` intacto
- Não tocar em outras telas (Agenda, RAS, Protocolos)
- `info.title` do OpenAPI permanece `Api`
