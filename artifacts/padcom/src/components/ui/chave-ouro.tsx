import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import "./chave-ouro.css";

/**
 * Chave dourada (Padrão 40), a mesma da tela de Governança: ligada = face dourada afundada com a pastilha à direita;
 * desligada = face clara afundada com a pastilha à esquerda. Mesmo contrato do Switch (checked, onCheckedChange, disabled, id, aria-label).
 */
export const ChaveOuro = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className = "", ...props }, ref) => (
  <SwitchPrimitives.Root ref={ref} className={`chave-ouro ${className}`} {...props}>
    <SwitchPrimitives.Thumb className="chave-ouro-pastilha" />
  </SwitchPrimitives.Root>
));
ChaveOuro.displayName = "ChaveOuro";
