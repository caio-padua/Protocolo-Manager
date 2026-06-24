# Spec — Anamnese V2: ajustes visuais (Onda 2)

Aprovado pelo CEO em 24/06/2026. SO acabamento visual; NAO toca motor/logica/dados.
Validar claro+escuro via `/anamnese/v2?demo=1` (viewport de celular).

## Itens (aprovados)

1. Estreitar SO a coluna das questoes
   - `<main>` segue largo (max-w-2xl) para alinhar com cabecalho e prateleira.
   - Questoes + Health Twin + navegacao vao dentro de um wrapper `max-w-xl` (≈576px) centralizado.
   - Rodape segue na largura do main (logos nas pontas).

2. Prateleira dos grupos como camada-divisoria
   - A faixa `.leva-band` (LISA, nao-fixa) fica no topo do main, larga, separando o tecido do cabecalho do tecido das questoes (que ficam estreitas).

3. Botoes de RESPOSTA nao ficam brancos ao apertar (`.leva-chip` claro)
   - Topo branco puro (#ffffff) -> creme quente; pressionar = afundar 3D, sem clarao.
   - `-webkit-tap-highlight-color: transparent` para matar flash de toque no celular.

4. Palavra inteira no lugar da sigla nos chips de navegacao
   - `SIGLA_MAX` 5 -> 14, corta com reticencia "…" so se passar.
   - Chip: fonte 11px, `min-w-0` + `<span class="truncate">` como rede de seguranca.

5. Barra de intensidade (EscalaControl): numero SELECIONADO mantem a cor dourada dos demais + ANEL/GLOW neon dourado em volta (em vez de virar navy/branco).

6. Alerta (badge "Atencao"): LED vermelho que acende/apaga MUITO lento e suave (pulse ~3,6s). Desliga sob prefers-reduced-motion.

7. Rodape — logos maiores e com brilho (glint)
   - Instituto Padua (ouro): simbolo 32 -> ~60 (dobro no celular); "PADUA" 17px -> ~24px.
   - PADCON: simbolo 22 -> ~44 (pega a altura); wordmark ~24.
   - Glint sutil (sweep mascarado pelo PNG do simbolo) em ambos, lento, mix-blend screen; desliga sob reduced-motion.

## Fora de escopo
- Logo PADCON wordmark (item bloqueado, aguarda Dr. Claude) — nao mexer.
