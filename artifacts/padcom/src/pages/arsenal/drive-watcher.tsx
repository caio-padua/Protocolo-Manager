import { useState, useEffect, useRef } from "react";
import {
  Radar, RefreshCw, Play, CheckCircle2, AlertCircle,
  Clock, FolderOpen, User, FileText, Loader2, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

// ============================================================================
// Painel de Vigilância de Pasta Drive
// Monitora as duas pastas compartilhadas (Sangue + Imagem) e importa arquivos
// novos automaticamente: identifica paciente, extrai, renomeia, sobe ao Drive.
// ============================================================================

interface WatcherState {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  filesFound: number;
  filesNew: number;
  filesProcessed: number;
  filesError: number;
  clientsCreated: string[];
  log: string[];
}

interface WatcherStats {
  total: number;
  processado: number;
  pendente: number;
  erro: number;
  recentes: Record<string, unknown>[];
}

interface ScanResult {
  folderId: string;
  folderType: "sangue" | "imagem";
  label: string;
  totalFiles: number;
  newFiles: { id: string; name: string }[];
}

function fmtDt(val: string | null): string {
  if (!val) return "—";
  try { return format(parseISO(val), "dd/MM HH:mm", { locale: ptBR }); } catch { return val; }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    processado: "bg-emerald-100 text-emerald-800",
    pendente:   "bg-amber-100 text-amber-800",
    erro:       "bg-red-100 text-red-800",
    ignorado:   "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`inline-block text-[10px] font-bold tracking-widest px-2 py-0.5 rounded ${map[status] ?? "bg-gray-100"}`}>
      {status.toUpperCase()}
    </span>
  );
}

