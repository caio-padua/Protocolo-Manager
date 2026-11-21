import { useState, type ReactNode, type InputHTMLAttributes, type ChangeEvent } from "react";
import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Valor } from "@/components/numeral/Numeral";

/** Ajuda em português simples. Popover abre com toque e com clique (tooltip só de hover não funciona no celular). */
export function Ajuda({ texto, rotulo = "Ajuda" }: { texto: string; rotulo?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`${rotulo}: ${texto.slice(0, 40)}`} className="inline-flex h-11 w-11 -m-3 items-center justify-center rounded-full text-muted-foreground hover:text-foreground md:h-6 md:w-6 md:m-0">
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-[12px] leading-snug" side="top">{texto}</PopoverContent>
    </Popover>
  );
}

export function Campo({ rotulo, ajuda, children }: { rotulo: string; ajuda: string; children: ReactNode }) {
  return (
    <div className="block text-[12px]">
      <span className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{rotulo}<Ajuda texto={ajuda} rotulo={rotulo} /></span>
      {children}
    </div>
  );
}
export const campoCls = "field-engraved w-full min-h-[44px] px-2 text-[13px] md:min-h-[36px]";
export const btnCls = "btn-3d-gold min-h-[44px] rounded-md px-3 text-[12px] font-bold uppercase md:min-h-[36px]";
export const btnSoftCls = "bevel-3d min-h-[44px] rounded-md px-3 text-[12px] font-bold uppercase disabled:opacity-40 md:min-h-[36px]";

/** Indicador: rótulo + valor (Numeral) + ajuda. `valor` em centavos. */
export function Indicador({ rotulo, ajuda, centavos, texto, destaque, nota }: { rotulo: string; ajuda: string; centavos?: number | null; texto?: ReactNode; destaque?: boolean; nota?: string }) {
  return (
    <div className="panel-3d-sub p-3" data-testid={`ind-${rotulo.toLowerCase().replace(/\W+/g, "-")}`}>
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{rotulo}<Ajuda texto={ajuda} rotulo={rotulo} /></div>
      <div className={destaque ? "mt-1 text-[22px]" : "mt-1 text-[18px]"}>{texto ?? <Valor valor={centavos == null ? null : centavos / 100} />}</div>
      {nota && <div className="mt-1 text-[11px] text-muted-foreground">{nota}</div>}
    </div>
  );
}

/** Texto "Não informado" explícito: campo vazio nunca fica sem rótulo. */
export const Dado = ({ v, vazio = "Não informado" }: { v: ReactNode; vazio?: string }) =>
  v === null || v === undefined || v === "" ? <span className="text-muted-foreground italic">{vazio}</span> : <>{v}</>;

export function useErro() { const [erro, setErro] = useState(""); return { erro, setErro }; }
export const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const rotuloMes = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
export const reaisParaCentavos = (t: string): number | null => { const s = t.replace(/\./g, "").replace(/[^\d,]/g, "").replace(",", "."); return s ? Math.round(Number(s) * 100) : null; };

/** Máscara de reais estilo caixa: digita só números, o campo vira 1.234,56 sozinho. */
export const mascaraReais = (t: string): string => {
  const d = t.replace(/\D/g, "").replace(/^0+/, "");
  if (!d) return "";
  const c = d.padStart(3, "0"); const inteiro = c.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${inteiro},${c.slice(-2)}`;
};
const exibeReais = (t: string) => (t === "" || t.includes(",") ? mascaraReais(t) : mascaraReais(`${t.replace(/\D/g, "")}00`));
export function InputReais(props: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void }) {
  const { value, onChange, ...rest } = props;
  return <input {...rest} inputMode="numeric" value={exibeReais(value)} onChange={(e) => { e.target.value = mascaraReais(e.target.value); onChange(e); }} />;
}

/** "1.234,56" -> 1234.56 (NaN se vazio). Usar no lugar de parseFloat(texto.replace(",", ".")), que erra com ponto de milhar. */
export const reaisDeTexto = (t: string): number => { const s = t.replace(/\./g, "").replace(",", "."); return s.trim() === "" ? NaN : Number(s); };
/** 1234.5 -> "1.234,50" */
export const textoDeReais = (n: number): string => mascaraReais(String(Math.round(n * 100)));
