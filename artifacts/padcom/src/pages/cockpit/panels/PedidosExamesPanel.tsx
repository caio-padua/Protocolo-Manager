import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Search,
  Trash2,
  Send,
  Mail,
  MessageCircle,
  FileText,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { BASE } from "../../comunicacao/_shared";
import { getCollabToken } from "@/lib/collab-auth";
import { useClinicalIdentity } from "@/hooks/use-clinical-identity";
import { ClinicalIdentityPanel } from "@/components/ClinicalIdentityPanel";
import ExamRequestHistoryPanel from "./ExamRequestHistoryPanel";

// ===========================================================================
// PAINEL: PEDIDOS DE EXAMES (client-scoped) — extraido de consulta/index.tsx.
// Catalogo + carrinho + medico solicitante + envio (e-mail/WhatsApp).
// Consome apenas motores existentes:
//   GET  /api/catalogos/exames    (catalogo)
//   GET  /api/professionals       (medicos)
//   POST /api/exam-requests/emit  (gera PDF + envio)
// ===========================================================================

type Tipo = "SANGUE" | "IMAGEM" | "OUTROS";

interface ProfOption {
  id: number;
  name: string;
  crm?: string | null;
  role?: string | null;
}
interface Exam {
  id: number;
  codigoExame: string | null;
  nomeExame: string | null;
  grupoPrincipal: string | null;
  subgrupo: string | null;
  modalidade: string | null;
  materialOuSetor: string | null;
  preparo: string | null;
  ativo?: boolean | null;
}
interface CartItem {
  id: number;
  nomeExame: string;
  codigoExame: string | null;
  grupoPrincipal: string | null;
  preparo: string | null;
  tipo: Tipo;
}
interface EmitResult {
  pdfs: Array<{ id: number; tipoLabel: string; fileName: string; examCount: number; url: string }>;
  email: { attempted: boolean; success: boolean; error?: string };
  whatsapp: { attempted: boolean; success: boolean; error?: string };
}

const TIPO_COLOR: Record<Tipo, string> = {
  SANGUE: "#B91C1C",
  IMAGEM: "#1D4ED8",
  OUTROS: "#7C3AED",
};
const IMAGING_MODALITIES = ["USG", "TC", "RM", "RX", "DENSITOMETRIA", "MAMOGRAFIA"];

function noAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function classifyTipo(modalidade: string | null, material: string | null, grupo: string | null): Tipo {
  const m = (modalidade ?? "").trim().toUpperCase();
  const mat = (material ?? "").trim().toUpperCase();
  const g = noAccents((grupo ?? "").trim().toUpperCase());
  if (m.includes("ENDOSCOP") || g.includes("ENDOSCOP")) return "OUTROS";
  const imagingByMod = IMAGING_MODALITIES.includes(m) || m.includes("IMAGEM");
  const imagingByMat = mat.includes("IMAGEM");
  const imagingByGroup =
    g.includes("IMAGEM") ||
    g.includes("RESSONANCIA") ||
    g.includes("ULTRASSOM") ||
    g.includes("MAMOGRAFIA") ||
    g === "TC" ||
    g === "BLOCO RX";
  if (imagingByMod || imagingByMat || imagingByGroup) return "IMAGEM";
  if (m === "CARDIO" || mat === "FUNCIONAL") return "OUTROS";
  return "SANGUE";
}

