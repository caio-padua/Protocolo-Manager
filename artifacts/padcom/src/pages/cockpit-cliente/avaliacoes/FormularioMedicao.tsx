import { useMemo, useState } from "react";
import { AVALIACOES, calculaDerivados, interpretaQuociente } from "@workspace/avaliacoes-corporais";
import type { Campo, TipoAvaliacao, ValoresAvaliacao } from "@workspace/avaliacoes-corporais";
import { Loader2, Save, History } from "lucide-react";
import { useSalvarMedicao, numeroBr } from "./api";
import type { Medicao } from "./api";

const hojeBrt = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

function lerNumero(txt: string): number | null {
  const t = txt.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function FormularioMedicao({ clientId, tipo, ultima, aoSalvar }: {
  clientId: number; tipo: TipoAvaliacao; ultima: Medicao | null; aoSalvar: () => void;
}) {
  const def = AVALIACOES[tipo];
  const salvar = useSalvarMedicao(clientId);
  const [data, setData] = useState(hojeBrt());
  const [txt, setTxt] = useState<Record<string, string>>({});
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const grupos = useMemo(() => {
    const m = new Map<string, Campo[]>();
    for (const c of def.campos) m.set(c.grupo, [...(m.get(c.grupo) ?? []), c]);
    return [...m.entries()];
  }, [def]);

  const parcial = useMemo(() => {
    const v: ValoresAvaliacao = {};
    for (const c of def.campos) {
      const t = txt[c.key] ?? "";
      if (c.kind === "number") { const n = lerNumero(t); if (n !== null && !Number.isNaN(n)) v[c.key] = n; }
      else if (t) v[c.key] = t;
    }
    return v;
  }, [txt, def]);
  const derivados = useMemo(() => calculaDerivados(tipo, parcial), [tipo, parcial]);

  const copiarUltima = () => {
    if (!ultima) return;
    const novo: Record<string, string> = {};
    for (const [k, v] of Object.entries(ultima.valores)) novo[k] = String(v).replace(".", ",");
    setTxt(novo);
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const valores: ValoresAvaliacao = {};
    for (const c of def.campos) {
      const t = (txt[c.key] ?? "").trim();
      if (!t) continue;
      if (c.kind === "number") {
        const n = lerNumero(t);
        if (n === null || Number.isNaN(n)) { setErro(`${c.label}: informe um número.`); return; }
        if (n < c.min || n > c.max) { setErro(`${c.label}: o valor deve ficar entre ${c.min} e ${c.max} ${c.unit}.`); return; }
        valores[c.key] = n;
      } else valores[c.key] = t;
    }
    if (!Object.keys(valores).length) { setErro("Preencha ao menos um campo."); return; }
    try {
      await salvar.mutateAsync({ tipo, data, valores, observacoes: obs });
      aoSalvar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  };

  const entrada = "field-engraved w-full rounded-[4px] px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/50";

  return (
    <form onSubmit={enviar} className="space-y-5" noValidate>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Data da medição</span>
          <input type="date" value={data} max={hojeBrt()} onChange={(e) => setData(e.target.value)}
            className={`${entrada} mt-1 w-44`} required />
        </label>
        {ultima && (
          <button type="button" onClick={copiarUltima} className="btn-3d-soft inline-flex items-center gap-2 px-3 py-2 text-[10px] font-extrabold uppercase tracking-widest">
            <History className="h-3.5 w-3.5" /> Partir da última medição
          </button>
        )}
      </div>

      {grupos.map(([grupo, campos]) => (
        <fieldset key={grupo} className="panel-3d-sub relative overflow-visible p-4 pt-6">
          <legend className="bevel-3d absolute -top-3 left-4 px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest">{grupo}</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {campos.map((c) => (
              <label key={c.key} className="block min-w-0">
                <span className="block truncate text-[11px] font-bold text-muted-foreground" title={c.label}>{c.label}</span>
                {c.kind === "number" ? (
                  <span className="relative mt-1 block">
                    <input inputMode="decimal" autoComplete="off" value={txt[c.key] ?? ""}
                      onChange={(e) => setTxt((t) => ({ ...t, [c.key]: e.target.value }))}
                      className={`${entrada} pr-16`} aria-label={`${c.label} em ${c.unit}`} />
                    <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[10px] font-extrabold text-muted-foreground/70">{c.unit}</span>
                  </span>
                ) : (
                  <select value={txt[c.key] ?? ""} onChange={(e) => setTxt((t) => ({ ...t, [c.key]: e.target.value }))} className={`${entrada} mt-1`}>
                    <option value="">Não avaliado</option>
                    {c.opcoes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      {def.derivados.length > 0 && (
        <div className="panel-3d-sub p-4" aria-live="polite">
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Calculado na hora</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {def.derivados.map((d) => (
              <div key={d.key} className="concave-3d px-3 py-2">
                <p className="truncate text-[10px] font-bold text-muted-foreground" title={d.label}>{d.label}</p>
                <p className="text-lg font-black text-foreground">
                  {derivados[d.key] === undefined ? "—" : numeroBr(derivados[d.key], d.casas)}
                  {derivados[d.key] !== undefined && d.unit && <span className="ml-1 text-[10px] font-bold text-muted-foreground">{d.unit}</span>}
                </p>
              </div>
            ))}
          </div>
          {tipo === "calorimetria" && interpretaQuociente(derivados.qr ?? null) && (
            <p className="mt-2 text-xs font-semibold text-foreground">{interpretaQuociente(derivados.qr ?? null)}</p>
          )}
        </div>
      )}

      <label className="block">
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Observações (aparelho, condições, interpretação)</span>
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} maxLength={1000} rows={3}
          className={`${entrada} mt-1 resize-y`} />
      </label>

      {erro && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{erro}</p>}

      <div className="flex justify-end">
        <button type="submit" disabled={salvar.isPending} className="btn-3d inline-flex items-center gap-2 px-6 py-2.5 text-xs font-extrabold uppercase tracking-widest">
          {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar medição
        </button>
      </div>
    </form>
  );
}
