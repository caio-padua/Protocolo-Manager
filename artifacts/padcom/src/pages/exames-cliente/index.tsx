import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlaskConical,
  Upload,
  Loader2,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Microscope,
  TableProperties,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Stamp,
  Bot,
  ShieldCheck,
  Radar,
  DownloadCloud,
  ChevronDown,
} from "lucide-react";
import { BASE, ConsoleShell, BlockTitle } from "../comunicacao/_shared";
import { DriveLinksField } from "@/components/ProcedenciaDocumentosBloco";
import { ClientPicker } from "@/components/ClientPicker";
import { getCollabProfessional, getCollabToken } from "@/lib/collab-auth";
import DriveWatcherPanel from "@/components/exames/DriveWatcherPanel";
import ImportarDrivePanel from "@/components/exames/ImportarDrivePanel";

// ===========================================================================
// EXAMES DO CLIENTE — Trajetoria do Exame Uploadado (spec
// specs/trajetoria-exame-upload.md). Tela unica com 3 postos de trabalho:
// 1. Recepcao (upload avulso por seletor de cliente — Modo Duplo)
// 2. Mesa de Validacao (fila de documentos + conferencia em 1 clique)
// 3. Evolucao Antes/Depois (comparativo por analito, colunas por data+lab)
// A leitura por IA demora 70-106 segundos em laudo grande: a tela NUNCA
// bloqueia — envia, recebe 202 e acompanha por sondagem (polling).
// ===========================================================================

interface ClienteOption {
  id: number;
  name: string;
}

interface DocRow {
  id: number;
  clientId: number;
  clientName: string;
  fileName: string;
  labName: string | null;
  collectionDate: string | null;
  status: string;
  confidence: string | null;
  modelUsed: string | null;
  createdAt: string;
  conferredAt: string | null;
  conf1Name: string | null;
  conf1Cargo: string | null;
  conf1At: string | null;
  conf2Name: string | null;
  conf2Cargo: string | null;
  conf2At: string | null;
}

interface ProfOption {
  id: number;
  name: string;
  role: string | null;
  category: string | null;
}

interface ResultRow {
  id: number;
  analyteCode: string | null;
  analyteNameRaw: string;
  valueRaw: string | null;
  unitRaw: string | null;
  refLow: string | null;
  refHigh: string | null;
  status: string | null;
  collectionDate: string | null;
  labName: string | null;
}

interface DocDetail extends DocRow {
  results: ResultRow[];
}

interface EvolucaoCell {
  value: string | null;
  valueNum: number | null;
  unit: string | null;
  status: string | null;
  documentId: number;
}

interface EvolucaoData {
  columns: Array<{
    key: string;
    date: string | null;
    lab: string | null;
    confLevel: "ia" | "c1" | "c2" | null;
    conferenteName: string | null;
    conferenteCargo: string | null;
  }>;
  analytes: Array<{
    key: string;
    name: string;
    unit: string | null;
    refLow: string | null;
    refHigh: string | null;
    trend: "subiu" | "caiu" | "estavel" | null;
    cells: Record<string, EvolucaoCell>;
  }>;
}

function formatDateBr(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function statusChip(status: string) {
  switch (status) {
    case "processando":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
          <Loader2 className="h-3 w-3 animate-spin" /> Lendo (IA)
        </span>
      );
    case "recebido":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          <Bot className="h-3 w-3" /> IA · aguarda C1
        </span>
      );
    case "conferido_1":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
          <Stamp className="h-3 w-3" /> C1 · aguarda C2
        </span>
      );
    case "conferido":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
          <CheckCircle2 className="h-3 w-3" /> Conferido
        </span>
      );
    case "erro":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-600">
          <AlertTriangle className="h-3 w-3" /> Erro na leitura
        </span>
      );
    default:
      return <span className="text-xs text-muted-foreground">{status}</span>;
  }
}

