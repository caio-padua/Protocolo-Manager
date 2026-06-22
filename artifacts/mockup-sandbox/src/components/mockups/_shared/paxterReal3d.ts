/**
 * Botoes 3D VALIDADOS do sistema de design Paxter (skill-layout-paxter).
 * CSS copiado IDENTICO de artifacts/padcom/src/index.css (fonte da verdade):
 *   - btn-3d        -> tecla primaria petroleo que afunda no :active (acao principal)
 *   - btn-3d-soft   -> tecla neutra para "escolher 1 entre varios" / voltar
 *   - bevel-3d      -> Bevel GROSSO (botao alto que salta da folha) = estado SELECIONADO
 * Classes UNLAYERED de proposito (vencem utilitarios bg/border do Tailwind).
 * Usadas em modo escuro (tela do paciente): o root precisa da classe `dark`.
 *
 * UNICO acrescimo nao-canonico: `.bevel-3d.is-selected` (anel dourado da marca
 * no estado selecionado), para leitura imediata "bater o olho" (preferencia do CEO).
 * Todo o resto e copia identica do index.css.
 */
export const PAXTER_REAL_3D_CSS = `
.btn-3d {
  border-radius: 0.375rem;
  border: 1px solid rgba(184, 146, 77, 0.55);
  background: linear-gradient(180deg, #22406a 0%, #16294a 52%, #0a1f3a 100%);
  color: #ffffff;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.5),
    inset 0 -3px 6px rgba(0, 0, 0, 0.22),
    0 8px 16px -5px rgba(7, 22, 43, 0.5),
    0 3px 6px -2px rgba(7, 22, 43, 0.32);
  transition: transform 0.08s ease, box-shadow 0.25s ease, filter 0.25s ease;
}
.btn-3d:hover {
  filter: brightness(1.10);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.55),
    inset 0 -3px 6px rgba(0, 0, 0, 0.22),
    0 10px 20px -5px rgba(7, 22, 43, 0.5),
    0 0 16px -2px hsl(39 60% 55% / 0.6);
}
.btn-3d:active {
  transform: translateY(2px);
  box-shadow:
    inset 0 2px 5px rgba(0, 0, 0, 0.32),
    0 2px 5px -2px rgba(7, 22, 43, 0.35);
}

.btn-3d-soft {
  border-radius: 0.375rem;
  border: 1px solid rgba(184, 146, 77, 0.45);
  background: linear-gradient(180deg, #ffffff 0%, #f6f1e6 55%, #ece4d2 100%);
  color: hsl(180 30% 28%);
  box-shadow:
    inset 0 1px 0 #ffffff,
    inset 0 -3px 6px rgba(0, 53, 58, 0.12),
    0 7px 14px -5px rgba(7, 22, 43, 0.34),
    0 2px 5px -2px rgba(7, 22, 43, 0.22);
  transition: transform 0.08s ease, box-shadow 0.25s ease, filter 0.25s ease;
}
.btn-3d-soft:hover {
  filter: brightness(1.02);
  box-shadow:
    inset 0 1px 0 #ffffff,
    inset 0 -3px 6px rgba(0, 53, 58, 0.12),
    0 9px 18px -5px rgba(7, 22, 43, 0.34),
    0 0 14px -2px hsl(39 60% 55% / 0.45);
}
.btn-3d-soft:active {
  transform: translateY(2px);
  box-shadow:
    inset 0 2px 5px rgba(0, 53, 58, 0.18),
    0 2px 5px -2px rgba(7, 22, 43, 0.22);
}
.dark .btn-3d-soft {
  border-color: hsl(180 16% 26%);
  background: linear-gradient(180deg, hsl(180 18% 20%) 0%, hsl(180 20% 15%) 100%);
  color: hsl(187 60% 70%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    inset 0 -3px 6px rgba(0, 0, 0, 0.4),
    0 7px 14px -5px rgba(0, 0, 0, 0.5);
}

.bevel-3d {
  background: linear-gradient(180deg, #ffffff 0%, #f8f5ec 55%, #efe8d6 100%);
  border: 1px solid rgba(184, 146, 77, 0.45);
  border-radius: 0.375rem;
  box-shadow:
    inset 0 3px 0 rgba(255, 255, 255, 0.98),
    inset 0 -6px 11px rgba(0, 53, 58, 0.14),
    0 16px 24px -10px rgba(7, 22, 43, 0.44),
    0 7px 12px -4px rgba(7, 22, 43, 0.30);
}
.dark .bevel-3d {
  background: linear-gradient(180deg, hsl(180 20% 21%) 0%, hsl(180 22% 15%) 100%);
  border-color: hsl(180 16% 27%);
  box-shadow:
    inset 0 3px 0 rgba(255, 255, 255, 0.08),
    inset 0 -6px 11px rgba(0, 0, 0, 0.48),
    0 16px 24px -10px rgba(0, 0, 0, 0.62),
    0 7px 12px -4px rgba(0, 0, 0, 0.5);
}
/* Selecionado: bevel alto + anel/borda dourada da marca para leitura imediata */
.bevel-3d.is-selected {
  border-color: rgba(196, 160, 90, 0.85);
  box-shadow:
    inset 0 3px 0 rgba(255, 255, 255, 0.10),
    inset 0 -6px 11px rgba(0, 0, 0, 0.48),
    0 16px 24px -10px rgba(0, 0, 0, 0.62),
    0 0 0 1.5px rgba(196, 160, 90, 0.55);
}
`;
