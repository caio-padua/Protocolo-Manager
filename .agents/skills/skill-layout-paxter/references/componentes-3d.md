---
name: Componentes 3D Paxter — receitas
description: Como criar cada controle 3D (Painel, Saliente/bevel, Concavo/inset, Botao, Neon, LED, Toggle): classe, JSX, receita de luz, quando usar, armadilha.
---

# Componentes 3D Paxter — receitas de "como criar"

As classes vivem em `artifacts/padcom/src/index.css` e sao **unlayered** de proposito (ficam fora de
`@layer`), por isso vencem utilitarios `bg-*`/`border-*`/`rounded-*` do Tailwind/shadcn. Nunca reordene
em camadas. Toda classe tem variante `.dark`; ao criar classe nova, crie tambem a `.dark`.

## Receita de luz (o que faz parecer 3D), em uma frase

| Efeito | Como falar | Receita de luz (box-shadow) |
|---|---|---|
| Sai da tela (alto-relevo) | Saliente / Bevel | topo iluminado (`inset 0 +Npx 0 branco`) + sombra externa profunda embaixo |
| Afunda na tela (baixo-relevo) | Concavo / Inset | sombra interna no topo (`inset 0 +Npx ... escuro`) + leve realce branco embaixo |
| Afunda ao clicar | tecla | no `:active`, `translateY(2px)` + troca a sombra externa por sombra interna |
| Brilho que chama | Neon / Underglow | `::after` com `radial-gradient` + `blur`, `pointer-events:none` |

## Tabela-mae dos controles (intencao -> classe)

| Falar como | Classe(s) | Efeito | Quando usar |
|---|---|---|---|
| Painel 3D | `panel-3d` / `panel-3d-sub` / `panel-3d-hero` | cartao que salta | moldura de cada bloco/secao |
| Painel ativo | `panel-3d-active` | painel + halo na cor primaria | bloco selecionado |
| Saliente (mini-tela) | `screen-3d` | numero/titulo em alto-relevo | conclusao/valor em destaque |
| Saliente (placa grossa) | `bevel-3d` (+ `bevel-3d-ok` verde) | botao grosso que salta | rotulo/etiqueta do bloco |
| Concavo (campo gravado) | `field-engraved` | input afundado | onde se digita |
| Concavo (chip/valor) | `concave-3d` | dado afundado | porcentagem, sessoes, status |
| Botao primario | `Button` + `btn-3d` | tecla petroleo que afunda | acao principal (1 por bloco) |
| Botao neutro | `Button` + `btn-3d-soft` | tecla clara | escolher 1 entre varios, voltar |
| Botao aceito | `Button` + `btn-3d-ok` | tecla verde sucesso | estado terminal (so apos aceitar) |
| Neon no hover | `neon-hover` | luz ciano sobe ao passar o mouse | item clicavel discreto |
| Neon estavel | `paxter-underglow` | luz que sobe do rodape, NAO pisca | bloco que precisa chamar sem piscar |
| Luz de status | `paxter-led` (+`-amber`/`-green`/`-red`, `-on`/`-off`/`-breathe`) | ponto que pulsa | Agora/Meta, ligado/desligado |
| Toggle | `Switch` quadrado dentro de ToggleWell (`concave-3d`) | liga/desliga afundado | opcao editavel |

## Esqueletos JSX (copiar e adaptar)

### Painel com titulo Saliente + valor Concavo
```tsx
<div className="panel-3d p-4 space-y-3">
  <div className="bevel-3d px-3 py-1.5 uppercase tracking-wide text-sm font-semibold inline-flex items-center gap-2">
    <Icon className="h-4 w-4 text-primary" /> TITULO DO BLOCO
  </div>
  <div className="concave-3d px-3 py-2 text-2xl font-bold">-15%</div>
</div>
```

### Botoes por intencao (sempre via shadcn Button + classe 3D)
```tsx
<Button className="btn-3d">Confirmar e lancar</Button>        {/* primaria: so 1 por bloco */}
<Button className="btn-3d-soft">Voltar</Button>               {/* neutra: pares SEMPRE iguais */}
<Button className="btn-3d-ok">Aceito</Button>                 {/* so DEPOIS de aceitar */}
```
Armadilha: nunca colorir so um de um par de escolhas neutras (parece "ja escolhido"). Recomendado se
marca por MOLDURA + selo (`panel-3d-rec`), nunca enchendo o botao de verde-sucesso.

### Neon no hover (item clicavel discreto)
```tsx
<button className="neon-hover concave-3d px-3 py-2">Ver detalhe</button>
```

### Neon estavel saindo de baixo (underglow — NAO pisca)
```tsx
{/* O underglow e um ::after que precisa de position:relative no pai.
    Usar quando o bloco inteiro precisa "chamar" sem ficar piscando. */}
<div className="paxter-underglow panel-3d p-4">
  <p className="text-sm font-semibold">Sessoes planejadas</p>
  <p className="text-3xl font-bold">12</p>
</div>
```
Armadilha: o `::after` tem `pointer-events:none` e `position:absolute` — o pai PRECISA de
`position:relative` (a classe `paxter-underglow` ja define). Se o pai nao tiver
`overflow:visible`, o neon fica cortado.

### LED de status (slot fixo, nunca aparece/some)
```tsx
<span className="concave-3d w-[72px] shrink-0 inline-flex items-center justify-center gap-1.5">
  <span className="paxter-led paxter-led-green paxter-led-on" /> VITRINE
</span>
```

### Luz de status de FERRAMENTA/integracao — respiro de VELA (padrao oficial)
Padrao aprovado pelo CEO (27/06/2026) para a luzinha que fica ao lado do TITULO
(bevel saliente) de uma ferramenta/integracao, indicando ligado/desligado:
```tsx
// verde = ligado/ativo, amarelo = desligado/inativo; respiro LENTO (vela)
<span className={`paxter-led paxter-led-breathe ${ativo ? "paxter-led-green" : "paxter-led-amber"}`} />
```
- `paxter-led-breathe` = `paxterPulse 3.6s` (acende/apaga LENTO, cadencia de vela). NAO usar
  `paxter-led-on` (1.4s e rapido demais para status de ferramenta).
- A cor vem do modificador (`-green`/`-amber`/`-red`); o respiro herda `--led-glow`, entao a vela
  acende na cor certa.
- UMA luz so por ferramenta: nao repetir LED no badge do segredo (cofre) e no titulo ao mesmo tempo.
- Armadilha: existe `.paxter-led-alert` (vermelho, `paxter-led-slow`) SO para o alarme da anamnese —
  nao confundir com o sistema canonico `.paxter-led`.

### Toggle quadrado em sulco (ToggleWell — Padrao 5/11)
```tsx
<div className="concave-3d flex items-center gap-3 px-3 py-2.5">
  <Switch checked={on} onCheckedChange={setOn} />
  <Label>Mostrar na vitrine</Label>
</div>
```
O `Switch` ja vem quadrado do componente base (`components/ui/switch.tsx`): trilho `rounded-[3px]`,
thumb `rounded-[2px]`. Nunca usar a pilula arredondada padrao.

## Armadilhas gerais (decisoes ja batidas)
- Para tingir um bloco em relevo (ex.: alerta verde "dentro do alvo"), `bg-emerald-50` PERDE para o
  unlayered; crie/use classe companheira unlayered (ex.: `bevel-3d-ok`).
- Pecas com relevo NUNCA se encostam (ver `references/alinhamento-espacamento.md`).
- So a APRESENTACAO muda; nunca alterar motor de calculo nem payload por estetica.
</content>
