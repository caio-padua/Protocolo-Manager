# Spec — Tela de Marcação de Consulta (Paxter)

Data: 22/06/2026 · Dono: Dr. Caio (CEO) · Loop: Paxter (Especificar → Construir → Revisar)

## Objetivo
Página mobile-first ("minha vida depende de marcar consultas") para o cliente marcar
uma consulta no Instituto Pádua, com a identidade Paxter (3D skeuomórfico, navy + ouro
polido) e carga emocional/premium que "surpreenda muito".

## Onde
Protótipo (mockup) no Canvas primeiro: `artifacts/mockup-sandbox/src/components/mockups/marcacao/MarcarConsulta.tsx`.
Decisão de virar rota real em `artifacts/padcom` fica para depois da aprovação do CEO.

## Alvo de dispositivo
- iPhone 13/14 normal (390 x 844) como base.
- iPhone Pro Max (430 x 932) sem quebrar.
- Toque grande, uma coluna, sem rolagem horizontal exceto a faixa de vídeos.

## Conteúdo obrigatório (o que a tela precisa ter)
1. Cabeçalho com o símbolo Paxter animado (contorno de energia tipo "raio" traçando o
   símbolo + brilho/shimmer dourado) e o wordmark.
2. Tagline em inglês "Clinical Intelligence System" com animação de entrada (desliza da
   lateral + leve zoom).
3. Botão principal premium "MARCAR CONSULTA": fundo preto, bevel ALTO (sobressalente),
   ouro polido reluzente (usar a linguagem `bevel-3d` da skill-layout-paxter).
4. Faixa horizontal de vídeos (carrossel/scroll lateral) com cartões 16:9 (placeholder
   por enquanto) — vídeos auto-explicativos de apresentação.
5. Passos de marcação (escolher motivo → profissional → dia → horário → confirmar) em
   cartões 3D (Saliente/screen-3d) com toque grande.
6. Endereço da clínica: "Rua Guaxupé, 327 — Vila Formosa" com ícone e link de mapa.
7. Rodapé "Instituto Pádua · Paxter — desenvolvido pela Padcon".

## Linguagem visual (skill-layout-paxter)
- Tokens da marca: navy #0d1830 / petróleo, ouro polido (#c2a05a → #f4e2a8 highlight).
- Saliente = `screen-3d`/`bevel-3d`; Côncavo = `concave-3d`; botão = `btn-3d`.
- Sem infantilidade; elegante, denso, alto contraste (TDAH-friendly).

## Aceite
- Renderiza bem em 390x844 e 430x932.
- Símbolo animado + tagline animada + botão ouro premium + faixa de vídeos + endereço.
- Sem rolagem horizontal fora da faixa de vídeos.
- Revisão do architect sem pendência grave.

## Fora de escopo (agora)
- Backend real de agendamento (ligar à Agenda/Google Calendar) — decisão posterior.
- Geração de vídeos por IA — placeholders por enquanto.

## Pendência conhecida (aceita pelo CEO até houver asset vetorial)
- O símbolo Paxter hoje é PNG (não SVG), então o efeito "contorno de energia/raio
  traçando exatamente o desenho do símbolo" está aproximado por aura dourada pulsante +
  shimmer (sweep). O traçado vetorial exato (stroke-dasharray no contorno) só é possível
  com o símbolo em SVG. Próximo passo: produzir o brasão em SVG e aplicar o trace; depois
  re-rodar a revisão do architect. Revisão atual: PASS sem pendência crítica/alta.
