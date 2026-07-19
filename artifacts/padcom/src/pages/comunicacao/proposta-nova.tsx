import { useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Building2, Globe, Mail, Phone, User, FileText,
  CreditCard, Send, CheckCircle, Loader2, ExternalLink, Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ConsoleShell, BASE } from "./_shared";

// ─── Planos pré-configurados ─────────────────────────────────────────────────

const PLANOS = [
  { id: "basico",       label: "Básico",      desc: "1 e-mail corporativo",   adesao: 29700, mensal: 9700,  emails: 1 },
  { id: "profissional", label: "Profissional", desc: "5 e-mails corporativos", adesao: 49700, mensal: 19700, emails: 5 },
  { id: "clinica",      label: "Clínica",      desc: "E-mails ilimitados",     adesao: 99700, mensal: 39700, emails: 999 },
  { id: "custom",       label: "Personalizado", desc: "Defina manualmente",    adesao: 0,     mensal: 0,     emails: 1 },
] as const;

type PlanoId = typeof PLANOS[number]["id"];

// ─── Status da proposta ──────────────────────────────────────────────────────

type StatusProposta = "rascunho" | "aprovada" | "cobranca_gerada" | "paga" | "ativa" | "cancelada";

interface PropostaCriada {
  id: number;
  status: StatusProposta;
  clinica_nome: string;
  dominio: string;
  asaas_invoice_url?: string | null;
  asaas_pix_qr?: string | null;
}

const STATUS_LABEL: Record<StatusProposta, { label: string; cor: string }> = {
  rascunho:       { label: "Rascunho",       cor: "text-amber-600" },
  aprovada:       { label: "Aprovada",        cor: "text-blue-600" },
  cobranca_gerada:{ label: "Cobrança Gerada", cor: "text-indigo-600" },
  paga:           { label: "Paga",            cor: "text-emerald-600" },
  ativa:          { label: "Ativa",           cor: "text-emerald-700" },
  cancelada:      { label: "Cancelada",       cor: "text-red-600" },
};

