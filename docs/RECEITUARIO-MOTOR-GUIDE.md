# GUIA DO MOTOR DE RECEITUÁRIO — Fonte de Verdade para o Agente
> **Leia este arquivo ANTES de criar qualquer rota, botão ou tela de receituário.**
> Qualquer novo motor deve ser registrado aqui após criação.

---

## 1. Mapa de Motores (Motor ID → Arquivo → Rota)

| ID | Arquivo | Função | Rota(s) que chama | Tipo de PDF |
|---|---|---|---|---|
| **M1** | `lib/receituario-pdf.ts` | `generateReceituarioPdf` | `GET /api/receituario/demo` | Grade magistral PAXTER (tabela Fórmula/Posologia/Via) |
| **M2** | `lib/receituario-pdf.ts` | `generateReceituarioPdfV2` | (via motor único apenas) | ANVISA 4-boxes branco (Emitente/Paciente/Comprador/Farmácia) |
| **M3** | `lib/prescription-pdf.ts` | `generateRecipePdf` | `POST /api/prescriptions/emit` (desmembramento) | Receita por cor regulatória (controlado/especial) |
| **M4** | `lib/puppeteer-capture.ts` | `htmlToPngBase64` + `generatePdfFromPngBase64` | (via motor único apenas) | Captura HTML do ReceituarioPreview.tsx — FIEL ao preview |
| **MU** | `lib/receituario-motor.ts` | `emitirReceituarioPdf` | TODAS as rotas (despacha M4 ou M2 conforme modelo ativo) | **Motor Único — use sempre este** |

---

## 2. Mapa de Rotas (URL → Motor → Body → Response)

### 2.1 Motor Único (usar em TODAS as novas implementações)

**`POST /api/receituario/emitir-prescricao`** — Motor Único (MU)
```json
// BODY
{
  "patient": {
    "nome": "Maria da Silva",
    "cpf": "000.000.000-00",
    "dataNascimento": "1985-03-15",
    "telefone": "(11) 99999-9999",
    "endereco": "Rua das Flores, 250 — SP",
    "email": "maria@email.com"
  },
  "formulas": [
    {
      "nome": "Glutationa Reduzida 600mg",
      "ativos": "Glutationa 600mg/frasco",
      "posologia": "1x/semana EV por 8 semanas",
      "via": "Endovenosa",
      "forma": "Solução injetável",
      "dose": "600mg"
    }
  ],
  "tipoReceita": "especial",
  "modeloId": null
}

// RESPONSE
{
  "ok": true,
  "pdfBase64": "JVBERi0...",
  "fileName": "26.07.22 RECEITUARIO MARIA DA SILVA.pdf",
  "driveUrl": "https://drive.google.com/...",
  "emailSent": true,
  "modeloUsado": "Faixas Paxter",
  "tipoMotor": "faixas_paxter"
}
```

---

**`POST /api/receituario/assinar-imagem-pdf`** — Motor Único (MU, despacha M4)
```json
// BODY (compatibilidade retroativa — aceita pngBase64 OU params completos)
{
  "pngBase64": "iVBOR...",
  "patientName": "Maria da Silva",
  "fileName": "26.07.22 RECEITUARIO MARIA DA SILVA.pdf",
  "patientEmail": "maria@email.com"
}

// RESPONSE
{
  "ok": true,
  "driveUrl": "https://drive.google.com/...",
  "emailSent": true
}
```

---

**`POST /api/receituario/emitir-cliente`** — Motor Único (MU)
```json
// BODY (mesmo shape do emitir-prescricao)
{ "patient": {...}, "formulas": [...], "tipoReceita": "especial" }

// RESPONSE
{ "ok": true, "driveUrl": "...", "emailSent": true, "pdfBase64": "..." }
```

---

**`POST /api/receituario/emitir-teste`** — Motor Único (MU, dados fictícios)
```json
// BODY
{ "modeloId": 1 }

// RESPONSE
{ "ok": true, "fileName": "...", "modeloUsado": "...", "pdfSizeBytes": 98432 }
```

---

### 2.2 Motor de Desmembramento (manter separado — receitas por cor regulatória)

**`POST /api/prescriptions/emit`** — Motor M3 (NÃO usa motor único)
```json
// BODY
{
  "clientId": 42,
  "professionalId": 6,
  "items": [
    {
      "substanceId": 101,
      "dose": "150mg",
      "via": "oral",
      "frequencia": "1x/dia",
      "observacao": "",
      "isControlled": false,
      "anvisaType": null,
      "anvisaColor": null
    }
  ],
  "cid": "E11",
  "durationDays": "30",
  "pharmacyId": null
}

// RESPONSE: PDF binário (Content-Type: application/pdf)
```

