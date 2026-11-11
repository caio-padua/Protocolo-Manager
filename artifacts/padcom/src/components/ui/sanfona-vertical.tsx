import type { ReactNode } from "react";

/**
 * Sanfona vertical (Padrão 40): abre e fecha o conteúdo na vertical, com animação suave.
 * Fechada, o conteúdo some da tela e do teclado (invisible), mas continua montado: nada é perdido.
 */
export function SanfonaVertical({ aberta, children, testId }: { aberta: boolean; children: ReactNode; testId?: string }) {
  return (
    <div
      className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${aberta ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      data-testid={testId}
      data-aberta={aberta ? "sim" : "nao"}
    >
      <div className={`min-h-0 overflow-hidden ${aberta ? "visible" : "invisible delay-300 [transition-property:visibility]"}`} aria-hidden={!aberta}>
        {children}
      </div>
    </div>
  );
}