function fmtBRL(centavos: number) {
  return "R$ " + (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function PropostaNova() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Dados do formulário
  const [planoId, setPlanoId] = useState<PlanoId>("basico");
  const [clinicaNome, setClinicaNome] = useState("");
  const [clinicaCnpj, setClinicaCnpj] = useState("");
  const [clinicaEmail, setClinicaEmail] = useState("");
  const [clinicaTelefone, setClinicaTelefone] = useState("");
  const [clinicaResponsavel, setClinicaResponsavel] = useState("");
  const [dominio, setDominio] = useState("");
  const [emailsIncluidos, setEmailsIncluidos] = useState(1);
  const [valorAdesao, setValorAdesao] = useState(29700);
  const [valorMensal, setValorMensal] = useState(9700);
  const [notas, setNotas] = useState("");

  // Estado da proposta criada
  const [proposta, setProposta] = useState<PropostaCriada | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCobranca, setLoadingCobranca] = useState(false);
  const [loadingAtivar, setLoadingAtivar] = useState(false);

  function handlePlanoChange(id: PlanoId) {
    setPlanoId(id);
    const p = PLANOS.find(x => x.id === id)!;
    if (id !== "custom") {
      setValorAdesao(p.adesao);
      setValorMensal(p.mensal);
      setEmailsIncluidos(p.emails === 999 ? 99 : p.emails);
    }
  }

  async function handleSalvar() {
    if (!clinicaNome.trim()) { toast({ title: "Nome da clínica é obrigatório", variant: "destructive" }); return; }
    if (!dominio.trim()) { toast({ title: "Domínio é obrigatório", variant: "destructive" }); return; }
    if (valorMensal < 500) { toast({ title: "Valor mensal mínimo: R$ 5,00", variant: "destructive" }); return; }

    setLoading(true);
    try {
      const resp = await fetch(`${BASE}/api/dominios-comercial/propostas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinica_nome: clinicaNome.trim(),
          clinica_cnpj: clinicaCnpj.trim() || null,
          clinica_email: clinicaEmail.trim() || null,
          clinica_telefone: clinicaTelefone.trim() || null,
          clinica_responsavel: clinicaResponsavel.trim() || null,
          dominio: dominio.trim().toLowerCase(),
          plano: planoId,
          emails_incluidos: emailsIncluidos,
          valor_adesao_centavos: valorAdesao,
          valor_mensal_centavos: valorMensal,
          notas: notas.trim() || null,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Erro ao salvar");
      setProposta(data as PropostaCriada);
      toast({ title: "Proposta salva com sucesso!" });
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Erro", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleGerarCobranca() {
    if (!proposta) return;
    setLoadingCobranca(true);
    try {
      const resp = await fetch(`${BASE}/api/dominios-comercial/propostas/${proposta.id}/gerar-cobranca`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Erro ao gerar cobrança");
      setProposta(prev => prev ? {
        ...prev,
        status: "cobranca_gerada",
        asaas_invoice_url: data.invoice_url ?? prev.asaas_invoice_url,
        asaas_pix_qr: data.pix_qr ?? prev.asaas_pix_qr,
      } : prev);
      toast({ title: "Cobrança gerada no Asaas!" });
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Erro", variant: "destructive" });
    } finally {
      setLoadingCobranca(false);
    }
  }

  async function handleAtivar() {
    if (!proposta) return;
    setLoadingAtivar(true);
    try {
      const resp = await fetch(`${BASE}/api/dominios-comercial/propostas/${proposta.id}/ativar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Erro ao ativar");
      setProposta(prev => prev ? { ...prev, status: "ativa" } : prev);
      toast({ title: "Proposta ativada! Domínio marcado como módulo pago." });
      setTimeout(() => navigate("/comunicacao/dominios"), 1200);
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Erro", variant: "destructive" });
    } finally {
      setLoadingAtivar(false);
    }
  }

  const planoSel = PLANOS.find(p => p.id === planoId)!;
  const statusInfo = proposta ? STATUS_LABEL[proposta.status] ?? STATUS_LABEL.rascunho : null;

  return (
    <ConsoleShell icon={Building2} title="Nova Proposta Comercial" subtitle="Módulo Domínios para Clínicas Licenciadas">
      {/* ── Cabeçalho ── */}
      <div className="flex items-center justify-between gap-4 mb-5">
        <button
          onClick={() => navigate("/comunicacao/dominios")}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar ao Painel de Domínios
        </button>
        {proposta && statusInfo && (
          <span className={`text-[11px] font-bold uppercase tracking-[0.1em] ${statusInfo.cor}`}>
            ● {statusInfo.label}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Coluna esquerda: formulário ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Seletor de plano */}
          <div className="panel-3d p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
              <CreditCard className="w-3 h-3" /> Plano
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PLANOS.map(p => (
                <button
                  key={p.id}
                  onClick={() => handlePlanoChange(p.id as PlanoId)}
                  disabled={!!proposta}
                  className={`rounded-[6px] px-3 py-2.5 text-left transition-all border ${
                    planoId === p.id
                      ? "border-cyan-500 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(6,182,212,0.4)]"
                      : "border-border/50 concave-3d hover:border-cyan-400/50"
                  }`}
                >
                  <p className="text-[11px] font-bold text-foreground">{p.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{p.desc}</p>
                  {p.mensal > 0 && (
                    <p className="text-[10px] font-semibold text-emerald-700 mt-1">{fmtBRL(p.mensal)}/mês</p>
                  )}
                </button>
              ))}
            </div>

            {/* Valores — editáveis sempre em "custom", em outros só exibe */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground mb-1">Adesão (centavos)</p>
                {planoId === "custom" && !proposta ? (
                  <Input
                    type="number"
                    min={0}
                    value={valorAdesao}
                    onChange={e => setValorAdesao(Math.max(0, parseInt(e.target.value) || 0))}
                    className="h-8 text-[12px]"
                    placeholder="Ex: 29700 = R$ 297"
                  />
                ) : (
                  <div className="concave-3d px-3 py-2 rounded-[6px] text-[13px] font-bold text-foreground">
                    {fmtBRL(valorAdesao)}
                  </div>
                )}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground mb-1">Mensal (centavos)</p>
                {planoId === "custom" && !proposta ? (
                  <Input
                    type="number"
                    min={500}
                    value={valorMensal}
                    onChange={e => setValorMensal(Math.max(500, parseInt(e.target.value) || 500))}
                    className="h-8 text-[12px]"
                    placeholder="Ex: 9700 = R$ 97"
                  />
                ) : (
                  <div className="concave-3d px-3 py-2 rounded-[6px] text-[13px] font-bold text-emerald-700">
                    {fmtBRL(valorMensal)}/mês
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Dados da clínica */}
          <div className="panel-3d p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
              <Building2 className="w-3 h-3" /> Dados da Clínica Parceira
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">Nome da Clínica *</label>
                <div className="relative mt-1">
                  <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
                  <Input
                    value={clinicaNome}
                    onChange={e => setClinicaNome(e.target.value)}
                    disabled={!!proposta}
                    className="pl-8 h-9 text-[12px]"
                    placeholder="Ex: Clínica Barakat"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">CNPJ</label>
                <Input
                  value={clinicaCnpj}
                  onChange={e => setClinicaCnpj(e.target.value)}
                  disabled={!!proposta}
                  className="mt-1 h-9 text-[12px]"
                  placeholder="XX.XXX.XXX/XXXX-XX"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">E-mail</label>
                <div className="relative mt-1">
                  <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
                  <Input
                    type="email"
                    value={clinicaEmail}
                    onChange={e => setClinicaEmail(e.target.value)}
                    disabled={!!proposta}
                    className="pl-8 h-9 text-[12px]"
                    placeholder="financeiro@clinica.com"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">Telefone / WhatsApp</label>
                <div className="relative mt-1">
                  <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
                  <Input
                    value={clinicaTelefone}
                    onChange={e => setClinicaTelefone(e.target.value)}
                    disabled={!!proposta}
                    className="pl-8 h-9 text-[12px]"
                    placeholder="+55 11 9XXXX-XXXX"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">Responsável / Contato</label>
                <div className="relative mt-1">
                  <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
                  <Input
                    value={clinicaResponsavel}
                    onChange={e => setClinicaResponsavel(e.target.value)}
                    disabled={!!proposta}
                    className="pl-8 h-9 text-[12px]"
                    placeholder="Dr. João Silva — sócio"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Domínio e e-mails */}
          <div className="panel-3d p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
              <Globe className="w-3 h-3" /> Domínio do Módulo
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">Domínio *</label>
                <div className="relative mt-1">
                  <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
                  <Input
                    value={dominio}
                    onChange={e => setDominio(e.target.value.toLowerCase())}
                    disabled={!!proposta}
                    className="pl-8 h-9 text-[12px] font-mono"
                    placeholder="clinicabarakat.com.br"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/60 mt-1">O domínio será configurado no Zoho para e-mails corporativos após ativação.</p>
              </div>
              {planoId !== "custom" && (
                <div className="concave-3d px-3 py-2 rounded-[6px]">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-[0.08em]">E-mails inclusos</p>
                  <p className="text-[14px] font-bold text-foreground mt-0.5">
                    {planoSel.emails === 999 ? "Ilimitados" : planoSel.emails}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Notas */}
          <div className="panel-3d p-4 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
              <FileText className="w-3 h-3" /> Notas Internas
            </p>
            <Textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              disabled={!!proposta}
              rows={3}
              className="text-[12px] resize-none"
              placeholder="Condições especiais, histórico de conversa, referência..."
            />
          </div>
        </div>

        {/* ── Coluna direita: painel de ações ── */}
        <div className="space-y-4">
          {/* Resumo da proposta */}
          <div className="panel-3d p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Resumo Financeiro</p>
            <div className="space-y-2">
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground">Plano</span>
                <span className="font-bold text-foreground">{planoSel.label}</span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground">Adesão única</span>
                <span className="font-bold text-foreground">{valorAdesao > 0 ? fmtBRL(valorAdesao) : "Isento"}</span>
              </div>
              <div className="flex justify-between text-[12px] border-t border-border/30 pt-2">
                <span className="text-muted-foreground">Recorrência mensal</span>
                <span className="font-bold text-emerald-700">{fmtBRL(valorMensal)}/mês</span>
              </div>
              {clinicaNome && (
                <div className="flex justify-between text-[12px]">
                  <span className="text-muted-foreground">Clínica</span>
                  <span className="font-semibold text-foreground text-right max-w-[120px] truncate">{clinicaNome}</span>
                </div>
              )}
              {dominio && (
                <div className="flex justify-between text-[12px]">
                  <span className="text-muted-foreground">Domínio</span>
                  <span className="font-mono font-semibold text-cyan-700">{dominio}</span>
                </div>
              )}
            </div>
          </div>

          {/* Ações */}
          {!proposta ? (
            <Button
              onClick={handleSalvar}
              disabled={loading || !clinicaNome.trim() || !dominio.trim()}
              className="btn-3d w-full h-10 text-[11px] font-bold uppercase tracking-[0.1em]"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Salvar Proposta
            </Button>
          ) : (
            <div className="space-y-3">
              {/* ID da proposta */}
              <div className="concave-3d px-3 py-2 rounded-[6px] flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-[0.08em]">ID da Proposta</p>
                  <p className="text-[15px] font-bold text-foreground">#{proposta.id}</p>
                </div>
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>

              {/* Gerar Cobrança Asaas */}
              {(proposta.status === "rascunho" || proposta.status === "aprovada") && (
                <Button
                  onClick={handleGerarCobranca}
                  disabled={loadingCobranca || !clinicaCnpj.trim() && !clinicaEmail.trim()}
                  className="btn-3d-soft w-full h-9 text-[11px] font-bold uppercase tracking-[0.1em]"
                >
                  {loadingCobranca ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  ) : (
                    <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Gerar Cobrança Asaas
                </Button>
              )}

              {/* Link da fatura / PIX */}
              {proposta.asaas_invoice_url && (
                <a
                  href={proposta.asaas_invoice_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[11px] font-semibold text-cyan-700 hover:text-cyan-600 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir link de pagamento Asaas
                </a>
              )}

              {/* Ativar manualmente */}
              {proposta.status !== "ativa" && proposta.status !== "cancelada" && (
                <Button
                  onClick={handleAtivar}
                  disabled={loadingAtivar}
                  className="btn-3d w-full h-9 text-[11px] font-bold uppercase tracking-[0.1em] bg-emerald-600 hover:bg-emerald-700"
                >
                  {loadingAtivar ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Ativar Manualmente
                </Button>
              )}

              {/* Proposta já ativa */}
              {proposta.status === "ativa" && (
                <div className="bevel-3d-ok px-3 py-2.5 rounded-[6px] flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <div>
                    <p className="text-[11px] font-bold text-emerald-700">Proposta Ativa</p>
                    <p className="text-[10px] text-muted-foreground">Domínio marcado como módulo pago.</p>
                  </div>
                </div>
              )}

              <button
                onClick={() => navigate("/comunicacao/dominios")}
                className="w-full text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                Voltar ao painel de domínios
              </button>
            </div>
          )}

          {/* Fluxo de ativação */}
          <div className="panel-3d-sub p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Fluxo de Ativação</p>
            {[
              { n: "①", txt: "Salvar proposta (rascunho)", done: !!proposta },
              { n: "②", txt: "Gerar cobrança no Asaas", done: proposta?.status === "cobranca_gerada" || proposta?.status === "paga" || proposta?.status === "ativa" },
              { n: "③", txt: "Pagamento confirmado", done: proposta?.status === "paga" || proposta?.status === "ativa" },
              { n: "④", txt: "Domínio ativado no sistema", done: proposta?.status === "ativa" },
            ].map(s => (
              <div key={s.n} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground/60">{s.n}</span>
                <span className={`text-[11px] ${s.done ? "text-emerald-700 font-semibold" : "text-muted-foreground"}`}>
                  {s.txt}
                </span>
                {s.done && <CheckCircle className="w-3 h-3 text-emerald-600 ml-auto shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </ConsoleShell>
  );
}
