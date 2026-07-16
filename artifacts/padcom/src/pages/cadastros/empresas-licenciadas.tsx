import { useEffect, useState, useCallback } from "react";
import {
  Building2, Crown, Plus, RefreshCw, ChevronRight,
  HardDrive, Check, AlertCircle, Edit2, X, Save,
  TrendingUp, Users, Landmark, Wifi
} from "lucide-react";
import { ConsoleShell } from "@/pages/comunicacao/_shared";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Tipos ──────────────────────────────────────────────────────────────────────

type TipoLicenciamento = "propria" | "sub_unidade" | "licenciada_direta" | "licenciada_por_clinica";

interface EmpresaNo {
  id: number;
  nome: string;
  tipoLicenciamento: TipoLicenciamento;
  status: string;
  donoNome: string | null;
  valorMensalContrato: string | null;
  royaltyPercent: string | null;
  isPlatformOwner: boolean;
  driveFolderEmpresaId: string | null;
  empresaMaeId: number | null;
  locations: string[];
  filhos: EmpresaNo[];
}

interface HierarquiaResposta {
  raiz?: EmpresaNo | null;
  raizes?: EmpresaNo[];
}

interface EmpresaFlat {
  id: number; nome: string; cnpj: string | null; status: string;
  tipoLicenciamento: string; empresaMaeId: number | null;
  valorMensalContrato: string | null; royaltyPercent: string | null;
  donoNome: string | null; telefone: string | null; emailGeral: string | null;
  isPlatformOwner: boolean; driveFolderEmpresaId: string | null;
  ativa: boolean;
}

// ── Constantes visuais ─────────────────────────────────────────────────────────

const TIPO_META: Record<TipoLicenciamento, { label: string; cor: string; bg: string; borda: string }> = {
  propria:               { label: "Própria",             cor: "#3D7A7A", bg: "#e6f2f2", borda: "#3D7A7A" },
  sub_unidade:           { label: "Sub-unidade",         cor: "#647c97", bg: "#eef2f7", borda: "#647c97" },
  licenciada_direta:     { label: "Licenciada Direta",   cor: "#45B8CC", bg: "#e3f7fb", borda: "#45B8CC" },
  licenciada_por_clinica:{ label: "Lic. por Clínica",   cor: "#c2a05a", bg: "#faf2e3", borda: "#c2a05a" },
};

const TIPOS_OPTIONS: { value: TipoLicenciamento; label: string }[] = [
  { value: "propria",               label: "Própria (clínica do CEO)" },
  { value: "sub_unidade",           label: "Sub-unidade (filial)" },
  { value: "licenciada_direta",     label: "Licenciada Direta (paga ao PAXTER)" },
  { value: "licenciada_por_clinica",label: "Licenciada por Clínica (paga à mãe)" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtBRL(val: string | number | null | undefined): string {
  if (!val) return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcReceita(nos: EmpresaNo[]): { direto: number; royalties: number } {
  let direto = 0;
  let royalties = 0;
  for (const no of nos) {
    const val = parseFloat(no.valorMensalContrato ?? "0") || 0;
    const pct = parseFloat(no.royaltyPercent ?? "30") || 30;
    if (no.tipoLicenciamento === "licenciada_direta") direto += val;
    if (no.tipoLicenciamento === "licenciada_por_clinica") royalties += (val * pct) / 100;
    const sub = calcReceita(no.filhos);
    direto += sub.direto;
    royalties += sub.royalties;
  }
  return { direto, royalties };
}

function contarTenants(nos: EmpresaNo[]): number {
  let n = 0;
  for (const no of nos) {
    n++;
    n += contarTenants(no.filhos);
  }
  return n;
}

function aplanar(nos: EmpresaNo[]): EmpresaNo[] {
  const acc: EmpresaNo[] = [];
  for (const no of nos) { acc.push(no); acc.push(...aplanar(no.filhos)); }
  return acc;
}

// ── Badge de tipo ──────────────────────────────────────────────────────────────

function TipoBadge({ tipo }: { tipo: string }) {
  const meta = TIPO_META[tipo as TipoLicenciamento] ?? { label: tipo, cor: "#647c97", bg: "#eee", borda: "#647c97" };
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ color: meta.cor, background: meta.bg, border: `1px solid ${meta.borda}` }}
    >
      {meta.label}
    </span>
  );
}

// ── Card de empresa no nó da pirâmide ──────────────────────────────────────────

