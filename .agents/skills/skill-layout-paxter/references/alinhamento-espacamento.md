---
name: Alinhamento e espacamento Paxter
description: Linhas-guia imaginarias visiveis (verticais e horizontais), escala de espacamento (respiro 3D) e grade casada cabecalho/linha.
---

# Alinhamento e espacamento Paxter

Regra-mae (CEO): toda tela e lida sobre LINHAS-GUIA imaginarias. Pensar e PROVAR essas linhas e
obrigatorio antes de dar a tela por pronta.

## 1. Linhas-guia imaginarias (verticais e horizontais)

| Linha-guia | Onde fica | O que deve bater nela |
|---|---|---|
| Vertical esquerda | comeco dos rotulos/icones | todo rotulo de linha empilhada comeca aqui |
| Vertical direita | fim dos valores | todo valor/numero termina aqui |
| Horizontal (baseline) | linha de base do texto de cada linha | rotulo e valor da mesma linha na mesma altura |
| Horizontal (topo do bloco) | borda superior do painel | titulos de blocos vizinhos no mesmo nivel |

Como CONSEGUIR no codigo:
- Token a esquerda e valor a direita na MESMA linha: `flex items-center justify-between` numa caixa de
  largura definida — cria a guia esquerda e a guia direita automaticamente.
- Colunas que nao podem "dancar" entre linhas: dar largura FIXA ao slot (ex.: chip de status
  `w-[72px] shrink-0`), sempre presente (nunca aparece/some).
- Tabela: usar o MESMO `grid-cols-[...]` no cabecalho E nas linhas; o cabecalho leva
  `border border-transparent` para casar com a borda de 1px da linha (alinha ao pixel).

## 2. Como tornar as linhas-guia VISIVEIS durante o trabalho (e remover depois)

Para CONFERIR (nunca deixar no commit final), aplique um contorno temporario nos itens que deveriam
alinhar:
```tsx
className="... outline outline-1 outline-cyan-500/40"
```
Os contornos revelam na hora qualquer item que nao bate na guia. Tambem vale a regua/guides do
navegador (DevTools). Apagar todos os `outline` de conferencia antes de finalizar.

## 3. Escala de espacamento (respiro 3D)

Pecas com relevo (paineis, chips, inserts, cards) NUNCA se encostam — sombra externa precisa respirar.

| Situacao | Espaco | Classe |
|---|---|---|
| Gap minimo entre pecas 3D | 12px | `gap-3` / `space-y-3` |
| Entre blocos/secoes | 16px | `space-y-4` |
| Lista/historico (linhas em `p-4`) | 20px | `space-y-5` |
| Cards com `scale-105` (recomendado) | 24px | `gap-6` (acomoda o crescimento) |
| Padding interno de bloco | 16px | `p-4` |

Pecas coladas matam o 3D. Na duvida, mais respiro.

## 4. Empilhamento por assunto (lego)

- Campos do mesmo assunto: sub-painel (`panel-3d-sub`) com rotulo MAIUSCULO no topo e campos
  EMPILHADOS na vertical (`space-y-3`) — nunca uma grade larga espremida.
- Assuntos distintos: sub-paineis lado a lado (ex.: "Descontos por pagamento" x "Parcelamento").

RESUMO EM 1 LINHA: alinhar tudo em duas verticais (rotulo a esquerda, valor a direita) e baselines
horizontais, com largura fixa nos slots que nao podem dancar, e respiro de no minimo 12px entre pecas.
</content>
