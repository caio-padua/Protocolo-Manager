---
name: Base única de clientes — regra de ouro
description: Toda criação de cliente DEVE ter empresa_id, location_id e status corretos; mapa das rotas auditadas e correções aplicadas em 23/07/2026.
---

# Base Única de Clientes — Regra de Ouro

**Why:** Hassan foi criado pelo drive-watcher com empresa_id=NULL e status='ativo' (PT), tornando-o invisível na lista. A API filtra por empresa_id=5 E status='active'. Qualquer rota que não passe os dois campos cria um "cliente fantasma".

## Valores obrigatórios em qualquer INSERT em clients

| Campo | Valor | Motivo |
|---|---|---|
| empresaId | 5 | Empresa padrão do sistema (99,9% dos clientes) |
| locationId | 8 | Instituto Padua — localização padrão |
| status | "active" | A API filtra por este valor exato (inglês, não "ativo") |

## Proteção em 3 camadas

1. **DB DEFAULT** (aplicado em 23/07/2026): `ALTER TABLE clients ALTER COLUMN empresa_id SET DEFAULT 5` + location_id + status — garante que qualquer INSERT cru vira com os valores certos.
2. **createClientSafe()** em `artifacts/api-server/src/lib/create-client-safe.ts` — utilitário que aplica os defaults em nível de aplicação.
3. **Correção das rotas** — todos os pontos de criação corrigidos.

## Rotas auditadas e status

| Arquivo | Criava cliente? | Bug | Correção |
|---|---|---|---|
| `routes/clients.ts` | SIM | Não — usa resolveEmpresaId ✅ | Sem ação |
| `lib/drive-watcher.ts` | SIM | status='ativo' + sem empresaId | ✅ Corrigido |
| `lib/concierge-finalize.ts` | SIM | sem status, empresaId, locationId | ✅ Corrigido |
| `lib/transmutacao.ts` | SIM | sem empresaId, locationId | ✅ Corrigido |
| `lib/seed-demo-rogerio.ts` | SIM | sem status, empresaId, locationId | ✅ Corrigido |
| `routes/encaminhamentos.ts` | NÃO | Só insere em referralsTable | ✅ Sem ação |

## Registros corrigidos no banco

- Hassan Ali Awada (id 5278): empresa_id NULL → 5, status 'ativo' → 'active'
- Rogério Juarez (id 5277): empresa_id NULL → 5, location_id NULL → 8

## Pipeline de exames — motor único

- Portal (`/api/client-portal/upload`) → chama `startExamIngestion` de exames-lab
- Drive Watcher → insere em `exam_documents` diretamente
- Drive Import → insere em `exam_documents`
- Todos convergem para a tabela `exam_documents` com campo `origin` distinguindo a fonte
- Endpoint de resultados `/api/exames-lab/resultados` requer auth de colaborador (por design)

## Portal do cliente — formato de data

O portal front-end envia birthDate como dígitos puros ("30011988"), não ISO.
O backend converte stored ISO para DDMMYYYY antes de comparar. Correto por design.
Teste com ISO ("1988-01-30") FALHA — isso é esperado, não é bug.
