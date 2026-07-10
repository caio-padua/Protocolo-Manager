import { useCallback, useEffect, useRef, useState } from "react";
import {
  DownloadCloud,
  FlaskConical,
  Image as ImageIcon,
  Layers,
  Play,
  RefreshCw,
  FolderSearch,
  CheckCircle2,
  Copy,
  AlertTriangle,
  UserX,
} from "lucide-react";
import { ConsoleShell, BlockTitle, BASE } from "./comunicacao/_shared";
import { getCollabToken } from "@/lib/collab-auth";
import { useToast } from "@/hooks/use-toast";

// ============================================================================
// IMPORTAÇÃO DO DRIVE — AO VIVO (spec importacao-drive-ao-vivo).
// Acompanha a importação em massa minuto a minuto: progresso, contadores e o
// FEED do que já foi importado. Polling a cada 3s. Rota protegida por
// colaborador (dispara IA + expõe PII). Padrão visual Paxter (panel-3d/bevel).
// ============================================================================

type RecentEntry = {
  clientId: number;
  clientName: string;
  fileName: string;
  kind: "lab" | "imagem";
  at: string;
};

type ImportStatus = {
  status: "idle" | "scanning" | "running" | "done" | "error";
  mode: "scan" | "full" | null;
  scope: "active" | "all";
  startedAt: string | null;
  finishedAt: string | null;
  currentFolder: string | null;
  message: string;
  totals: {
    foldersScanned: number;
    foldersTotal: number;
    filesFound: number;
    ingested: number;
    duplicates: number;
    labDocs: number;
    imageDocs: number;
    nonExam: number;
    errors: number;
    noMatch: number;
    homonimUnited: number;
    skippedInactive: number;
  };
  recent: RecentEntry[];
};

