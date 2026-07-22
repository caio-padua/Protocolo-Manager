# Spec P7 — Controle de altura individual: grupo Box 3+4

**Data:** 22/07/2026  
**Arquivos:** `receituario-config.ts`, `receituario.tsx` (designer)

## Alvo

O slider atual `boxMinHeight` passa a ser o controle EXCLUSIVO dos boxes 3 e 4.
Renomear label para "Altura mínima — Boxes 3 e 4 (faixa inferior)".

## Mudanças

1. **Sem nova chave de config** — `boxMinHeight` já existe e já persiste
2. **Renomear label** no designer: "Altura Mínima dos Boxes" → "Altura — Boxes 3 e 4"
3. **`BandaComBoxes` superior** usa `cfg.boxSuperiorMinHeight` (ver Spec P6)
4. **`BandaComBoxes` inferior** continua usando `cfg.boxMinHeight`

## Critério de aceitação

- Slider "Altura 3+4" não afeta boxes 1 e 2
- Slider "Altura 1+2" não afeta boxes 3 e 4
- Labels dos sliders são claros e distintos
