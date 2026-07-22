# Spec P1+P2 — Boxes 1 e 2: âncora no topo, crescimento para baixo

**Data:** 22/07/2026  
**Arquivo:** `artifacts/padcom/src/components/receituario/ReceituarioPreview.tsx`  
**Config:** `artifacts/padcom/src/lib/arabesques/receituario-config.ts`

## Alvo

Boxes 1 (Paciente) e 2 (Emitente) devem ter um TOPO fixo (linha imaginária horizontal).
Quando a altura aumenta (slider ou conteúdo), o limite INFERIOR cresce para baixo.
O topo nunca se move.

## Situação atual

- Boxes 1 e 2 ficam no fluxo normal do documento (position: static)
- `minHeight` controla a altura, mas o crescimento é imprevisível visualmente
- Slider `boxMinHeight` controla os 4 boxes ao mesmo tempo (sem separação)

## Solução

1. **Config nova**: adicionar `boxSuperiorMinHeight: number` (default: 120) — controla apenas boxes 1 e 2
2. **`BandaComBoxes` superior**: recebe `minHeightOverride={cfg.boxSuperiorMinHeight}` em vez de `cfg.boxMinHeight`
3. **Âncora visual**: o topo da banda superior fica imediatamente abaixo do cabeçalho/título. Comportamento natural do fluxo já garante isso — o importante é que `boxSuperiorMinHeight` substitui `boxMinHeight` para esse grupo.
4. **Manter `boxMinHeight`** como controle dos boxes 3 e 4 (renomeado internamente via spec P6+P7)

## Critério de aceitação

- Slider "Altura boxes 1+2" afeta APENAS boxes 1 e 2
- Topo dos boxes 1+2 não se move ao aumentar altura
- Limite inferior cresce para baixo
