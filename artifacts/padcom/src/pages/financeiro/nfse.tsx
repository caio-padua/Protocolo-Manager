import { useMemo, useState } from "react";
import { useListClients, useListPayments, getListPaymentsQueryKey, type Payment } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";
import { getCollabToken } from "@/lib/collab-auth";
import { PaxterLogo } from "@/components/branding/PaxterLogo";
import {
  Receipt,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  User,
  FileText,
  Link2,
  ExternalLink,
  Info,
  Lock,
} from "lucide-react";

const apiBase = import.meta.env.VITE_API_URL || "/api";

// Servicos municipais (Lei Complementar 116/2003) para clinica medica em
// Sao Paulo. ISS de servico medico no municipio de Sao Paulo = 2% (pesquisa
// 28/06/2026). O codigo/nome vai para o Asaas como municipalServiceCode/Name.
const MUNICIPAL_SERVICES: Array<{ code: string; name: string }> = [
  { code: "4.03", name: "Hospitais, clínicas, laboratórios e congêneres" },
  { code: "4.01", name: "Medicina e biomedicina" },
  { code: "4.08", name: "Fisioterapia, fonoaudiologia e terapia ocupacional" },
  { code: "4.06", name: "Enfermagem, inclusive serviços auxiliares" },
];
const ISS_ALIQUOTA_SP = 2; // % — serviço médico no município de São Paulo

type Origem = "payment" | "avulsa";

// Status real da NFS-e devolvido pelo Asaas (nunca simulado).
interface AsaasInvoice {
  id: string;
  status: string;
  value: number;
  effectiveDate: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  number: string | null;
}

// Como cada status do Asaas aparece (honesto: o texto vem do provedor).
const STATUS_UI: Record<string, { label: string; cls: string }> = {
  SCHEDULED: { label: "Agendada", cls: "text-cyan-600 dark:text-cyan-400" },
  SYNCHRONIZED: { label: "Sincronizada", cls: "text-cyan-600 dark:text-cyan-400" },
  AUTHORIZED: { label: "Autorizada (emitida)", cls: "text-emerald-600 dark:text-emerald-400" },
  PROCESSING_CANCELLATION: { label: "Cancelando", cls: "text-amber-600 dark:text-amber-400" },
  CANCELED: { label: "Cancelada", cls: "text-slate-500 dark:text-slate-400" },
  ERROR: { label: "Erro na emissão", cls: "text-red-600 dark:text-red-400" },
};

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Data no padrao do Brasil (DD/MM/AAAA) sem cair em fuso (trata "AAAA-MM-DD").
function fmtDateBR(d?: string | null): string {
  if (!d) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("pt-BR");
}