function EmpresaCard({ no, onDrive, onEdit }: {
  no: EmpresaNo;
  onDrive: (id: number) => void;
  onEdit: (id: number) => void;
}) {
  const meta = TIPO_META[no.tipoLicenciamento as TipoLicenciamento] ?? TIPO_META.propria;
  const semDrive = !no.driveFolderEmpresaId;

  return (
    <div
      className="panel-3d min-w-[200px] max-w-[240px]"
      style={{ borderLeft: `4px solid ${meta.borda}` }}
    >
      {/* Topo */}
      <div className="bevel-3d flex items-center gap-2 px-3 py-2">
        {no.isPlatformOwner && <Crown className="h-3.5 w-3.5 shrink-0 text-[#c2a05a]" />}
        <span className="truncate text-[12px] font-bold text-[#16294a]">{no.nome}</span>
      </div>
      {/* Corpo */}
      <div className="px-3 py-2 space-y-1">
        <TipoBadge tipo={no.tipoLicenciamento} />
        {no.donoNome && (
          <div className="text-[10px] text-[#647c97]">
            <span className="font-semibold">Responsável:</span> {no.donoNome}
          </div>
        )}
        {no.valorMensalContrato && (
          <div className="text-[10px] text-[#647c97]">
            <span className="font-semibold">Plano:</span> {fmtBRL(no.valorMensalContrato)}/mês
          </div>
        )}
        {no.locations.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {no.locations.slice(0, 3).map(l => (
              <span key={l} className="concave-3d px-1.5 py-0.5 text-[9px] text-[#647c97]">{l}</span>
            ))}
            {no.locations.length > 3 && (
              <span className="text-[9px] text-[#647c97]">+{no.locations.length - 3}</span>
            )}
          </div>
        )}
      </div>
      {/* Ações */}
      <div className="border-t border-[rgba(22,41,74,0.1)] px-3 py-2 flex items-center gap-2">
        <button
          onClick={() => onEdit(no.id)}
          className="concave-3d inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-[#16294a]"
        >
          <Edit2 className="h-3 w-3" /> Editar
        </button>
        {semDrive ? (
          <button
            onClick={() => onDrive(no.id)}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded"
            style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fbbf24" }}
          >
            <HardDrive className="h-3 w-3" /> Drive
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] text-[#3D7A7A]">
            <Check className="h-3 w-3" /> Drive ✓
          </span>
        )}
      </div>
    </div>
  );
}

// ── Nó da pirâmide com filhos ──────────────────────────────────────────────────

