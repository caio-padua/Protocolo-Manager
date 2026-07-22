# SPEC 04 — Paridade Preview ↔ PDF
**Loop Paxter — Fase 1 (ESPECIFICAR)**
**Data:** 22/07/2026 | Status: AGUARDANDO APROVAÇÃO DO CEO

---

## Objetivo
Garantir que o componente `ReceituarioPreview.tsx` (o que o usuário VÊ na tela)
seja exatamente o mesmo que o motor de PDF captura para gerar o documento final.
Zero divergência visual entre preview e PDF.

---

## Problema atual
- `ReceituarioPreview.tsx` é um componente React independente
- O motor M4 (Puppeteer) captura este componente VIA renderização em HTML separado (`receituario-html.ts`)
- Se o componente mudar mas o HTML não mudar (ou vice-versa), o PDF diverge do preview
- Os motores M2 e M3 ignoram completamente o `ReceituarioPreview.tsx`

---

## Requisitos

### R01 — Fonte única de renderização
- `ReceituarioPreview.tsx` É a fonte de renderização — não existe uma cópia HTML paralela
- O motor captura DIRETAMENTE o componente React (via `/preview-render/:token`) em vez de reconstruir HTML
- O endpoint `/preview-render/:token` renderiza o componente com os dados passados via token (curta duração)

### R02 — Dados idênticos
- O preview na tela usa exatamente os mesmos dados que serão enviados ao motor
- Não existe "dado de demonstração" que some no PDF — se some no PDF, some no preview também
- Campos não preenchidos = exibidos como "—" tanto no preview quanto no PDF

### R03 — Conferência visual automática (futura)
- FORA DO ESCOPO desta spec — documentar como dívida técnica

---

## Linhas Vermelhas
- NÃO mudar props de `ReceituarioPreview.tsx` sem ajustar todas as telas que o usam
- NÃO criar nova versão "para PDF" do componente — apenas um componente

---

## Definição de PRONTO
- [ ] O preview da tela `/prescricao` e o PDF gerado são pixel-iguais (conferido por screenshot)
- [ ] O preview da tela `/modelo-receituario` e o PDF do "Testar PDF" são pixel-iguais
- [ ] `receituario-html.ts` foi removido ou marcado como deprecated