export default function LancadorNfse() {
  const { toast } = useToast();
  const { data: clients, isLoading: loadingClients } = useListClients();

  const [origem, setOrigem] = useState<Origem>("payment");
  const [clientId, setClientId] = useState<number | null>(null);
  const [paymentId, setPaymentId] = useState<string>("");
  const [value, setValue] = useState<string>("");
  const [serviceDescription, setServiceDescription] = useState<string>("");
  const [effectiveDate, setEffectiveDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [municipalCode, setMunicipalCode] = useState<string>(MUNICIPAL_SERVICES[0].code);
  const [observations, setObservations] = useState<string>("");
  // Valor fica protegido (somente leitura) quando vem data-bound da cobranca.
  const [valueUnlocked, setValueUnlocked] = useState(false);

  const [launching, setLaunching] = useState(false);
  const [result, setResult] = useState<AsaasInvoice | null>(null);

  const client = useMemo(
    () => (clients || []).find((c) => c.id === clientId) || null,
    [clients, clientId],
  );

  // Pagamentos do cliente (para vincular a nota a uma cobranca existente).
  const { data: payments, isLoading: loadingPayments } = useListPayments(
    { clientId: client?.id ?? 0 },
    { query: { enabled: !!client, queryKey: getListPaymentsQueryKey({ clientId: client?.id ?? 0 }) } },
  );

  const payment = useMemo(
    () => (payments || []).find((p) => String(p.id) === paymentId) || null,
    [payments, paymentId],
  );

  const municipal = MUNICIPAL_SERVICES.find((m) => m.code === municipalCode) || MUNICIPAL_SERVICES[0];

  // DATA-BIND: ao escolher a cobranca, puxa valor e descricao automaticamente.
  function onPickPayment(v: string) {
    setPaymentId(v);
    setResult(null);
    setValueUnlocked(false); // re-protege o valor ao trocar de cobranca
    const p = (payments || []).find((x) => String(x.id) === v) || null;
    if (p) {
      setValue(String(p.amount));
      setServiceDescription(p.description?.trim() || `Protocolo injetável — ${client?.name ?? ""}`.trim());
    }
  }

  function onPickClient(id: number | null) {
    setClientId(id);
    setPaymentId("");
    setResult(null);
    setValue("");
    setServiceDescription("");
    setValueUnlocked(false);
  }

  function onOrigem(o: Origem) {
    setOrigem(o);
    setResult(null);
    setPaymentId("");
    setValueUnlocked(false);
    if (o === "avulsa") {
      // Avulsa: sem cobranca; descricao padrao a partir do cliente.
      setServiceDescription(client ? `Protocolo injetável — ${client.name}` : "");
      setValue("");
    }
  }

  const valueNum = parseFloat(value.replace(",", "."));
  const valueValid = !isNaN(valueNum) && valueNum > 0;
  // Valor protegido (somente leitura) quando data-bound de uma cobranca e ainda nao destravado.
  const valueLocked = origem === "payment" && !!payment && !valueUnlocked;
  const descValid = serviceDescription.trim().length > 0;
  const originValid = origem === "payment" ? !!payment : !!client;
  const canLaunch = originValid && valueValid && descValid && !!effectiveDate && !launching;

  async function launch() {
    setLaunching(true);
    setResult(null);
    try {
      const token = getCollabToken();
      const res = await fetch(`${apiBase}/asaas/invoice/launch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          paymentId: origem === "payment" && payment ? payment.id : undefined,
          clientId: origem === "avulsa" && client ? client.id : undefined,
          serviceDescription: serviceDescription.trim(),
          value: valueNum,
          effectiveDate,
          observations: observations.trim() || undefined,
          municipalServiceCode: municipal.code,
          municipalServiceName: municipal.name,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        throw new Error("Sessão do colaborador expirada. Entre novamente para lançar a nota.");
      }
      if (!res.ok) {
        throw new Error(data.error || "Erro ao lançar a NFS-e.");
      }
      setResult(data.invoice as AsaasInvoice);
      toast({ title: "NFS-e enviada ao Asaas", description: "Confira o status real abaixo." });
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setLaunching(false);
    }
  }

  const statusUi = result ? STATUS_UI[result.status] || { label: result.status, cls: "text-muted-foreground" } : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* HERO navy com a marca PAXTER (vidro + ouro) */}
      <div className="relative overflow-hidden rounded-[10px] border border-[#26406e] bg-[#16284a] px-6 py-7 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="flex flex-col items-center gap-3">
          <PaxterLogo variant="appHeader" tone="dark" />
          <div className="mt-1">
            <h1 className="text-lg font-bold tracking-tight text-[#e9d7a7]">Lançador de NFS-e</h1>
            <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/70 mt-0.5">
              Nota Fiscal de Serviço — emissão pelo Asaas com dados do protocolo
            </p>
          </div>
        </div>
      </div>

      {/* AVISO HONESTO de pré-requisito fiscal */}
      <div className="concave-3d flex items-start gap-2.5 px-4 py-3">
        <Lock className="w-4 h-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          A emissão real exige configuração fiscal na conta Asaas (Inscrição Municipal homologada na
          prefeitura, certificado A1 e-CNPJ e empresa Pessoa Jurídica). Enquanto isso não estiver
          configurado, o Asaas devolve o erro real — esta tela nunca simula uma emissão.
        </p>
      </div>

      {/* FORMULARIO — todos os campos sempre visiveis (slot fixo) */}
      <section className="panel-3d p-5 space-y-5">
        {/* Origem da nota */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Origem da nota</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onOrigem("payment")}
              aria-pressed={origem === "payment"}
              className={[
                "rounded-[8px] px-3 py-2.5 text-[13px] font-semibold inline-flex items-center justify-center gap-2 transition-all",
                origem === "payment" ? "panel-3d panel-3d-active ring-2 ring-[#c2a05a]/70" : "bevel-3d",
              ].join(" ")}
            >
              <Link2 className="w-4 h-4" /> Vincular a uma cobrança
            </button>
            <button
              type="button"
              onClick={() => onOrigem("avulsa")}
              aria-pressed={origem === "avulsa"}
              className={[
                "rounded-[8px] px-3 py-2.5 text-[13px] font-semibold inline-flex items-center justify-center gap-2 transition-all",
                origem === "avulsa" ? "panel-3d panel-3d-active ring-2 ring-[#c2a05a]/70" : "bevel-3d",
              ].join(" ")}
            >
              <FileText className="w-4 h-4" /> Nota avulsa (por cliente)
            </button>
          </div>
        </div>

        {/* Cliente */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cliente</label>
          <PaxterClientSelector
            clientes={clients || []}
            value={clientId}
            onChange={onPickClient}
            placeholder="Selecionar cliente…"
          />
          <div className="concave-3d mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[12px]">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <User className="w-3.5 h-3.5" />
              {client ? client.name : "Nenhum cliente selecionado"}
            </span>
            {client && client.cpf && (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">CPF {client.cpf}</span>
            )}
          </div>
        </div>

        {/* Cobranca (data-bind) — SEMPRE visivel (slot fixo). No modo avulsa fica desabilitada. */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cobrança vinculada</label>
          <Select value={paymentId} onValueChange={onPickPayment} disabled={origem !== "payment" || !client}>
            <SelectTrigger className="bevel-3d h-11">
              <SelectValue
                placeholder={
                  origem !== "payment"
                    ? "Indisponível no modo avulsa"
                    : !client
                      ? "Escolha o cliente primeiro"
                      : loadingPayments
                        ? "Carregando cobranças..."
                        : (payments || []).length === 0
                          ? "Cliente sem cobranças"
                          : "Selecione a cobrança"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {(payments || []).map((p: Payment) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {brl(p.amount)} — {p.description || "sem descrição"} — {p.status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {origem === "payment" ? (
            <p className="text-[12px] text-muted-foreground">
              O valor e a descrição abaixo são preenchidos automaticamente a partir da cobrança.
            </p>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              Modo avulsa: a nota é vinculada apenas ao cliente (sem cobrança).
            </p>
          )}

          {/* RESUMO data-bind — o que foi puxado da cobranca (inclui vencimento) */}
          {origem === "payment" && payment && (
            <div className="concave-3d mt-1 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 px-3 py-2.5 text-[12px]">
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Valor (cobrança)</p>
                <p className="font-semibold text-foreground">{brl(payment.amount)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Vencimento</p>
                <p className="font-semibold text-foreground">{fmtDateBR(payment.dueDate)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Status</p>
                <p className="font-semibold text-foreground">{payment.status}</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Descrição</p>
                <p className="font-semibold text-foreground truncate" title={payment.description || ""}>
                  {payment.description || "—"}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Valor + Data de emissao */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Valor da nota (R$)</label>
              {origem === "payment" && payment && (
                valueLocked ? (
                  <button
                    type="button"
                    onClick={() => setValueUnlocked(true)}
                    className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 inline-flex items-center gap-1 hover:underline"
                  >
                    <Lock className="w-3 h-3" /> Editar valor
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setValue(String(payment.amount));
                      setValueUnlocked(false);
                    }}
                    className="text-[11px] font-semibold text-muted-foreground inline-flex items-center gap-1 hover:underline"
                  >
                    Restaurar da cobrança
                  </button>
                )
              )}
            </div>
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={value}
              readOnly={valueLocked}
              onChange={(e) => setValue(e.target.value)}
              className={`bevel-3d h-11 ${valueLocked ? "opacity-70 cursor-not-allowed" : ""}`}
            />
            {valueLocked ? (
              <p className="text-[12px] text-muted-foreground">Valor protegido (puxado da cobrança). Clique em "Editar valor" para alterar.</p>
            ) : origem === "payment" && payment ? (
              <p className="text-[12px] text-amber-600 dark:text-amber-400">Atenção: você alterou o valor manualmente; ele pode divergir da cobrança vinculada.</p>
            ) : null}
            {value && !valueValid && (
              <p className="text-[12px] text-red-600 dark:text-red-400">Informe um valor positivo.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Data de emissão</label>
            <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="bevel-3d h-11" />
          </div>
        </div>

        {/* Descricao do servico (data-bound, editavel) */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Descrição do serviço</label>
          <Input
            placeholder="Ex.: Protocolo injetável — aplicação endovenosa"
            value={serviceDescription}
            onChange={(e) => setServiceDescription(e.target.value)}
            className="bevel-3d h-11"
          />
        </div>

        {/* Servico municipal + ISS */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Serviço municipal (Lei Complementar 116/2003)</label>
          <Select value={municipalCode} onValueChange={(v) => setMunicipalCode(v)}>
            <SelectTrigger className="bevel-3d h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MUNICIPAL_SERVICES.map((m) => (
                <SelectItem key={m.code} value={m.code}>
                  {m.code} — {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="concave-3d flex items-center gap-2 px-3 py-2 text-[12px] text-muted-foreground">
            <Info className="w-3.5 h-3.5 shrink-0" />
            ISS (Imposto Sobre Serviços) para serviço médico no município de São Paulo: <strong className="text-foreground">{ISS_ALIQUOTA_SP}%</strong>.
          </div>
        </div>

        {/* Observacoes (opcional) */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Observações (opcional)</label>
          <Input
            placeholder="Texto livre para constar na nota"
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            className="bevel-3d h-11"
          />
        </div>

        {/* Acao */}
        <Button onClick={launch} disabled={!canLaunch} className="btn-3d w-full h-12 text-[13px] font-bold uppercase tracking-[0.14em]">
          {launching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Receipt className="w-4 h-4 mr-2" />}
          {launching ? "Enviando ao Asaas..." : "Agendar NFS-e"}
        </Button>
        {origem === "payment" && client && !payment && (
          <p className="text-[12px] text-amber-600 dark:text-amber-400 text-center">
            Selecione a cobrança a vincular (ou use o modo "Nota avulsa").
          </p>
        )}
      </section>

      {/* RESULTADO — status REAL do Asaas */}
      {result && statusUi && (
        <section className="panel-3d p-5 space-y-4">
          <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5">
            {result.status === "ERROR" ? (
              <AlertTriangle className="w-4 h-4 text-red-500" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            )}
            <span className="text-[12px] font-semibold uppercase tracking-[0.12em]">Retorno do Asaas</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="concave-3d px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Status</p>
              <p className={`text-[14px] font-bold ${statusUi.cls}`}>{statusUi.label}</p>
            </div>
            <div className="concave-3d px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Valor</p>
              <p className="text-[14px] font-bold">{brl(result.value)}</p>
            </div>
            <div className="concave-3d px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Id da nota</p>
              <p className="text-[13px] font-medium break-all">{result.id || "—"}</p>
            </div>
            <div className="concave-3d px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Número</p>
              <p className="text-[13px] font-medium">{result.number || "—"}</p>
            </div>
          </div>

          {(result.pdfUrl || result.xmlUrl) && (
            <div className="flex items-center gap-2">
              {result.pdfUrl && (
                <Button variant="outline" size="sm" className="btn-3d-soft" onClick={() => window.open(result.pdfUrl!, "_blank")}>
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> PDF
                </Button>
              )}
              {result.xmlUrl && (
                <Button variant="outline" size="sm" className="btn-3d-soft" onClick={() => window.open(result.xmlUrl!, "_blank")}>
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> XML
                </Button>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
