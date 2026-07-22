================================================================================
CARTA TECNICA — DR. MANUS (Engenheiro Autonomo de Missoes)
De: Dr. Replit Paxter (Dr. Caio Henrique Fernandes Padua — PADCOM/PAXTER)
Assunto: Unificacao do Sistema de Prescricao de Receituario
Data: 22/07/2026
================================================================================

DR. MANUS,

O sistema PAXTER (Padcon Conect) tem hoje um PROBLEMA GRAVE no modulo de
prescricao medica: existem 4 motores de geracao de PDF independentes, sem
fonte de verdade unica, e o preview que o medico ve na tela NAO corresponde
ao PDF que chega na farmacia.

Segue o mapa completo do problema e o que precisamos que voce construa.

────────────────────────────────────────────────────────────────────────────────
1. INVENTARIO DOS MOTORES ATUAIS (os 4 motores que precisam virar 1)
────────────────────────────────────────────────────────────────────────────────

MOTOR M1 — receituario-pdf.ts / generateReceituarioPdf
  Arquivo: artifacts/api-server/src/lib/receituario-pdf.ts
  Formato: Grade/tabela PAXTER magistral (linhas com Formula/Posologia/Via)
  Usado por: rota GET /api/receituario/demo
  Problema: Formato proprio, desconectado do preview visual

MOTOR M2 — receituario-pdf.ts / generateReceituarioPdfV2
  Arquivo: artifacts/api-server/src/lib/receituario-pdf.ts
  Formato: ANVISA 4 boxes branco (Emitente / Paciente / Comprador / Farmacia)
  Usado por: POST /api/receituario/emitir-prescricao
  Problema: Nao usa arabescos; ignora a config salva na tela de modelo

MOTOR M3 — prescription-pdf.ts (Fabrica de Documentos)
  Arquivo: artifacts/api-server/src/lib/prescription-pdf.ts
  Formato: Receita simples ou especial por cor interna (desmembramento)
  Usado por: POST /api/prescriptions/emit
  Problema: Ignora completamente o ReceituarioPreview.tsx

MOTOR M4 — puppeteer-capture.ts (Captura HTML)
  Arquivo: artifacts/api-server/src/lib/puppeteer-capture.ts
  Formato: Captura PNG do HTML do ReceituarioPreview.tsx + assina ICP-Brasil
  Usado por: POST /api/receituario/assinar-imagem-pdf e emitir-cliente
  Este e o motor mais fiel ao preview — BASE para a unificacao.

────────────────────────────────────────────────────────────────────────────────
2. INVENTARIO DAS TELAS / BOTOES QUE EMITEM RECEITA
────────────────────────────────────────────────────────────────────────────────

TELA A — /prescricao (Prescricao.tsx)
  Preview: SIM (ReceituarioPreview.tsx ao vivo)
  Botoes de emissao:
    - "Gerar Receituario" → POST /api/receituario/assinar-imagem-pdf (M4)
    - "Emitir" → POST /api/prescriptions/emit (M3)
  Problema: 2 botoes, 2 motores, 2 formatos diferentes

TELA B — /receituario-automatico
  Preview: NAO
  Botao: "Emitir Receita Real" → POST /api/receituario/emitir-prescricao (M2)
  Problema: Sem preview; formato M2 diverge do M4

TELA C — /cockpit (PrescricaoFormulasPanel.tsx)
  Preview: SIM (ReceituarioPreview.tsx)
  Botao: POST /api/receituario/assinar-imagem-pdf (M4) → CORRETO
  Problema: Menor (M4 ja captura o preview)

TELA D — /cockpit (ReceituarioAlertaPanel.tsx)
  Preview: NAO
  Botao: "Emitir Receita Real" → POST /api/receituario/emitir-prescricao (M2)
  Problema: Formato M2, sem preview

TELA E — /configuracoes/receituario (hoje chamada "Faixa de Receituario")
  Preview: SIM (ReceituarioPreview.tsx ao vivo com config)
  Botao: NENHUM de emissao
  Problema: A tela que configura o modelo nao emite nada e os motores
            nao consomem a config que ela salva

────────────────────────────────────────────────────────────────────────────────
3. O QUE PRECISAMOS QUE VOCE CONSTRUA
────────────────────────────────────────────────────────────────────────────────

As specs completas estao em:
  specs/receituario-mapa-diagnostico.md
  specs/receituario-unificado-01-modelo-pagina.md
  specs/receituario-unificado-02-motor-unico.md
  specs/receituario-unificado-03-rotas.md
  specs/receituario-unificado-04-preview-parity.md

RESUMO DO QUE CONSTRUIR (em ordem):

Passo 1 → Criar tabela `receituario_modelos` no banco (migration SQL manual).
Passo 2 → Criar API CRUD `/api/receituario-modelos` (GET/POST/PATCH ativar).
Passo 3 → Criar funcao `emitirReceituarioPdf` em `lib/receituario-motor.ts`
           usando M4 (Puppeteer) como base, carregando o modelo ativo.
Passo 4 → Redirecionar as 5 rotas existentes para `emitirReceituarioPdf`.
Passo 5 → Renomear tela E para "Modelo de Receituarios" (URL /modelo-receituario).
Passo 6 → Adicionar botao "Testar PDF" na tela E, usando preview-pdf.
Passo 7 → Garantir paridade: o preview da tela = o PDF gerado.

────────────────────────────────────────────────────────────────────────────────
4. LINHAS VERMELHAS (nunca cruzar)
────────────────────────────────────────────────────────────────────────────────

- NUNCA fazer DROP TABLE em producao
- NUNCA remover rotas existentes (compatibilidade retroativa)
- NUNCA mudar a assinatura ICP-Brasil (cert ativo em certs/assinatura.pfx)
- NUNCA usar generateReceituarioPdfV2 como motor "padrao" — ele fica so para
  emissoes que explicitamente precisam do formato ANVISA branco
- NUNCA alterar o motor de desmembramento (prescription-pdf.ts / desmembramento.ts)
  para receitas que NAO precisam de desmembramento

────────────────────────────────────────────────────────────────────────────────
5. STACK TECNICA
────────────────────────────────────────────────────────────────────────────────

- Backend: Express 5 + Drizzle ORM + PostgreSQL
- PDF: Puppeteer (Chromium via pkgs.chromium Nix, path fixo em puppeteer-capture.ts)
- Assinatura: @signpdf (PAdES) com cert PFX ICP-Brasil
- Frontend: React + Vite + TailwindCSS + shadcn/ui
- Monorepo: pnpm workspaces, API em /api prefix

================================================================================
FIM DA CARTA
================================================================================