export default function PedidosExamesPanel({ clientId }: { clientId: number }) {
  const identity = useClinicalIdentity(clientId);
  const [exams, setExams] = useState<Exam[]>([]);
  const [carregandoExams, setCarregandoExams] = useState(true);
  const [erroExams, setErroExams] = useState(false);
  const [busca, setBusca] = useState("");
  const [cart, setCart] = useState<Record<number, CartItem>>({});
  const [observacao, setObservacao] = useState("");
  const [cardiacOnly, setCardiacOnly] = useState(false);
  const [individualDocuments, setIndividualDocuments] = useState(true);
  const [recentIds, setRecentIds] = useState<number[]>([]);
  const activeClient = useRef(clientId);
  activeClient.current = clientId;
  const [emitindo, setEmitindo] = useState(false);
  const [emitResult, setEmitResult] = useState<EmitResult | null>(null);
  const [emitErro, setEmitErro] = useState<string | null>(null);


  const carregarExams = useCallback(() => {
    setCarregandoExams(true);
    setErroExams(false);
    fetch(`${BASE}/api/catalogos/exames`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("catalogo"))))
      .then((d: Exam[]) => setExams(Array.isArray(d) ? d : []))
      .catch(() => {
        setExams([]);
        setErroExams(true);
      })
      .finally(() => setCarregandoExams(false));
  }, []);

  useEffect(() => {
    carregarExams();
  }, [carregarExams]);

  // Trocar de cliente limpa o carrinho e o resultado da emissao anterior.
  useEffect(() => {
    setCart({});
    setEmitResult(null);
    setEmitErro(null);
    setRecentIds([]);
    setObservacao("");
  }, [clientId]);

  const examesFiltrados = useMemo(() => {
    const term = noAccents(busca.trim().toLowerCase());
    const ativos = exams.filter((e) => {
      if (e.ativo === false || !e.nomeExame) return false;
      const text = noAccents([e.nomeExame, e.grupoPrincipal, e.subgrupo, e.modalidade].filter(Boolean).join(" ")).toUpperCase();
      return !cardiacOnly || /CARDIO|ECOCARD|CORONARI|HOLTER|\bECG\b|\bMAPA\b|ERGOMETR|(?:ESCORE|SCORE).*CALCIO/.test(text);
    });
    if (!term) return ativos.slice(0, 40);
    return ativos
      .filter((e) =>
        [e.nomeExame, e.codigoExame, e.grupoPrincipal, e.subgrupo]
          .filter(Boolean)
          .some((v) => noAccents(String(v).toLowerCase()).includes(term)),
      )
      .slice(0, 60);
  }, [exams, busca, cardiacOnly]);

  const cartList = useMemo(() => Object.values(cart), [cart]);

  const toggleExam = (e: Exam) => {
    setCart((prev) => {
      const next = { ...prev };
      if (next[e.id]) delete next[e.id];
      else
        next[e.id] = {
          id: e.id,
          nomeExame: e.nomeExame ?? "(sem nome)",
          codigoExame: e.codigoExame,
          grupoPrincipal: e.grupoPrincipal,
          preparo: e.preparo,
          tipo: classifyTipo(e.modalidade, e.materialOuSetor, e.grupoPrincipal),
        };
      return next;
    });
  };

  const emitir = async () => {
    if (emitindo || cartList.length === 0 || !identity.data || identity.isFetching || identity.isError) return;
    const requestedClient = clientId;
    setEmitindo(true);
    setEmitErro(null);
    setEmitResult(null);
    try {
      const r = await fetch(`${BASE}/api/exam-requests/emit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getCollabToken() ?? ""}` },
        body: JSON.stringify({
          clientId,
          observacao: observacao.trim() || undefined,
          individualDocuments,
          sendEmail: false,
          sendWhatsapp: false,
          items: cartList.map((i) => ({
            nomeExame: i.nomeExame,
            codigoExame: i.codigoExame,
            grupoPrincipal: i.grupoPrincipal,
            preparo: i.preparo,
            tipo: i.tipo,
          })),
        }),
      });
      const d = await r.json().catch(() => ({}) as Record<string, unknown>);
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Falha ao gerar solicitação");
      if (activeClient.current !== requestedClient) return;
      setEmitResult(d as EmitResult);
      setRecentIds((d as EmitResult).pdfs.map(pdf => pdf.id));
      setCart({});
    } catch (e) {
      if (activeClient.current === requestedClient) setEmitErro((e as Error).message);
    } finally {
      if (activeClient.current === requestedClient) setEmitindo(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      {/* Catalogo */}
      <div className="space-y-3">
        <label className="concave-3d flex items-center gap-2 p-3 text-sm">
          <input type="checkbox" checked={cardiacOnly} onChange={event => setCardiacOnly(event.target.checked)} disabled={emitindo} />
          Mostrar exames cardiológicos
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="concave-3d h-10 w-full rounded-md bg-transparent pl-9 pr-3 text-sm"
            placeholder="Buscar exame pelo nome…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        {carregandoExams ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando catálogo…
          </div>
        ) : erroExams ? (
          <div className="bevel-3d flex items-center justify-between gap-2 px-3 py-3 text-sm text-red-400">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" /> Falha ao carregar o catálogo de exames.
            </span>
            <button
              type="button"
              onClick={() => carregarExams()}
              className="btn-3d-soft rounded px-2 py-1 text-xs font-semibold uppercase"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <div className="max-h-[420px] divide-y divide-white/10 overflow-y-auto rounded-md border border-white/10">
            {examesFiltrados.map((e) => {
              const tipo = classifyTipo(e.modalidade, e.materialOuSetor, e.grupoPrincipal);
              return (
                <label key={e.id} className="flex cursor-pointer items-start gap-3 px-3 py-2 neon-hover">
                  <input type="checkbox" disabled={emitindo} checked={!!cart[e.id]} onChange={() => toggleExam(e)} className="mt-1" />
                  <span className="min-w-0">
                    <span className="block text-sm">{e.nomeExame}</span>
                    <span className="block text-xs text-muted-foreground">
                      <span
                        className="mr-1 inline-block rounded px-1 text-[10px] font-bold uppercase text-white"
                        style={{ background: TIPO_COLOR[tipo] }}
                      >
                        {tipo}
                      </span>
                      {[e.codigoExame, e.grupoPrincipal].filter(Boolean).join(" • ")}
                    </span>
                  </span>
                </label>
              );
            })}
            {examesFiltrados.length === 0 && (
              <p className="px-3 py-6 text-sm text-muted-foreground">Nenhum exame encontrado.</p>
            )}
          </div>
        )}
      </div>

      {/* Carrinho + acoes */}
      <div className="space-y-3">
        <div className="concave-3d rounded-md p-3">
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Selecionados ({cartList.length})
          </p>
          {cartList.length === 0 ? (
            <p className="text-xs text-muted-foreground">Marque exames no catálogo ao lado.</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {cartList.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{i.nomeExame}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setCart((prev) => {
                        const n = { ...prev };
                        delete n[i.id];
                        return n;
                      })
                    }
                    className="text-muted-foreground hover:text-red-400"
                    aria-label="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <ClinicalIdentityPanel identity={identity} />

        <textarea
          className="concave-3d min-h-[64px] w-full rounded-md bg-transparent px-3 py-2 text-sm"
          placeholder="Observação (opcional)…"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
        />

        <label className="concave-3d flex items-start gap-2 p-3 text-sm">
          <input type="checkbox" checked={individualDocuments} disabled={emitindo}
            onChange={event => setIndividualDocuments(event.target.checked)} />
          Gerar um documento por exame, todos na mesma ação.
        </label>
        <p className="text-xs text-muted-foreground">Gerar não envia mensagens; confira os documentos e escolha os canais no histórico abaixo.</p>

        <button
          type="button"
          onClick={() => void emitir()}
          disabled={cartList.length === 0 || emitindo || !identity.data || identity.isFetching || identity.isError}
          className="btn-3d-soft inline-flex h-11 w-full items-center justify-center gap-2 text-sm font-semibold uppercase tracking-wide disabled:opacity-60"
        >
          {emitindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Gerar pedidos de exames
        </button>

        {emitErro && (
          <div className="bevel-3d flex items-start gap-2 px-3 py-2 text-xs text-red-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {emitErro}
          </div>
        )}
        {emitResult && (
          <div className="bevel-3d space-y-1 px-3 py-2 text-xs">
            <p className="flex items-center gap-1.5 font-semibold text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> {emitResult.pdfs.length} PDF(s) gerado(s)
            </p>
            {emitResult.pdfs.map((p) => (
              <a
                key={p.id}
                href={p.url.startsWith("http") ? p.url : `${BASE}${p.url}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 underline"
              >
                <FileText className="h-3.5 w-3.5" /> {p.tipoLabel} ({p.examCount})
              </a>
            ))}
            {emitResult.email.attempted && (
              <p className={emitResult.email.success ? "text-emerald-400" : "text-amber-400"}>
                E-mail: {emitResult.email.success ? "enviado" : `falhou (${emitResult.email.error})`}
              </p>
            )}
            {emitResult.whatsapp.attempted && (
              <p className={emitResult.whatsapp.success ? "text-emerald-400" : "text-amber-400"}>
                WhatsApp: {emitResult.whatsapp.success ? "enviado" : `falhou (${emitResult.whatsapp.error})`}
              </p>
            )}
          </div>
        )}
      </div>
      <ExamRequestHistoryPanel key={`${clientId}-${identity.data?.professional.id ?? "sem-sessao"}`}
        clientId={clientId} professionalId={identity.data?.professional.id}
        email={identity.data?.client.email} phone={identity.data?.client.phone}
        enabled={!!identity.data && !identity.isError && !identity.isFetching}
        recentIds={recentIds} />
    </div>
  );
}
