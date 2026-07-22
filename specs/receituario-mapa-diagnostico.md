# DIAGNÓSTICO — Sistema de Prescrição Médica (Receituário)
**Data:** 22/07/2026 | **Autor:** Dr. Replit Paxter

---

## Objetivo deste documento
Mapear TODOS os motores, telas, rotas e previews de prescrição existentes;
identificar cada erro/divergência; servir como base de verdade para os
specs de unificação.

---

## 1. Inventário — Motores de PDF (Backend)

| ID | Arquivo | Descrição | Formato gerado | Assinatura ICP? |
|---|---|---|---|---|
| M1 | `lib/receituario-pdf.ts` → `generateReceituarioPdf` | Motor V1 — tabela PAXTER (magistral) | Grid com colunas Fórmula/Posologia/Via | SIM |
| M2 | `lib/receituario-pdf.ts` → `generateReceituarioPdfV2` | Motor V2 — ANVISA 4 boxes branco | 4 boxes brancos (Emitente/Paciente/Comprador/Farmácia) | SIM |
| M3 | `lib/prescription-pdf.ts` | Motor Desmembramento — Fábrica de Documentos | Receita simples ou especial por cor interna | SIM |
| M4 | `lib/puppeteer-capture.ts` | Captura HTML → screenshot → PDF | PNG capturada do ReceituarioPreview.tsx | SIM (sobre a imagem) |

---

## 2. Inventário — Rotas API

| Rota | Motor usado | Quem chama | Resultado |
|---|---|---|---|
| `POST /api/receituario/emitir-prescricao` | M2 (V2 ANVISA) | Botão "Emitir Receita Real" (Cockpit + Receituário Automático) | PDF 4-boxes branco |
| `POST /api/receituario/assinar-imagem-pdf` | M4 (Puppeteer) | `prescricao/index.tsx` botão "Gerar Receituário" | PDF = captura do ReceituarioPreview |
| `POST /api/prescriptions/emit` | M3 (Desmembramento) | `prescricao/index.tsx` botão "Emitir" | PDF por cor interna |
| `POST /api/prescriptions/preview` | (cálculo só) | `prescricao/index.tsx` botão "Preview" | Plano de desmembramento (JSON) |
| `POST /api/receituario/emitir-cliente` | M4 (Puppeteer) | Cockpit consulta | PDF captura HTML |
| `GET /api/receituario/demo` | M1 (V1) | Tela demo | PDF magistral V1 |

---

## 3. Inventário — Telas Frontend

| Tela | Rota URL | Preview embutido? | Motor chamado | Problema |
|---|---|---|---|---|
| **Prescrição** | `/prescricao` | SIM — `ReceituarioPreview.tsx` | M4 (assinar-imagem-pdf) + M3 (emit desmembramento) | Preview via Puppeteer ≈ correto, mas M3 não respeita o layout do preview |
| **Receituário Automático** | `/receituario-automatico` | NÃO | M2 (emitir-prescricao) | Botão sem dados pré-carregados (corrigido) mas PDF usa motor diferente do preview |
| **Config Receituário** | `/configuracoes/receituario` | SIM — `ReceituarioPreview.tsx` | Nenhum (só config) | Config salva mas não alimenta o motor que gera PDF |
| **Cockpit Consulta** | `/cockpit` | SIM — `ReceituarioPreview.tsx` | M4 (emitir-cliente) | PDF = captura da tela (correto visualmente) |
| **Faixa de Receituário** | `/configuracoes/receituario` | SIM | Nenhum | Nome errado; função limitada a config de arabescos |

---

## 4. Mapa de Divergências (erros por tela)

| Tela | O preview mostra | O PDF gerado tem | Divergência |
|---|---|---|---|
| `/prescricao` | Layout navy/gold Instituto Pádua com arabescos | M4: OK (captura o preview). M3: PDF simples sem arabescos | M3 ignora o layout completamente |
| `/receituario-automatico` | Nenhum preview | M2: ANVISA 4-boxes branco sem arabescos | Formato totalmente diferente do preview da tela de Config |
| `/configuracoes/receituario` | Layout completo com arabescos configuráveis | Nenhum PDF gerado aqui | Config não alimenta nenhum motor |
| Cockpit "Emitir Receita Real" | Nenhum preview | M2: ANVISA 4-boxes | Formato não configurável |
| Cockpit "emitir-cliente" | ReceituarioPreview | M4: OK (captura) | Correto — mas só para fórmulas simples |

---

## 5. Causa-raiz dos Erros

1. **Nenhuma fonte de verdade única** — 4 motores independentes sem padrão comum.
2. **Config desconectada dos motores** — a tela `/configuracoes/receituario` salva em localStorage/config, mas os motores M2 e M3 ignoram essa config.
3. **M2 (V2 ANVISA) não usa arabescos** — foi construído como motor autônomo para ANVISA, sem herdar o modelo configurado.
4. **M4 (Puppeteer) é o mais fiel ao preview** — mas é frágil (depende do Chromium, lento ~4s, falha se o DOM mudar).
5. **"Faixa de Receituário"** = tela de config mal nomeada que não emite nada e não centraliza nada.

---

## 6. Definição de PRONTO (para os specs de unificação)

- [ ] Existe UMA tela chamada "Modelo de Receituários" com todos os modelos salvos
- [ ] Todo motor de PDF importa o modelo ativo desta tela
- [ ] O preview HTML (`ReceituarioPreview.tsx`) é pixel-fiel ao PDF gerado
- [ ] As rotas `/api/prescriptions/emit` e `/api/receituario/emitir-prescricao` convergem para o mesmo motor
- [ ] A tela de Configurações do Receituário alimenta os motores (não é ornamental)
- [ ] Um farmacêutico pode validar o documento gerado (nome completo, dose, posologia, assinatura legível)
