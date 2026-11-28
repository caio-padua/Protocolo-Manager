import type { AnchorHTMLAttributes } from "react";

/** Substitui o Link do roteador de origem: navegação comum por endereço (sem laço, sem prefixo de subdomínio). */
export function Link({ to, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a href={to} {...rest} />;
}
