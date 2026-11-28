import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { Numeral } from "@/components/numeral/Numeral";

type Catalogo = { id: number; nomeArquivo: string; mime: string; tamanhoBytes: number; origem: "upload" | "localizado"; referencia: string | null; enviadoEm: string; enviadoPor: string | null };

async function erroDe(r: Response, padrao: string): Promise<string> {
  try { const j = await r.json(); if (j?.error) return String(j.error); } catch { /* corpo ilegível */ }
  return r.status === 401 ? "Entre novamente para continuar." : r.status === 403 ? "Seu acesso não permite consultar catálogos." : padrao;
}

function tamanho(bytes: number): string {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

/** Histórico dos catálogos originais do fornecedor: cada arquivo enviado fica guardado e disponível para baixar. Nada é apagado. */
export function CatalogosFornecedor({ fornecedorId, nome, onFechar }: { fornecedorId: number; nome: string; onFechar: () => void }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const [baixando, setBaixando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const chave = ["fornecedor-catalogos", fornecedorId];

  const q = useQuery({
    queryKey: chave, staleTime: 0, refetchOnMount: "always",
    queryFn: async (): Promise<Catalogo[]> => {
      const r = await fetch(`/api/fornecedores/${fornecedorId}/catalogos`, { headers: collabAuthHeaders() });
      if (!r.ok) throw new Error(await erroDe(r, "Não foi possível consultar o histórico de catálogos."));
      return ((await r.json()) as { catalogos: Catalogo[] }).catalogos;
    },
  });

  const enviar = async (arq: File) => {
    setOcupado(true); setErro(null); setAviso(null);
    try {
      const fd = new FormData(); fd.append("file", arq);
      const r = await fetch(`/api/fornecedores/${fornecedorId}/catalogos`, { method: "POST", headers: collabAuthHeaders(), body: fd });
      if (!r.ok) throw new Error(await erroDe(r, "Não foi possível guardar o arquivo."));
      const j = (await r.json()) as { jaExistia: boolean };
      setAviso(j.jaExistia ? "Este mesmo arquivo já estava no histórico; nada foi duplicado." : "Arquivo guardado no histórico.");
      await qc.invalidateQueries({ queryKey: chave });
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível guardar o arquivo."); }
    finally { setOcupado(false); if (input.current) input.current.value = ""; }
  };

  const baixar = async (c: Catalogo) => {
    setBaixando(c.id); setErro(null);
    try {
      const r = await fetch(`/api/fornecedores/catalogos/${c.id}/arquivo`, { headers: collabAuthHeaders() });
      if (!r.ok) throw new Error(await erroDe(r, "Não foi possível baixar o arquivo."));
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a"); a.href = url; a.download = c.nomeArquivo; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível baixar o arquivo."); }
    finally { setBaixando(null); }
  };

  return (
    <div className="concave-3d mt-3 space-y-3 p-3" data-testid={`catalogos-${fornecedorId}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-widest text-primary">Catálogos enviados — {nome}</p>
        <Button type="button" variant="outline" size="icon" className="btn-3d-soft h-9 w-9" aria-label="Fechar catálogos" onClick={onFechar} disabled={ocupado}><X className="h-4 w-4" /></Button>
      </div>
      <p className="text-xs text-muted-foreground">Aqui ficam guardados os arquivos originais (PDF, planilha ou imagem) que este fornecedor mandou. Todos podem ser baixados; nada é apagado.</p>
      <input ref={input} type="file" accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg" className="sr-only" data-testid={`input-catalogo-${fornecedorId}`}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f); }} />
      <Button type="button" className="btn-3d min-h-10 w-full gap-2 sm:w-auto" disabled={ocupado} onClick={() => input.current?.click()} data-testid={`button-enviar-catalogo-${fornecedorId}`}>
        <Upload className="h-4 w-4" aria-hidden="true" /> {ocupado ? "Guardando…" : "Enviar catálogo"}
      </Button>
      <div className="min-h-5 text-sm" aria-live="polite">
        {erro && <p className="text-amber-700" role="alert" data-testid="erro-catalogo">{erro}</p>}
        {!erro && aviso && <p className="font-semibold text-primary" data-testid="aviso-catalogo">{aviso}</p>}
      </div>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Carregando histórico…</p>
        : q.isError ? <p className="text-sm text-amber-700" role="alert">{q.error instanceof Error ? q.error.message : "Falha ao consultar."}</p>
        : (q.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground" data-testid="catalogos-vazio">Nenhum catálogo guardado para este fornecedor ainda.</p>
        : (
          <ul className="space-y-2" data-testid="historico-catalogos">
            {q.data!.map((c) => (
              <li key={c.id} className="panel-3d-sub flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`catalogo-${c.id}`}>
                <div className="flex min-w-0 items-start gap-3">
                  <span className="screen-3d grid h-10 w-10 shrink-0 place-items-center text-primary"><FileText className="h-5 w-5" aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold text-foreground">{c.nomeArquivo}</p>
                    {c.referencia && <p className="text-xs text-foreground/80">{c.referencia}</p>}
                    <p className="text-[11px] text-muted-foreground">
                      {quando(c.enviadoEm)} · {tamanho(c.tamanhoBytes)} · {c.origem === "localizado" ? "localizado no sistema" : `enviado${c.enviadoPor ? ` por ${c.enviadoPor}` : ""}`}
                    </p>
                  </div>
                </div>
                <Button type="button" variant="outline" className="btn-3d-soft min-h-10 w-full shrink-0 gap-2 sm:w-[150px]" disabled={baixando === c.id} onClick={() => baixar(c)} data-testid={`button-baixar-catalogo-${c.id}`}>
                  <Download className="h-4 w-4" aria-hidden="true" /> {baixando === c.id ? "Baixando…" : "Baixar"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      {(q.data ?? []).length > 0 && <p className="text-[11px] text-muted-foreground">Total no histórico: <Numeral>{q.data!.length}</Numeral></p>}
    </div>
  );
}
