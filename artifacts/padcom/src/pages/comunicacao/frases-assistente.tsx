/**
 * Frases do assistente de agendamento no Telegram. O texto mora no banco (tabela telegram_frases);
 * esta tela lista, valida variáveis e grava. Só o CEO grava.
 */
import { useEffect, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { BASE } from "./_shared";
import { getCollabToken } from "@/lib/collab-auth";

interface Frase { chave: string; grupo: string; descricao: string; variaveis: string[]; obrigatorias: string[]; texto: string; padrao: string }

const auth = (): Record<string, string> => { const t = getCollabToken(); return t ? { Authorization: `Bearer ${t}` } : {}; };

export function FrasesAssistente() {
  const [frases, setFrases] = useState<Frase[] | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/telegram-inbox/frases`, { headers: auth() })
      .then(async (r) => { if (!r.ok) throw new Error("Sem acesso às frases."); const j = await r.json() as { frases: Frase[] }; setFrases(j.frases); setRascunho(Object.fromEntries(j.frases.map((f) => [f.chave, f.texto]))); })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Não foi possível carregar."));
  }, []);

  const salvar = async (f: Frase, texto: string) => {
    setAviso((a) => ({ ...a, [f.chave]: "Gravando…" }));
    const r = await fetch(`${BASE}/api/telegram-inbox/frases/${f.chave}`, { method: "PUT", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ texto }) });
    const j = await r.json().catch(() => ({})) as { error?: string };
    if (r.ok) setFrases((l) => l?.map((x) => (x.chave === f.chave ? { ...x, texto } : x)) ?? l);
    setAviso((a) => ({ ...a, [f.chave]: r.ok ? "Gravada." : r.status === 403 ? "Somente o CEO pode gravar." : (j.error ?? "Não gravou.") }));
  };

  const grupos = [...new Set(frases?.map((f) => f.grupo) ?? [])];
  return (
    <section className="panel-3d overflow-hidden" data-testid="frases-assistente">
      <div className="bevel-3d flex items-center gap-3 px-5 py-3" style={{ borderLeft: "4px solid #b8924d" }}>
        <MessageSquareText className="h-5 w-5 text-[#b8924d]" />
        <div>
          <p className="text-[13px] font-bold uppercase tracking-wide">Frases do assistente de agendamento</p>
          <p className="text-[10px] text-muted-foreground">Texto cadastrado no banco. Use as variáveis entre chaves, como {"{nome1}"} e {"{lista}"}.</p>
        </div>
      </div>
      <div className="space-y-5 p-5">
        {erro && <p role="alert" className="concave-3d p-3 text-[12px] text-rose-700">{erro}</p>}
        {grupos.map((g) => (
          <div key={g} className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#b8924d]">{g}</p>
            {frases!.filter((f) => f.grupo === g).map((f) => (
              <div key={f.chave} className="concave-3d space-y-2 p-3">
                <p className="text-[12px] font-semibold">{f.descricao}</p>
                <textarea className="w-full min-h-[84px] rounded-md border border-border bg-background p-2 text-[13px]" value={rascunho[f.chave] ?? ""} onChange={(e) => setRascunho((r) => ({ ...r, [f.chave]: e.target.value }))} aria-label={f.descricao} />
                <p className="text-[10px] text-muted-foreground">Variáveis: {f.variaveis.length ? f.variaveis.map((v) => `{${v}}${f.obrigatorias.includes(v) ? " (obrigatória)" : ""}`).join(", ") : "nenhuma"}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="bevel-3d min-h-11 px-4 text-[12px] font-bold uppercase" disabled={rascunho[f.chave] === f.texto} onClick={() => void salvar(f, rascunho[f.chave] ?? "")}>Gravar</button>
                  <button type="button" className="bevel-3d min-h-11 px-4 text-[12px] font-bold uppercase" onClick={() => setRascunho((r) => ({ ...r, [f.chave]: f.padrao }))}>Voltar ao texto original</button>
                  {aviso[f.chave] && <span role="status" className="text-[12px]">{aviso[f.chave]}</span>}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