function authHeaders(): HeadersInit {
  const t = getCollabToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function horaBR(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

const STATUS_LABEL: Record<ImportStatus["status"], string> = {
  idle: "Parada",
  scanning: "Varrendo",
  running: "Importando",
  done: "Concluída",
  error: "Erro",
};

function CounterCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof FlaskConical;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="bevel-3d flex items-center gap-3 p-3">
      <div className={`flex h-9 w-9 items-center justify-center ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </div>
        <div className="text-xl font-bold tabular-nums leading-tight">{value}</div>
      </div>
    </div>
  );
}

export default function ImportarDrive() {
  const { toast } = useToast();
  const [data, setData] = useState<ImportStatus | null>(null);
  const [error, setError] = useState(false);
  const [starting, setStarting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const alive = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/importar-drive/status`, { headers: authHeaders() });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as ImportStatus;
      if (alive.current) {
        setData(d);
        setError(false);
      }
    } catch {
      if (alive.current) setError(true);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void fetchStatus();
    const id = setInterval(() => void fetchStatus(), 3000);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [fetchStatus]);

  const running = data?.status === "running" || data?.status === "scanning";

  const startImport = useCallback(async () => {
    setStarting(true);
    try {
      const r = await fetch(`${BASE}/api/importar-drive/run`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "all" }),
      });
      if (r.status === 202) {
        toast({ title: "Importação disparada", description: "Acompanhe o progresso ao vivo abaixo." });
      } else if (r.status === 409) {
        toast({ title: "Já está em execução", description: "A importação já está rodando." });
      } else {
        throw new Error(String(r.status));
      }
      await fetchStatus();
    } catch {
      toast({ title: "Falha ao disparar", description: "Não foi possível iniciar. Tente novamente.", variant: "destructive" });
    } finally {
      setStarting(false);
    }
  }, [fetchStatus, toast]);

  const baixarRelatorio = useCallback(async () => {
    setDownloading(true);
    try {
      const r = await fetch(`${BASE}/api/importar-drive/relatorio.xlsx`, { headers: authHeaders() });
      if (!r.ok) throw new Error(String(r.status));
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "importacao-drive.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Falha no relatório", description: "Não foi possível baixar a planilha.", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }, [toast]);

  const t = data?.totals;
  const pct = t && t.foldersTotal > 0 ? Math.round((t.foldersScanned / t.foldersTotal) * 100) : 0;

  return (
    <ConsoleShell
      icon={DownloadCloud}
      title="Importação do Drive — Ao Vivo"
      subtitle="Acompanhe a extração dos exames minuto a minuto: progresso, contadores e o que já foi importado."
    >
      {/* Barra de comando */}
      <div className="panel-3d p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={`paxter-led paxter-led-breathe ${
                error
                  ? "paxter-led-red"
                  : running
                    ? "paxter-led-green"
                    : data?.status === "done"
                      ? "paxter-led-green"
                      : "paxter-led-amber"
              }`}
            />
            <div>
              <div className="text-sm font-bold uppercase tracking-[0.08em]">
                {error ? "Indisponível" : data ? STATUS_LABEL[data.status] : "Carregando…"}
              </div>
              <div className="text-xs text-muted-foreground">
                {error
                  ? "Não foi possível ler o estado. Tentando de novo…"
                  : data?.message ?? ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={startImport}
              disabled={starting || running}
              className="btn-3d inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold uppercase tracking-wide disabled:opacity-50"
            >
              {starting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {running ? "Rodando…" : "Iniciar / Re-disparar"}
            </button>
            <button
              type="button"
              onClick={baixarRelatorio}
              disabled={downloading}
              className="btn-3d-soft inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold uppercase tracking-wide disabled:opacity-50"
            >
              {downloading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
              Relatório (Excel)
            </button>
          </div>
        </div>

        {/* Progresso de pastas */}
        <div className="mt-5">
          <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <FolderSearch className="h-4 w-4" />
              {t ? `${t.foldersScanned} de ${t.foldersTotal} pastas` : "—"}
              {data?.currentFolder ? ` · ${data.currentFolder}` : ""}
            </span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="bevel-3d-well h-3 w-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Contadores */}
      <div className="panel-3d p-5">
        <BlockTitle icon={Layers}>Contadores</BlockTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <CounterCard icon={CheckCircle2} label="Lançados" value={t?.ingested ?? 0} accent="text-emerald-600" />
          <CounterCard icon={FlaskConical} label="Laboratoriais" value={t?.labDocs ?? 0} accent="text-primary" />
          <CounterCard icon={ImageIcon} label="Imagem" value={t?.imageDocs ?? 0} accent="text-primary" />
          <CounterCard icon={Copy} label="Já existiam" value={t?.duplicates ?? 0} accent="text-muted-foreground" />
          <CounterCard icon={AlertTriangle} label="Erros" value={t?.errors ?? 0} accent="text-rose-600" />
          <CounterCard icon={UserX} label="Sem cliente" value={t?.noMatch ?? 0} accent="text-amber-600" />
        </div>
      </div>

      {/* Feed ao vivo */}
      <div className="panel-3d p-5">
        <BlockTitle icon={DownloadCloud}>Importados agora (últimos 80)</BlockTitle>
        {data && data.recent.length > 0 ? (
          <ul className="max-h-[28rem] divide-y divide-border/60 overflow-y-auto pr-1">
            {data.recent.map((r, i) => (
              <li key={`${r.clientId}-${r.at}-${i}`} className="flex items-center gap-3 py-2">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center bevel-3d ${
                    r.kind === "lab" ? "text-primary" : "text-cyan-600"
                  }`}
                >
                  {r.kind === "lab" ? <FlaskConical className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{r.clientName}</div>
                  <div className="truncate text-xs text-muted-foreground">{r.fileName}</div>
                </div>
                <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {r.kind === "lab" ? "Lab" : "Imagem"}
                </span>
                <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{horaBR(r.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {running
              ? "Aguardando o primeiro exame ser lançado…"
              : "Nenhum exame lançado ainda. Clique em Iniciar / Re-disparar para começar."}
          </p>
        )}
      </div>
    </ConsoleShell>
  );
}
