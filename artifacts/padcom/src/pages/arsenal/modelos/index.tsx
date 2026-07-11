import { useEffect, useMemo, useRef, useState, type ElementType } from "react";
import {
  FileText, Plus, Save, Trash2, Eye, Tag, FilePlus2, Sparkles, Pencil, X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  VARIAVEIS_DOC, aplicarVariaveis, type VariavelDoc,
} from "@/lib/doc-variaveis";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface DocumentTemplate {
  id: number;
  tipo: string;
  nome: string;
  corpo: string;
  descricao: string | null;
  variaveis: unknown;
  ativo: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

const TIPOS: { value: string; label: string }[] = [
  { value: "atestado", label: "Atestado" },
  { value: "encaminhamento", label: "Encaminhamento" },
  { value: "recibo", label: "Recibo" },
  { value: "geral", label: "Geral" },
];

const TIPO_LABEL: Record<string, string> = {
  atestado: "Atestado",
  encaminhamento: "Encaminhamento",
  recibo: "Recibo",
  geral: "Geral",
};

// Valores de EXEMPLO do catálogo — usados só na PRÉVIA da tela.
const VALORES_EXEMPLO: Record<string, string> = Object.fromEntries(
  VARIAVEIS_DOC.map((v) => [v.chave, v.exemplo]),
);

interface FormState {
  id: number | null;
  tipo: string;
  nome: string;
  descricao: string;
  corpo: string;
}

const FORM_VAZIO: FormState = { id: null, tipo: "atestado", nome: "", descricao: "", corpo: "" };

export default function ModelosDocumentoPage() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const corpoRef = useRef<HTMLTextAreaElement>(null);

  const carregar = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/document-templates`);
      if (!r.ok) throw new Error("falha");
      setTemplates(await r.json());
    } catch {
      toast({ title: "Erro ao carregar modelos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Agrupa os modelos por tipo, na ordem oficial dos tipos.
  const grupos = useMemo(() => {
    return TIPOS.map((t) => ({
      tipo: t.value,
      label: t.label,
      itens: templates.filter((m) => m.tipo === t.value),
    })).filter((g) => g.itens.length > 0);
  }, [templates]);

  const editando = form.id != null;

  const novo = () => {
    setForm(FORM_VAZIO);
    corpoRef.current?.focus();
  };

  const editar = (m: DocumentTemplate) => {
    setForm({ id: m.id, tipo: m.tipo, nome: m.nome, descricao: m.descricao ?? "", corpo: m.corpo });
  };

  // Insere {{chave}} na posição do cursor do textarea do corpo.
  const inserirVariavel = (chave: string) => {
    const el = corpoRef.current;
    const token = `{{${chave}}}`;
    if (!el) {
      setForm((f) => ({ ...f, corpo: f.corpo + token }));
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const novoCorpo = form.corpo.slice(0, start) + token + form.corpo.slice(end);
    setForm((f) => ({ ...f, corpo: novoCorpo }));
    // Reposiciona o cursor logo após o token inserido.
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const salvar = async () => {
    if (!form.nome.trim()) {
      toast({ title: "Informe o nome do modelo", variant: "destructive" });
      return;
    }
    if (!form.corpo.trim()) {
      toast({ title: "O corpo do modelo não pode ficar vazio", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tipo: form.tipo,
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        corpo: form.corpo,
      };
      const url = editando
        ? `${BASE}/api/document-templates/${form.id}`
        : `${BASE}/api/document-templates`;
      const r = await fetch(url, {
        method: editando ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error("falha");
      toast({ title: editando ? "Modelo atualizado" : "Modelo criado" });
      setForm(FORM_VAZIO);
      await carregar();
    } catch {
      toast({ title: "Erro ao salvar modelo", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const excluir = async (m: DocumentTemplate) => {
    if (!window.confirm(`Excluir o modelo "${m.nome}"?`)) return;
    try {
      const r = await fetch(`${BASE}/api/document-templates/${m.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("falha");
      toast({ title: "Modelo excluído" });
      if (form.id === m.id) setForm(FORM_VAZIO);
      await carregar();
    } catch {
      toast({ title: "Erro ao excluir modelo", variant: "destructive" });
    }
  };

  const previa = useMemo(() => aplicarVariaveis(form.corpo, VALORES_EXEMPLO), [form.corpo]);

  const inputCls =
    "field-engraved border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-accent/40 w-full";

  return (
    <div className="max-w-[1100px] mx-auto space-y-5">
      {/* PAGE HEADER */}
      <div className="screen-3d flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="bevel-3d inline-flex w-11 h-11 items-center justify-center text-primary">
            <FileText className="w-6 h-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Modelos de Documento</h1>
            <p className="text-[11px] tracking-[0.22em] uppercase text-primary font-semibold">
              Motor de Textos Reutilizáveis — Arsenal Clínico
            </p>
          </div>
        </div>
        <button onClick={novo} className="btn-3d px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-1.5 shrink-0">
          <Plus className="w-4 h-4" />Novo modelo
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── COLUNA ESQUERDA: LISTA POR TIPO ─────────────────────────── */}
        <section className="panel-3d p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <BlockTitle icon={Tag} color="text-primary">Modelos Cadastrados</BlockTitle>
            <span className="font-mono text-xs text-muted-foreground shrink-0">{templates.length}</span>
          </div>

          {loading ? (
            <div className="concave-3d flex items-center justify-center py-14 text-sm text-muted-foreground">
              Carregando modelos…
            </div>
          ) : grupos.length === 0 ? (
            <div className="concave-3d flex items-center justify-center text-center text-muted-foreground py-14">
              <div>
                <FileText className="w-12 h-12 mx-auto mb-2 text-border" />
                <p className="text-sm">Nenhum modelo cadastrado</p>
                <p className="text-xs mt-1">Crie um modelo no formulário ao lado</p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {grupos.map((g) => (
                <div key={g.tipo} className="space-y-3">
                  {/* Rótulo do grupo (tipo) */}
                  <div className="flex items-center gap-3">
                    <div className="panel-3d-active flex items-center gap-2 px-3 py-1.5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        {g.label}
                      </span>
                      <span className="concave-3d px-2 py-0.5 text-[10px] font-black tabular-nums text-muted-foreground">
                        {g.itens.length}
                      </span>
                    </div>
                    <div className="flex-1 h-0.5 bg-foreground/8" />
                  </div>

                  {g.itens.map((m) => (
                    <div
                      key={m.id}
                      className={`panel-3d-sub p-4 ${form.id === m.id ? "panel-3d-active" : ""}`}
                    >
                      {/* Zona título: nome no slot fixo + chip de tipo */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-black uppercase tracking-tight text-foreground truncate">
                            {m.nome}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                            {m.descricao || "—"}
                          </div>
                        </div>
                        <span className="concave-3d shrink-0 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-primary">
                          {TIPO_LABEL[m.tipo] ?? m.tipo}
                        </span>
                      </div>

                      {/* Zona meta: status + ações */}
                      <div className="flex items-center justify-between gap-2 mt-3">
                        <span className="concave-3d inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-emerald-600">
                          <span className="paxter-led paxter-led-green paxter-led-on" />
                          Ativo
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => editar(m)}
                            className="btn-3d-soft px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1"
                          >
                            <Pencil className="w-3.5 h-3.5" />Editar
                          </button>
                          <button
                            onClick={() => excluir(m)}
                            className="btn-3d-soft px-3 py-1.5 rounded-md text-xs font-semibold text-destructive flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />Excluir
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── COLUNA DIREITA: FORMULÁRIO ──────────────────────────────── */}
        <section className="panel-3d p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <BlockTitle icon={editando ? Pencil : FilePlus2} color="text-primary">
              {editando ? "Editar Modelo" : "Novo Modelo"}
            </BlockTitle>
            {editando && (
              <button
                onClick={() => setForm(FORM_VAZIO)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 font-semibold"
              >
                <X className="w-3.5 h-3.5" />Cancelar edição
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground block mb-1">Nome</label>
              <input
                className={inputCls}
                placeholder="Ex.: Atestado de comparecimento"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground block mb-1">Tipo</label>
              <select
                className={inputCls}
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              >
                {TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground block mb-1">Descrição</label>
              <input
                className={inputCls}
                placeholder="Opcional"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>
          </div>

          {/* CHIPS de variáveis */}
          <div className="panel-3d-sub p-3">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Variáveis (clique para inserir no corpo)
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {VARIAVEIS_DOC.map((v: VariavelDoc) => (
                <button
                  key={v.chave}
                  type="button"
                  onClick={() => inserirVariavel(v.chave)}
                  title={`{{${v.chave}}} — ex.: ${v.exemplo}`}
                  className="btn-3d-soft px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />{v.rotulo}
                </button>
              ))}
            </div>
          </div>

          {/* CORPO */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground block mb-1">Corpo do documento</label>
            <textarea
              ref={corpoRef}
              className={`${inputCls} min-h-[220px] font-mono leading-relaxed resize-y`}
              placeholder="Escreva o texto do modelo. Use as variáveis acima, ex.: Atesto que {{cliente.nome}} esteve presente em {{data.hoje}}."
              value={form.corpo}
              onChange={(e) => setForm({ ...form, corpo: e.target.value })}
            />
          </div>

          {/* PRÉVIA */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Eye className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Prévia (com valores de exemplo)
              </span>
            </div>
            <div className="concave-3d px-4 py-3 text-sm text-foreground whitespace-pre-wrap min-h-[80px] leading-relaxed">
              {previa || <span className="text-muted-foreground/50">A prévia aparece aqui conforme você digita o corpo.</span>}
            </div>
          </div>

          {/* AÇÕES */}
          <div className="flex items-center gap-3">
            <button
              onClick={salvar}
              disabled={saving}
              className="btn-3d px-5 py-2.5 rounded-md text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
            >
              <Save className="w-4 h-4" />{saving ? "Salvando…" : editando ? "Salvar alterações" : "Criar modelo"}
            </button>
            {editando && form.id != null && (
              <button
                onClick={() => {
                  const m = templates.find((t) => t.id === form.id);
                  if (m) excluir(m);
                }}
                className="btn-3d-soft px-4 py-2.5 rounded-md text-sm font-semibold text-destructive flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />Excluir
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// Placa Saliente (Bevel) do título de cada bloco — padrão Paxter (Padrão 3).
function BlockTitle({ icon: Icon, color, children }: { icon: ElementType; color: string; children: React.ReactNode }) {
  return (
    <span className={`bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-base font-semibold uppercase tracking-wide ${color}`}>
      <Icon className="h-4 w-4" />
      {children}
    </span>
  );
}
