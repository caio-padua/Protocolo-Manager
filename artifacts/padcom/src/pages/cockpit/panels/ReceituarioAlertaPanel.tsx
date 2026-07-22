/**
 * PAINEL: ALERTA DO RECEITUÁRIO AUTOMÁTICO
 * Exibe no Cockpit da Consulta os slots com liberação nos próximos 7 dias
 * e os slots atrasados (vencidos sem liberar).
 */
import { useEffect, useState } from "react";
import { Calendar, AlertTriangle, Send, Loader2, CheckCircle2, FileText, X, ExternalLink, Zap, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");
function authHeader(): HeadersInit {
  const t = localStorage.getItem("collab_token") || "";
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }
           : { "Content-Type": "application/json" };
}
async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { ...opts, headers: { ...authHeader(), ...(opts?.headers ?? {}) } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

type AlertaSlot = {
  id: number;
  nome: string;
  dataLiberacao: string;
  dataFormatada: string;
  status: string;
  clientName: string;
  formulas: { nome: string }[];
};

interface Props {
  clientId?: number;
}

export function ReceituarioAlertaPanel({ clientId }: Props) {
  const { toast } = useToast();
  const [slots, setSlots]       = useState<AlertaSlot[]>([]);
  const [atrasados, setAtrasados] = useState<AlertaSlot[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [liberando, setLiberando] = useState<number | null>(null);

  // ── Emissão rápida ICP-Brasil (Motor Único) ──────────────────────────────
  const [emitirAberto,    setEmitirAberto]    = useState(false);
  const [emitirLoading,   setEmitirLoading]   = useState(false);
  const [emitirResultado, setEmitirResultado] = useState<{ ok: boolean; driveUrl?: string; emailSent?: boolean; error?: string } | null>(null);
  // ── Gerar PDF Visual (server-side Puppeteer — fiel ao template HTML) ─────
  const [gerarLoading, setGerarLoading] = useState(false);
  const [gerarResultado, setGerarResultado] = useState<{ ok: boolean; driveUrl?: string; emailSent?: boolean; error?: string } | null>(null);
  const [emitirFormula,   setEmitirFormula]   = useState({
    nome: "Bupropiona 180mg + Topiramato 20mg",
    dose: "Cápsula XR",
    posologia: "1 dose VO – 2h Antes do Almoço (10h)\n1 dose VO – 2h Antes do Jantar (18h)",
    via: "oral",
  });

  async function gerarPdfVisual() {
    setGerarLoading(true);
    setGerarResultado(null);
    try {
      const r = await apiFetch("/api/receituario/emitir-cliente", {
        method: "POST",
        body: JSON.stringify({
          clientId: clientId ?? 11,
          formulas: [{
            nome:      emitirFormula.nome,
            forma:     emitirFormula.dose || undefined,
            posologia: emitirFormula.posologia || undefined,
            via:       emitirFormula.via || "oral",
          }],
          tipoReceita: "especial",
        }),
      });
      setGerarResultado({ ok: true, driveUrl: r.driveUrl, emailSent: r.emailSent });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setGerarResultado({ ok: false, error: msg });
    } finally {
      setGerarLoading(false);
    }
  }

  async function emitirReceita() {
    if (!emitirFormula.nome.trim()) return;
    setEmitirLoading(true);
    setEmitirResultado(null);
    try {
      const r = await apiFetch("/api/receituario/emitir-prescricao", {
        method: "POST",
        body: JSON.stringify({
          patient: {
            nome:           "CARLUCIA SANTOS FERNANDES",
            cpf:            "024.862.801-11",
            dataNascimento: "1988-01-30",
            telefone:       "(62) 98269-6656",
            endereco:       "Rua Guaxupé, 327, Vila Formosa, São Paulo - SP",
          },
          formulas: [{
            nome:      emitirFormula.nome,
            forma:     emitirFormula.dose || undefined,
            posologia: emitirFormula.posologia || undefined,
            via:       emitirFormula.via || "oral",
          }],
          tipoReceita: "especial",
        }),
      });
      setEmitirResultado({ ok: true, driveUrl: r.driveUrl, emailSent: r.emailSent });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setEmitirResultado({ ok: false, error: msg });
    } finally {
      setEmitirLoading(false);
    }
  }

  const carregar = async () => {
    setCarregando(true);
    try {
      const d = await apiFetch("/api/receituario/alertas?dias=7");
      let proximos = (d.slots ?? []) as AlertaSlot[];
      let atras    = (d.atrasados ?? []) as AlertaSlot[];
      if (clientId) {
        proximos = proximos.filter((s) => s.clientId === clientId);
        atras    = atras.filter((s) => s.clientId === clientId);
      }
      setSlots(proximos);
      setAtrasados(atras);
    } catch { /* silencioso */ }
    finally { setCarregando(false); }
  };

  useEffect(() => { void carregar(); }, [clientId]);

  const liberar = async (slotId: number, nome: string) => {
    setLiberando(slotId);
    try {
      await apiFetch(`/api/receituario/slots/${slotId}/liberar`, { method: "POST" });
      toast({ title: `"${nome}" liberada com sucesso` });
      await carregar();
    } catch {
      toast({ title: "Erro na liberação", variant: "destructive" });
    } finally { setLiberando(null); }
  };

  const total = slots.length + atrasados.length;

  if (carregando) {
    return (
      <div className="panel-3d-sub p-4 flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Verificando receituário automático…
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="panel-3d-sub p-3 flex items-center gap-2 text-muted-foreground text-sm">
        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        Nenhuma receita a liberar nos próximos 7 dias
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Cabeçalho + botão de emissão rápida */}
      <div className="flex items-center justify-between gap-2">
        <div className="bevel-3d text-[11px] px-2 py-0.5 uppercase tracking-widest inline-flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          Receituário Automático
          <span className="concave-3d px-1.5 py-0 text-[10px] font-bold ml-1">{total}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            className="btn-3d h-7 text-xs gap-1"
            onClick={() => { setEmitirResultado(null); setEmitirAberto(true); }}
            title="Motor único — lê o modelo ativo do banco"
          >
            <FileText className="w-3.5 h-3.5" />
            Emitir Receituário
          </Button>
          <Button
            className="btn-3d-soft h-7 text-xs gap-1"
            onClick={() => { void gerarPdfVisual(); }}
            disabled={gerarLoading}
            title="Puppeteer server-side — fiel ao template HTML"
          >
            {gerarLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            PDF Visual
          </Button>
        </div>
      </div>

      {/* Modal emissão rápida ICP-Brasil */}
      {emitirAberto && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="panel-3d w-full max-w-md space-y-3 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Receituário de Controle Especial — ICP-Brasil</div>
                <div className="text-sm font-black mt-0.5 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-emerald-600" />
                  Emissão Rápida
                </div>
              </div>
              <button type="button" className="btn-3d-soft p-1.5" onClick={() => setEmitirAberto(false)}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="screen-3d px-3 py-2 text-xs space-y-0.5">
              <div><span className="text-muted-foreground">Paciente:</span> <span className="font-bold">CARLUCIA SANTOS FERNANDES</span></div>
              <div><span className="text-muted-foreground">CPF:</span> 024.862.801-11 · <span className="text-muted-foreground">Médico:</span> Dr. Caio — CRM SP 125.475</div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Fórmula</label>
              <input
                className="field-engraved w-full text-sm"
                value={emitirFormula.nome}
                onChange={e => setEmitirFormula(f => ({ ...f, nome: e.target.value }))}
              />
            </div>

            <div className="flex gap-2">
              <div className="space-y-1 flex-1">
                <label className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Forma</label>
                <input
                  className="field-engraved w-full text-sm"
                  placeholder="ex: Cápsula XR"
                  value={emitirFormula.dose}
                  onChange={e => setEmitirFormula(f => ({ ...f, dose: e.target.value }))}
                />
              </div>
              <div className="space-y-1 flex-1">
                <label className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Via</label>
                <input
                  className="field-engraved w-full text-sm"
                  value={emitirFormula.via}
                  onChange={e => setEmitirFormula(f => ({ ...f, via: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Posologia</label>
              <textarea
                className="field-engraved w-full text-sm resize-none"
                rows={2}
                value={emitirFormula.posologia}
                onChange={e => setEmitirFormula(f => ({ ...f, posologia: e.target.value }))}
              />
            </div>

            {emitirResultado && (
              <div className={`p-2.5 rounded text-xs flex items-start gap-2 border ${emitirResultado.ok ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-rose-50 text-rose-800 border-rose-200"}`}>
                {emitirResultado.ok
                  ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600" />
                  : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-600" />}
                <div>
                  {emitirResultado.ok ? (
                    <>
                      <div className="font-bold">PDF gerado e assinado!</div>
                      {emitirResultado.driveUrl && (
                        <a href={emitirResultado.driveUrl} target="_blank" rel="noreferrer"
                          className="underline flex items-center gap-1 mt-1 text-emerald-700 font-semibold">
                          <ExternalLink className="w-3 h-3" />
                          Abrir no Drive
                        </a>
                      )}
                      {emitirResultado.emailSent && <div className="text-[10px] mt-0.5 text-emerald-600">E-mail enviado ao Dr. Caio</div>}
                    </>
                  ) : <div>{emitirResultado.error}</div>}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1 border-t border-border/30">
              <button type="button" className="btn-3d-soft px-3 py-1.5 text-xs"
                onClick={() => { setEmitirAberto(false); setEmitirResultado(null); }}>
                Fechar
              </button>
              <Button className="btn-3d gap-1.5 text-xs h-8"
                disabled={emitirLoading || !emitirFormula.nome.trim()}
                onClick={emitirReceita}>
                {emitirLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                {emitirLoading ? "Gerando…" : "Gerar e Assinar PDF"}
              </Button>
            </div>
          </div>
        </div>
      )}


      {/* Atrasados — prioridade máxima */}
      {atrasados.map((s) => (
        <div key={s.id} className="panel-3d-sub flex overflow-hidden">
          <div className="w-1 bg-rose-500 shrink-0" />
          <div className="flex-1 flex items-center gap-3 px-3 py-2.5 min-w-0">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{s.nome}</div>
              <div className="text-[11px] text-rose-600">Vencida em {s.dataFormatada} — {s.clientName}</div>
              {s.formulas?.length > 0 && (
                <div className="text-[10px] text-muted-foreground">{s.formulas.map((f) => f.nome).join(", ")}</div>
              )}
            </div>
            <Button
              className="btn-3d h-7 text-xs gap-1 shrink-0"
              onClick={() => liberar(s.id, s.nome)}
              disabled={liberando === s.id}
            >
              {liberando === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Liberar
            </Button>
          </div>
        </div>
      ))}

      {/* Próximos 7 dias */}
      {slots.map((s) => (
        <div key={s.id} className="panel-3d-sub flex overflow-hidden">
          <div className="w-1 bg-amber-400 shrink-0" />
          <div className="flex-1 flex items-center gap-3 px-3 py-2.5 min-w-0">
            <Calendar className="w-4 h-4 text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{s.nome}</div>
              <div className="text-[11px] text-muted-foreground">{s.dataFormatada} — {s.clientName}</div>
              {s.formulas?.length > 0 && (
                <div className="text-[10px] text-muted-foreground">{s.formulas.map((f) => f.nome).join(", ")}</div>
              )}
            </div>
            <Button
              className="btn-3d-soft h-7 text-xs gap-1 shrink-0"
              onClick={() => liberar(s.id, s.nome)}
              disabled={liberando === s.id}
            >
              {liberando === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Antecipar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
