import { useEffect, useRef, useState } from "react";
import { collabAuthHeaders } from "@/lib/collab-auth";

/** Quadro de símbolo ou logo da empresa da sessão (somente a própria empresa). Logo aceita troca por quem tem permissão. */
export function MarcaEmpresaQuadro({ tipo, rotulo, podeTrocar }: { tipo: "simbolo" | "logo"; rotulo: string; podeTrocar: boolean }) {
  const base = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/empresa-marca/${tipo}`;
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [versao, setVersao] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let atual: string | null = null;
    let cancelado = false;
    fetch(base, { headers: collabAuthHeaders() })
      .then(async (r) => (r.ok ? r.blob() : null))
      .then((b) => { if (!cancelado) { atual = b ? URL.createObjectURL(b) : null; setUrl(atual); } })
      .catch(() => { if (!cancelado) setUrl(null); });
    return () => { cancelado = true; if (atual) URL.revokeObjectURL(atual); };
  }, [base, versao]);

  async function enviar(f: File | undefined) {
    if (!f) return;
    setErro("");
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch(base, { method: "PUT", headers: collabAuthHeaders(), body: fd });
    if (!r.ok) { setErro(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Não foi possível enviar."); return; }
    setVersao((v) => v + 1);
  }

  return (
    <div className="concave-3d rounded-[6px] p-3 min-h-[64px] flex flex-col justify-center gap-1">
      <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">{rotulo}</span>
      {url
        ? <img src={url} alt={rotulo} className="max-h-16 max-w-full object-contain" data-testid={`canal-clinica-${tipo}-img`} />
        : <span className="text-xs text-muted-foreground" data-testid={`canal-clinica-${tipo}`}>{rotulo} não cadastrado na empresa</span>}
      {tipo === "logo" && podeTrocar && (
        <>
          <input ref={input} type="file" accept="image/png" className="hidden" data-testid="canal-clinica-logo-arquivo" onChange={(e) => enviar(e.target.files?.[0])} />
          <button type="button" className="btn-3d-soft self-start rounded-[4px] px-2 py-1 text-[10px] font-extrabold uppercase" onClick={() => input.current?.click()}>
            {url ? "Trocar logo (PNG)" : "Enviar logo (PNG)"}
          </button>
        </>
      )}
      {erro && <span role="alert" className="text-xs font-semibold text-red-700 dark:text-red-300">{erro}</span>}
    </div>
  );
}
