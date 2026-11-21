import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";

type Sexo = "M" | "F";
interface Hist { id: number; valorAnterior: Sexo | null; valorNovo: Sexo; motivo: string; criadoEm: string }
interface Resp { sexo: Sexo | null; historico: Hist[] }

const NOME: Record<Sexo, string> = { M: "Masculino", F: "Feminino" };
const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

/** Sexo registrado ao nascimento: valor do cadastro, com correcao rastreavel (motivo obrigatorio + historico). */
export function SexoRegistradoField({ clientId }: { clientId: number }) {
  const qc = useQueryClient();
  const key = ["cliente-sexo-registrado", clientId];
  const q = useQuery<Resp>({
    queryKey: key,
    enabled: clientId > 0,
    retry: false,
    queryFn: async () => {
      const r = await fetch(`${API}/collaborator/clients/${clientId}/sexo-biologico`, { headers: collabAuthHeaders() });
      if (!r.ok) throw new Error("Não foi possível carregar o sexo registrado");
      return r.json();
    },
  });
  const [editando, setEditando] = useState(false);
  const [novo, setNovo] = useState<Sexo | null>(null);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [verHist, setVerHist] = useState(false);

  const atual = q.data?.sexo ?? null;
  const salvar = async () => {
    if (!novo) return;
    setSalvando(true);
    try {
      const r = await fetch(`${API}/collaborator/clients/${clientId}/sexo-biologico`, {
        method: "PUT",
        headers: { "content-type": "application/json", ...collabAuthHeaders() },
        body: JSON.stringify({ sexo: novo, motivo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Não foi possível salvar");
      qc.setQueryData(key, { sexo: j.sexo, historico: j.historico });
      toast.success(j.mudou ? "Sexo registrado atualizado e anotado no histórico" : "Nenhuma mudança: o valor já era esse");
      setEditando(false); setMotivo(""); setNovo(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <fieldset className="col-span-full flex flex-col gap-2" aria-describedby="sexo-registrado-ajuda">
      <legend className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Sexo registrado ao nascimento</legend>
      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
      ) : q.isError ? (
        <p className="text-sm text-destructive" role="alert">Não foi possível carregar o sexo registrado.</p>
      ) : (
        <>
          <div role="radiogroup" aria-label="Sexo registrado ao nascimento" className="flex flex-wrap gap-2">
            {(["M", "F"] as Sexo[]).map((s) => {
              const marcado = (editando ? novo : atual) === s;
              const podeEscolher = editando || atual === null;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={marcado}
                  disabled={!podeEscolher}
                  onClick={() => { if (atual === null && !editando) setEditando(true); setNovo(s); }}
                  className={`btn-3d-soft min-h-[44px] min-w-[132px] rounded-md px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring inline-flex items-center justify-center gap-2 ${marcado ? "ring-2 ring-[#c9a24e] font-bold" : "opacity-80"}`}
                >
                  {marcado && <Check className="h-4 w-4" aria-hidden />}
                  {NOME[s]}
                </button>
              );
            })}
          </div>
          <p id="sexo-registrado-ajuda" className="text-xs text-muted-foreground">
            {atual === null
              ? "Ainda não registrado. Escolha uma opção e informe a origem; o cliente também pode responder na anamnese."
              : "Valor do cadastro. Para mudar é preciso informar o motivo; o valor anterior fica no histórico."}
          </p>
          {atual !== null && !editando && (
            <button type="button" onClick={() => { setEditando(true); setNovo(atual); }} className="self-start text-xs font-semibold underline underline-offset-2">
              Corrigir
            </button>
          )}
          {editando && (
            <div className="flex flex-col gap-2">
              <label htmlFor="sexo-motivo" className="text-xs font-semibold">Motivo {atual === null ? "do registro" : "da correção"} (obrigatório)</label>
              <textarea
                id="sexo-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={500}
                className="field-engraved w-full rounded-md p-2 text-sm" placeholder="Ex.: conferido no documento do cliente"
              />
              <div className="flex gap-2">
                <button type="button" onClick={salvar} disabled={salvando || !novo || motivo.trim().length < 5 || novo === atual}
                  className="btn-3d min-h-[40px] rounded-md px-4 text-sm font-semibold disabled:opacity-50">
                  {salvando ? "Salvando…" : "Salvar"}
                </button>
                <button type="button" onClick={() => { setEditando(false); setMotivo(""); setNovo(null); }} className="btn-3d-soft min-h-[40px] rounded-md px-4 text-sm">
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {(q.data?.historico.length ?? 0) > 0 && (
            <div>
              <button type="button" aria-expanded={verHist} onClick={() => setVerHist((v) => !v)} className="text-xs font-semibold underline underline-offset-2">
                {verHist ? "Ocultar histórico" : `Ver histórico (${q.data!.historico.length})`}
              </button>
              {verHist && (
                <ul className="mt-1 flex flex-col gap-1 text-xs">
                  {q.data!.historico.map((h) => (
                    <li key={h.id} className="rounded-md bg-muted/40 p-2">
                      {new Date(h.criadoEm).toLocaleString("pt-BR")}: {h.valorAnterior ? NOME[h.valorAnterior] : "vazio"} para {NOME[h.valorNovo]}. Motivo: {h.motivo}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
