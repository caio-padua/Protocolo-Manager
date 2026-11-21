import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, AlertTriangle, CheckCircle2, Eye, FileUp, ShieldAlert } from "lucide-react";
import { finApi, finUpload, finDownload } from "@/lib/pax-finance-api";
import { btnCls, btnSoftCls } from "../pax-finance-ui";

type Campo = { chave: string; rotulo: string; grupo: string; valor: unknown };
type Sens = { chave: string; rotulo: string; mascara: string };
type Doc = { id: number; arquivo: string; bytes: number; sha256: string; metodo: "texto" | "visao_ia"; status: string; enviadoEm: string; campos: Campo[]; sensiveis: Sens[]; conferenciaIa: { status: string; divergencias?: string[]; faltando?: string[]; motivo?: string }; avisos: string[] };
type Hist = { id: number; arquivo: string; bytes: number; status: string; enviadoEm: string };
type Lista = { ehCeo: boolean; slots: { slot: string; rotulo: string; historico: Hist[]; documento: Doc | null }[]; cruzada: { chave: string; rotulo: string; resultado: string; valores: Record<string, string> }[]; bloqueios: string[]; podeAplicar: boolean };
type Registro = { existe: boolean; campos: (Campo & { origem: string | null })[]; sensiveis: Sens[] };

const fmt = (v: unknown, chave: string): string => {
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "number") return chave.endsWith("Cents") ? (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : v.toLocaleString("pt-BR");
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("/") : v;
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : typeof x === "object" && x ? Object.values(x as object).filter((y) => y !== null).join(" · ") : String(x))).join("\n");
  return String(v);
};

