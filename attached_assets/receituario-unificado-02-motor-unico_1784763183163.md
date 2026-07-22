# SPEC 02 — Motor Único de Geração de PDF
**Loop Paxter — Fase 1 (ESPECIFICAR)**
**Data:** 22/07/2026 | Status: AGUARDANDO APROVAÇÃO DO CEO

---

## Objetivo
Criar UM único motor de geração de PDF de receituário que:
(a) lê o modelo ativo da tela "Modelo de Receituários",
(b) produz um PDF pixel-fiel ao preview HTML,
(c) é usado por TODAS as rotas do sistema sem exceção.

---

## Decisão arquitetural: qual motor usar como base?

| Opção | Base | Prós | Contras |
|---|---|---|---|
| A (recomendada) | M4 Puppeteer captura do ReceituarioPreview | Preview = PDF (garantido); arabescos automáticos | ~4s, depende de Chromium, falha em DOM externo |
| B | M2 pdf-lib V2 com herança de config | Rápido, sem Chromium | Preview não mapeia 1:1; toda mudança duplica esforço |
| C | Reescrever com react-pdf ou @react-pdf/renderer | Preview = PDF via mesmo componente React | Terceira lib nova; curva de adoção alta |

**Default recomendado: Opção A (Puppeteer)** — já existe, já funciona, já assina ICP-Brasil.
O esforço é garantir que o `ReceituarioPreview.tsx` receba os dados corretos do modelo ativo.

---

## Requisitos

### R01 — Função canônica única
```typescript
// lib/receituario-motor.ts
export async function emitirReceituarioPdf(params: {
  modeloId?: number;         // se omitido, usa o ativo por tipo
  tipoReceita: "especial" | "simples" | "manipulacao";
  paciente: PacienteDataBind;
  medico?: MedicoDataBind;
  clinica?: ClinicaDataBind;
  formulas: RealFormula[];
  driveFolder?: string;      // se informado, faz upload
  emailTo?: string;          // se informado, envia e-mail
}): Promise<{ pdfBytes: Buffer; driveUrl?: string; emailSent?: boolean }>
```

### R02 — Todas as rotas chamam esta função
- `POST /api/receituario/emitir-prescricao` → chama `emitirReceituarioPdf`
- `POST /api/prescriptions/emit` → chama `emitirReceituarioPdf`
- `POST /api/receituario/assinar-imagem-pdf` → chama `emitirReceituarioPdf`
- `POST /api/receituario/emitir-cliente` → chama `emitirReceituarioPdf`

### R03 — Carrega o modelo ativo antes de gerar
- Busca em `receituario_modelos` o modelo ativo por `tipoReceita`
- Se não encontrar, usa DEFAULT_CONFIG hardcoded como fallback
- Injeta arabescos, logo, cores e fontes do modelo no HTML antes da captura

### R04 — Preview = PDF
- O `ReceituarioPreview.tsx` recebe os MESMOS dados que o motor usa para gerar o PDF
- Nenhum campo pode existir no PDF que não exista no preview e vice-versa
- O motor captura o mesmo componente que o usuário vê na tela

### R05 — Assinatura ICP-Brasil preservada
- O PDF final é assinado com o cert ativo (`certs/assinatura.pfx`)
- O bloco de certificado mostra: assinante, CRM, AC, data, URL de verificação ITI real

---

## Casos Extremos
- Chromium indisponível: retornar erro 503 claro ("motor de PDF indisponível")
- Modelo sem arabescos: usar faixa lisa (sem quebrar)
- Fórmula sem posologia: exibir "Ver orientação médica" no campo

---

## Linhas Vermelhas
- NÃO remover `generateReceituarioPdfV2` (outros PDFs do sistema podem depender)
- NÃO mudar a assinatura ICP-Brasil (cert vigente)
- NÃO usar M3 (desmembramento) para prescrições simples — ele é para receitas por cor interna

---

## Definição de PRONTO
- [ ] Existe `lib/receituario-motor.ts` com a função `emitirReceituarioPdf`
- [ ] As 4 rotas acima chamam apenas esta função
- [ ] O PDF gerado é visualmente idêntico ao preview da tela "Modelo de Receituários"
- [ ] Nome completo da fórmula, dose, posologia e assinatura legíveis no PDF
- [ ] Um farmacêutico consegue validar o documento sem ambiguidade
