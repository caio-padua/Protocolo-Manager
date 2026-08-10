import { useEffect, useMemo, useState, type ElementType } from "react";
import { tituloProprio } from "@/lib/utils";
import {
  FileSignature, User, Stethoscope, FileText, Eye, CheckCircle2,
  ExternalLink, Download, Layers, Clock, CalendarDays,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PaxterClientSelector, type PaxterClientOption } from "@/components/PaxterClientSelector";
import { CidPicker } from "@/components/CidPicker";
import { useToast } from "@/hooks/use-toast";
import {
  VARIAVEIS_DOC, aplicarVariaveis, montarValores, dataHojeBR,
} from "@/lib/doc-variaveis";

const NAVY = "#16284a";
const OURO = "#c9a24e";

const API = import.meta.env.BASE_URL + "api";

// Profissional padrão da casa (espelha a tela de Prescrição).
const PROF_DEFAULT = { nome: "Dr. Caio Henrique Pádua", crm: "125475", uf: "SP" };

const TIPOS: { value: string; label: string }[] = [
  { value: "comparecimento", label: "Comparecimento" },
  { value: "afastamento", label: "Afastamento" },
  { value: "acompanhante", label: "Acompanhante" },
  { value: "aptidao", label: "Aptidão" },
];

interface ClientRow {
  id: number;
  name: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
}

interface ProfessionalRow {
  id: number;
  name: string;
  crm: string | null;
}

interface DocumentTemplate {
  id: number;
  tipo: string;
  nome: string;
  corpo: string;
}

interface Atestado {
  id: number;
  clientId: number | null;
  clientName: string;
  tipo: string;
  status: string;
  fileName: string | null;
  driveWebViewLink: string | null;
  pdfUrl: string;
  createdAt: string;
  emittedAt: string | null;
}

