# Spec: Motor de Receituário — Prescrição Real com Layout ANVISA

**Data:** 20/07/2026  
**Status:** CONSTRUINDO

## Objetivo

Todas as prescrições geradas na tela `/prescricao` e em qualquer ponto do sistema
devem usar o motor `generateReceituarioPdfV2` que produz:
- Layout ANVISA 4 boxes (conforme designer do CEO)  
- Data-bind real: Dr. Caio + Instituto Padua + paciente  
- Assinatura ICP-Brasil (cert `certs/assinatura.pfx`)  
- Upload ao Google Drive  
- E-mail com PDF anexado para drcaiohenriquepadua@gmail.com  

**Zero receitas hardcoded. Zero `window.print()`.**

---

## Dados Fixos Auto-Carregados

| Campo | Fonte | Valor atual |
|---|---|---|
| Médico | `professionals` id=6 | Dr. Caio Henrique Fernandes Pádua |
| CRM | professionals.crm | CRM SP 125475 |
| Clínica | `locations` id=8 | Instituto Padua / Paduccia Clínica Médica |
| Cert. digital | `certs/assinatura.pfx` | ICP-Brasil real |
| E-mail destino | hardcoded | drcaiohenriquepadua@gmail.com |
| Drive folder | hardcoded | 1v1eNJeRUBSR5wBucuBLnzkpGKHsrlnep |

---

## Interface `ReceituarioDataV2`

```typescript
export interface ReceituarioDataV2 {
  // Box 1 — Emitente (preenchido automaticamente)
  medicoName: string;
  medicoCrm: string;
  clinicaNome: string;
  clinicaEndereco?: string;
  clinicaTelefone?: string;

  // Box 2 — Paciente (preenchido pelo médico)
  pacienteNome: string;
  pacienteCpf?: string;
  pacienteNascimento?: string;
  pacienteTelefone?: string;
  pacienteEndereco?: string;

  // Corpo — Fórmulas
  formulas: {
    nome: string;         // ex: "BUPROPIONA 180MG + TOPIRAMATO 20MG"
    ativos?: string;      // texto livre multi-linha
    posologia?: string;   // ex: "1 dose VO 2h Antes do Almoço (10h)"
    via?: string;
    forma?: string;
    observacao?: string;
  }[];

  // Metadados
  tipoReceita: 'especial' | 'simples';
  dataEmissao?: string;   // YYYY-MM-DD, default = hoje
  validadeDias?: number;  // default 30
  numeroReceita?: string;
}
```

---

## Layout do PDF (pdf-lib, A4)

```
┌──────────────────────────────────────────────────────────┐ y=841
│ FAIXA NAVY: Nome clínica (gold) | "RECEITUÁRIO" (white)  │
│ Endereço clínica (cyan)         | Tipo + vias (cyan)     │
├──────────────────────────────────────────────────────────┤ y=771
│        RECEITUÁRIO DE CONTROLE ESPECIAL (ou SIMPLES)     │
│      1ª via - Farmácia | 2ª via - Paciente (reter)       │
├──────────────────────────┬───────────────────────────────┤ y=750
│ BOX 1 — IDENTIFICAÇÃO DO │ BOX 2 — IDENTIFICAÇÃO DO      │
│ EMITENTE                 │ PACIENTE                      │
│ Profissional: (nome)     │ Nome: (nome ou linha pontilh.)│
│ Conselho: (CRM)          │ CPF: ...  Nasc: ...           │
│ Telefone: (tel clínica)  │ Telefone: ...                 │
│ Endereço: (end clínica)  │ Endereço: ...                 │
├──────────────────────────┴───────────────────────────────┤ y=600
│ Prescrevo:                                               │
│ 01. BUPROPIONA 180MG + TOPIRAMATO 20MG                  │
│     Cápsulas XR Liberação Entérica...                   │
│     Posologia: 1 dose VO 2h Antes do Almoço (10h)       │
│               1 dose VO 2h Antes do Jantar (18h)        │
├──────────────────────────────────────────────────────────┤ y=~400
│ ___________________________                              │
│ Dr. Caio Henrique Fernandes Pádua                       │
│ CRM SP 125475          São Paulo, 20/07/2026            │
├──────────────────────────┬───────────────────────────────┤ y=~340
│ BOX 3 — IDENTIFICAÇÃO DO │ BOX 4 — IDENTIFICAÇÃO DO      │
│ COMPRADOR (farmácia fill)│ FORNECEDOR (farmácia fill)    │
│ Nome: _______________    │ Assinatura: _____________     │
│ End: ________________    │ Data: ___________________     │
│ Cidade: ____  UF: ____   │                               │
│ Identidade: _________    │                               │
│ Telefone: ___________    │                               │
└──────────────────────────┴───────────────────────────────┘ y=36
│ RODAPÉ NAVY: endereço | PAXTER                           │
```

---

## Rota Backend

`POST /api/receituario/emitir-prescricao`

Body:
```json
{
  "patient": { "nome": "Carlúcia ...", "cpf": "432...", "telefone": "...", "endereco": "..." },
  "formulas": [{ "nome": "BUPROPIONA 180MG + TOPIRAMATO 20MG", "ativos": "...", "posologia": "..." }],
  "tipoReceita": "especial",
  "professionalId": 6,
  "locationId": 8
}
```

Resposta:
```json
{ "ok": true, "driveUrl": "...", "fileName": "...", "emailSent": true }
```

---

## Frontend (`prescricao/index.tsx`)

- Botão "Imprimir / PDF" → chama `handleGerarReceituario()` (não `window.print()`)
- `handleGerarReceituario`: POST para `/api/receituario/emitir-prescricao` com dados do formulário
- Toast de sucesso com link para o Drive
- Loading state no botão durante a geração

---

## Critérios de Aceitação

1. PDF contém os 4 boxes ANVISA com posições fixas
2. Box 1 preenchido com Dr. Caio + Instituto Padua (automático, sem input do usuário)
3. Box 2 preenchido com dados da Carlúcia
4. Boxes 3 e 4 com linhas pontilhadas em branco
5. Corpo contém Bupropiona 180mg + Topiramato 20mg com posologia completa
6. PDF assinado com cert ICP-Brasil real
7. PDF no Drive (URL retornada e aberta automaticamente)
8. PDF recebido por email em drcaiohenriquepadua@gmail.com
