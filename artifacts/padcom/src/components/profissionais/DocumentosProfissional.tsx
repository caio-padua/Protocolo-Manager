import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { collabAuthHeaders } from "@/lib/collab-auth";

/**
 * Documentos de qualquer profissional (carteira do conselho, comprovante, identidade...). O arquivo fica em armazenamento privado
 * e só é aberto por esta tela com a sessão autenticada. Dados lidos de um documento aparecem como SUGESTÃO: só entram no cadastro
 * depois que uma pessoa autorizada aceita. Nada é apagado: "arquivar" só tira da lista.
 */
const apiBase = import.meta.env.VITE_API_URL || `${import.meta.env.BASE_URL}api`;

const TIPOS: { value: string; label: string }[] = [
  { value: "carteira_conselho", label: "Carteira do conselho" },
  { value: "comprovante_endereco", label: "Comprovante de endereço" },
  { value: "documento_identidade", label: "Documento de identidade" },
  { value: "diploma_certificado", label: "Diploma ou certificado" },
  { value: "contrato", label: "Contrato" },
  { value: "outro", label: "Outro" },
];
const SITUACAO: Record<string, string> = {
  pendente_confirmacao: "Aguardando conferência", confirmado: "Confirmado", titular_divergente: "Titular diferente do profissional", arquivado: "Arquivado",
};
const CAMPO: Record<string, string> = { registro_conselho: "Conselho", registro_numero: "Número do registro", habilitacao: "Habilitação", titular: "Titular" };
const STATUS_DADO: Record<string, string> = { sugerido: "Sugestão", aceito: "Aceito", recusado: "Recusado" };

type Dado = { campo: string; valor: string; status: string; valorAnterior: string | null };
type Documento = {
  id: number; tipo: string; titulo: string; nomeOriginal: string; mime: string; tamanhoBytes: number; situacao: string;
  titularDeclarado: string | null; observacao: string | null; criadoEm: string; dados: Dado[];
};

class ErroApi extends Error {}
async function chamar<T>(caminho: string, init?: RequestInit, json = true): Promise<T> {
  const r = await fetch(`${apiBase}${caminho}`, { ...init, headers: collabAuthHeaders(json ? { "Content-Type": "application/json" } : {}) });
  const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new ErroApi(String(corpo.error ?? "Não foi possível concluir a operação."));
  return corpo as T;
}

