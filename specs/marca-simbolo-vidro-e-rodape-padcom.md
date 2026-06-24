# Spec — Símbolo Paxter hiper-real (vidro + ouro + raio) e Rodapé "Engineered by PADCON/PADCOM"

Data de início: 24/06/2026. Loop Paxter (Especificar → Construir → Revisar).
Acionado por fala do CEO Dr. Caio ("loop Paxter", "faz o spect", "sinceridade", "transporte").

## Objetivo (uma frase)

Elevar o SÍMBOLO da marca Paxter a um acabamento hiper-realista (vidro de verdade, moldura de
ouro muito brilhante e um raio de luz de sol cruzando), e acrescentar no CANTO INFERIOR DIREITO
das telas do paciente um crédito "Engineered by" (em branco) + a palavra da empresa em OURO
VETORIZADO (mesmo tratamento do PAXTER), com leve brilho passando e link clicável para o site —
fechando, junto, a graduação da anamnese escura (fonte Lora).

## Decisões pendentes do CEO (travam o rodapé — preencher após a entrevista)

| Pendência | Opções | Default proposto |
|---|---|---|
| Grafia da palavra | PADCON (com N, igual à arte anexada) / PADCOM (com M, replit.md "empresa-mãe") | PADCON (espelha a arte) |
| URL do site (link do crédito) | (a definir pelo CEO) | (sem default — fato externo) |
| Abrangência do rodapé | só /anamnese/v2 / todas as telas do paciente (anamnese-v2 + agendar) / todas as telas | todas as telas do paciente |

## Estado real HOJE (base honesta, lida do código)

| Frente | O que existe hoje | Veredito sincero |
|---|---|---|
| Símbolo (PaxterSymbolGlass) | Moldura de ouro fina 2px (gradiente chapado) + cúpula de vidro só no ARO superior (mix-blend screen) + miolo navy + símbolo premium (PNG/aura/sweep) | Bonito, porém o vidro é raso (só brilho no topo) e a moldura não tem "estouro" de luz; não está hiper-real |
| Raio de sol | Há um sweep no símbolo premium (raster), não um raio diagonal nítido cruzando o vidro | Falta o raio de sol claro |
| Wordmark PAXTER | SVG vetor das letras oficiais, ouro 3D (profundidade + frente + lift) | Esse é o tratamento a replicar para a palavra da empresa |
| Rodapé canto inferior direito | NÃO existe; no rodapé central há só o selo "Tudo salvo automaticamente" | Crédito "Engineered by ..." é item NOVO |
| Fonte Lora (anamnese escura) | Carregada no index.html e aplicada a .leva-q; tela real renderiza no claro sem quebrar | Falta a CONFERÊNCIA no ESCURO com pergunta serifada (fui interrompido aqui) |

## Requisitos exatos

### R1 — Símbolo Paxter hiper-real (fonte única)
1.1 Manter o símbolo como FONTE ÚNICA (PaxterSymbolGlass) — melhorar aqui melhora TODAS as telas.
1.2 Vidro de verdade: cúpula com corpo de vidro (não só aro), reflexo superior forte, leve luz de
    rebote na base, sensação de espessura/refração na borda. Sem "lavar" o símbolo (miolo navy).
1.3 Moldura de ouro muito brilhante: pelo menos um ponto de luz especular forte (hotspot) e
    contorno com leitura metálica real (claro→escuro→claro), não chapado.
1.4 Raio de sol: um feixe diagonal nítido que cruza o vidro/medalhão em ciclo suave (não infantil).
1.5 Acessibilidade/perf: decorativo (aria-hidden), sem custo que trave a tela; respeitar
    prefers-reduced-motion para o raio.

### R2 — Rodapé "Engineered by" + palavra da empresa em ouro
2.1 Posição: canto INFERIOR DIREITO da(s) tela(s) definida(s) na decisão de abrangência.
2.2 Conteúdo exato: "Engineered by" em BRANCO + a palavra da empresa (grafia a confirmar) em
    OURO VETORIZADO, com o MESMO tratamento do wordmark PAXTER (SVG vetor, não fonte de texto).
2.3 Brilho: leve "brilhinho" passando sobre o ouro (glint discreto), sem exagero.
2.4 Link: o crédito inteiro é clicável e abre o site (URL a confirmar) em nova aba, com
    rel="noopener noreferrer". Acessível por teclado (foco visível).
2.5 SEM o símbolo da empresa — apenas o texto "Engineered by" + a palavra em ouro.

### R3 — Fechar a graduação da anamnese escura (Lora)
3.1 Conferir, por screenshot REAL no tema ESCURO, a tela /anamnese/v2 com uma pergunta de chip:
    fonte Lora nas perguntas, painel misto, chips com anel de ouro, fileira de ações ciano.
3.2 Zero quebra de lógica (token anti-IDOR, skip-logic, linha vermelha do alarme, salvamento,
    áudio, tema). Nada de mudança de comportamento, só pele.

## Casos extremos a tratar
- Símbolo em tamanhos pequenos (32px no cabeçalho) x grandes (hero): o vidro/raio devem escalar e
  não virar borrão; o raio não pode "vazar" para fora do medalhão.
- prefers-reduced-motion: raio e glint param (ou ficam estáticos), sem travar.
- Rodapé não pode cobrir conteúdo nem o selo de salvamento (posicionar para não colidir).
- Wordmark da empresa: kerning correto (o vetor não pode abrir buraco e ler "PAD CON").
- Grafia/URL ainda não confirmadas: NÃO inventar; deixar o rodapé pronto e plugar os dois fatos.

## Definição de PRONTO
| Critério | Conferido por |
|---|---|
| Símbolo com vidro/ouro/raio hiper-real, aprovado a olho | screenshot real (claro e escuro) + olhar do CEO |
| Rodapé inferior direito com "Engineered by" branco + palavra ouro vetor + glint + link funcional | screenshot real + clique |
| Anamnese escura conferida no ESCURO com Lora, sem lógica quebrada | screenshot real escuro |
| Nenhuma linha vermelha violada | leitura do diff |
| Revisão do architect sem pendência grave | Fase 3 (code_review) |
| Comunicação final em Densidade B | replit.md Art.37-51 |

## Linhas vermelhas
- NÃO tocar a lógica da anamnese (token/skip-logic/linha vermelha/salvamento/áudio/tema).
- Símbolo continua FONTE ÚNICA (não duplicar/forkar o medalhão).
- Motor de luz: estender por props, NUNCA forkar o PaxterGlintPremium (memória).
- Palavra da empresa é VETOR com o tratamento do Paxter, nunca fonte de texto simples.
- NÃO inventar grafia da marca nem URL do site — esperar a decisão do CEO.
