/** Tom de voz da assistente: guia de estilo editável por clínica, com rascunho e aprovação médica. */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Save, Sparkles } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { BASE, BlockTitle } from "./_shared";
import { PreviaTelegram } from "./orientacao-previa";

/** Proposta inicial. É EXEMPLO: só entra no campo para edição; nada é salvo ou aprovado sozinho. */
export const TOM_EXEMPLO = [
  "Elegante, acolhedor e empático, formal na medida certa, prestativo e discreto.",
  "",
  "Frases curtas. Uma ideia por parágrafo, com linha em branco entre eles.",
  "",
  "Pontuação correta. Uma pergunta por vez.",
  "",
  "No máximo um emoji discreto por conversa.",
  "",
  "A assistente se apresenta como virtual, com o nome da clínica e sem nome próprio inventado.",
  "",
  "Nunca afirmar encaminhamento, prazo ou envio sem confirmação efetiva do sistema.",
  "",
  "Horários só os que vierem da agenda.",
].join("\n");

type Tom = { texto: string; status: "rascunho" | "aprovada"; aprovadoEm: string | null; atualizadoEm: string } | null;

async function chamar<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(collabAuthHeaders());
  new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  const r = await fetch(`${BASE}/api${path}`, { ...init, headers });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `Falha (${r.status}).`);
  return (await r.json()) as T;
}

export function TomDeVoz() {
  const [tom, setTom] = useState<Tom>(null);
  const [limite, setLimite] = useState(4000);
  const [podeAprovar, setPodeAprovar] = useState(false);
  const [texto, setTexto] = useState("");
  const [clinica, setClinica] = useState<string | null>(null);
  const [carregado, setCarregado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const d = await chamar<{ tom: Tom; podeAprovar: boolean; limite: number; clinica?: string | null }>("/duvidas-orientacoes/tom-de-voz");
      setTom(d.tom); setPodeAprovar(d.podeAprovar); setLimite(d.limite); setClinica(d.clinica ?? null); setTexto(d.tom?.texto ?? "");
      setCarregado(true);
    } catch (e) { setMsg({ ok: false, t: e instanceof Error ? e.message : "Não foi possível carregar o tom de voz." }); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  async function salvar() {
    setOcupado(true); setMsg(null);
    try {
      const r = await chamar<{ status: string }>("/duvidas-orientacoes/tom-de-voz", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
      await carregar();
      setMsg({ ok: true, t: `Tom de voz salvo. Estado: ${r.status}.` });
    } catch (e) { setMsg({ ok: false, t: e instanceof Error ? e.message : "Não foi possível salvar." }); }
    finally { setOcupado(false); }
  }
  async function aprovar() {
    setOcupado(true); setMsg(null);
    try {
      await chamar("/duvidas-orientacoes/tom-de-voz/aprovar", { method: "POST" });
      await carregar();
      setMsg({ ok: true, t: "Tom de voz aprovado." });
    } catch (e) { setMsg({ ok: false, t: e instanceof Error ? e.message : "Não foi possível aprovar." }); }
    finally { setOcupado(false); }
  }

  const alterado = (tom?.texto ?? "") !== texto;
  return (
    <section className="panel-3d p-4 sm:p-5" aria-label="Tom de voz da assistente" data-testid="tom-de-voz">
      <BlockTitle icon={Sparkles}>Tom de voz da assistente</BlockTitle>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        Guia de estilo da clínica para quem escreve os textos. A assistente continua usando só orientações aprovadas, palavra por palavra; este guia ainda não escreve nada sozinho.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="tom-texto" className="lbl">Guia de tom de voz</label>
            <span className="concave-3d px-2 py-1 text-[10px] font-bold uppercase tracking-wide" data-testid="tom-status">{tom ? (tom.status === "aprovada" ? "Aprovado" : "Rascunho") : "Ainda não salvo"}</span>
          </div>
          <textarea id="tom-texto" data-testid="tom-field" value={texto} onChange={(e) => { setTexto(e.target.value); setMsg(null); }} maxLength={limite} rows={12}
            disabled={!carregado} className="field-engraved w-full rounded-[4px] border px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-primary/40" style={{ whiteSpace: "pre-wrap" }} />
          <p className="mt-1 text-right text-[10px] text-muted-foreground">{texto.length}/{limite}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" data-testid="tom-exemplo" onClick={() => setTexto(TOM_EXEMPLO)} className="btn-3d-soft px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide">Carregar exemplo (editável)</button>
            <button type="button" data-testid="tom-salvar" onClick={() => void salvar()} disabled={ocupado || texto.trim().length < 10} className="btn-3d inline-flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide disabled:opacity-50"><Save className="h-3.5 w-3.5" />Salvar rascunho</button>
            {podeAprovar && tom?.status === "rascunho" && !alterado && (
              <button type="button" data-testid="tom-aprovar" onClick={() => void aprovar()} disabled={ocupado} className="btn-3d inline-flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" />Aprovar</button>
            )}
          </div>
          {!podeAprovar && <p className="mt-1 text-[10px] text-muted-foreground">A aprovação é restrita a profissionais médicos.</p>}
          {msg && <p role={msg.ok ? "status" : "alert"} data-testid="tom-msg" className={`mt-2 text-xs ${msg.ok ? "text-emerald-800 dark:text-emerald-300" : "text-rose-700 dark:text-rose-400"}`}>{msg.t}</p>}
        </div>
        <PreviaTelegram texto={texto} clinica={clinica} />
      </div>
    </section>
  );
}