function PiramideNo({ no, nivel, onDrive, onEdit }: {
  no: EmpresaNo; nivel: number;
  onDrive: (id: number) => void;
  onEdit: (id: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-0">
      <EmpresaCard no={no} onDrive={onDrive} onEdit={onEdit} />
      {no.filhos.length > 0 && (
        <>
          {/* Linha descendente */}
          <div className="w-px bg-[rgba(22,41,74,0.2)]" style={{ height: 20 }} />
          {/* Linha horizontal */}
          <div className="relative flex items-start">
            {no.filhos.length > 1 && (
              <div
                className="absolute top-0 bg-[rgba(22,41,74,0.2)]"
                style={{
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: `calc(${no.filhos.length - 1} * 260px)`,
                  height: 1,
                }}
              />
            )}
            <div className="flex gap-4">
              {no.filhos.map(filho => (
                <PiramideNo key={filho.id} no={filho} nivel={nivel + 1} onDrive={onDrive} onEdit={onEdit} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Modal de criação/edição ────────────────────────────────────────────────────

interface FormState {
  nome: string; cnpj: string; donoNome: string; telefone: string; emailGeral: string;
  tipoLicenciamento: TipoLicenciamento; empresaMaeId: string;
  valorMensalContrato: string; royaltyPercent: string; status: string;
}

const FORM_VAZIO: FormState = {
  nome: "", cnpj: "", donoNome: "", telefone: "", emailGeral: "",
  tipoLicenciamento: "licenciada_direta", empresaMaeId: "",
  valorMensalContrato: "", royaltyPercent: "30", status: "ATIVO",
};

function Modal({ inicial, todasEmpresas, onSalvar, onFechar, salvando }: {
  inicial: FormState | null;
  todasEmpresas: EmpresaFlat[];
  onSalvar: (dados: FormState) => void;
  onFechar: () => void;
  salvando: boolean;
}) {
  const [form, setForm] = useState<FormState>(inicial ?? FORM_VAZIO);
  const set = (k: keyof FormState, v: string) => setForm(prev => ({ ...prev, [k]: v }));
  const precisaMae = form.tipoLicenciamento === "sub_unidade" || form.tipoLicenciamento === "licenciada_por_clinica";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(7,22,43,0.7)]">
      <div className="panel-3d w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bevel-3d flex items-center justify-between px-5 py-3">
          <span className="text-[14px] font-bold text-[#16294a]">
            {inicial ? "Editar Empresa" : "Nova Empresa"}
          </span>
          <button onClick={onFechar} className="concave-3d p-1"><X className="h-4 w-4 text-[#647c97]" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {/* Nome */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-[#647c97]">Nome da Empresa *</label>
            <input
              value={form.nome} onChange={e => set("nome", e.target.value)}
              className="concave-3d mt-1 w-full rounded px-3 py-2 text-[13px] text-[#16294a]"
              placeholder="Ex.: Clínica Barakat"
            />
          </div>
          {/* CNPJ + Responsável */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-[#647c97]">CNPJ</label>
              <input value={form.cnpj} onChange={e => set("cnpj", e.target.value)}
                className="concave-3d mt-1 w-full rounded px-3 py-2 text-[13px] text-[#16294a]"
                placeholder="00.000.000/0001-00" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-[#647c97]">Responsável</label>
              <input value={form.donoNome} onChange={e => set("donoNome", e.target.value)}
                className="concave-3d mt-1 w-full rounded px-3 py-2 text-[13px] text-[#16294a]"
                placeholder="Nome do dono" />
            </div>
          </div>
          {/* Tipo de licenciamento */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-[#647c97]">Tipo de Licenciamento *</label>
            <select
              value={form.tipoLicenciamento}
              onChange={e => set("tipoLicenciamento", e.target.value as TipoLicenciamento)}
              className="concave-3d mt-1 w-full rounded px-3 py-2 text-[13px] text-[#16294a]"
            >
              {TIPOS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {/* Empresa mãe (condicional) */}
          {precisaMae && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-[#647c97]">Empresa Mãe *</label>
              <select
                value={form.empresaMaeId}
                onChange={e => set("empresaMaeId", e.target.value)}
                className="concave-3d mt-1 w-full rounded px-3 py-2 text-[13px] text-[#16294a]"
              >
                <option value="">— Selecione —</option>
                {todasEmpresas.map(e => (
                  <option key={e.id} value={String(e.id)}>{e.nome}</option>
                ))}
              </select>
            </div>
          )}
          {/* Valores */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-[#647c97]">Mensalidade (R$)</label>
              <input value={form.valorMensalContrato} onChange={e => set("valorMensalContrato", e.target.value)}
                type="number" min="0" step="10"
                className="concave-3d mt-1 w-full rounded px-3 py-2 text-[13px] text-[#16294a]"
                placeholder="500" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-[#647c97]">Royalty % (repasse)</label>
              <input value={form.royaltyPercent} onChange={e => set("royaltyPercent", e.target.value)}
                type="number" min="0" max="100" step="1"
                className="concave-3d mt-1 w-full rounded px-3 py-2 text-[13px] text-[#16294a]"
                placeholder="30" />
            </div>
          </div>
          {/* Contato */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-[#647c97]">Telefone</label>
              <input value={form.telefone} onChange={e => set("telefone", e.target.value)}
                className="concave-3d mt-1 w-full rounded px-3 py-2 text-[13px] text-[#16294a]"
                placeholder="+55 11 00000-0000" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-[#647c97]">E-mail</label>
              <input value={form.emailGeral} onChange={e => set("emailGeral", e.target.value)}
                type="email"
                className="concave-3d mt-1 w-full rounded px-3 py-2 text-[13px] text-[#16294a]"
                placeholder="contato@clinica.com.br" />
            </div>
          </div>
          {/* Status */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-[#647c97]">Status</label>
            <select value={form.status} onChange={e => set("status", e.target.value)}
              className="concave-3d mt-1 w-full rounded px-3 py-2 text-[13px] text-[#16294a]">
              <option value="ATIVO">ATIVO</option>
              <option value="SUSPENSO">SUSPENSO</option>
              <option value="CANCELADO">CANCELADO</option>
            </select>
          </div>
        </div>
        {/* Footer */}
        <div className="border-t border-[rgba(22,41,74,0.1)] px-5 py-3 flex justify-end gap-3">
          <button onClick={onFechar} className="btn-3d-soft px-4 py-2 text-[12px] font-bold uppercase tracking-wide">
            Cancelar
          </button>
          <button
            onClick={() => onSalvar(form)}
            disabled={salvando || !form.nome}
            className="btn-3d inline-flex items-center gap-2 px-5 py-2 text-[12px] font-bold uppercase tracking-wide disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Painel de receita ──────────────────────────────────────────────────────────

function PainelReceita({ raiz, raizes }: { raiz: EmpresaNo | null; raizes?: EmpresaNo[] }) {
  const todosNos = raiz ? [raiz] : (raizes ?? []);
  const filhosParaCalculo = raiz ? raiz.filhos : todosNos;
  const { direto, royalties } = calcReceita(filhosParaCalculo);
  const total = direto + royalties;
  const projecaoAnual = total * 12;

  return (
    <section className="panel-3d px-5 py-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-4 w-4 text-[#c2a05a]" />
        <span className="text-[12px] font-bold uppercase tracking-wide text-[#16294a]">Receita PAXTER — Resumo Mensal</span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { rotulo: "Licenças Diretas", valor: fmtBRL(direto), cor: "#45B8CC" },
          { rotulo: "Royalties (30%)", valor: fmtBRL(royalties), cor: "#c2a05a" },
          { rotulo: "Total Mensal", valor: fmtBRL(total), cor: "#3D7A7A" },
        ].map(k => (
          <div key={k.rotulo} className="concave-3d px-3 py-2">
            <div className="text-[9px] font-bold uppercase tracking-wide text-[#647c97]">{k.rotulo}</div>
            <div className="text-[18px] font-bold mt-0.5" style={{ color: k.cor }}>{k.valor}</div>
          </div>
        ))}
      </div>
      <div className="concave-3d px-3 py-2 flex items-center justify-between">
        <span className="text-[11px] text-[#647c97]">Projeção anual (12 meses)</span>
        <span className="text-[14px] font-bold text-[#16294a]">{fmtBRL(projecaoAnual)}</span>
      </div>
      <p className="mt-2 text-[10px] text-[#647c97]">
        Cálculo: licenciadas_direta pagam mensalidade ao PAXTER; licenciadas_por_clinica pagam à clínica mãe, que repassa {30}% ao PAXTER.
      </p>
    </section>
  );
}

// ── Tabela de empresas ─────────────────────────────────────────────────────────

function TabelaEmpresas({ empresas, onEdit, onDrive }: {
  empresas: EmpresaFlat[];
  onEdit: (id: number) => void;
  onDrive: (id: number) => void;
}) {
  return (
    <section className="panel-3d px-5 py-4">
      <div className="text-[12px] font-bold uppercase tracking-wide text-[#16294a] mb-3">
        Todas as Empresas ({empresas.length})
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] text-[#16294a]">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-wide text-[#647c97]">
              <th className="concave-3d px-3 py-2 text-left">Empresa</th>
              <th className="concave-3d px-3 py-2 text-left">Tipo</th>
              <th className="concave-3d px-3 py-2 text-left">Status</th>
              <th className="concave-3d px-3 py-2 text-right">Mensalidade</th>
              <th className="concave-3d px-3 py-2 text-right">Royalty %</th>
              <th className="concave-3d px-3 py-2 text-left">Drive</th>
              <th className="concave-3d px-3 py-2 text-left">Ações</th>
            </tr>
          </thead>
          <tbody>
            {empresas.map((e, i) => (
              <tr key={e.id} style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.55)" : "transparent" }}>
                <td className="px-3 py-2 font-semibold">
                  {e.isPlatformOwner && <Crown className="inline h-3 w-3 mr-1 text-[#c2a05a]" />}
                  {e.nome}
                  {e.donoNome && <div className="text-[10px] text-[#647c97]">{e.donoNome}</div>}
                </td>
                <td className="px-3 py-2"><TipoBadge tipo={e.tipoLicenciamento} /></td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] font-bold ${e.status === "ATIVO" ? "text-[#3D7A7A]" : "text-[#c0392b]"}`}>
                    {e.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">{fmtBRL(e.valorMensalContrato)}</td>
                <td className="px-3 py-2 text-right">{e.royaltyPercent ? `${e.royaltyPercent}%` : "—"}</td>
                <td className="px-3 py-2">
                  {e.driveFolderEmpresaId
                    ? <Check className="h-3.5 w-3.5 text-[#3D7A7A]" />
                    : <button onClick={() => onDrive(e.id)} className="text-[10px] text-amber-600 underline underline-offset-2">Configurar</button>
                  }
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => onEdit(e.id)} className="concave-3d px-2 py-1 text-[10px] font-semibold text-[#16294a]">
                    <Edit2 className="inline h-3 w-3 mr-0.5" /> Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function EmpresasLicenciadas() {
  const [hierarquia, setHierarquia] = useState<HierarquiaResposta | null>(null);
  const [empresasFlat, setEmpresasFlat] = useState<EmpresaFlat[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; msg: string } | null>(null);
  const [driveCarregando, setDriveCarregando] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [h, flat] = await Promise.all([
        fetch(`${BASE}/api/empresas/hierarquia`).then(r => r.json()) as Promise<HierarquiaResposta>,
        fetch(`${BASE}/api/empresas`).then(r => r.json()) as Promise<EmpresaFlat[]>,
      ]);
      setHierarquia(h);
      setEmpresasFlat(Array.isArray(flat) ? flat : []);
    } catch {
      setAviso({ tipo: "erro", msg: "Erro ao carregar dados." });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  // KPIs
  const raiz = hierarquia?.raiz ?? null;
  const raizes = hierarquia?.raizes ?? [];
  const todosNos = raiz ? aplanar([raiz]) : aplanar(raizes);
  const totalTenants = todosNos.length;
  const filhosCalculo = raiz ? raiz.filhos : raizes;
  const { direto, royalties } = calcReceita(filhosCalculo);

  // Drive setup
  async function handleDrive(empresaId: number) {
    setDriveCarregando(empresaId);
    try {
      const r = await fetch(`${BASE}/api/empresas/${empresaId}/setup-drive`, { method: "POST" });
      const data = await r.json();
      if (r.ok) {
        setAviso({ tipo: "ok", msg: `Drive configurado! Pasta: ${data.folderUrl ?? data.folderId}` });
        void carregar();
      } else {
        setAviso({ tipo: "erro", msg: data.error ?? "Falha no Drive." });
      }
    } catch {
      setAviso({ tipo: "erro", msg: "Erro ao configurar Drive." });
    } finally {
      setDriveCarregando(null);
    }
  }

  function handleEdit(id: number) {
    setEditandoId(id);
    setModalAberto(true);
  }

  function handleNovaEmpresa() {
    setEditandoId(null);
    setModalAberto(true);
  }

  async function handleSalvar(form: FormState) {
    setSalvando(true);
    setAviso(null);
    try {
      const payload: Record<string, unknown> = {
        nome: form.nome,
        cnpj: form.cnpj || undefined,
        donoNome: form.donoNome || undefined,
        telefone: form.telefone || undefined,
        emailGeral: form.emailGeral || undefined,
        tipoLicenciamento: form.tipoLicenciamento,
        empresaMaeId: form.empresaMaeId ? parseInt(form.empresaMaeId) : null,
        valorMensalContrato: form.valorMensalContrato ? parseFloat(form.valorMensalContrato) : null,
        royaltyPercent: form.royaltyPercent ? parseFloat(form.royaltyPercent) : null,
        status: form.status,
      };

      const url = editandoId ? `${BASE}/api/empresas/${editandoId}` : `${BASE}/api/empresas`;
      const method = editandoId ? "PUT" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (r.ok) {
        setAviso({ tipo: "ok", msg: editandoId ? "Empresa atualizada." : "Empresa criada." });
        setModalAberto(false);
        void carregar();
      } else {
        const e = await r.json();
        setAviso({ tipo: "erro", msg: e.error ?? "Falha ao salvar." });
      }
    } catch {
      setAviso({ tipo: "erro", msg: "Erro de rede." });
    } finally {
      setSalvando(false);
    }
  }

  // Dados para o modal de edição
  const empresaParaEditar = editandoId ? empresasFlat.find(e => e.id === editandoId) : null;
  const formInicial: FormState | null = empresaParaEditar
    ? {
        nome: empresaParaEditar.nome,
        cnpj: empresaParaEditar.cnpj ?? "",
        donoNome: empresaParaEditar.donoNome ?? "",
        telefone: empresaParaEditar.telefone ?? "",
        emailGeral: empresaParaEditar.emailGeral ?? "",
        tipoLicenciamento: (empresaParaEditar.tipoLicenciamento as TipoLicenciamento) ?? "propria",
        empresaMaeId: empresaParaEditar.empresaMaeId ? String(empresaParaEditar.empresaMaeId) : "",
        valorMensalContrato: empresaParaEditar.valorMensalContrato ?? "",
        royaltyPercent: empresaParaEditar.royaltyPercent ?? "30",
        status: empresaParaEditar.status,
      }
    : null;

  return (
    <ConsoleShell
      icon={Building2}
      title="Centro de Comando PAXTER"
      subtitle="Pirâmide de licenciamento — clínicas, sub-unidades e royalties"
    >
      {/* KPIs */}
      <section className="panel-3d px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-3">
            {[
              { rotulo: "Tenants Ativos", valor: String(totalTenants), icon: Users, cor: "#3D7A7A" },
              { rotulo: "Receita Mensal", valor: fmtBRL(direto + royalties), icon: TrendingUp, cor: "#45B8CC" },
              { rotulo: "Royalties Recebidos", valor: fmtBRL(royalties), icon: Landmark, cor: "#c2a05a" },
            ].map(k => (
              <div key={k.rotulo} className="concave-3d flex items-center gap-2 px-3 py-2">
                <k.icon className="h-4 w-4 shrink-0" style={{ color: k.cor }} />
                <div>
                  <div className="text-[8px] font-bold uppercase tracking-wide text-[#647c97]">{k.rotulo}</div>
                  <div className="text-[16px] font-bold text-[#16294a]">{k.valor}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {aviso && (
              <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${aviso.tipo === "ok" ? "text-[#3D7A7A]" : "text-[#c0392b]"}`}>
                {aviso.tipo === "ok" ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                {aviso.msg}
              </div>
            )}
            <button onClick={carregar} className="concave-3d p-2">
              <RefreshCw className={`h-4 w-4 text-[#647c97] ${carregando ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={handleNovaEmpresa}
              className="btn-3d inline-flex items-center gap-2 px-4 py-2.5 text-[12px] font-bold uppercase tracking-wide"
            >
              <Plus className="h-4 w-4" /> Nova Empresa
            </button>
          </div>
        </div>
      </section>

      {/* Pirâmide visual */}
      <section className="panel-3d px-5 py-6">
        <div className="flex items-center gap-2 mb-5">
          <Wifi className="h-4 w-4 text-[#c2a05a]" />
          <span className="text-[12px] font-bold uppercase tracking-wide text-[#16294a]">Pirâmide de Licenciamento</span>
        </div>
        {carregando ? (
          <div className="py-10 text-center text-[12px] text-[#647c97]">Carregando pirâmide…</div>
        ) : (
          <div className="overflow-x-auto pb-4">
            <div className="flex justify-center min-w-max">
              {raiz ? (
                <PiramideNo no={raiz} nivel={0} onDrive={handleDrive} onEdit={handleEdit} />
              ) : (
                <div className="flex gap-4">
                  {raizes.map(r => (
                    <PiramideNo key={r.id} no={r} nivel={0} onDrive={handleDrive} onEdit={handleEdit} />
                  ))}
                </div>
              )}
            </div>
            {/* Legenda */}
            <div className="flex flex-wrap items-center gap-4 mt-6 justify-center">
              {Object.entries(TIPO_META).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1.5 text-[10px]" style={{ color: v.cor }}>
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ background: v.bg, border: `1.5px solid ${v.borda}` }} />
                  {v.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Painel de receita */}
      <PainelReceita raiz={raiz} raizes={raizes} />

      {/* Tabela */}
      {!carregando && <TabelaEmpresas empresas={empresasFlat} onEdit={handleEdit} onDrive={handleDrive} />}

      {/* Modal */}
      {modalAberto && (
        <Modal
          inicial={formInicial}
          todasEmpresas={empresasFlat}
          onSalvar={handleSalvar}
          onFechar={() => setModalAberto(false)}
          salvando={salvando}
        />
      )}

      {/* Overlay de Drive */}
      {driveCarregando !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(7,22,43,0.7)]">
          <div className="panel-3d px-6 py-5 flex items-center gap-3">
            <HardDrive className="h-5 w-5 text-[#45B8CC] animate-pulse" />
            <span className="text-[13px] font-semibold text-[#16294a]">Configurando pasta no Google Drive…</span>
          </div>
        </div>
      )}
    </ConsoleShell>
  );
}
