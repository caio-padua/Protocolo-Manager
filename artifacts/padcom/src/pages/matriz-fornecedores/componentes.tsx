import { useEffect, useRef, useState } from "react";
import { Percentual, Valor } from "@/components/numeral/Numeral";

/** Dinheiro em centavos, sempre pelo mostrador oficial (Lei do Numeral). */
export function V({ c, peso = 700, className = "mx-money" }: { c: number | null | undefined; peso?: number; className?: string }) {
  return <Valor valor={c == null ? null : c / 100} peso={peso} className={className} />;
}
export function P({ v, peso = 700, className = "mx-money" }: { v: number | null | undefined; peso?: number; className?: string }) {
  return <Percentual valor={v} peso={peso} className={className} />;
}

/** Texto puro (área de transferência, dicas): mesma formatação brasileira. */
export const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const pctTxt = (x: number) => `${x.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
export const sinal = (x: number) => `${x >= 0 ? "+" : "−"}${pctTxt(Math.abs(x))}`;
export const qtdTxt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const fmtIn = (n: number) => String(n).replace(".", ",");

/** Campo numérico com vírgula decimal; guarda o texto digitado e normaliza ao sair do campo. */
export function NumField({ value, onChange, max = 95, label, w = 64 }: { value: number; onChange: (n: number) => void; max?: number; label: string; w?: number }) {
  const [txt, setTxt] = useState(fmtIn(value));
  const foco = useRef(false);
  useEffect(() => { if (!foco.current) setTxt(fmtIn(value)); }, [value]);
  return (
    <input className="mx-num" style={{ width: w }} value={txt} inputMode="decimal" aria-label={label}
      onFocus={(e) => { foco.current = true; e.currentTarget.select(); }}
      onBlur={() => { foco.current = false; setTxt(fmtIn(value)); }}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d,.]/g, "");
        setTxt(t);
        const n = parseFloat(t.replace(",", "."));
        onChange(Number.isNaN(n) ? 0 : Math.min(max, Math.max(0, Math.round(n * 10) / 10)));
      }} />
  );
}
