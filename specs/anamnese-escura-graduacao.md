# Graduação: Anamnese Escura (Lora) → Tela Real do Paciente

Decisão do CEO (Dr. Caio), 24/06/2026: travar a fonte **Lora (Modelo 4)** e transportar o desenho
ESCURO aprovado (mockup) para a tela real do paciente, preservando 100% da lógica existente.

## Objetivo
Reskin fiel da tela real `artifacts/padcom/src/pages/anamnese-v2/index.tsx` para o visual escuro
aprovado no mockup `anamnese-escura/FonteLora`, SEM quebrar nenhuma funcionalidade.

## Fonte da verdade visual
- Shell do mockup: `artifacts/mockup-sandbox/src/components/mockups/_shared/levaAnamnese.tsx`
  (renderizado com `bevel="misto"` e `qfont="lora"`).
- Modelo escolhido: `artifacts/mockup-sandbox/src/components/mockups/anamnese-escura/FonteLora.tsx`.

## O que TRANSFERE (aparência)
1. Fonte das perguntas = **Lora** (serifada), carregada via Google Fonts no `index.html` do padcom.
2. Painel da pergunta = acabamento "misto" SUAVIZADO (degradê parelho; base escura
   `#14304f→#0f2442→#0b1c34`; verniz/`::after` reduzido para ~0.18).
3. Fileira de ações por pergunta = **Ouvir / Vídeo / Gravar** no estilo REVERTIDO/original:
   Ouvir ícone ciano (#5cc4d6), Vídeo link ciano, Gravar ouro (#f0c674); ícones SEM cor custom.
   Mostrar Ouvir quando houver `audioUrl`; Vídeo quando houver `videoUrl`; Gravar onde a resposta
   por voz já é suportada (controls.tsx). Não inventar comportamento novo — só reorganizar em fileira.
4. Chips de resposta = estilo `leva-chip` (côncavo/well; ativo com anel ouro).
5. Header = medalhão de vidro + lockup PAXTER (já existe via `BrandMark`; manter, só harmonizar).
6. Barra de progresso com selo de porcentagem ouro — já existe, manter.

## O que PRESERVA (lógica — NÃO ALTERAR comportamento)
- `IdentifyGate` (token), `CenterLoader`, `FinishScreen`, banner MODO TESTE/DEMO.
- Tema dark/light + `ThemeToggle` + `useScreenTheme` (a tela DEVE continuar alternável).
- Modo foco (`FocusView`), mapa de grupos, `Meter`s, `HealthTwin`, selo de salvamento, navegação.
- Skip-logic, LINHA VERMELHA (defesa do alarme em 3 camadas), flush de rascunho (keepalive).
- Áudio premium (`audioUrl` mp3 — Web Speech API é PROIBIDA), vídeo, observação leiga.
- `controls.tsx` (tipos de pergunta): restilizar só a casca, não o comportamento.

## Verificação
- Screenshot da tela REAL `/anamnese/v2` em tema escuro (mobile 402x874): perguntas em Lora +
  fileira Ouvir/Vídeo/Gravar + painel misto suavizado + alternância de tema funcionando.
- NÃO usar `pnpm build` (typecheck global do repo é pré-quebrado). Usar runtime/screenshot;
  typecheck do pacote: `pnpm --filter @workspace/padcom run typecheck`.

## Aprovação
- Revisar com `architect({ includeGitDiff: true })` antes de dar como pronto; corrigir pendências.
- Se Lora virar definitiva na tela real, registrar como fonte oficial na skill `skill-layout-paxter`.
