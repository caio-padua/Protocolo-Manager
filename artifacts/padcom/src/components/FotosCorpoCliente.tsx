import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle, ChevronDown, ChevronUp, Loader2, AlertCircle, ImagePlus } from "lucide-react";
import { ImagemAutenticada, Silhueta, dataBr, type AnguloChave, type AnguloInfo, type SerieFotos } from "./fotos-corpo/shared";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const LADO_MAXIMO = 1600;

type Orientacao = { titulo: string; itens: string[] };
type Dados = { hoje: string; angulos: AnguloInfo[]; orientacoes: Orientacao[]; series: SerieFotos[] };

/** Reduz a foto no proprio aparelho (lado maior 1600 px, JPEG): envio rapido e sem estourar o limite do servidor. */
async function reduzir(arquivo: File): Promise<Blob> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error("Não foi possível abrir esta foto. Use uma foto JPEG tirada pelo celular."));
      i.src = url;
    });
    const f = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * f); c.height = Math.round(img.naturalHeight * f);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error("Falha ao preparar a foto."))), "image/jpeg", 0.9));
  } finally { URL.revokeObjectURL(url); }
}

export default function FotosCorpoCliente({ token }: { token: string }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [guiaAberto, setGuiaAberto] = useState(false);
  const [data, setData] = useState("");
  const [consentimento, setConsentimento] = useState(false);
  const [escolhidas, setEscolhidas] = useState<Partial<Record<AnguloChave, File>>>({});
  const [previas, setPrevias] = useState<Partial<Record<AnguloChave, string>>>({});
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const headers = { Authorization: `Bearer ${token}` };

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/area-paciente/fotos-corpo`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(r.status === 401 ? "Sessão expirada. Entre novamente." : "Erro ao carregar as fotos.");
      const d = (await r.json()) as Dados;
      setDados(d); setErro("");
      setData((atual) => atual || d.hoje);
    } catch (e) { setErro((e as Error).message); }
    finally { setCarregando(false); }
  }, [token]);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => () => { Object.values(previas).forEach((u) => u && URL.revokeObjectURL(u)); }, [previas]);

  const escolher = (a: AnguloChave, f: File | undefined) => {
    if (!f) return;
    setResultado(null);
    setEscolhidas((p) => ({ ...p, [a]: f }));
    setPrevias((p) => { if (p[a]) URL.revokeObjectURL(p[a]!); return { ...p, [a]: URL.createObjectURL(f) }; });
  };

  const enviar = async () => {
    if (!dados) return;
    const fila = dados.angulos.filter((a) => escolhidas[a.chave]);
    if (!fila.length) { setResultado({ ok: false, texto: "Escolha ao menos uma foto." }); return; }
    if (!consentimento) { setResultado({ ok: false, texto: "Marque a autorização para guardar as suas fotos." }); return; }
    if (!data || data > dados.hoje) { setResultado({ ok: false, texto: "Escolha uma data que não seja futura." }); return; }
    setEnviando(true); setResultado(null);
    const falhas: string[] = []; const enviadas: AnguloChave[] = [];
    for (const a of fila) {
      try {
        const blob = await reduzir(escolhidas[a.chave]!);
        const fd = new FormData();
        fd.set("angulo", a.chave); fd.set("data", data); fd.set("consentimento", "true");
        fd.set("file", blob, `${a.chave}.jpg`);
        const r = await fetch(`${API_BASE}/api/area-paciente/fotos-corpo`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
        if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || "Falha no envio.");
        enviadas.push(a.chave);
      } catch (e) { falhas.push(`${a.rotulo}: ${(e as Error).message}`); }
    }
    setEscolhidas((p) => { const n = { ...p }; enviadas.forEach((k) => delete n[k]); return n; });
    setPrevias((p) => { const n = { ...p }; enviadas.forEach((k) => { if (n[k]) URL.revokeObjectURL(n[k]!); delete n[k]; }); return n; });
    await carregar();
    setEnviando(false);
    setResultado(falhas.length
      ? { ok: false, texto: `${enviadas.length ? `${enviadas.length} foto(s) enviada(s). ` : ""}Não enviadas — ${falhas.join(" | ")}` }
      : { ok: true, texto: `${enviadas.length} foto(s) enviada(s) com a data ${dataBr(data)}.` });
  };

  if (carregando) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;
  if (erro || !dados) return <div className="panel-3d-sub rounded-xl p-6 text-center text-sm text-destructive">{erro || "Erro ao carregar."}</div>;

  const jaEnviadasNaData = dados.series.find((s) => s.data === data);

  return (
    <div className="space-y-4">
      <div className="panel-3d rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <Camera className="h-4 w-4 text-accent" />
          <h2 className="text-[11px] font-black uppercase tracking-widest">Minhas fotos de evolução</h2>
        </div>
        <p className="px-4 pt-3 text-xs text-muted-foreground">
          Envie 4 fotos do corpo inteiro (frente, costas, perfil esquerdo e perfil direito). A equipe compara as datas para acompanhar a sua evolução.
        </p>
        <button type="button" onClick={() => setGuiaAberto((v) => !v)} aria-expanded={guiaAberto}
          className="mx-4 mt-3 flex min-h-[44px] w-[calc(100%-2rem)] items-center justify-between rounded-md bevel-3d px-3 text-[10px] font-black uppercase tracking-widest text-accent">
          Como tirar as fotos {guiaAberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {guiaAberto && (
          <div className="space-y-3 px-4 pt-3">
            {dados.orientacoes.map((o) => (
              <div key={o.titulo} className="concave-3d p-3">
                <h3 className="mb-1 text-[10px] font-black uppercase tracking-widest text-accent">{o.titulo}</h3>
                <ul className="list-disc space-y-1 pl-4 text-xs text-foreground/90">{o.itens.map((i) => <li key={i}>{i}</li>)}</ul>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 p-4">
          <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Data em que as fotos foram tiradas
            <input type="date" value={data} max={dados.hoje} min="2000-01-01" onChange={(e) => setData(e.target.value)}
              className="field-engraved mt-1 block min-h-[44px] w-full px-3 text-sm normal-case tracking-normal text-foreground" />
          </label>
          {jaEnviadasNaData && (
            <p className="text-[11px] text-muted-foreground">
              Já existem fotos nesta data. Se enviar o mesmo ângulo de novo, a nova foto substitui a anterior (a anterior fica guardada pela equipe).
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {dados.angulos.map((a) => (
              <div key={a.chave} className="concave-3d flex flex-col items-center gap-2 p-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-accent">{a.rotulo}</span>
                <div className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded bg-background/40 text-muted-foreground">
                  {previas[a.chave]
                    ? <img src={previas[a.chave]} alt={`Prévia ${a.rotulo}`} className="h-full w-full object-cover" />
                    : <Silhueta angulo={a.chave} className="h-4/5" />}
                </div>
                <p className="text-[10px] leading-snug text-muted-foreground">{a.como}</p>
                <label className="btn-3d-soft flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-1.5 px-2 text-[10px] font-black uppercase tracking-widest">
                  <ImagePlus className="h-4 w-4" /> {escolhidas[a.chave] ? "Trocar foto" : "Escolher foto"}
                  <input type="file" accept="image/jpeg,image/png,image/*" className="sr-only"
                    onChange={(e) => { escolher(a.chave, e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              </div>
            ))}
          </div>
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" checked={consentimento} onChange={(e) => setConsentimento(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
            <span>Autorizo a clínica a guardar estas fotos do meu corpo, de forma privada, para acompanhar a minha evolução. Só a equipe de saúde autorizada pode vê-las.</span>
          </label>
          <button type="button" onClick={enviar} disabled={enviando}
            className="btn-3d flex min-h-[48px] w-full items-center justify-center gap-2 text-[11px] font-black uppercase tracking-widest disabled:opacity-60">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {enviando ? "Enviando…" : "Enviar fotos"}
          </button>
          {resultado && (
            <div role="status" className={`flex items-start gap-2 rounded-md p-3 text-xs ${resultado.ok ? "bevel-3d-ok" : "concave-3d text-destructive"}`}>
              {resultado.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
              <span>{resultado.texto}</span>
            </div>
          )}
        </div>
      </div>

      <div className="panel-3d rounded-xl overflow-hidden">
        <div className="border-b border-border/60 px-4 py-3 text-[11px] font-black uppercase tracking-widest">Fotos já enviadas</div>
        {dados.series.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">Você ainda não enviou fotos.</p>
        ) : (
          <div className="space-y-3 p-4">
            {[...dados.series].reverse().map((s) => (
              <div key={s.data} className="concave-3d p-2">
                <div className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-accent">{dataBr(s.data)}</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {dados.angulos.map((a) => {
                    const f = s.fotos[a.chave];
                    return (
                      <div key={a.chave} className="flex flex-col items-center gap-0.5">
                        <div className="aspect-[3/4] w-full overflow-hidden rounded bg-background/40">
                          {f
                            ? <ImagemAutenticada url={`${API_BASE}/api/area-paciente/fotos-corpo/${f.id}/arquivo`} headers={headers}
                                alt={`${a.rotulo} em ${dataBr(s.data)}`} className="h-full w-full object-cover" />
                            : <div className="flex h-full items-center justify-center text-muted-foreground">—</div>}
                        </div>
                        <span className="text-[8px] font-bold uppercase text-muted-foreground">{a.rotulo.replace("Perfil ", "P. ")}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
