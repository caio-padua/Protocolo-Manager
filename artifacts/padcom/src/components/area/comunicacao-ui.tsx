import { useCallback, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Pecas visuais da aba COMUNICACAO da Area do Cliente.
 * Regra de grade (TOC/TDAH): todo passo tem a MESMA altura, todo botao tem a MESMA altura,
 * numero sempre na 1a coluna, acao sempre embaixo, na largura total.
 */

/** Copia texto. Cai para execCommand quando o navegador (ou iframe) bloqueia a area de transferencia. */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch { /* tenta o plano B */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = texto;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

export function BotaoCopiar({ texto, rotulo, testId }: { texto: string; rotulo: string; testId?: string }) {
  const [estado, setEstado] = useState<"idle" | "ok" | "erro">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clicar = useCallback(async () => {
    const ok = await copiarTexto(texto);
    setEstado(ok ? "ok" : "erro");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setEstado("idle"), 2200);
  }, [texto]);
  return (
    <button type="button" onClick={clicar} data-testid={testId} data-copiado={estado === "ok" ? "1" : "0"}
      className={`comm-btn ${estado === "ok" ? "comm-btn-ok" : "btn-3d-soft"}`} aria-live="polite">
      {estado === "ok" ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      <span>{estado === "ok" ? "Copiado" : estado === "erro" ? "Não copiou. Toque e segure" : rotulo}</span>
    </button>
  );
}

export type EstadoPasso = "feito" | "agora" | "espera";

/** Um passo: numero (ou check) na 1a coluna, texto na 2a. Altura fixa = tudo alinhado. */
export function Passo({ n, estado, titulo, dica }: { n: number; estado: EstadoPasso; titulo: ReactNode; dica?: string }) {
  return (
    <li className={`comm-passo comm-passo-${estado}`} data-estado={estado}>
      <span className="comm-passo-num concave-3d" aria-hidden>
        {estado === "feito" ? <Check className="h-4 w-4" /> : n}
      </span>
      <span className="comm-passo-txt">
        <span className="comm-passo-titulo">{titulo}</span>
        {dica && <span className="comm-passo-dica">{dica}</span>}
      </span>
    </li>
  );
}

export type Cor = "verde" | "ambar" | "cinza";

/** Etiqueta de status com LED, sempre do mesmo tamanho. */
export function Etiqueta({ cor, children }: { cor: Cor; children: ReactNode }) {
  const led = cor === "verde" ? "paxter-led paxter-led-green" : cor === "ambar" ? "paxter-led paxter-led-amber paxter-led-breathe" : "paxter-led paxter-led-off";
  return (
    <span className="comm-etiqueta">
      <span className={led} aria-hidden />
      <span>{children}</span>
    </span>
  );
}

export interface Ladrilho {
  key: string;
  n: number;
  icone: ReactNode;
  nome: string;
  etiqueta: ReactNode;
}

/** Quatro ladrilhos IGUAIS; o selecionado ganha neon dourado e fica afundado. */
export function Ladrilhos({ itens, ativo, onPick }: { itens: Ladrilho[]; ativo: string; onPick: (k: string) => void }) {
  return (
    <div className="comm-grade" role="tablist" aria-label="Canais de comunicação">
      {itens.map((it) => {
        const sel = it.key === ativo;
        return (
          <button key={it.key} type="button" role="tab" aria-selected={sel} data-testid={`comm-ladrilho-${it.key}`}
            onClick={() => onPick(it.key)}
            className={`comm-ladrilho ${sel ? "comm-ladrilho-sel concave-3d" : "bevel-3d"}`}>
            <span className="comm-ladrilho-n">{it.n}</span>
            <span className="comm-ladrilho-ico" aria-hidden>{it.icone}</span>
            <span className="comm-ladrilho-nome">{it.nome}</span>
            <span className="comm-ladrilho-etq">{it.etiqueta}</span>
          </button>
        );
      })}
    </div>
  );
}