function authHeader() {
  const t = localStorage.getItem("collab_token") ?? "";
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function DriveWatcherPage() {
  const [state, setState] = useState<WatcherState | null>(null);
  const [stats, setStats] = useState<WatcherStats | null>(null);
  const [scan, setScan] = useState<ScanResult[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [maxFiles, setMaxFiles] = useState(20);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchStatus() {
    try {
      const r = await fetch("/api/drive-watcher/status", { headers: authHeader() });
      if (!r.ok) return;
      const d = await r.json();
      setState(d.state);
      setStats(d.stats);
    } catch { /* silencioso */ }
  }

  useEffect(() => {
    fetchStatus();
    pollingRef.current = setInterval(fetchStatus, 4000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  async function doScan() {
    setScanning(true);
    setScan(null);
    try {
      const r = await fetch("/api/drive-watcher/scan", {
        method: "POST",
        headers: authHeader(),
      });
      if (r.ok) {
        const d = await r.json();
        setScan(d.result ?? []);
      }
    } finally {
      setScanning(false);
    }
  }

  async function doProcess() {
    setProcessing(true);
    try {
      await fetch("/api/drive-watcher/process", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ maxFiles }),
      });
      await fetchStatus();
    } finally {
      setProcessing(false);
    }
  }

  const isRunning = state?.running ?? false;

  return (
    <div className="p-6 space-y-6">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#1a2744] rounded-[6px] flex items-center justify-center">
            <Radar className="w-5 h-5 text-[#c9a227]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#1a2744] uppercase tracking-widest">
              Vigilância de Pasta Drive
            </h1>
            <p className="text-xs text-gray-500">
              Monitora as pastas de exames compartilhadas e importa arquivos novos automaticamente
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchStatus} className="text-gray-500">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Pastas monitoradas */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { type: "sangue",  label: "Exames de Sangue",  color: "bg-red-50 border-red-200" },
          { type: "imagem",  label: "Exames de Imagem",  color: "bg-blue-50 border-blue-200" },
        ].map((folder) => {
          const scanData = scan?.find((s) => s.folderType === folder.type);
          return (
            <div key={folder.type} className={`rounded-[6px] border ${folder.color} p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <FolderOpen className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-semibold text-gray-800">{folder.label}</span>
              </div>
              {scanData ? (
                <div className="space-y-1">
                  <div className="text-sm text-gray-700">
                    <span className="font-bold">{scanData.totalFiles}</span> arquivo(s) na pasta
                  </div>
                  <div className="text-sm text-gray-700">
                    <span className="font-bold text-amber-700">{scanData.newFiles.length}</span> novo(s) para processar
                  </div>
                  {scanData.newFiles.slice(0, 3).map((f) => (
                    <div key={f.id} className="text-xs text-gray-500 truncate">• {f.name}</div>
                  ))}
                  {scanData.newFiles.length > 3 && (
                    <div className="text-xs text-gray-400">+ {scanData.newFiles.length - 3} arquivo(s)</div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-400">Clique em "Escanear" para verificar</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Ações */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          onClick={doScan}
          disabled={scanning || isRunning}
          variant="outline"
          className="border-[#1a2744] text-[#1a2744]"
        >
          {scanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
          Escanear Pastas
        </Button>

        <div className="flex items-center gap-2">
          <Button
            onClick={doProcess}
            disabled={processing || isRunning}
            className="bg-[#1a2744] hover:bg-[#243660] text-white"
          >
            {(processing || isRunning) ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            {isRunning ? "Processando..." : "Processar Novos"}
          </Button>
          <div className="flex items-center gap-1 text-xs text-gray-600">
            <span>Máx</span>
            <input
              type="number"
              value={maxFiles}
              onChange={(e) => setMaxFiles(Math.max(1, parseInt(e.target.value, 10) || 20))}
              className="w-12 border border-gray-300 rounded px-1 py-0.5 text-center text-xs"
            />
            <span>arquivos</span>
          </div>
        </div>

        {isRunning && (
          <div className="flex items-center gap-2 text-amber-700 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Worker rodando — atualiza automaticamente a cada 4s</span>
          </div>
        )}
      </div>

      {/* Estatísticas */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "TOTAL VISTO", value: stats.total, icon: <FileText className="w-4 h-4" />, color: "text-gray-700" },
            { label: "PROCESSADOS", value: stats.processado, icon: <CheckCircle2 className="w-4 h-4" />, color: "text-emerald-700" },
            { label: "PENDENTES",   value: stats.pendente,   icon: <Clock className="w-4 h-4" />,        color: "text-amber-700" },
            { label: "ERROS",       value: stats.erro,       icon: <AlertCircle className="w-4 h-4" />,  color: "text-red-700" },
          ].map((k) => (
            <div key={k.label} className="bg-white rounded-[6px] border border-gray-200 px-4 py-3">
              <div className={`flex items-center gap-1 ${k.color} mb-1`}>
                {k.icon}
                <span className="text-[10px] font-bold tracking-widest">{k.label}</span>
              </div>
              <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Pacientes criados automaticamente */}
      {state && state.clientsCreated.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-[6px] p-4">
          <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-2">
            <User className="w-4 h-4" />
            Pacientes criados automaticamente nesta execução — REVISAR CADASTRO
          </div>
          <div className="space-y-1">
            {state.clientsCreated.map((name, i) => (
              <div key={i} className="text-sm text-amber-700 flex items-center gap-2">
                <AlertCircle className="w-3 h-3" />
                {name}
                <span className="text-xs text-amber-500">(cadastro incompleto — verificar CPF, data de nascimento)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log em tempo real */}
      {state && state.log.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">Log da Última Execução</h3>
          <div className="bg-[#0f1923] rounded-[6px] p-3 max-h-48 overflow-y-auto font-mono text-xs text-green-400 space-y-0.5">
            {state.log.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
          {state.startedAt && (
            <div className="text-xs text-gray-400 mt-1">
              Iniciado: {fmtDt(state.startedAt)}
              {state.finishedAt && ` · Concluído: ${fmtDt(state.finishedAt)}`}
              {` · ${state.filesProcessed} processado(s) · ${state.filesError} erro(s)`}
            </div>
          )}
        </div>
      )}

      {/* Tabela de arquivos recentes */}
      {stats && stats.recentes.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">
            Arquivos Recentes ({stats.recentes.length})
          </h3>
          <div className="bg-white rounded-[6px] border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1a2744] text-white text-[10px] uppercase tracking-widest">
                  <th className="text-left px-3 py-2">Arquivo Original</th>
                  <th className="text-left px-3 py-2">Renomeado Para</th>
                  <th className="text-left px-3 py-2">Paciente</th>
                  <th className="text-left px-3 py-2">Tipo</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Data</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentes.map((r, i) => (
                  <tr key={String(r.file_id)} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-3 py-2 text-xs text-gray-700 max-w-[200px] truncate" title={String(r.original_name)}>
                      {String(r.original_name)}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 max-w-[200px] truncate" title={String(r.renamed_to || "—")}>
                      {String(r.renamed_to || "—")}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700">{String(r.client_name_raw || "—")}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        r.folder_type === "sangue" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                      }`}>
                        {String(r.folder_type).toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2"><StatusBadge status={String(r.status)} /></td>
                    <td className="px-3 py-2 text-xs text-gray-500">{fmtDt(String(r.created_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stats.recentes.some((r) => r.status === "erro") && (
            <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Alguns arquivos tiveram erro — verifique o log da próxima execução ou corrija manualmente na tela de Validações.
            </div>
          )}
        </div>
      )}

    </div>
  );
}
