# NOTAS DE ANÁLISE — Pedidos do CEO

## Mapa real das telas que emitem receita (do código-fonte):

### TELA A: /prescricao (prescricao/index.tsx)
- Preview: SIM (ReceituarioPreview.tsx com ReceituarioConfig do localStorage)
- Botão 1: "Gerar Receituário" → html2canvas + POST /api/receituario/assinar-imagem-pdf → M4 (Puppeteer) → PDF = captura do preview (CORRETO visualmente)
- Botão 2: "Emitir" → POST /api/prescriptions/emit → M3 (prescription-pdf.ts) → PDF COMPLETAMENTE DIFERENTE (sem arabescos, sem layout PAXTER)
- PROBLEMA: 2 botões na MESMA tela geram 2 PDFs diferentes

### TELA B: /receituario-automatico
- Preview: NÃO
- Botão: "Emitir Receita Real" (modal) → POST /api/receituario/emitir-prescricao → M2 (V2 ANVISA branco)
- PROBLEMA: Sem preview; formato M2 diverge totalmente do preview da tela de Config

### TELA C: /cockpit → PrescricaoFormulasPanel.tsx
- Preview: SIM (ReceituarioPreview.tsx)
- Botão: captura html2canvas → POST /api/receituario/assinar-imagem-pdf → M4 → PDF = captura do preview (navy/gold Instituto Pádua)
- CORRETO visualmente (usa M4)

### TELA D: /cockpit → ReceituarioAlertaPanel.tsx
- Preview: NÃO (só lista slots)
- Botão: "Emitir Receita Real" (modal) → POST /api/receituario/emitir-prescricao → M2 (V2 ANVISA branco)
- PROBLEMA: Usa M2, sem preview, formato diferente

### TELA E: /configuracoes/receituario (receituario.tsx)
- Preview: SIM (ReceituarioPreview.tsx ao vivo com config completa)
- Botão 1: "Imprimir / PDF" → window.print() do DOM do preview (só navegador, não é PDF real)
- Botão 2: "Gerar receita demo" → POST /api/receituario/gerar-demo → M1 (V1 magistral)
- PROBLEMA: A tela que CONFIGURA o modelo não alimenta nenhum motor. Config salva no localStorage.

### TELA F: /cockpit (painel de fórmulas dentro da consulta)
- Preview: SIM (ReceituarioPreview.tsx)
- Botão: captura html2canvas → POST /api/receituario/emitir-cliente → M4 (Puppeteer)
- CORRETO visualmente (usa M4, captura o preview)

## Os 4 motores reais no backend:
M1 = generateReceituarioPdf (V1 grade magistral)
M2 = generateReceituarioPdfV2 (V2 ANVISA 4-boxes branco)
M3 = generateRecipePdf (prescription-pdf.ts - desmembramento)
M4 = htmlToPngBase64 + generatePdfFromPngBase64 (Puppeteer captura)

## Problema do certificado:
- cert-source.ts lê o .pfx real e extrai metadados (nome, CPF, AC, validade)
- ReceituarioPreview.tsx usa dados estáticos "NOME DO MÉDICO" e QR como upload manual
- M2 (V2) usa readCertMetaSync() para dados reais + QR gerado pela lib
- M4 captura o preview que tem dados estáticos → certificado no PDF ≠ certificado real

## O que o Dr. Replit já entregou (dos anexos do usuário):
- 4 specs escritas (Fase 1 ESPECIFICAR)
- Carta para Dr. Manus
- Mapa diagnóstico
- NÃO construiu código (Fase 2) — aguardando aprovação do CEO
- NÃO renomeou tela
- NÃO criou motor único
- NÃO recriou rotas
