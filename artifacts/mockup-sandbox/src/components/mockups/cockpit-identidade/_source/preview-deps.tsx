import type { ReactNode } from "react";

// Dados deliberadamente fictícios. Nenhum serviço é chamado pela prévia.
export const clientesDeExemplo = [
  {
    id: 1001,
    name: "Ana de Oliveira Exemplo",
    cpf: "00000000000",
    phone: "(00) 00000-0000",
    email: "ana.exemplo@example.com",
    birthDate: "1985-06-12",
    photoUrl: null,
    status: "active",
  },
  {
    id: 1002,
    name: "Bruno Santos Exemplo",
    cpf: "11111111111",
    phone: "(00) 00000-1111",
    email: "bruno.exemplo@example.com",
    birthDate: "1990-02-19",
    photoUrl: null,
    status: "active",
  },
];

export function useListClients() {
  return { data: clientesDeExemplo };
}

export function Link({ children }: { href: string; children: ReactNode }) {
  return (
    <span
      onClick={() => window.dispatchEvent(new CustomEvent("cockpit-preview-action", {
        detail: "Editar cliente: disponível somente no sistema após a integração.",
      }))}
    >
      {children}
    </span>
  );
}