export function DocumentosProfissional({ professionalId }: { professionalId: number }) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<Documento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tipo, setTipo] = useState("carteira_conselho");
  const [titular, setTitular] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const base = `/professionals/${professionalId}/documentos`;

  const carregar = useCallback(async () => {
    try { setDocs((await chamar<{ documentos: Documento[] }>(base)).documentos); setErro(null); }
    catch (e) { setDocs(null); setErro(e instanceof Error ? e.message : "Falha ao carregar."); }
  }, [base]);
  useEffect(() => { setDocs(null); void carregar(); }, [carregar]);

  const falha = (titulo: string) => (e: unknown) => toast({ title: titulo, description: e instanceof Error ? e.message : undefined, variant: "destructive" });

  const enviar = async () => {
    const arquivo = arquivoRef.current?.files?.[0];
    if (!arquivo) { toast({ title: "Escolha um arquivo", variant: "destructive" }); return; }
    const f = new FormData();
    f.append("file", arquivo); f.append("tipo", tipo);
    if (titular.trim()) { f.append("titularDeclarado", titular.trim()); f.append("titularDivergente", "true"); }
    if (obs.trim()) f.append("observacao", obs.trim());
    setEnviando(true);
    try {
      await chamar(base, { method: "POST", body: f }, false);
      toast({ title: "Documento guardado", description: "Fica aguardando conferência de outra pessoa." });
      if (arquivoRef.current) arquivoRef.current.value = "";
      setTitular(""); setObs("");
      await carregar();
    } catch (e) { falha("Não foi possível enviar")(e); } finally { setEnviando(false); }
  };

  const ver = async (d: Documento) => {
    try {
      const r = await fetch(`${apiBase}${base}/${d.id}/arquivo`, { headers: collabAuthHeaders() });
      if (!r.ok) throw new ErroApi(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Não foi possível abrir o arquivo.");
      const url = URL.createObjectURL(await r.blob());
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { falha("Não foi possível abrir")(e); }
  };

  const acao = async (fn: () => Promise<unknown>, titulo: string, ok: string) => {
    try { await fn(); toast({ title: ok }); await carregar(); } catch (e) { falha(titulo)(e); }
  };

  return (
    <section className="panel-3d-sub mt-4 space-y-3 p-4" aria-label="Documentos do profissional" data-testid="documentos-profissional">
      <h3 className="text-[11px] font-black uppercase tracking-widest text-primary">Documentos (arquivo privado)</h3>
      <div className="concave-3d grid gap-2 p-3 sm:grid-cols-2">
        <label className="text-[11px] font-bold">Tipo
          <select className="field-engraved mt-1 min-h-10 w-full px-2" value={tipo} onChange={(e) => setTipo(e.target.value)} data-testid="doc-tipo">
            {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-bold">Arquivo (JPG, PNG ou PDF, até 10 MB)
          <input ref={arquivoRef} type="file" accept="image/jpeg,image/png,application/pdf" className="field-engraved mt-1 block min-h-10 w-full px-2 py-2" data-testid="doc-arquivo" />
        </label>
        <label className="text-[11px] font-bold">Nome do titular que consta no documento (se diferente do profissional)
          <input type="text" maxLength={200} className="field-engraved mt-1 block min-h-10 w-full px-2" value={titular} onChange={(e) => setTitular(e.target.value)} />
        </label>
        <label className="text-[11px] font-bold">Observação
          <input type="text" maxLength={500} className="field-engraved mt-1 block min-h-10 w-full px-2" value={obs} onChange={(e) => setObs(e.target.value)} />
        </label>
        <div className="sm:col-span-2">
          <Button type="button" size="sm" disabled={enviando} onClick={() => void enviar()} data-testid="doc-enviar">{enviando ? "Enviando…" : "Guardar documento"}</Button>
        </div>
      </div>

      {erro && <p role="alert" className="text-xs font-bold text-red-800" data-testid="doc-erro">{erro}</p>}
      {!erro && docs === null && <p role="status" className="text-xs">Carregando documentos…</p>}
      {docs?.length === 0 && <p className="text-xs text-muted-foreground">Nenhum documento guardado.</p>}
      {docs?.map((d) => (
        <article key={d.id} className="concave-3d space-y-2 p-3" data-testid={`documento-${d.id}`}>
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-xs">{d.titulo}</strong>
            <span className="bevel-3d px-2 py-1 text-[10px] font-black uppercase tracking-widest">{SITUACAO[d.situacao] ?? d.situacao}</span>
            <span className="text-[10px] text-muted-foreground">{TIPOS.find((t) => t.value === d.tipo)?.label ?? d.tipo} · {Math.max(1, Math.round(d.tamanhoBytes / 1024))} KB</span>
          </div>
          {d.titularDeclarado && <p className="text-[11px]">Titular que consta: <strong>{d.titularDeclarado}</strong></p>}
          {d.situacao === "titular_divergente" && <p role="status" className="text-[11px] font-bold text-amber-900">Este documento não está no nome do profissional; não vale como comprovação do cadastro dele.</p>}
          {d.observacao && <p className="text-[11px] text-muted-foreground">{d.observacao}</p>}
          {d.dados.length > 0 && (
            <ul className="space-y-1">
              {d.dados.map((x) => (
                <li key={x.campo} className="flex flex-wrap items-center gap-2 text-[11px]" data-testid={`dado-${d.id}-${x.campo}`}>
                  <span className="font-bold">{CAMPO[x.campo] ?? x.campo}:</span> {x.valor}
                  <span className="text-muted-foreground">({STATUS_DADO[x.status] ?? x.status})</span>
                  {x.status === "sugerido" && (
                    <>
                      <Button type="button" size="sm" variant="outline"
                        onClick={() => void acao(() => chamar(`${base}/${d.id}/dados/${x.campo}`, { method: "PATCH", body: JSON.stringify({ acao: "aceitar" }) }), "Não foi possível aceitar", "Dado aceito no cadastro")}>Aceitar no cadastro</Button>
                      <Button type="button" size="sm" variant="ghost"
                        onClick={() => void acao(() => chamar(`${base}/${d.id}/dados/${x.campo}`, { method: "PATCH", body: JSON.stringify({ acao: "recusar" }) }), "Não foi possível recusar", "Sugestão recusada")}>Recusar</Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void ver(d)}>Abrir arquivo</Button>
            {d.situacao === "pendente_confirmacao" && (
              <Button type="button" size="sm" variant="outline"
                onClick={() => void acao(() => chamar(`${base}/${d.id}`, { method: "PATCH", body: JSON.stringify({ situacao: "confirmado" }) }), "Não foi possível confirmar", "Documento confirmado")}>Confirmar documento</Button>
            )}
            {d.situacao !== "arquivado" && (
              <Button type="button" size="sm" variant="ghost"
                onClick={() => { if (window.confirm("Arquivar tira da lista, mas o arquivo é preservado. Continuar?")) void acao(() => chamar(`${base}/${d.id}`, { method: "PATCH", body: JSON.stringify({ situacao: "arquivado" }) }), "Não foi possível arquivar", "Documento arquivado"); }}>Arquivar</Button>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