function resultStatusClass(status: string | null): string {
  switch (status) {
    case "acima":
      return "bg-red-500/15 text-red-600";
    case "abaixo":
      return "bg-amber-500/15 text-amber-600";
    case "dentro":
      return "bg-emerald-500/15 text-emerald-700";
    case "conferencia":
      return "bg-slate-500/15 text-slate-600";
    default:
      return "text-muted-foreground";
  }
}

// Identidade do colaborador na conferencia: "Sobrenome, Nome (Cargo)".
// Remove prefixos de tratamento (Dr., Dra., Enf., etc.) para nao duplicar cargo.
function formatColaborador(name: string | null, cargo: string | null): string {
  const clean = (name ?? "")
    .replace(/^(dr\.?|dra\.?|enf\.?|psic\.?|nutr\.?|recep\.?|adm\.?|fin\.?)\s+/i, "")
    .trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  let base: string;
  if (parts.length === 0) base = "";
  else if (parts.length === 1) base = parts[0];
  else base = `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}`;
  const c = (cargo ?? "").trim();
  if (!base) return c ? `(${c})` : "—";
  return c ? `${base} (${c})` : base;
}

// Selo de conferencia por nivel: IA (cinza), C1 (ambar), C2 (verde).
function ConfSelo({
  level,
  conferenteName,
  conferenteCargo,
}: {
  level: "ia" | "c1" | "c2" | null;
  conferenteName: string | null;
  conferenteCargo: string | null;
}) {
  if (level === "c2") {
    return (
      <span className="inline-flex flex-col rounded-md bg-emerald-500/15 px-2 py-0.5 text-emerald-700">
        <span className="text-[10px] font-bold uppercase tracking-wide">C2 · Clínica</span>
        <span className="text-[10px] font-medium normal-case">
          {formatColaborador(conferenteName, conferenteCargo)}
        </span>
      </span>
    );
  }
  if (level === "c1") {
    return (
      <span className="inline-flex flex-col rounded-md bg-amber-500/15 px-2 py-0.5 text-amber-700">
        <span className="text-[10px] font-bold uppercase tracking-wide">C1 · Operacional</span>
        <span className="text-[10px] font-medium normal-case">
          {formatColaborador(conferenteName, conferenteCargo)}
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
      <Bot className="h-3 w-3" /> IA · aguarda conferência
    </span>
  );
}

export default function ExamesCliente() {
  // ---- Clientes ----
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [clienteId, setClienteId] = useState<string>("");

  // ---- Upload ----
  const fileRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // ---- Fila ----
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [carregandoDocs, setCarregandoDocs] = useState(true);

  // ---- Mesa de Validacao ----
  const [docSelecionado, setDocSelecionado] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<DocDetail | null>(null);
  const [conferindo, setConferindo] = useState(false);

  // ---- Conferentes (colaboradores) ----
  const [profissionais, setProfissionais] = useState<ProfOption[]>([]);
  const [conferenteId, setConferenteId] = useState<string>(
    () => {
      const p = getCollabProfessional();
      return p ? String(p.id) : "";
    },
  );

  // ---- Toggle global "liberar validacoes" (exames.exigirValidacaoHumana) ----
  const [exigirValidacao, setExigirValidacao] = useState(true);
  const [salvandoToggle, setSalvandoToggle] = useState(false);

  // ---- Evolucao ----
  const [evolucao, setEvolucao] = useState<EvolucaoData | null>(null);
  const [carregandoEvolucao, setCarregandoEvolucao] = useState(false);

  // ---- Seções fundidas do Drive (colapsáveis) ----
  const [vigilanciaAberta, setVigilanciaAberta] = useState(false);
  const [importacaoAberta, setImportacaoAberta] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/api/clients`)
      .then((r) => r.json())
      .then((d: ClienteOption[]) =>
        setClientes(
          [...d].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
        ),
      )
      .catch(() => setClientes([]));
  }, []);

  // Colaboradores (conferentes). Todos podem conferir; o padrao e o colaborador logado.
  useEffect(() => {
    fetch(`${BASE}/api/professionals`)
      .then((r) => r.json())
      .then((d: ProfOption[]) =>
        setProfissionais(
          Array.isArray(d)
            ? [...d].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
            : [],
        ),
      )
      .catch(() => setProfissionais([]));
  }, []);

  // Toggle global "liberar validacoes". As rotas /settings/* exigem colaborador,
  // entao mandamos o token HMAC no cabecalho Authorization.
  useEffect(() => {
    const t = getCollabToken();
    fetch(`${BASE}/api/settings/exames`, {
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("settings"))))
      .then((d: { exigirValidacaoHumana?: boolean }) =>
        setExigirValidacao(d.exigirValidacaoHumana !== false),
      )
      .catch(() => undefined);
  }, []);

  const salvarToggle = async (proximo: boolean) => {
    setExigirValidacao(proximo);
    setSalvandoToggle(true);
    try {
      const t = getCollabToken();
      const r = await fetch(`${BASE}/api/settings/exames`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(t ? { Authorization: `Bearer ${t}` } : {}),
        },
        body: JSON.stringify({ exigirValidacaoHumana: proximo }),
      });
      if (!r.ok) throw new Error("toggle");
      carregarEvolucao(clienteId);
    } catch {
      setExigirValidacao(!proximo);
      setAviso("Nao foi possivel salvar a configuracao de validacao.");
    } finally {
      setSalvandoToggle(false);
    }
  };

  const carregarDocs = useCallback(() => {
    return fetch(`${BASE}/api/exames-lab/documentos`)
      .then((r) => r.json())
      .then((d: DocRow[]) => setDocs(Array.isArray(d) ? d : []))
      .catch(() => undefined)
      .finally(() => setCarregandoDocs(false));
  }, []);

  useEffect(() => {
    void carregarDocs();
  }, [carregarDocs]);

  // Sondagem: enquanto houver documento "processando", atualiza a cada 5s
  const temProcessando = docs.some((d) => d.status === "processando");
  useEffect(() => {
    if (!temProcessando) return;
    const t = setInterval(() => {
      void carregarDocs();
      if (docSelecionado) void carregarDetalhe(docSelecionado);
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temProcessando, docSelecionado]);

  const carregarDetalhe = useCallback((id: number) => {
    return fetch(`${BASE}/api/exames-lab/documentos/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("detalhe"))))
      .then((d: DocDetail) => setDetalhe(d))
      .catch(() => setDetalhe(null));
  }, []);

  useEffect(() => {
    if (docSelecionado) void carregarDetalhe(docSelecionado);
    else setDetalhe(null);
  }, [docSelecionado, carregarDetalhe]);

  const carregarEvolucao = useCallback((cid: string) => {
    if (!cid) {
      setEvolucao(null);
      return;
    }
    setCarregandoEvolucao(true);
    fetch(`${BASE}/api/exames-lab/evolucao/${cid}`)
      .then((r) => r.json())
      .then((d: EvolucaoData) => setEvolucao(d))
      .catch(() => setEvolucao(null))
      .finally(() => setCarregandoEvolucao(false));
  }, []);

  useEffect(() => {
    carregarEvolucao(clienteId);
  }, [clienteId, carregarEvolucao, docs]);

  const enviarExame = async () => {
    const file = fileRef.current?.files?.[0];
    if (!clienteId || !file) {
      setAviso("Escolha o cliente e o arquivo PDF antes de enviar.");
      return;
    }
    setEnviando(true);
    setAviso(null);
    try {
      const fd = new FormData();
      fd.append("clientId", clienteId);
      fd.append("file", file);
      const r = await fetch(`${BASE}/api/exames-lab/ingest`, {
        method: "POST",
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Falha no envio");
      setAviso(
        d.duplicate
          ? `Este arquivo ja foi recebido antes (documento ${d.documentId}). Nada foi duplicado.`
          : `Exame recebido (documento ${d.documentId}). A leitura por inteligencia artificial leva de 1 a 2 minutos — acompanhe na fila abaixo.`,
      );
      if (fileRef.current) fileRef.current.value = "";
      void carregarDocs();
      setDocSelecionado(d.documentId);
    } catch (e) {
      setAviso(`Erro: ${(e as Error).message}`);
    } finally {
      setEnviando(false);
    }
  };

  const conferir = async (fase: 1 | 2) => {
    if (!docSelecionado) return;
    if (!conferenteId) {
      setAviso("Escolha o colaborador conferente antes de conferir.");
      return;
    }
    setConferindo(true);
    try {
      const r = await fetch(
        `${BASE}/api/exames-lab/documentos/${docSelecionado}/conferir`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fase, professionalId: Number(conferenteId) }),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? "Falha ao conferir");
      }
      await carregarDetalhe(docSelecionado);
      void carregarDocs();
    } catch (e) {
      setAviso(`Erro: ${(e as Error).message}`);
    } finally {
      setConferindo(false);
    }
  };

  const docsFiltrados = useMemo(
    () =>
      clienteId ? docs.filter((d) => String(d.clientId) === clienteId) : docs,
    [docs, clienteId],
  );

  return (
    <ConsoleShell
      icon={FlaskConical}
      title="Exames do Cliente"
      subtitle="Upload → leitura por IA → Mesa de Validação → Evolução Antes/Depois"
    >
      {/* ---- Toggle global: liberar validacoes ---- */}
      <section className="panel-3d p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="bevel-3d flex h-9 w-9 flex-shrink-0 items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">
                Exigir conferência humana para liberar valores
              </p>
              <p className="text-xs text-muted-foreground">
                {exigirValidacao
                  ? "LIGADO: a Evolução só mostra valores conferidos pela equipe (C2)."
                  : "DESLIGADO: a Evolução mostra também valores lidos só pela IA (ainda não conferidos)."}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={exigirValidacao}
            disabled={salvandoToggle}
            onClick={() => void salvarToggle(!exigirValidacao)}
            className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${exigirValidacao ? "bg-emerald-500" : "bg-slate-400"}`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${exigirValidacao ? "translate-x-6" : "translate-x-1"}`}
            />
          </button>
        </div>
      </section>

      {/* ---- 1. Recepcao (upload avulso) ---- */}
      <section className="panel-3d p-5">
        <BlockTitle icon={Upload}>1. Receber exame (PDF)</BlockTitle>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <ClientPicker
            clientes={clientes}
            value={clienteId ? Number(clienteId) : null}
            onChange={(id) => setClienteId(id == null ? "" : String(id))}
            placeholder="Todos os clientes (filtro)"
            allOptionLabel="Todos os clientes (filtro)"
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="concave-3d h-10 w-full min-w-0 rounded-md bg-transparent px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-primary/10 file:px-2 file:py-0.5 file:text-xs file:font-semibold file:text-primary"
          />
          <button
            onClick={() => void enviarExame()}
            disabled={enviando}
            className="btn-3d-soft inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-semibold uppercase tracking-wide text-primary disabled:opacity-60"
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Enviar ao motor
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          O mesmo motor recebe automaticamente os exames que o cliente envia pela
          Area do Cliente. O valor lido pela IA so vira verdade clinica depois da
          conferencia humana na Mesa de Validacao.
        </p>
        {aviso && (
          <div className="bevel-3d mt-3 px-3 py-2 text-sm">
            {aviso}
          </div>
        )}
      </section>

      {/* ---- 2. Fila + Mesa de Validacao ---- */}
      <section className="panel-3d p-5">
        <div className="flex items-center justify-between">
          <BlockTitle icon={Microscope}>2. Mesa de Validação</BlockTitle>
          <button
            onClick={() => {
              setCarregandoDocs(true);
              void carregarDocs();
            }}
            className="btn-3d-soft inline-flex h-8 items-center gap-1.5 px-3 text-xs font-semibold uppercase tracking-wide text-primary"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
        </div>

        {carregandoDocs ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando fila…
          </div>
        ) : docsFiltrados.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            Nenhum documento na fila{clienteId ? " deste cliente" : ""}.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">Documento</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Laboratorio</th>
                  <th className="py-2 pr-3">Coleta</th>
                  <th className="py-2 pr-3">Situacao</th>
                </tr>
              </thead>
              <tbody>
                {docsFiltrados.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => setDocSelecionado(d.id)}
                    className={`cursor-pointer border-b last:border-0 hover:bg-primary/5 ${docSelecionado === d.id ? "bg-primary/10" : ""}`}
                  >
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">#{d.id}</span>
                        <span className="max-w-[220px] truncate text-muted-foreground">
                          {d.fileName}
                        </span>
                      </span>
                    </td>
                    <td className="py-2 pr-3">{d.clientName}</td>
                    <td className="py-2 pr-3">{d.labName ?? "—"}</td>
                    <td className="py-2 pr-3">{formatDateBr(d.collectionDate)}</td>
                    <td className="py-2 pr-3">{statusChip(d.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {detalhe && (
          <div className="concave-3d mt-4 rounded-md p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  Documento #{detalhe.id} — {detalhe.clientName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {detalhe.labName ?? "Laboratorio nao identificado"} · Coleta{" "}
                  {formatDateBr(detalhe.collectionDate)} · Confianca da leitura:{" "}
                  {detalhe.confidence ?? "—"} ({detalhe.modelUsed ?? "—"})
                </p>
                <div className="mt-2 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
                  {detalhe.conf1Name && (
                    <span>
                      C1 (operacional):{" "}
                      <span className="font-medium text-amber-700">
                        {formatColaborador(detalhe.conf1Name, detalhe.conf1Cargo)}
                      </span>{" "}
                      · {formatDateBr(detalhe.conf1At)}
                    </span>
                  )}
                  {detalhe.conf2Name && (
                    <span>
                      C2 (clínica):{" "}
                      <span className="font-medium text-emerald-700">
                        {formatColaborador(detalhe.conf2Name, detalhe.conf2Cargo)}
                      </span>{" "}
                      · {formatDateBr(detalhe.conf2At)}
                    </span>
                  )}
                </div>
              </div>

              {(detalhe.status === "recebido" || detalhe.status === "conferido_1") && (
                <div className="flex flex-col items-end gap-2">
                  <select
                    className="concave-3d h-9 min-w-[200px] rounded-md bg-transparent px-2 text-xs"
                    value={conferenteId}
                    onChange={(e) => setConferenteId(e.target.value)}
                  >
                    <option value="">Colaborador conferente…</option>
                    {profissionais.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {formatColaborador(p.name, p.role)}
                      </option>
                    ))}
                  </select>
                  {detalhe.status === "recebido" ? (
                    <button
                      onClick={() => void conferir(1)}
                      disabled={conferindo}
                      className="btn-3d-soft inline-flex h-9 items-center gap-2 px-4 text-sm font-semibold uppercase tracking-wide text-amber-700 disabled:opacity-60"
                    >
                      {conferindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stamp className="h-4 w-4" />}
                      Conferência operacional (C1)
                    </button>
                  ) : (
                    <button
                      onClick={() => void conferir(2)}
                      disabled={conferindo}
                      className="btn-3d-soft inline-flex h-9 items-center gap-2 px-4 text-sm font-semibold uppercase tracking-wide text-emerald-700 disabled:opacity-60"
                    >
                      {conferindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Liberar (conferência clínica C2)
                    </button>
                  )}
                </div>
              )}
              {detalhe.status === "conferido" && statusChip("conferido")}
            </div>

            {/* Link do Drive copiável (sob demanda) */}
            <DriveLinksField documentId={detalhe.id} />

            {detalhe.results.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="py-1.5 pr-3">Analito</th>
                      <th className="py-1.5 pr-3">Valor</th>
                      <th className="py-1.5 pr-3">Unidade</th>
                      <th className="py-1.5 pr-3">Referencia</th>
                      <th className="py-1.5 pr-3">Data</th>
                      <th className="py-1.5 pr-3">Situacao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalhe.results.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-1.5 pr-3 font-medium">
                          {r.analyteNameRaw}
                          {r.analyteCode && (
                            <span className="ml-1.5 text-[10px] uppercase text-primary">
                              {r.analyteCode}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3">{r.valueRaw ?? "—"}</td>
                        <td className="py-1.5 pr-3">{r.unitRaw ?? "—"}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">
                          {r.refLow ?? ""}
                          {r.refLow || r.refHigh ? " a " : "—"}
                          {r.refHigh ?? ""}
                        </td>
                        <td className="py-1.5 pr-3">{formatDateBr(r.collectionDate)}</td>
                        <td className="py-1.5 pr-3">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${resultStatusClass(r.status)}`}
                          >
                            {r.status ?? "sem ref."}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : detalhe.status === "processando" ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> A inteligencia
                artificial ainda esta lendo este laudo…
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhum analito extraido deste documento.
              </p>
            )}
          </div>
        )}
      </section>

      {/* ---- 3. Evolucao Antes/Depois ---- */}
      <section className="panel-3d p-5">
        <BlockTitle icon={TableProperties}>3. Evolução Antes / Depois</BlockTitle>
        {!clienteId ? (
          <p className="py-4 text-sm text-muted-foreground">
            Escolha um cliente no seletor do bloco 1 para ver o comparativo.
          </p>
        ) : carregandoEvolucao ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Montando comparativo…
          </div>
        ) : !evolucao || evolucao.analytes.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Nenhum resultado registrado para este cliente ainda.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">Analito</th>
                  {evolucao.columns.map((c) => (
                    <th key={c.key} className="py-2 pr-3 align-top">
                      <div>{formatDateBr(c.date)}</div>
                      <div className="font-normal normal-case text-muted-foreground">
                        {c.lab ?? ""}
                      </div>
                      <div className="mt-1">
                        <ConfSelo
                          level={c.confLevel}
                          conferenteName={c.conferenteName}
                          conferenteCargo={c.conferenteCargo}
                        />
                      </div>
                    </th>
                  ))}
                  <th className="py-2 pr-3">Tendencia</th>
                </tr>
              </thead>
              <tbody>
                {evolucao.analytes.map((a) => (
                  <tr key={a.key} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">
                      {a.name}
                      {a.unit && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">
                          {a.unit}
                        </span>
                      )}
                    </td>
                    {evolucao.columns.map((c) => {
                      const cell = a.cells[c.key];
                      return (
                        <td key={c.key} className="py-2 pr-3">
                          {cell ? (
                            <span
                              className={`inline-block rounded px-1.5 py-0.5 font-medium ${resultStatusClass(cell.status)}`}
                            >
                              {cell.value ?? "—"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">·</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 pr-3">
                      {a.trend === "subiu" && (
                        <TrendingUp className="h-4 w-4 text-red-500" />
                      )}
                      {a.trend === "caiu" && (
                        <TrendingDown className="h-4 w-4 text-amber-600" />
                      )}
                      {a.trend === "estavel" && (
                        <Minus className="h-4 w-4 text-muted-foreground" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---- 4. VIGILÂNCIA DO DRIVE (fundida de /arsenal/drive-watcher) ---- */}
      <section className="panel-3d p-5">
        <button
          type="button"
          onClick={() => setVigilanciaAberta((v) => !v)}
          className="flex w-full items-center justify-between"
        >
          <BlockTitle icon={Radar}>4. Vigilância do Drive</BlockTitle>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${vigilanciaAberta ? "rotate-180" : ""}`}
          />
        </button>
        {vigilanciaAberta && (
          <div className="mt-2">
            <DriveWatcherPanel embedded />
          </div>
        )}
      </section>

      {/* ---- 5. IMPORTAÇÃO DO DRIVE (fundida de /importar-drive) ---- */}
      <section className="panel-3d p-5">
        <button
          type="button"
          onClick={() => setImportacaoAberta((v) => !v)}
          className="flex w-full items-center justify-between"
        >
          <BlockTitle icon={DownloadCloud}>5. Importação do Drive</BlockTitle>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${importacaoAberta ? "rotate-180" : ""}`}
          />
        </button>
        {importacaoAberta && (
          <div className="mt-2">
            <ImportarDrivePanel embedded />
          </div>
        )}
      </section>
    </ConsoleShell>
  );
}
