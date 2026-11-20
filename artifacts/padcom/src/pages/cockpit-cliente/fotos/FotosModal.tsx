import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Columns2, Grid3x3, Layers, Loader2, Maximize2, Minimize2, Pause, Play, SplitSquareHorizontal } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { dataBr, type AnguloChave } from "@/components/fotos-corpo/shared";
import { urlArquivoFoto, useFotosCorpo } from "./api";
import { GradeReferencia, type ConfigGrade } from "./GradeReferencia";

type Modo = "lado" | "cortina" | "transicao";
const MAX_DATAS = 4;

/** Baixa as fotos (rota autenticada) uma vez e guarda enderecos locais temporarios para todos os modos. */
function useFotosBlob(clientId: number, ids: number[]) {
  const [urls, setUrls] = useState<Record<number, string | "erro">>({});
  const pedidos = useRef(new Set<number>());
  const guardadas = useRef<Record<number, string>>({});
  const vivo = useRef(true);
  const chave = ids.join(",");
  useEffect(() => {
    vivo.current = true;
    for (const id of ids) {
      if (pedidos.current.has(id)) continue;
      pedidos.current.add(id);
      fetch(urlArquivoFoto(clientId, id), { headers: collabAuthHeaders() })
        .then((r) => { if (!r.ok) throw new Error("falhou"); return r.blob(); })
        .then((b) => {
          if (!vivo.current) return;
          const u = URL.createObjectURL(b);
          guardadas.current[id] = u;
          setUrls((p) => ({ ...p, [id]: u }));
        })
        .catch(() => { if (vivo.current) setUrls((p) => ({ ...p, [id]: "erro" })); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, chave]);
  useEffect(() => () => {
    vivo.current = false;
    Object.values(guardadas.current).forEach((u) => URL.revokeObjectURL(u));
    guardadas.current = {}; pedidos.current.clear();
  }, []);
  return urls;
}

function Quadro({ url, grade, alt }: { url: string | "erro" | undefined; grade: ConfigGrade; alt: string }) {
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded bg-black/40">
      {url === undefined && <div className="absolute inset-0 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>}
      {url === "erro" && <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Foto indisponível</div>}
      {url && url !== "erro" && <img src={url} alt={alt} draggable={false} className="absolute inset-0 h-full w-full object-contain" />}
      <GradeReferencia cfg={grade} />
    </div>
  );
}

export function FotosModal({ clientId, clienteNome, aberto, escuro, onClose }: {
  clientId: number; clienteNome: string; aberto: boolean; escuro: boolean; onClose: () => void;
}) {
  const q = useFotosCorpo(clientId);
  const [maximizado, setMaximizado] = useState(false);
  const [angulo, setAngulo] = useState<AnguloChave>("frente");
  const [escolha, setEscolha] = useState<string[] | null>(null);
  const [modo, setModo] = useState<Modo>("lado");
  const [grade, setGrade] = useState<ConfigGrade>({ ligada: false, alturaCm: null, topoPct: 8, pesPct: 95 });
  const [pos, setPos] = useState(50);
  const [t, setT] = useState(0);
  const [tocando, setTocando] = useState(false);

  const series = q.data?.series ?? [];
  const angulos = q.data?.angulos ?? [];
  const comAngulo = useMemo(() => series.filter((s) => s.fotos[angulo]), [series, angulo]);
  const sel = useMemo(() => {
    const base = escolha ?? (comAngulo.length >= 2 ? [comAngulo[0].data, comAngulo[comAngulo.length - 1].data] : comAngulo.map((s) => s.data));
    return comAngulo.filter((s) => base.includes(s.data));
  }, [escolha, comAngulo]);

  const idsParaBaixar = useMemo(() => comAngulo.map((s) => s.fotos[angulo]!.id), [comAngulo, angulo]);
  const urls = useFotosBlob(clientId, aberto ? idsParaBaixar : []);
  const urlDe = (s: (typeof sel)[number]) => urls[s.fotos[angulo]!.id];

  // Reproducao da transicao: avanca o ponto "t" de 0 ate a ultima data (1,6 s por intervalo).
  useEffect(() => {
    if (!tocando || sel.length < 2) return;
    let raf = 0, ultimo = performance.now();
    const fim = sel.length - 1;
    const passo = (agora: number) => {
      const dt = (agora - ultimo) / 1600; ultimo = agora;
      let acabou = false;
      setT((v) => { const n = v + dt; if (n >= fim) { acabou = true; return fim; } return n; });
      if (acabou) setTocando(false); else raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [tocando, sel.length]);
  useEffect(() => { setT((v) => Math.min(v, Math.max(0, sel.length - 1))); }, [sel.length]);
  useEffect(() => { if (!aberto) setTocando(false); }, [aberto]);

  const alternar = (data: string) => {
    const atual = sel.map((s) => s.data);
    setEscolha(atual.includes(data) ? atual.filter((d) => d !== data) : atual.length >= MAX_DATAS ? atual : [...atual, data]);
  };
  const reproduzir = () => {
    if (tocando) { setTocando(false); return; }
    if (t >= sel.length - 1) setT(0);
    setTocando(true);
  };

  const botao = (ativo: boolean, onClick: () => void, rotulo: string, Icone?: typeof Layers, desabilitado?: boolean) => (
    <button type="button" onClick={onClick} aria-pressed={ativo} disabled={desabilitado}
      className={`${ativo ? "bevel-3d text-primary" : "concave-3d text-muted-foreground/80"} inline-flex min-h-9 items-center gap-1.5 px-3 text-[10px] font-black uppercase tracking-widest disabled:opacity-40`}>
      {Icone && <Icone className="h-3.5 w-3.5" />} {rotulo}
    </button>
  );

  const g = grade;
  const dataAtual = sel.length ? sel[Math.min(sel.length - 1, Math.round(t))] : null;
  const pontoCortina = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)));
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) { setMaximizado(false); setTocando(false); onClose(); } }}>
      <DialogContent className={`${escuro ? "dark " : ""}panel-3d flex max-h-[94vh] flex-col gap-0 overflow-hidden border-none p-0 text-foreground transition-[width,max-width,height] duration-200 ${
        maximizado ? "h-[96vh] w-[98vw] max-w-none" : "w-[min(96vw,1100px)] max-w-none"}`}>
        <header className="flex flex-wrap items-center gap-3 border-b border-border/60 py-3 pl-5 pr-24">
          <span className="concave-3d flex h-10 w-10 shrink-0 items-center justify-center text-primary"><Camera className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg font-black uppercase leading-tight tracking-wide">Fotos de evolução</DialogTitle>
            <DialogDescription className="truncate text-xs text-muted-foreground">
              {clienteNome} · {series.length} {series.length === 1 ? "data" : "datas"} enviadas pelo cliente
            </DialogDescription>
          </div>
          <button type="button" onClick={() => setMaximizado((m) => !m)} aria-pressed={maximizado}
            aria-label={maximizado ? "Restaurar tamanho" : "Maximizar"} title={maximizado ? "Restaurar tamanho" : "Maximizar"}
            className="btn-3d-soft absolute right-12 top-3 flex h-8 w-8 items-center justify-center">
            {maximizado ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5 pt-4">
          {q.isLoading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>}
          {q.isError && <div className="concave-3d p-6 text-center text-sm text-destructive">{(q.error as Error).message}</div>}
          {q.data && series.length === 0 && (
            <div className="concave-3d p-6 text-center text-sm text-muted-foreground">
              Este cliente ainda não enviou fotos. Ele envia pelo App do Cliente, na aba MINHAS FOTOS.
            </div>
          )}
          {q.data && series.length > 0 && (
            <>
              <div role="tablist" aria-label="Ângulo" className="flex flex-wrap gap-2">
                {angulos.map((a) => (
                  <button key={a.chave} type="button" role="tab" aria-selected={angulo === a.chave} onClick={() => setAngulo(a.chave)}
                    className={`${angulo === a.chave ? "bevel-3d text-primary" : "concave-3d text-muted-foreground/80"} min-h-9 px-4 text-[10px] font-black uppercase tracking-widest`}>
                    {a.rotulo}
                  </button>
                ))}
              </div>

              <section aria-label="Linha do tempo" className="concave-3d p-3">
                <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Datas (escolha de 2 a {MAX_DATAS} para comparar)
                </h3>
                <div className="flex flex-wrap gap-2">
                  {series.map((s) => {
                    const tem = Boolean(s.fotos[angulo]);
                    const marcada = sel.some((x) => x.data === s.data);
                    const total = Object.values(s.fotos).filter(Boolean).length;
                    return (
                      <button key={s.data} type="button" disabled={!tem} aria-pressed={marcada} onClick={() => alternar(s.data)}
                        title={tem ? "Marcar ou desmarcar para comparar" : "Sem foto deste ângulo nesta data"}
                        className={`${marcada ? "bevel-3d text-primary" : "btn-3d-soft"} flex min-h-[44px] flex-col items-center justify-center px-3 text-[11px] font-black disabled:opacity-40`}>
                        <span>{dataBr(s.data)}</span>
                        <span className="text-[9px] font-semibold text-muted-foreground">{tem ? `${total}/4 fotos` : "—"}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <div className="flex flex-wrap items-center gap-2">
                {botao(modo === "lado", () => setModo("lado"), "Lado a lado", Columns2)}
                {botao(modo === "cortina", () => setModo("cortina"), "Cortina", SplitSquareHorizontal)}
                {botao(modo === "transicao", () => setModo("transicao"), "Transição", Layers)}
                <span className="mx-1 h-6 w-px bg-border" />
                {botao(g.ligada, () => setGrade({ ...g, ligada: !g.ligada }), "Grade", Grid3x3)}
              </div>

              {g.ligada && (
                <section aria-label="Ajuste da grade" className="concave-3d grid gap-3 p-3 text-xs sm:grid-cols-3">
                  <label className="space-y-1">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Altura do cliente (cm)</span>
                    <input type="number" inputMode="numeric" min={100} max={230} placeholder="Ex.: 170" value={g.alturaCm ?? ""}
                      onChange={(e) => setGrade({ ...g, alturaCm: e.target.value === "" ? null : Number(e.target.value) })}
                      className="field-engraved min-h-[40px] w-full px-3 text-sm" />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Linha do topo da cabeça</span>
                    <input type="range" min={0} max={40} value={g.topoPct} onChange={(e) => setGrade({ ...g, topoPct: Number(e.target.value) })} className="w-full" />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Linha dos pés</span>
                    <input type="range" min={60} max={100} value={g.pesPct} onChange={(e) => setGrade({ ...g, pesPct: Number(e.target.value) })} className="w-full" />
                  </label>
                  <p className="text-[11px] text-muted-foreground sm:col-span-3">
                    {g.alturaCm
                      ? `Cada quadrado mede 10 cm, calibrado pelas linhas azuis (cabeça e pés) e pela altura de ${g.alturaCm} cm.`
                      : "Sem a altura, a grade é uniforme e não tem medida em centímetros."}
                    {" "}A grade vale quando as fotos têm o mesmo enquadramento (mesma distância e altura da câmera). Ajuste as linhas pela foto mais recente.
                  </p>
                </section>
              )}

              {sel.length < 2 && (
                <div className="concave-3d p-6 text-center text-sm text-muted-foreground">
                  {comAngulo.length < 2
                    ? "Para comparar, o cliente precisa ter este ângulo em pelo menos 2 datas."
                    : "Marque pelo menos 2 datas na linha do tempo para comparar."}
                  {sel.length === 1 && (
                    <div className="mx-auto mt-3 w-full max-w-xs">
                      <p className="mb-1 text-[10px] font-black uppercase">{dataBr(sel[0].data)}</p>
                      <Quadro url={urlDe(sel[0])} grade={g} alt={`${angulo} em ${dataBr(sel[0].data)}`} />
                    </div>
                  )}
                </div>
              )}

              {sel.length >= 2 && modo === "lado" && (
                <div className={`grid gap-3 ${sel.length === 2 ? "grid-cols-2" : sel.length === 3 ? "grid-cols-3" : "grid-cols-2 lg:grid-cols-4"}`}>
                  {sel.map((s) => (
                    <figure key={s.data} className="space-y-1">
                      <figcaption className="text-center text-[11px] font-black uppercase tracking-widest text-accent">{dataBr(s.data)}</figcaption>
                      <Quadro url={urlDe(s)} grade={g} alt={`${angulo} em ${dataBr(s.data)}`} />
                    </figure>
                  ))}
                </div>
              )}

              {sel.length >= 2 && modo === "cortina" && (sel.length !== 2 ? (
                <div className="concave-3d p-6 text-center text-sm text-muted-foreground">A cortina compara exatamente 2 datas. Deixe só 2 marcadas.</div>
              ) : (
                <div className="mx-auto w-full max-w-md space-y-2">
                  <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-accent">
                    <span>{dataBr(sel[0].data)}</span><span>{dataBr(sel[1].data)}</span>
                  </div>
                  <div className="relative cursor-ew-resize touch-none select-none"
                    onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pontoCortina(e); }}
                    onPointerMove={(e) => { if (e.buttons) pontoCortina(e); }}>
                    <Quadro url={urlDe(sel[1])} grade={{ ...g, ligada: false }} alt={`${angulo} em ${dataBr(sel[1].data)}`} />
                    <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
                      <Quadro url={urlDe(sel[0])} grade={{ ...g, ligada: false }} alt={`${angulo} em ${dataBr(sel[0].data)}`} />
                    </div>
                    <div className="pointer-events-none absolute inset-0"><GradeOverlay g={g} /></div>
                    <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${pos}%` }}>
                      <span className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[10px] font-black text-black shadow">⇆</span>
                    </div>
                  </div>
                  <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))}
                    aria-label="Posição da cortina" className="h-8 w-full" />
                </div>
              ))}

              {sel.length >= 2 && modo === "transicao" && (
                <div className="mx-auto w-full max-w-md space-y-2">
                  <div className="text-center text-[11px] font-black uppercase tracking-widest text-accent">
                    {dataAtual ? dataBr(dataAtual.data) : ""} {Math.abs(t - Math.round(t)) > 0.15 ? "(entre datas)" : ""}
                  </div>
                  <div className="relative aspect-[3/4] w-full overflow-hidden rounded bg-black/40">
                    {sel.map((s, i) => {
                      const u = urlDe(s);
                      return u && u !== "erro" ? (
                        <img key={s.data} src={u} alt={`${angulo} em ${dataBr(s.data)}`} draggable={false}
                          className="absolute inset-0 h-full w-full object-contain" style={{ opacity: Math.max(0, 1 - Math.abs(t - i)) }} />
                      ) : null;
                    })}
                    <GradeOverlay g={g} />
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={reproduzir} className="btn-3d-soft flex h-11 w-11 shrink-0 items-center justify-center"
                      aria-label={tocando ? "Pausar" : "Reproduzir"}>
                      {tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                    <input type="range" min={0} max={sel.length - 1} step={0.01} value={t} aria-label="Linha do tempo da transição"
                      onChange={(e) => { setTocando(false); setT(Number(e.target.value)); }} className="h-8 w-full" />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    {sel.map((s) => <span key={s.data}>{dataBr(s.data)}</span>)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GradeOverlay({ g }: { g: ConfigGrade }) {
  return <div className="pointer-events-none absolute inset-0"><GradeReferencia cfg={g} /></div>;
}
