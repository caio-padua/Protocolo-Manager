// Sistema de design PAXTER (3D skeuomorphic, navy + gold).
// Compartilhado pelos mockups da ENTREGA 12. Pasta "_shared" e ignorada pelo
// plugin de preview (so .tsx fora de pastas _*). Espelha os tokens aprovados
// em marcacao/MarcarConsulta.tsx para manter consistencia visual.

export const PAXTER_STYLE = `
  /* Azul marinho classico com degrade "camurca" (suede): brilho suave diagonal
     sobre um marinho profundo. Tom totalmente classico, fundo NUNCA muda de cor. */
  .paxter-bg {
    background:
      linear-gradient(135deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0) 34%, rgba(0,0,0,0.16) 100%),
      radial-gradient(130% 100% at 50% -12%, #1b3a5f 0%, #122a49 32%, #0b1d37 62%, #07142a 100%);
  }
  .text-gold { background: linear-gradient(180deg, #f4e2a8 0%, #c2a05a 45%, #8a6d2f 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
  .bg-gold { background: linear-gradient(180deg, #f4e2a8 0%, #c2a05a 45%, #8a6d2f 100%); }
  .border-gold { border-color: #c2a05a; }

  /* 3D Premium Button (preto, bevel alto, ouro polido) */
  .btn-premium {
    background: linear-gradient(180deg, #1a1a1a 0%, #000000 100%);
    box-shadow: inset 0 2px 1px rgba(244, 226, 168, 0.3), inset 0 -4px 8px rgba(0,0,0,0.8), 0 12px 24px rgba(0,0,0,0.6), 0 0 20px rgba(194, 160, 90, 0.15);
    border: 1px solid rgba(194, 160, 90, 0.8);
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .btn-premium:active { transform: translateY(2px); box-shadow: inset 0 4px 10px rgba(0,0,0,0.9), 0 4px 8px rgba(0,0,0,0.4); }

  /* Paineis 3D salientes (Saliente / Bevel) */
  .panel-3d {
    background: linear-gradient(180deg, #182a4d 0%, #0f1c36 100%);
    border: 1px solid rgba(255,255,255,0.04);
    border-top: 1px solid rgba(255,255,255,0.12);
    box-shadow: 0 12px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
    border-radius: 16px;
  }

  /* Pocos concavos (Concavo / Well) */
  .concave-3d {
    background: rgba(0,0,0,0.3);
    box-shadow: inset 0 2px 12px rgba(0,0,0,0.6);
    border: 1px solid rgba(255,255,255,0.03);
    border-bottom: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
  }

  /* Chips 3D (selecionavel) */
  .chip-3d {
    background: linear-gradient(180deg, #1c3057 0%, #12213d 100%);
    border: 1px solid rgba(255,255,255,0.05);
    border-top: 1px solid rgba(255,255,255,0.15);
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    border-radius: 10px;
    transition: all 0.2s ease;
  }
  .chip-3d[data-active="true"] {
    background: linear-gradient(180deg, #243e6e 0%, #182b4d 100%);
    border-color: #c2a05a;
    box-shadow: 0 0 16px rgba(194, 160, 90, 0.2), inset 0 1px 0 rgba(244, 226, 168, 0.3);
  }

  /* Moldura dourada do cartao-heroi (porta exclusiva) */
  .gold-rim {
    position: relative;
    border-radius: 18px;
    background: linear-gradient(135deg, #6f5421 0%, #f6e6a8 16%, #c9a24e 38%, #8a6d2f 56%, #f1dd9a 76%, #927235 100%);
    padding: 2px;
    box-shadow: 0 16px 36px rgba(0,0,0,0.6), 0 0 26px rgba(194,160,90,0.28);
  }

  /* Badge de alarme (linha vermelha) */
  .alarm-badge {
    background: linear-gradient(180deg, #7f1d1d 0%, #5b1212 100%);
    border: 1px solid rgba(248,113,113,0.5);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 0 14px rgba(220,38,38,0.35);
  }

  /* Esconder scrollbar */
  .hide-scroll::-webkit-scrollbar { display: none; }
  .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }

  /* Animacoes de entrada */
  @keyframes slideUpFade { 0% { opacity: 0; transform: translateY(15px); } 100% { opacity: 1; transform: translateY(0); } }
  .anim-enter { animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
  .anim-delay-1 { animation-delay: 0.1s; }
  .anim-delay-2 { animation-delay: 0.2s; }
  .anim-delay-3 { animation-delay: 0.3s; }
  .anim-delay-4 { animation-delay: 0.4s; }

  /* Marca do sistema "PAXTER" — placa boton em ouro polido, chanfros RETOS (nao
     arredondados), com brilho passando pelo contorno e pelo corpo da escrita a
     cada 15s por 0,5s. (iOS esta para Apple; Paxter esta para o Padcon.) */
  .paxter-plate {
    position: relative;
    display: inline-flex; align-items: center; justify-content: center;
    padding: 6px 13px;
    background: linear-gradient(180deg, #1b2a45 0%, #0b1729 100%);
    border: 1px solid rgba(194,160,90,0.55);
    box-shadow: inset 0 1px 0 rgba(244,226,168,0.28), inset 0 -3px 6px rgba(0,0,0,0.6), 0 6px 14px rgba(0,0,0,0.5);
    /* chanfros retos nos 4 cantos (corte a 45 graus, sem arredondar) */
    clip-path: polygon(7px 0, calc(100% - 7px) 0, 100% 7px, 100% calc(100% - 7px), calc(100% - 7px) 100%, 7px 100%, 0 calc(100% - 7px), 0 7px);
    overflow: hidden;
  }
  .paxter-word {
    font-weight: 800; letter-spacing: 0.22em; font-size: 13px; line-height: 1;
    background: linear-gradient(180deg, #f8ecbf 0%, #d8b765 38%, #a07d34 68%, #f1dd9a 100%);
    -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 1px 0 rgba(0,0,0,0.55)) drop-shadow(0 -0.5px 0 rgba(255,250,228,0.45));
  }
  .paxter-glint { position: absolute; inset: 0; pointer-events: none; }
  .paxter-glint::before {
    content: ""; position: absolute; top: -20%; bottom: -20%; left: 0; width: 45%;
    background: linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,250,228,0.0) 30%, rgba(255,252,235,0.85) 50%, rgba(255,250,228,0.0) 70%, rgba(255,255,255,0) 100%);
    transform: translateX(-220%) skewX(-18deg);
    animation: paxterGlint 15s ease-in-out infinite;
    mix-blend-mode: screen;
  }
  /* travessia de ~0,5s (3,33% de 15s) e depois repouso ate o proximo ciclo */
  @keyframes paxterGlint {
    0%    { transform: translateX(-220%) skewX(-18deg); }
    3.33% { transform: translateX(320%) skewX(-18deg); }
    100%  { transform: translateX(320%) skewX(-18deg); }
  }

  /* Aura dourada pulsante atras do simbolo */
  @keyframes auraPulse { 0%, 100% { opacity: 0.25; transform: scale(0.9); } 50% { opacity: 0.6; transform: scale(1.15); } }
  .aura-pulse { animation: auraPulse 3s ease-in-out infinite; }

  /* Entrada da tagline */
  @keyframes taglineEnter { 0% { opacity: 0; transform: translateX(-20px) scale(0.95); } 100% { opacity: 1; transform: translateX(0) scale(1); } }
  .tagline-anim { animation: taglineEnter 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; animation-delay: 0.4s; }

  /* Brilho de barra de intensidade preenchida */
  .bar-on { background: linear-gradient(180deg, #f4e2a8 0%, #c2a05a 55%, #8a6d2f 100%); box-shadow: 0 0 8px rgba(194,160,90,0.5), inset 0 1px 0 rgba(255,250,228,0.7); }
  .bar-off { background: rgba(0,0,0,0.35); box-shadow: inset 0 2px 5px rgba(0,0,0,0.6); }
`;
