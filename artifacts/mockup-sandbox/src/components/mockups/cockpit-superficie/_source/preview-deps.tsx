import type { ReactNode, MouseEventHandler } from "react";
import { Moon, Sun } from "lucide-react";

export type ScreenTheme = "light" | "dark";
export type Client = {
  id: number; name: string; cpf: string; phone: string; photoUrl: string | null;
  birthDate: string; email: string; address: string;
};
export const client: Client = {
  id: 1001, name: "Ana de Oliveira Exemplo", cpf: "00000000000",
  phone: "(00) 00000-0000", photoUrl: null, birthDate: "1985-06-12",
  email: "ana.exemplo@example.com", address: "Endereço demonstrativo",
};
export const BASE = "";
export function tituloProprio(text: string) { return text; }
export function useListClients(..._args: unknown[]): {
  data: Client[]; error: { status: number } | null; isError: boolean;
  isLoading: boolean; isFetching: boolean; refetch: () => Promise<void>;
} {
  return { data: [client], error: null, isError: false, isLoading: false, isFetching: false, refetch: async () => {} };
}
export function useQuery<T>(_options: {
  queryKey: unknown[]; queryFn: (context: { signal: AbortSignal }) => Promise<T>; retry: boolean;
}): { data: T; isLoading: boolean; isError: boolean; refetch: () => Promise<void> } {
  return { data: [] as unknown as T, isLoading: false, isError: false, refetch: async () => {} };
}
export function useLocation(): [string, (path: string) => void] {
  return ["/cockpit", () => {}];
}
export function Link({ children, className, onClick }: { href: string; children: ReactNode; className?: string; onClick?: MouseEventHandler<HTMLAnchorElement> }) {
  return <a href="#" className={className} onClick={event => { event.preventDefault(); onClick?.(event); }}>{children}</a>;
}
export function ThemeToggle({ theme, onToggle }: { theme: ScreenTheme; onToggle: () => void }) {
  return <button type="button" aria-label="Alternar tema ilustrativo" onClick={onToggle} className="cc-theme-preview">{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button>;
}
