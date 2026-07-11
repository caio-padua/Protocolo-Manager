import { useEffect, useState } from "react";
import { FileUp, Loader2, TrendingUp } from "lucide-react";

// ===========================================================================
// EXAMES ENVIADOS (Cockpit da Consulta — aba Exames): documentos de exame
// uploadados pelo sistema (portal, area do cliente, importacao Drive) do
// cliente selecionado, com status de conferencia C1/C2.
// Colunas + graficos dos analitos ficam na aba Evolucao (EvolucaoExamesPanel).
// Spec: specs/cockpit-cliente-onda2-anamnese-exames.md
// ===========================================================================

const NAVY = "#16294a";
const OURO = "#9a7b32";
const API = import.meta.env.BASE_URL + "api";

type DocRow = {
  id: number;
  fileName: string;
  labName: string | null;
  collectionDate: string | null;
  status: string;
  createdAt: string;
  conf1Name: string | null;
  conf1Cargo: string | null;
  conf2Name: string | null;
  conf2Cargo: string | null;
};

const STATUS_VISUAL: Record<string, { rotulo: string; cor: string }> = {
  processando: { rotulo: "Processando", cor: "#0e7490" },
  recebido: { rotulo: "Recebido", cor: "#d97706" },
  conferido_1: { rotulo: "Conferido 1/2", cor: "#2563eb" },
  conferido: { rotulo: "Conferido", cor: "#16a34a" },
  erro: { rotulo: "Erro", cor: "#dc2626" },
};

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function ExamesEnviadosPanel({ clientId }: { clientId: number }) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro("");
    fetch(`${API}/exames-lab/documentos?clientId=${clientId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<DocRow[]>;
      })
      .then((data) => {
        if (ativo) setDocs(data);
      })
      .catch(() => {
        if (ativo) setErro("Não foi possível carregar os exames enviados.");
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [clientId]);

  return (
    <div className="rounded-md border bg-white p-4 shadow-sm" style={{ borderColor: "#d8cfbc" }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em]"
          style={{ color: NAVY }}
        >
          <FileUp className="h-4 w-4" style={{ color: OURO }} />
          Exames enviados pelo sistema
        </div>
        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "#647c97" }}>
          <TrendingUp className="h-3.5 w-3.5" />
          Colunas e gráficos dos analitos: aba Evolução
        </div>
      </div>

      {carregando ? (
        <div className="flex items-center gap-2 py-4 text-sm" style={{ color: "#647c97" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando exames…
        </div>
      ) : erro ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {erro}
        </div>
      ) : docs.length === 0 ? (
        <p className="py-2 text-sm" style={{ color: "#647c97" }}>
          Nenhum exame enviado para este cliente.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr
                className="border-b text-left text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "#647c97", borderColor: "#eee5d0" }}
              >
                <th className="py-2 pr-3">Arquivo</th>
                <th className="py-2 pr-3">Laboratório</th>
                <th className="py-2 pr-3">Coleta</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Conferências</th>
                <th className="py-2">Entrada</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const sv = STATUS_VISUAL[d.status] ?? { rotulo: d.status, cor: "#94a3b8" };
                return (
                  <tr key={d.id} className="border-b last:border-0" style={{ borderColor: "#f3eee1" }}>
                    <td className="max-w-[280px] truncate py-2 pr-3 font-semibold" style={{ color: NAVY }}>
                      {d.fileName}
                    </td>
                    <td className="py-2 pr-3" style={{ color: "#4a5d75" }}>
                      {d.labName ?? "—"}
                    </td>
                    <td className="py-2 pr-3" style={{ color: "#4a5d75" }}>
                      {fmtData(d.collectionDate)}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white"
                        style={{ background: sv.cor }}
                      >
                        {sv.rotulo}
                      </span>
                    </td>
                    <td className="py-2 pr-3" style={{ color: "#4a5d75" }}>
                      {d.conf1Name
                        ? `C1 ${d.conf1Name}${d.conf1Cargo ? ` (${d.conf1Cargo})` : ""}`
                        : "C1 —"}
                      {" · "}
                      {d.conf2Name
                        ? `C2 ${d.conf2Name}${d.conf2Cargo ? ` (${d.conf2Cargo})` : ""}`
                        : "C2 —"}
                    </td>
                    <td className="py-2" style={{ color: "#4a5d75" }}>
                      {fmtData(d.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
