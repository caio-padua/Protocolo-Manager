/**
 * PaxterClientSelector — tipos públicos compartilhados entre os módulos.
 */

export interface PaxterClientOption {
  id: number;
  name: string;
  cpf?: string | null;
  phone?: string | null;
  /** URL da foto do cliente (object-storage). Exibida como mini-avatar no trigger e na lista. */
  photoUrl?: string | null;
  status?: string | null;
  deletedAt?: string | null;
}

export interface PaxterClientSelectorProps {
  /** Lista local de clientes (modo client-side). Omita ao usar serverSearch. */
  clientes?: PaxterClientOption[];

  /** Quando true, busca via GET /api/clients?search=...&limit=20 (debounce 300ms, mín. 2 chars). */
  serverSearch?: boolean;

  /** ID do cliente selecionado (controlado pelo pai). */
  value: number | null;

  /** Chamado com o novo ID ao selecionar, ou null ao limpar. */
  onChange: (id: number | null) => void;

  /**
   * "popover" (padrão) — trigger button + popover com barra A–Z.
   * "search" — input sempre visível + dropdown (para cabeçalhos compactos).
   */
  variant?: "popover" | "search";

  /** Texto exibido quando nenhum cliente está selecionado. */
  placeholder?: string;

  /**
   * Se fornecido, exibe uma primeira opção com esse texto que define value=null.
   * Útil para telas de filtro ("Todos os clientes").
   */
  allOptionLabel?: string;

  /** Desabilita o seletor. */
  disabled?: boolean;

  /** Classe CSS extra para o elemento raiz. */
  className?: string;
}
