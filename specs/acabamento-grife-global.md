# Spec — Acabamento de Grife Global (creme/dourado + Cormorant)

## Objetivo
Padronizar TODAS as telas no acabamento clássico creme/dourado do Dashboard e ativar a serifada Cormorant Garamond nos nomes e títulos, sem editar tela por tela (mudança 100% no CSS base + index.html).

## Contexto verificado
- O CSS já foi desenhado para `--app-font-display` ser a serifada (comentários citam Cormorant), mas aponta provisoriamente para Archivo.
- O acabamento creme/dourado existe HOJE só dentro do escopo `.pw-home` (usado apenas pelo Dashboard). As classes 3D BASE têm gradiente frio azulado (#eef5f5, vestígio do tema verde-petroleo antigo).
- Tokens de COR já são navy/gold globalmente (--primary marinho, --accent dourado); o que resta frio são: --foreground, --border, --card-border, --input, --popover-border, --background e as classes 3D base.

## Requisitos exatos
1. Cormorant Garamond carregada no index.html (FEITO).
2. `--app-font-display` e `--app-font-serif` = `"Cormorant Garamond", Georgia, serif`. Isso ativa a serifada em h1/h2/h3, `.pw-title-serif` e `.pw-client-name` de uma vez.
3. Botões e rótulos uppercase continuam em Archivo/Inter (NÃO usam display → não viram serifada). Dados (números, telefones, e-mails) continuam Inter.
4. Tokens base frios -> creme/dourado, replicando o que o `.pw-home` já faz:
   - `--foreground`, `--card-foreground`, `--popover-foreground`, `--secondary-foreground` -> marinho `214 54% 19%`.
   - `--card-border`, `--popover-border`, `--border`, `--input` -> dourado `41 38% 70%`.
   - `--background` -> creme `40 33% 96%`.
5. Classes 3D base recebem os MESMOS gradientes/bordas creme/dourado do `.pw-home`, para TODAS as telas herdarem: `.panel-3d`, `.panel-3d-sub`, `.panel-3d-hero`, `.bevel-3d`, `.concave-3d`, `.screen-3d`, `.field-engraved`, `.btn-3d`, `.btn-3d-soft`, `.neon-hover`.
6. Body com o mesmo gradiente creme do Dashboard (radial dourado + linear creme).

## Casos extremos
- Cor de SUBSTÂNCIA e SISTEMA CORPORAL = DADO (vem do payload/classes próprias), NUNCA tocar.
- Dourado só em borda/anel/fundo/gradiente; nunca em texto pequeno sobre branco.
- Valores base devem ser IDÊNTICOS aos do `.pw-home` para o Dashboard não divergir.
- Cores semânticas de alerta clínico (verde/amarelo/vermelho, destructive) intocáveis.

## Linhas vermelhas
- Só apresentação (CSS + index.html). Nunca payload/motor/rotas de cálculo.
- Não introduzir Archivo em botões globalmente (escopo extra não pedido) — só garantir que botões NÃO virem serifada.

## Definição de PRONTO
- Telas como Clientes, Protocolos, Agenda, Estoque e Financeiro com painéis creme + fio dourado, idênticas ao Dashboard.
- Títulos e nomes em Cormorant; botões/rótulos em Archivo/Inter; dados em Inter.
- Screenshots de pelo menos 3 telas diferentes confirmando.
- architect aprova requisito por requisito, zero pendência.
