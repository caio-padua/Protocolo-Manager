/**
 * Agrupa mensagens seguidas da mesma conversa: cada nova mensagem reinicia a
 * espera (padrão 4 s). Um teto evita adiar para sempre quem escreve sem parar.
 * Estado só em memória; a recuperação após reinício é feita por varredura no banco.
 */
export interface Agrupador {
  agendar(chave: string, esperaMs?: number): void;
  pendentes(): number;
  cancelarTodos(): void;
}

export const ESPERA_AGRUPAMENTO_MS = 4000;
export const TETO_AGRUPAMENTO_MS = 12000;

export function criarAgrupador(
  aoDisparar: (chave: string) => Promise<void>,
  opcoes: { esperaMs?: number; tetoMs?: number; agora?: () => number } = {},
): Agrupador {
  const espera = opcoes.esperaMs ?? ESPERA_AGRUPAMENTO_MS;
  const teto = opcoes.tetoMs ?? TETO_AGRUPAMENTO_MS;
  const agora = opcoes.agora ?? Date.now;
  const fila = new Map<string, { timer: NodeJS.Timeout; inicio: number }>();
  return {
    agendar(chave, esperaMs) {
      const atual = fila.get(chave);
      const inicio = atual?.inicio ?? agora();
      if (atual) clearTimeout(atual.timer);
      const restante = Math.max(0, teto - (agora() - inicio));
      const ms = Math.min(esperaMs ?? espera, restante);
      const timer = setTimeout(() => {
        fila.delete(chave);
        void aoDisparar(chave).catch(() => undefined);
      }, ms);
      timer.unref?.();
      fila.set(chave, { timer, inicio });
    },
    pendentes: () => fila.size,
    cancelarTodos() { for (const v of fila.values()) clearTimeout(v.timer); fila.clear(); },
  };
}
