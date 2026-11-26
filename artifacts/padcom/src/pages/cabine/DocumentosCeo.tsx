import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Search, FileText, X, ArrowLeft } from "lucide-react";
import { cabineJson, cabineBlob } from "./api";
import { collabAuthHeaders } from "@/lib/collab-auth";

interface Doc { id: number; empresaId: number | null; titulo: string; descricao: string | null; nomeOriginal: string; mimeType: string; tamanhoBytes: number; criadoEm: string }
interface Clinica { id: number; nome: string }

const fmtTam = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fmtData = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default function DocumentosCeo() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [clinicas, setClinicas] = useState<Clinica[]>([]);
  const [q, setQ] = useState("");
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [empresaNovo, setEmpresaNovo] = useState("");
  const [aberto, setAberto] = useState<{ doc: Doc; url: string; tipo: string } | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (q.trim()) p.set("q", q.trim());
      if (filtroEmpresa) p.set("empresaId", filtroEmpresa);
      const r = await cabineJson<{ documentos: Doc[] }>(`/ceo/documentos?${p}`);
      setDocs(r.documentos);
      setErro(null);
    } catch (e) { setErro((e as Error).message); }
  }, [q, filtroEmpresa]);

  useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t); }, [carregar]);
  useEffect(() => {
    cabineJson<{ data: Clinica[] }>("/ceo/resumo").then((r) => setClinicas(r.data)).catch(() => setClinicas([]));
  }, []);

  async function enviar() {
    const f = arquivoRef.current?.files?.[0];
    if (!f) { setErro("Escolha um arquivo."); return; }
    setEnviando(true); setErro(null); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("arquivo", f);
      if (titulo.trim()) fd.append("titulo", titulo.trim());
      if (descricao.trim()) fd.append("descricao", descricao.trim());
      if (empresaNovo) fd.append("empresaId", empresaNovo);
      await cabineJson("/ceo/documentos", { method: "POST", body: fd, headers: collabAuthHeaders() });
      setMsg("Documento guardado."); setTitulo(""); setDescricao(""); if (arquivoRef.current) arquivoRef.current.value = "";
      await carregar();
    } catch (e) { setErro((e as Error).message); }
    setEnviando(false);
  }

  async function abrir(doc: Doc) {
    try {
      setErro(null);
      const { url, tipo } = await cabineBlob(`/ceo/documentos/${doc.id}/arquivo`);
      setAberto({ doc, url, tipo });
    } catch (e) { setErro((e as Error).message); }
  }
  function fechar() { if (aberto) URL.revokeObjectURL(aberto.url); setAberto(null); }

  const nomeClinica = (id: number | null) => (id ? clinicas.find((c) => c.id === id)?.nome ?? `Clínica ${id}` : "Geral (todas)");

  if (aberto) {
    const img = aberto.tipo.startsWith("image/");
    return (
      <div className="space-y-3" data-testid="visualizador">
        <div className="flex items-center justify-between gap-2">
          <button onClick={fechar} className="bevel-3d px-3 py-1.5 text-sm inline-flex items-center gap-2" data-testid="voltar-visao-geral"><ArrowLeft className="h-4 w-4" /> Voltar à visão geral</button>
          <span className="text-sm font-semibold truncate">{aberto.doc.titulo}</span>
          <button onClick={fechar} aria-label="Fechar" className="bevel-3d p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="concave-3d p-2">
          {img
            ? <img src={aberto.url} alt={aberto.doc.titulo} className="max-h-[75vh] mx-auto object-contain" />
            : <iframe title={aberto.doc.titulo} src={aberto.url} sandbox="" className="w-full h-[75vh] bg-white" />}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="documentos-ceo">
      <div className="panel-3d-sub p-4 space-y-3">
        <h3 className="font-semibold uppercase text-sm">Cadastrar documento</h3>
        <div className="grid md:grid-cols-2 gap-2">
          <input ref={arquivoRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.svg,.txt,.md" data-testid="campo-arquivo" className="text-sm" />
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título (opcional)" className="concave-3d px-2 py-1.5 text-sm" data-testid="campo-titulo" />
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição (opcional)" className="concave-3d px-2 py-1.5 text-sm" />
          <select value={empresaNovo} onChange={(e) => setEmpresaNovo(e.target.value)} className="concave-3d px-2 py-1.5 text-sm" aria-label="Clínica do documento">
            <option value="">Geral (todas as clínicas)</option>
            {clinicas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <button onClick={enviar} disabled={enviando} className="bevel-3d px-4 py-2 text-sm inline-flex items-center gap-2" data-testid="botao-enviar"><Upload className="h-4 w-4" /> {enviando ? "Enviando…" : "Guardar documento"}</button>
        <p className="text-xs text-muted-foreground">Aceitos: PDF, PNG, JPG, WEBP, SVG, TXT e MD, até 25 MB.</p>
      </div>
      {msg ? <p role="status" className="text-sm text-emerald-700">{msg}</p> : null}
      {erro ? <p role="alert" className="text-sm text-red-700">{erro}</p> : null}
      <div className="flex flex-wrap gap-2">
        <div className="concave-3d px-2 py-1.5 flex items-center gap-2 flex-1 min-w-[220px]"><Search className="h-4 w-4" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar por título, descrição ou arquivo" className="bg-transparent outline-none text-sm w-full" data-testid="busca-docs" /></div>
        <select value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)} className="concave-3d px-2 py-1.5 text-sm" aria-label="Filtrar por clínica">
          <option value="">Todas as clínicas</option>
          {clinicas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {docs.map((d) => (
          <button key={d.id} onClick={() => abrir(d)} data-testid={`doc-${d.id}`} className="panel-3d-sub p-3 text-left space-y-1">
            <div className="flex items-center gap-2"><FileText className="h-4 w-4 shrink-0" /><span className="font-semibold text-sm truncate">{d.titulo}</span></div>
            {d.descricao ? <p className="text-xs text-muted-foreground line-clamp-2">{d.descricao}</p> : null}
            <p className="text-xs text-muted-foreground">{nomeClinica(d.empresaId)} · {fmtTam(d.tamanhoBytes)} · {fmtData(d.criadoEm)}</p>
          </button>
        ))}
        {docs.length === 0 && !erro ? <p className="text-sm text-muted-foreground" data-testid="sem-docs">Nenhum documento encontrado.</p> : null}
      </div>
    </div>
  );
}