export default function AtestadosPage() {
  const { toast } = useToast();

  // ---- Dados de apoio ----
  const { data: clientes = [] } = useQuery<ClientRow[]>({
    queryKey: ["atestado-clientes"],
    queryFn: async () => {
      const r = await fetch(`${API}/clients`);
      if (!r.ok) throw new Error("Falha ao carregar clientes");
      return r.json();
    },
  });
  const { data: profissionais = [] } = useQuery<ProfessionalRow[]>({
    queryKey: ["atestado-profissionais"],
    queryFn: async () => {
      const r = await fetch(`${API}/professionals`);
      if (!r.ok) throw new Error("Falha ao carregar profissionais");
      return r.json();
    },
  });
  const { data: modelos = [] } = useQuery<DocumentTemplate[]>({
    queryKey: ["atestado-modelos"],
    queryFn: async () => {
      const r = await fetch(`${API}/document-templates?tipo=atestado`);
      if (!r.ok) throw new Error("Falha ao carregar modelos");
      return r.json();
    },
  });

  // ---- Estado do formulário ----
  const [clientId, setClientId] = useState<number | null>(null);
  const [professionalId, setProfessionalId] = useState<number | null>(null);
  const [tipo, setTipo] = useState("comparecimento");
  const [dias, setDias] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [cid, setCid] = useState("");
  const [finalidade, setFinalidade] = useState("");
  const [modeloId, setModeloId] = useState<number | null>(null);
  const [corpo, setCorpo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [emitindo, setEmitindo] = useState(false);

  const clienteSel = useMemo(() => clientes.find((c) => c.id === clientId) ?? null, [clientes, clientId]);
  const profSel = useMemo(() => profissionais.find((p) => p.id === professionalId) ?? null, [profissionais, professionalId]);

  const clientPickerOpts: PaxterClientOption[] = useMemo(
    () => clientes.map((c) => ({ id: c.id, name: c.name, cpf: c.cpf, phone: c.phone, photoUrl: (c as any).photoUrl ?? null })),
    [clientes],
  );

  // ---- Histórico do cliente ----
  const { data: historico = [], refetch: refetchHistorico } = useQuery<Atestado[]>({
    queryKey: ["atestados", clientId],
    enabled: clientId != null,
    queryFn: async () => {
      const r = await fetch(`${API}/atestados?clientId=${clientId}`);
      if (!r.ok) throw new Error("Falha ao carregar histórico");
      return r.json();
    },
  });

  // Aplica o modelo escolhido ao corpo.
  function aplicarModelo(id: number | null) {
    setModeloId(id);
    if (id == null) return;
    const m = modelos.find((x) => x.id === id);
    if (m) setCorpo(m.corpo);
  }

  // Valores atuais das variáveis (para prévia e para insertar chips).
  const valores = useMemo(
    () =>
      montarValores({
        cliente: { nome: clienteSel?.name, cpf: clienteSel?.cpf },
        profissional: {
          nome: profSel?.name ?? PROF_DEFAULT.nome,
          crm: profSel?.crm ?? PROF_DEFAULT.crm,
          uf: PROF_DEFAULT.uf,
        },
        extras: { dias, cid, finalidade },
      }),
    [clienteSel, profSel, dias, cid, finalidade],
  );

  const corpoAplicado = useMemo(() => aplicarVariaveis(corpo, valores), [corpo, valores]);

  function inserirVariavel(chave: string) {
    setCorpo((c) => `${c}{{${chave}}}`);
  }

  async function emitir() {
    if (clientId == null || !clienteSel) {
      toast({ title: "Selecione um cliente", variant: "destructive" });
      return;
    }
    if (!corpoAplicado.trim()) {
      toast({ title: "O corpo do atestado está vazio", variant: "destructive" });
      return;
    }
    setEmitindo(true);
    try {
      // 1) Cria o registro (corpo JÁ com variáveis aplicadas).
      const criar = await fetch(`${API}/atestados`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          clientName: clienteSel.name,
          clientCpf: clienteSel.cpf ?? null,
          clientPhone: clienteSel.phone ?? null,
          clientEmail: clienteSel.email ?? null,
          professionalId: professionalId ?? null,
          professionalName: profSel?.name ?? PROF_DEFAULT.nome,
          professionalCrm: profSel?.crm ?? PROF_DEFAULT.crm,
          professionalUf: PROF_DEFAULT.uf,
          tipo,
          dias: dias.trim() ? Number(dias) : null,
          dataInicio: dataInicio.trim() || null,
          cid: cid.trim() || null,
          finalidade: finalidade.trim() || null,
          corpo: corpoAplicado,
          observacao: observacao.trim() || null,
        }),
      });
      if (!criar.ok) throw new Error("Falha ao criar o atestado");
      const criado: Atestado = await criar.json();

      // 2) Emite (gera PDF + sobe ao Drive best-effort).
      const emit = await fetch(`${API}/atestados/${criado.id}/emitir`, { method: "POST" });
      if (!emit.ok) throw new Error("Falha ao emitir o atestado");
      const emitido: Atestado = await emit.json();

      toast({ title: "Atestado emitido!", description: "PDF gerado com sucesso." });
      window.open(`${API}/atestados/${emitido.id}/pdf`, "_blank");
      refetchHistorico();
    } catch (err) {
      toast({
        title: "Erro ao emitir atestado",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setEmitindo(false);
    }
  }

  return (
    <div className="screen-3d min-h-full p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        {/* Cabeçalho */}
        <header className="panel-3d flex items-center gap-3 px-5 py-4">
          <span className="bevel-3d flex h-11 w-11 items-center justify-center" style={{ color: OURO }}>
            <FileSignature className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold" style={{ color: NAVY }}>Atestados</h1>
            <p className="text-sm text-slate-500">Emissão de atestados médicos — Arsenal Clínico</p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Coluna esquerda — formulário */}
          <div className="space-y-5">
            {/* Cliente & Profissional */}
            <section className="panel-3d space-y-4 p-5">
              <BlockTitle icon={User} color="text-slate-700">Cliente e Profissional</BlockTitle>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Cliente</label>
                  <PaxterClientSelector clientes={clientPickerOpts} value={clientId} onChange={setClientId} />
                  {clienteSel && (
                    <p className="mt-1 text-xs text-slate-500">CPF: {clienteSel.cpf || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Profissional</label>
                  <select
                    className="field-engraved h-10 w-full px-3"
                    value={professionalId ?? ""}
                    onChange={(e) => setProfessionalId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">{`${PROF_DEFAULT.nome} — CRM ${PROF_DEFAULT.crm}/${PROF_DEFAULT.uf} (padrão)`}</option>
                    {profissionais.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.crm ? ` — CRM ${p.crm}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* Parâmetros do atestado */}
            <section className="panel-3d space-y-4 p-5">
              <BlockTitle icon={Stethoscope} color="text-slate-700">Parâmetros</BlockTitle>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Tipo</label>
                  <select className="field-engraved h-10 w-full px-3" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                    {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Clock className="h-3 w-3" /> Dias
                  </label>
                  <input
                    type="number" min={0} className="field-engraved h-10 w-full px-3"
                    value={dias} onChange={(e) => setDias(e.target.value)} placeholder="ex.: 3"
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <CalendarDays className="h-3 w-3" /> Início
                  </label>
                  <input
                    type="date" className="field-engraved h-10 w-full px-3"
                    value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">CID</label>
                  <CidPicker value={cid} onChange={setCid} placeholder="ex.: J06.9 ou gripe" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Finalidade</label>
                  <input
                    className="field-engraved h-10 w-full px-3"
                    value={finalidade} onChange={(e) => setFinalidade(e.target.value)} placeholder="ex.: tratamento clínico"
                  />
                </div>
              </div>
            </section>

            {/* Corpo & Modelo */}
            <section className="panel-3d space-y-4 p-5">
              <BlockTitle icon={FileText} color="text-slate-700">Texto do Atestado</BlockTitle>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Modelo</label>
                <select
                  className="field-engraved h-10 w-full px-3"
                  value={modeloId ?? ""}
                  onChange={(e) => aplicarModelo(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">— escolher um modelo —</option>
                  {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Variáveis</label>
                <div className="flex flex-wrap gap-1.5">
                  {VARIAVEIS_DOC.map((v) => (
                    <button
                      key={v.chave}
                      type="button"
                      onClick={() => inserirVariavel(v.chave)}
                      className="bevel-3d px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                      title={v.rotulo}
                    >
                      {`{{${v.chave}}}`}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Corpo</label>
                <textarea
                  className="field-engraved min-h-[160px] w-full resize-y p-3 text-sm leading-relaxed"
                  value={corpo} onChange={(e) => setCorpo(e.target.value)}
                  placeholder="Escreva o texto do atestado ou selecione um modelo. Use {{variáveis}}."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Observações</label>
                <textarea
                  className="field-engraved min-h-[70px] w-full resize-y p-3 text-sm"
                  value={observacao} onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Observações internas (opcional)."
                />
              </div>
            </section>
          </div>

          {/* Coluna direita — prévia + emissão + histórico */}
          <div className="space-y-5">
            <section className="panel-3d space-y-4 p-5">
              <div className="flex items-center justify-between">
                <BlockTitle icon={Eye} color="text-slate-700">Prévia</BlockTitle>
                <button
                  type="button"
                  onClick={emitir}
                  disabled={emitindo}
                  className="btn-3d inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: NAVY }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {emitindo ? "Emitindo…" : "Emitir Atestado"}
                </button>
              </div>

              <div className="concave-3d rounded-md bg-white p-5">
                <div className="border-b-2 pb-2 text-center" style={{ borderColor: NAVY }}>
                  <div className="text-lg font-bold tracking-wide" style={{ color: NAVY }}>INSTITUTO PÁDUA</div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: OURO }}>
                    Paxter — desenvolvido pela Padcon
                  </div>
                </div>
                <div className="mt-4 text-center text-base font-bold uppercase tracking-wide" style={{ color: NAVY }}>
                  Atestado Médico
                </div>
                <div className="mt-4 space-y-1 text-sm text-slate-700">
                  <p><span className="font-semibold">Cliente:</span> {clienteSel?.name ? tituloProprio(clienteSel.name) : "—"}</p>
                  <p className="text-xs text-slate-500">CPF: {clienteSel?.cpf || "—"}</p>
                  <p className="text-xs" style={{ color: NAVY }}>
                    Tipo: {TIPOS.find((t) => t.value === tipo)?.label}
                  </p>
                </div>
                <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                  {corpoAplicado || <span className="text-slate-400">O texto aparecerá aqui…</span>}
                </div>
                {cid.trim() && <p className="mt-3 text-sm font-semibold" style={{ color: NAVY }}>CID: {cid}</p>}
                <div className="mt-8 text-center text-sm text-slate-700">
                  <p>São Paulo, {dataHojeBR()}.</p>
                  <div className="mx-auto mt-10 w-64 border-t border-slate-400 pt-1">
                    <p className="font-semibold">{profSel?.name ?? PROF_DEFAULT.nome}</p>
                    <p className="text-xs text-slate-500">
                      CRM {profSel?.crm ?? PROF_DEFAULT.crm}/{PROF_DEFAULT.uf}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Histórico */}
            <section className="panel-3d space-y-3 p-5">
              <BlockTitle icon={Layers} color="text-slate-700">Histórico do Cliente</BlockTitle>
              {clientId == null ? (
                <p className="text-sm text-slate-400">Selecione um cliente para ver os atestados emitidos.</p>
              ) : historico.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum atestado emitido para este cliente.</p>
              ) : (
                <ul className="space-y-2">
                  {historico.map((a) => (
                    <li key={a.id} className="concave-3d flex items-center justify-between rounded-md bg-white px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-700">
                          {TIPOS.find((t) => t.value === a.tipo)?.label ?? a.tipo}
                          <span className="ml-2 text-xs text-slate-400">#{a.id}</span>
                        </p>
                        <p className="text-xs text-slate-400">
                          {a.status === "emitted" ? "Emitido" : "Rascunho"}
                          {a.emittedAt ? ` — ${new Date(a.emittedAt).toLocaleString("pt-BR")}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <a
                          href={`${API}/atestados/${a.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="bevel-3d inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                        >
                          <Download className="h-3.5 w-3.5" /> PDF
                        </a>
                        {a.driveWebViewLink && (
                          <a
                            href={a.driveWebViewLink}
                            target="_blank"
                            rel="noreferrer"
                            className="bevel-3d inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> Drive
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

// Placa Saliente (Bevel) do título de cada bloco — padrão Paxter.
function BlockTitle({ icon: Icon, color, children }: { icon: ElementType; color: string; children: React.ReactNode }) {
  return (
    <span className={`bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-base font-semibold uppercase tracking-wide ${color}`}>
      <Icon className="h-4 w-4" />
      {children}
    </span>
  );
}