> **QUANDO USAR M3:** Apenas para receitas que precisam de desmembramento por cor
> regulatória ANVISA (receituário branco, azul, amarelo, etc.) com numeração SNCR.
> Para tudo mais, usar o motor único (MU).

---

### 2.3 Modelo de Receituários (CRUD de configuração)

**`GET /api/receituario-modelos`** — Lista modelos
```json
// RESPONSE
{ "modelos": [{ "id": 1, "nome": "Faixas Paxter", "tipo": "faixas_paxter", "ativo": true, ... }] }
```

**`POST /api/receituario-modelos`** — Criar modelo
```json
// BODY
{ "nome": "Novo Modelo", "tipo": "faixas_paxter", "config": {} }
```

**`PATCH /api/receituario-modelos/:id/ativar`** — Ativar modelo
```json
// BODY: vazio {}
// RESPONSE: { "ok": true }
```

---

## 3. Mapa de Telas → Botões → Rotas

| Tela | URL | Botão 1 (Motor Único) | Botão 2 (Captura Visual) | Status |
|---|---|---|---|---|
| **Prescrição** | `/prescricao` | ✅ "Emitir Receituário" → MU | ✅ "Gerar PDF Visual" → captura HTML | OK |
| **Rec. Automático** | `/receituario-automatico` | ✅ "Emitir Receituário" → MU | ✅ "Gerar PDF Visual" | A fazer |
| **Cockpit Fórmulas** | `/cockpit` (PrescricaoFormulasPanel) | ✅ "Emitir" → MU | ✅ "Gerar PDF Visual" | A fazer |
| **Cockpit Alerta** | `/cockpit` (ReceituarioAlertaPanel) | ✅ "Emitir" → MU | ✅ "Gerar PDF Visual" | A fazer |
| **Modelo de Rec.** | `/modelo-receituario` | ✅ "Emitir Receituário" → MU | ✅ "Testar PDF Visual" | A fazer |

---

## 4. Decisão de Qual Motor Usar (fluxograma)

```
PRECISA GERAR PDF DE RECEITA?
          │
          ▼
É receita controlada por cor ANVISA (branco/azul/amarelo) com SNCR?
  SIM → usar M3 (POST /api/prescriptions/emit)
  NÃO → continuar
          │
          ▼
Tem preview visual do ReceituarioPreview.tsx disponível na tela?
  SIM → capturar HTML → chamar MU (assinar-imagem-pdf ou emitir-prescricao)
  NÃO → chamar MU com dados do formulário (emitir-prescricao)
          │
          ▼
O MU despacha internamente para:
  modelo.tipo === "faixas_paxter"  → M4 (Puppeteer captura HTML template)
  modelo.tipo === "classico_anvisa" → M2 (pdf-lib 4-boxes ANVISA)
```

---

## 5. Como Adicionar um Novo Motor

1. **Criar** a função em `artifacts/api-server/src/lib/receituario-NOME.ts`
2. **Registrar** em `emitirReceituarioPdf()` (lib/receituario-motor.ts): adicionar novo case no despacho
3. **Criar** tipo de modelo em `receituario_modelos.tipo` (ADD COLUMN ou novo valor TEXT)
4. **Seed** o novo modelo na função `garantirTabelaModelos()`
5. **Atualizar este arquivo** (docs/RECEITUARIO-MOTOR-GUIDE.md) com a nova linha na tabela
6. **Atualizar** `.agents/memory/MEMORY.md` com ponteiro para este arquivo

---

## 6. Regras Invioláveis (Linhas Vermelhas)

| Regra | Motivo |
|---|---|
| NUNCA remover rotas existentes | Frontend pode depender delas sem que o agente saiba |
| NUNCA usar M3 para receitas simples | M3 tem lógica de desmembramento regulatório — não é motor visual |
| NUNCA gerar PDF sem passar pelo MU (exceto M3) | Motor único = governança = auditoria = consistência |
| SEMPRE assinar com ICP-Brasil via `certs/assinatura.pfx` | Obrigação regulatória |
| NUNCA hardcodar modelo — sempre ler do banco | `getModeloAtivo()` em lib/receituario-motor.ts |

---

## 7. Histórico de Decisões Arquiteturais

| Data | Decisão | Motivo |
|---|---|---|
| 22/07/2026 | M4 (Puppeteer) como base do motor único | Único motor fiel ao preview — garante paridade visual |
| 22/07/2026 | Modelo armazenado no banco (não localStorage) | Backend precisa ler a config para gerar o PDF |
| 22/07/2026 | M3 (desmembramento) isolado | Lógica regulatória diferente — não deve poluir o motor visual |
| 22/07/2026 | Wrapper adapter para rotas antigas | Compatibilidade retroativa sem breaking change no frontend |

---

*Última atualização: 22/07/2026 — Dr. Replit Paxter*
*Adicionar entrada no `.agents/memory/MEMORY.md` ao atualizar este arquivo.*
