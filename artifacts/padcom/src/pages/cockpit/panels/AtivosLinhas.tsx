/**
 * Ativos de uma fórmula em linhas horizontais: [Nome] [Dose] [Unidade] [Remover].
 * O dado continua sendo o texto de ativos (uma linha por ativo); cada edição reescreve só o trecho alterado.
 * Linhas em branco (separadores) ficam preservadas e não aparecem.
 */
import { Plus, X } from "lucide-react";
import { UNIDADES_ATIVO, alterarAtivo, lerPartesAtivo } from "@/lib/ativos-linhas";

const campo =
  "concave-3d !rounded-[2px] bg-transparent px-2 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#c2a05a]/40";

export default function AtivosLinhas({ formulaId, valor, onChange }: {
  formulaId: string; valor: string; onChange: (novo: string) => void;
}) {
  const linhas = valor.split("\n");
  const gravar = (i: number, nova: string) => onChange(linhas.map((l, k) => (k === i ? nova : l)).join("\n"));
  const remover = (i: number) => onChange(linhas.filter((_, k) => k !== i).join("\n"));
  const adicionar = () => { if (valor.trim() && linhas[linhas.length - 1].trim()) onChange(`${valor}\n`); };
  return (
    <div className="space-y-1.5" data-testid={`ativos-${formulaId}`}>
      {linhas.map((linha, i) => {
        // Linhas em branco do meio são separadores preservados; só a última linha vazia vira campo para digitar.
        if (!linha.trim() && i !== linhas.length - 1) return null;
        const p = lerPartesAtivo(linha);
        const unidades = p.unidade && !(UNIDADES_ATIVO as readonly string[]).includes(p.unidade) ? [p.unidade, ...UNIDADES_ATIVO] : UNIDADES_ATIVO;
        return (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_96px_84px_28px] items-center gap-1.5 sm:grid-cols-[minmax(0,1fr)_120px_96px_28px]">
            <input
              aria-label="Nome do ativo" data-ativos-id={formulaId} value={p.nome}
              onChange={(e) => gravar(i, alterarAtivo(linha, "nome", e.target.value))}
              className={`${campo} min-w-0`}
            />
            <input
              aria-label="Dose" inputMode="decimal" disabled={p.dose === null} placeholder={p.dose === null ? "—" : ""}
              value={p.dose ?? ""} onChange={(e) => gravar(i, alterarAtivo(linha, "dose", e.target.value))}
              className={`${campo} text-center font-mono disabled:opacity-40`}
            />
            <select
              aria-label="Unidade" disabled={p.unidade === null} value={p.unidade ?? ""}
              onChange={(e) => gravar(i, alterarAtivo(linha, "unidade", e.target.value))}
              className={`${campo} disabled:opacity-40`}
            >
              {p.unidade === null && <option value="">—</option>}
              {unidades.map((u) => <option key={u} value={u} className="bg-background text-foreground">{u}</option>)}
            </select>
            <button type="button" onClick={() => remover(i)} aria-label={`Remover ${p.nome || "linha"}`} className="flex justify-center text-destructive hover:opacity-80">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
      <button type="button" onClick={adicionar} className="flex items-center gap-1 text-xs font-semibold" style={{ color: "#c2a05a" }}>
        <Plus className="h-3.5 w-3.5" /> Ativo
      </button>
    </div>
  );
}
