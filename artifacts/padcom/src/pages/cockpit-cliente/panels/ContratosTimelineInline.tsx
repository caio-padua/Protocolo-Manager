import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ExternalLink, FileSignature, Loader2, Lock } from "lucide-react";
import { getCollabToken } from "@/lib/collab-auth";
import { listarTimeline, type TimelineItem } from "@/lib/cartorio-api";

// ===========================================================================
// CONTRATOS & TERMOS (Cockpit da Consulta — aba Documentos): linha do tempo
// do Cartorio (motor de assinatura) do cliente selecionado, inline. A emissao
// completa (editor, clausulas, ZapSign) continua no Cartorio.
// Spec: specs/cockpit-cliente-onda2-anamnese-exames.md
// ===========================================================================

const NAVY = "#16294a";
const OURO = "#9a7b32";

function statusVisual(status: string): { rotulo: string; cor: string } {
  const s = status.toLowerCase();
  if (s.includes("conclu") || s.includes("assinad")) return { rotulo: status, cor: "#16a34a" };
  if (s.includes("erro") || s.includes("recus") || s.includes("cancel"))
    return { rotulo: status, cor: "#dc2626" };
  if (s.includes("envi") || s.includes("pend")) return { rotulo: status, cor: "#d97706" };
  return { rotulo: status, cor: "#94a3b8" };
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function ContratosTimelineInline({ clientId }: { clientId: number }) {
  const temToken = Boolean(getCollabToken());
  const [itens, setItens] = useState<TimelineItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!temToken) {
      setCarregando(false);
      return;
    }
    let ativo = true;
    setCarregando(true);
    setErro("");
    listarTimeline(clientId)
      .then((data) => {
        if (ativo) setItens(data);
      })
      .catch(() => {
        if (ativo) setErro("Não foi possível carregar os documentos do Cartório.");
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [clientId, temToken]);

  return (
    <div className="rounded-md border bg-white p-4 shadow-sm" style={{ borderColor: "#d8cfbc" }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em]"
          style={{ color: NAVY }}
        >
          <FileSignature className="h-4 w-4" style={{ color: OURO }} />
          Contratos & Termos (Cartório)
        </div>
        <Link
          href="/cartorio"
          className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
          style={{ borderColor: OURO, color: NAVY }}
        >
          <ExternalLink className="h-3.5 w-3.5" /> Abrir Cartório completo
        </Link>
      </div>

      {!temToken ? (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <Lock className="h-4 w-4 shrink-0" />
          Entre como colaborador para ver os contratos e termos deste cliente.
        </div>
      ) : carregando ? (
        <div className="flex items-center gap-2 py-3 text-sm" style={{ color: "#647c97" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando documentos…
        </div>
      ) : erro ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {erro}
        </div>
      ) : itens.length === 0 ? (
        <p className="py-1 text-sm" style={{ color: "#647c97" }}>
          Nenhum contrato ou termo emitido para este cliente.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr
                className="border-b text-left text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "#647c97", borderColor: "#eee5d0" }}
              >
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3">Título</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Enviado</th>
                <th className="py-2">Concluído</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((t) => {
                const sv = statusVisual(t.status);
                return (
                  <tr key={t.id} className="border-b last:border-0" style={{ borderColor: "#f3eee1" }}>
                    <td className="py-2 pr-3 font-semibold" style={{ color: NAVY }}>
                      {t.tipoDoc}
                    </td>
                    <td className="max-w-[280px] truncate py-2 pr-3" style={{ color: "#4a5d75" }}>
                      {t.titulo ?? "—"}
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
                      {fmtData(t.enviadoEm)}
                    </td>
                    <td className="py-2" style={{ color: "#4a5d75" }}>
                      {fmtData(t.concluidoEm)}
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