const ROT_ST: Record<string, string> = { extraido: "extraído", aplicado: "aplicado", substituido: "substituído", rejeitado: "rejeitado" };
function LinhaHist({ h, destaque }: { h: Hist; destaque?: boolean }) {
  const baixa = useMutation({ mutationFn: () => finDownload(`/documents/${h.id}/download`, h.arquivo) });
  return (
    <div className={`flex items-center justify-between gap-2 py-1 ${destaque ? "font-semibold" : ""}`}>
      <span className="min-w-0 break-words">{new Date(h.enviadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {h.arquivo} · {ROT_ST[h.status] ?? h.status}</span>
      <button type="button" className={`${btnSoftCls} min-h-[44px] shrink-0 px-2`} onClick={() => baixa.mutate()} disabled={baixa.isPending} aria-label={`Baixar ${h.arquivo}`} data-testid={`doc-baixar-${h.id}`}><Download className="inline h-4 w-4" /> Baixar</button>
    </div>
  );
}

function Cartao({ item, ehCeo }: { item: Lista["slots"][number]; ehCeo: boolean }) {
  const qc = useQueryClient(); const ref = useRef<HTMLInputElement>(null);
  const [revelado, setRevelado] = useState<Record<string, string>>({});
  const envia = useMutation({ mutationFn: (f: File) => finUpload(`/documents/${item.slot}`, "arquivo", f), onSuccess: () => { setRevelado({}); qc.invalidateQueries({ queryKey: ["fin", "docs"] }); } });
  const rejeita = useMutation({ mutationFn: (id: number) => finApi(`/documents/${id}/reject`, { method: "POST" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["fin", "docs"] }) });
  const revela = useMutation({ mutationFn: (v: { id: number; chave: string }) => finApi<{ chave: string; valor: string }>(`/documents/${v.id}/reveal`, { method: "POST", body: { chave: v.chave } }), onSuccess: (r) => setRevelado((p) => ({ ...p, [r.chave]: r.valor })) });
  const d = item.documento;
  const grupos = d ? [...new Set(d.campos.map((c) => c.grupo))] : [];
  return (
    <section className="panel-3d-sub p-3 text-[12px]" data-testid={`doc-${item.slot}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <b className="uppercase">{item.rotulo}</b>
        <span className="text-muted-foreground" data-testid={`doc-estado-${item.slot}`}>{d ? (d.status === "aplicado" ? "APLICADO" : "EXTRAÍDO, AGUARDA CONFERÊNCIA") : "NÃO ENVIADO"}</span>
      </div>
      <input ref={ref} type="file" accept="application/pdf,.pdf" className="hidden" data-testid={`doc-arquivo-${item.slot}`}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) envia.mutate(f); e.target.value = ""; }} />
      <button type="button" className={`${btnSoftCls} min-h-[44px] w-full`} disabled={envia.isPending} onClick={() => ref.current?.click()} data-testid={`doc-enviar-${item.slot}`}>
        <FileUp className="mr-1 inline h-4 w-4" />{envia.isPending ? "Lendo o documento…" : d ? "Enviar outro arquivo (substitui)" : "Escolher arquivo PDF"}
      </button>
      {item.historico.length > 0 && (
        <div className="mt-3" data-testid={`doc-historico-${item.slot}`}>
          <div className="font-bold uppercase text-muted-foreground">Último enviado</div>
          <LinhaHist h={item.historico[0]} destaque />
          {item.historico.length > 1 && <><div className="mt-2 font-bold uppercase text-muted-foreground">Histórico ({item.historico.length - 1})</div>
            {item.historico.slice(1).map((h) => <LinhaHist key={h.id} h={h} />)}</>}
        </div>)}
      {envia.isError && <p className="mt-2 text-destructive" role="alert" data-testid={`doc-erro-${item.slot}`}>{(envia.error as Error).message}</p>}
      {d && (
        <div className="mt-3 space-y-2">
          <p className="text-muted-foreground">{d.arquivo} · {(d.bytes / 1024).toFixed(0)} KB · {d.metodo === "visao_ia" ? "lido por IA de visão (documento digitalizado)" : "lido do texto do PDF"} · selo {d.sha256.slice(0, 12)}</p>
          {d.avisos.map((a, i) => <p key={i} className="flex gap-1 text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{a}</p>)}
          <p className="text-muted-foreground">Conferência por IA: {d.conferenciaIa.status === "ok"
            ? ((d.conferenciaIa.divergencias?.length || d.conferenciaIa.faltando?.length) ? `${d.conferenciaIa.divergencias?.length ?? 0} divergência(s), ${d.conferenciaIa.faltando?.length ?? 0} item(ns) sem campo — ${[...(d.conferenciaIa.divergencias ?? []), ...(d.conferenciaIa.faltando ?? [])].join("; ")}` : "nenhuma divergência apontada")
            : `NÃO REALIZADA (${d.conferenciaIa.motivo ?? "indisponível"}). Confira os campos manualmente.`}</p>
          {grupos.map((g) => (
            <div key={g}><div className="mt-2 font-bold uppercase text-muted-foreground">{g}</div>
              <dl className="grid grid-cols-1 gap-x-3 gap-y-1 md:grid-cols-[minmax(0,200px)_1fr]">
                {d.campos.filter((c) => c.grupo === g).map((c) => (<div key={c.chave} className="contents"><dt className="text-muted-foreground">{c.rotulo}</dt><dd className="whitespace-pre-line break-words" data-testid={`campo-${item.slot}-${c.chave}`}>{fmt(c.valor, c.chave)}</dd></div>))}
              </dl></div>))}
          {d.sensiveis.length > 0 && (
            <div className="rounded border border-amber-400/60 p-2"><div className="mb-1 flex items-center gap-1 font-bold uppercase"><ShieldAlert className="h-4 w-4" />Dados pessoais protegidos (cifrados)</div>
              <dl className="grid grid-cols-1 gap-x-3 gap-y-1 md:grid-cols-[minmax(0,200px)_1fr]">
                {d.sensiveis.map((s) => (<div key={s.chave} className="contents"><dt className="text-muted-foreground">{s.rotulo}</dt>
                  <dd className="flex items-center gap-2 break-words" data-testid={`sens-${item.slot}-${s.chave}`}>{revelado[s.chave] ?? s.mascara}
                    {ehCeo && !revelado[s.chave] && <button type="button" className="min-h-[44px] px-2 underline md:min-h-0" onClick={() => revela.mutate({ id: d.id, chave: s.chave })} aria-label={`Revelar ${s.rotulo}`}><Eye className="inline h-3.5 w-3.5" /> revelar</button>}</dd></div>))}
              </dl>{!ehCeo && <p className="mt-1 text-muted-foreground">A revelação é exclusiva do CEO e fica registrada.</p>}</div>)}
          {d.status === "extraido" && <button type="button" className={`${btnSoftCls} min-h-[44px]`} onClick={() => rejeita.mutate(d.id)} disabled={rejeita.isPending}>Rejeitar esta leitura</button>}
        </div>)}
    </section>
  );
}

function ResponsavelTecnico({ reg }: { reg?: Registro }) {
  const qc = useQueryClient();
  const nome0 = String(reg?.campos.find((c) => c.chave === "rtNome")?.valor ?? ""), crm0 = String(reg?.campos.find((c) => c.chave === "rtCrm")?.valor ?? "");
  const [nome, setNome] = useState<string | null>(null); const [crm, setCrm] = useState<string | null>(null);
  const salva = useMutation({ mutationFn: () => finApi("/documents/registry/responsavel-tecnico", { method: "PUT", body: { nome: nome ?? nome0, registro: crm ?? crm0 } }),
    onSuccess: () => { setNome(null); setCrm(null); qc.invalidateQueries({ queryKey: ["fin", "docs-registry"] }); } });
  const cls = "w-full min-h-[44px] rounded border border-border bg-background px-2 text-[13px]";
  return (
    <section className="panel-3d-sub p-3 text-[12px]" data-testid="docs-rt">
      <b className="uppercase">Médico responsável técnico (clínico)</b>
      <p className="my-1 text-muted-foreground">Cadastro informativo. Não é sócio, não administra a empresa e não tem responsabilidade jurídica ou financeira.</p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_220px_auto] md:items-end">
        <label>Nome do médico<input className={cls} value={nome ?? nome0} onChange={(e) => setNome(e.target.value)} data-testid="rt-nome" /></label>
        <label>Registro (ex.: CRM/SP 125475)<input className={cls} value={crm ?? crm0} onChange={(e) => setCrm(e.target.value)} data-testid="rt-crm" /></label>
        <button type="button" className={`${btnSoftCls} min-h-[44px]`} disabled={salva.isPending || (nome ?? nome0).trim().length < 3} onClick={() => salva.mutate()} data-testid="rt-salvar">Salvar</button>
      </div>
      {salva.isError && <p className="mt-1 text-destructive" role="alert">{(salva.error as Error).message}</p>}
    </section>
  );
}

export function DocumentosImport() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["fin", "docs"], queryFn: () => finApi<Lista>("/documents") });
  const reg = useQuery({ queryKey: ["fin", "docs-registry"], queryFn: () => finApi<Registro>("/documents/registry") });
  const aplica = useMutation({ mutationFn: () => finApi<{ camposRegistro: number; camposEmpresaAlterados: string[]; pessoasNovas: number }>("/documents/apply", { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries(); } });
  const L = q.data;
  return (
    <div className="space-y-3" data-testid="docs-import">
      <p className="text-[12px]">Cada documento tem o seu próprio campo (um arquivo por campo, só PDF até 15 MB). O sistema lê o texto, mostra todos os dados encontrados e os confere entre si. Nada é gravado no cadastro até você clicar em <b>Aplicar ao cadastro</b>. CPF, RG, nascimento e endereço residencial ficam cifrados e mascarados. Documento digitalizado é lido por IA de visão e, nesse caso, as páginas (com dados pessoais) são enviadas ao provedor de IA.</p>
      {q.isError && <p className="text-[12px] text-destructive" role="alert">{(q.error as Error).message}</p>}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">{L?.slots.map((s) => <Cartao key={s.slot} item={s} ehCeo={L.ehCeo} />)}</div>
      {L && L.cruzada.length > 0 && (
        <section className="panel-3d-sub p-3 text-[12px]" data-testid="docs-cruzada"><b className="uppercase">Conferência entre os documentos</b>
          <ul className="mt-1 space-y-0.5">{L.cruzada.map((l) => (<li key={l.chave} data-testid={`cruz-${l.chave}`}>{l.resultado === "confere" ? <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-600" /> : <AlertTriangle className={`mr-1 inline h-3.5 w-3.5 ${l.resultado === "diverge" ? "text-destructive" : "text-amber-600"}`} />}
            {l.rotulo}: {l.resultado === "confere" ? "confere" : l.resultado === "diverge" ? `DIVERGE (${Object.entries(l.valores).map(([k, v]) => `${k}: ${v}`).join(" × ")})` : "constou em um só documento"}</li>))}</ul>
          {L.bloqueios.map((b, i) => <p key={i} className="mt-1 text-destructive" role="alert">{b}</p>)}</section>)}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={`${btnCls} min-h-[44px]`} disabled={!L?.podeAplicar || aplica.isPending} onClick={() => aplica.mutate()} data-testid="docs-aplicar">{aplica.isPending ? "Aplicando…" : "Aplicar ao cadastro"}</button>
        {aplica.isError && <span className="text-[12px] text-destructive" role="alert" data-testid="docs-aplicar-erro">{(aplica.error as Error).message}</span>}
        {aplica.isSuccess && <span className="text-[12px]" data-testid="docs-aplicar-ok">Aplicado: {aplica.data.camposRegistro} campos no cadastro; {aplica.data.camposEmpresaAlterados.length} campo(s) da empresa atualizados; {aplica.data.pessoasNovas} pessoa(s) nova(s). O cadastro do Pax Finance voltou a rascunho para sua validação.</span>}
      </div>
      <ResponsavelTecnico reg={reg.data} />
      {reg.data?.existe && (
        <section className="panel-3d-sub p-3 text-[12px]" data-testid="docs-registro"><b className="uppercase">Cadastro societário completo da empresa (origem de cada dado)</b>
          <dl className="mt-1 grid grid-cols-1 gap-x-3 gap-y-1 md:grid-cols-[minmax(0,220px)_1fr_auto]">
            {reg.data.campos.map((c) => (<div key={c.chave} className="contents"><dt className="text-muted-foreground">{c.rotulo}</dt><dd className="whitespace-pre-line break-words">{fmt(c.valor, c.chave)}</dd><dd className="text-muted-foreground">{c.origem ?? ""}</dd></div>))}
            {reg.data.sensiveis.map((s) => (<div key={s.chave} className="contents"><dt className="text-muted-foreground">{s.rotulo}</dt><dd>{s.mascara}</dd><dd className="text-muted-foreground">protegido</dd></div>))}
          </dl></section>)}
    </div>
  );
}
