import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FileCheck2,
  FileText,
  FolderOpen,
  HeartHandshake,
  LockKeyhole,
  Pill,
  ScanLine,
  Share2,
  Sparkles,
  Syringe,
  Users,
} from "lucide-react";
import { Button } from "@paxcare/components/ui/button";
import { BrandArtwork } from "@paxcare/components/pax-care";

type ExamCategory = "vitaminas" | "metabolico" | "tireoide";

const EXAM_CATEGORIES: Record<ExamCategory, {
  label: string;
  rows: Array<{ name: string; unit: string; first: string; second: string; third: string }>;
  path: string;
}> = {
  vitaminas: {
    label: "Vitaminas",
    rows: [
      { name: "Vitamina D", unit: "ng/mL", first: "24,8", second: "36,2", third: "42,5" },
      { name: "Vitamina B12", unit: "pg/mL", first: "310", second: "425", third: "512" },
      { name: "Ferritina", unit: "ng/mL", first: "38", second: "54", third: "71" },
    ],
    path: "M4 76 C42 72, 56 48, 96 51 S154 28, 202 20 S248 14, 276 8",
  },
  metabolico: {
    label: "Metabólico",
    rows: [
      { name: "Glicemia em jejum", unit: "mg/dL", first: "98", second: "92", third: "88" },
      { name: "Hemoglobina glicada", unit: "%", first: "5,6", second: "5,4", third: "5,2" },
      { name: "Triglicerídeos", unit: "mg/dL", first: "148", second: "126", third: "112" },
    ],
    path: "M4 12 C46 18, 58 30, 98 34 S156 52, 202 55 S250 68, 276 72",
  },
  tireoide: {
    label: "Tireoide",
    rows: [
      { name: "TSH", unit: "mUI/L", first: "3,4", second: "2,6", third: "2,1" },
      { name: "T4 livre", unit: "ng/dL", first: "1,0", second: "1,2", third: "1,3" },
    ],
    path: "M4 64 C44 58, 70 66, 104 48 S154 42, 194 30 S242 28, 276 16",
  },
};

export function ExamsPreview() {
  const [category, setCategory] = useState<ExamCategory>("vitaminas");
  const [reportOpen, setReportOpen] = useState(false);
  const current = EXAM_CATEGORIES[category];

  return (
    <div className="product-window exams-window">
      <div className="window-chrome">
        <span className="window-dots"><i /><i /><i /></span>
        <BrandArtwork compact />
        <span>MINHA HISTÓRIA</span>
      </div>
      {reportOpen ? (
        <div className="report-view" aria-live="polite">
          <Button type="button" variant="quiet" onClick={() => setReportOpen(false)} className="preview-back">
            <ArrowLeft size={15} /> Voltar ao histórico
          </Button>
          <div className="report-paper">
            <div className="report-paper-head">
              <span className="report-seal"><FileCheck2 size={20} /></span>
              <span>RELATÓRIO PARA CONSULTA</span>
              <span>PDF</span>
            </div>
            <h3>A sua evolução, pronta para entrar na conversa.</h3>
            <p>Uma leitura organizada dos seus exames, documentos e marcos de cuidado para apresentar ao profissional.</p>
            <div className="report-summary-grid">
              <span><strong>03</strong> momentos comparados</span>
              <span><strong>01</strong> histórico reunido</span>
            </div>
            <div className="report-lines"><i /><i /><i /><i /></div>
          </div>
        </div>
      ) : (
        <div className="window-content">
          <div className="preview-heading-row">
            <div>
              <span className="preview-kicker">EXAMES E EVOLUÇÃO</span>
              <h3>O tempo passa. O contexto fica.</h3>
            </div>
            <Button type="button" variant="quiet" onClick={() => setReportOpen(true)} className="pdf-trigger">
              <FileText size={15} /> PDF de evolução
            </Button>
          </div>
          <div className="category-tabs" role="tablist" aria-label="Categorias de exames">
            {(Object.keys(EXAM_CATEGORIES) as ExamCategory[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={category === key}
                className={`category-tab ${category === key ? "active" : ""}`}
                onClick={() => setCategory(key)}
              >
                {EXAM_CATEGORIES[key].label}
              </button>
            ))}
          </div>
          <div className="exam-overview">
            <div className="exam-chart">
              <div className="chart-heading"><span>Linha do tempo</span><strong>Fev — Ago</strong></div>
              <svg viewBox="0 0 280 88" role="img" aria-label={`Evolução da categoria ${current.label}`} preserveAspectRatio="none">
                <path className="chart-grid-line" d="M0 22H280 M0 44H280 M0 66H280" />
                <path className="exam-chart-shadow" d={`${current.path} L276 88 L4 88 Z`} />
                <path className="exam-chart-line" d={current.path} />
                <circle cx="276" cy={category === "metabolico" ? "72" : category === "tireoide" ? "16" : "8"} r="4" className="exam-chart-dot" />
              </svg>
            </div>
            <div className="exam-table-wrap">
              <table className="exam-table">
                <thead><tr><th>Indicador</th><th>Fev</th><th>Mai</th><th>Ago</th></tr></thead>
                <tbody>
                  {current.rows.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}<small>{row.unit}</small></td>
                      <td>{row.first}</td><td>{row.second}</td><td><strong>{row.third}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="exam-document-rail" aria-label="Documentos da linha de evolução">
            {["Fevereiro", "Maio", "Agosto"].map((month, index) => (
              <span key={month}><FileCheck2 size={14} /><small>0{index + 1} · {month}</small><strong>Laudo e resultados</strong></span>
            ))}
          </div>
          <div className="preview-bottom-row">
            <span><FolderOpen size={15} /> Laudos e arquivos no mesmo lugar</span>
            <span>Comparativo <ArrowRight size={14} /></span>
          </div>
        </div>
      )}
    </div>
  );
}

const ROUTINE_ITEMS = [
  { id: "medicamento", icon: Pill, title: "Medicamento prescrito", detail: "Conforme a orientação do seu profissional", time: "08:00" },
  { id: "creatina", icon: Sparkles, title: "Creatina · 5 g", detail: "Um cuidado simples, no seu ritmo", time: "13:00" },
  { id: "whey", icon: Bell, title: "Whey protein · 1 dose", detail: "Lembrete criado para a sua rotina", time: "18:30" },
];

export function RoutinePreview() {
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());

  function toggleItem(id: string) {
    setCompleted((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const progress = Math.round((completed.size / ROUTINE_ITEMS.length) * 100);

  return (
    <div className="product-window routine-window">
      <div className="window-chrome">
        <span className="window-dots"><i /><i /><i /></span><span>MEU DIA</span><span>ROTINA</span>
      </div>
      <div className="window-content">
        <div className="preview-heading-row">
          <div><span className="preview-kicker">QUARTA-FEIRA · SEU RITMO</span><h3>Pequenos cuidados. Um dia mais leve.</h3></div>
          <span className="routine-date"><CalendarDays size={17} /> Hoje</span>
        </div>
        <ul className="routine-list">
          {ROUTINE_ITEMS.map((item) => {
            const Icon = item.icon;
            const done = completed.has(item.id);
            return (
              <li key={item.id}>
                <button type="button" className={`routine-item ${done ? "done" : ""}`} aria-pressed={done} onClick={() => toggleItem(item.id)}>
                  <span className="routine-icon"><Icon size={18} /></span>
                  <span className="routine-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
                  <span className="routine-time"><Clock3 size={12} />{item.time}</span>
                  <span className="routine-check">{done && <Check size={14} />}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="routine-progress" aria-live="polite">
          <div><span>Seu ritmo de hoje</span><strong>{completed.size} de {ROUTINE_ITEMS.length} lembretes</strong></div>
          <div className="progress-track" aria-label={`${progress}% da rotina marcada`}><span style={{ width: `${progress}%` }} /></div>
        </div>
      </div>
    </div>
  );
}

type ProtocolOrigin = "integrada" | "externa" | "pessoal";
const PROTOCOLS: Record<ProtocolOrigin, { label: string; title: string; subtitle: string; sessions: string[] }> = {
  integrada: { label: "Clínica integrada", title: "Protocolo acompanhado pela clínica", subtitle: "Etapas, registros e orientações reunidos na sua jornada.", sessions: ["Início", "Aplicação 02", "Aplicação 03", "Revisão"] },
  externa: { label: "Outra clínica", title: "Protocolo realizado em outra clínica", subtitle: "O cuidado feito em outro espaço também encontra o seu lugar na história.", sessions: ["Registro", "Aplicação 01", "Aplicação 02", "Retorno"] },
  pessoal: { label: "Registro pessoal", title: "O seu próprio registro de cuidado", subtitle: "Uma memória organizada para você e para quem acompanha você.", sessions: ["Anotação", "Horário", "Evolução", "Consulta"] },
};

export function ProtocolPreview() {
  const [origin, setOrigin] = useState<ProtocolOrigin>("integrada");
  const current = PROTOCOLS[origin];
  return (
    <div className="protocol-preview">
      <div className="protocol-tabs" role="tablist" aria-label="Origem do protocolo">
        {(Object.keys(PROTOCOLS) as ProtocolOrigin[]).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={origin === key} className={origin === key ? "active" : ""} onClick={() => setOrigin(key)}>
            {PROTOCOLS[key].label}
          </button>
        ))}
      </div>
      <div className="protocol-card" aria-live="polite">
        <div className="protocol-card-head">
          <span className="protocol-icon"><Syringe size={22} /></span>
          <div><span>PROTOCOLO INJETÁVEL</span><h3>{current.title}</h3><p>{current.subtitle}</p></div>
        </div>
        <ol className="protocol-timeline">
          {current.sessions.map((session, index) => (
            <li key={session} className={index < 2 ? "complete" : ""}>
              <span>{index < 2 ? <Check size={13} /> : index + 1}</span><strong>{session}</strong><small>{index < 2 ? "Registrado" : "Na jornada"}</small>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function MriPreview() {
  const [presentation, setPresentation] = useState(false);
  return (
    <div className="mri-preview">
      <div className="mri-toolbar">
        <span><ScanLine size={17} /> Ressonância de coluna</span>
        <Button type="button" variant={presentation ? "outline" : "champagne"} onClick={() => setPresentation((value) => !value)}>
          {presentation ? <ArrowLeft size={15} /> : <FileText size={15} />}
          {presentation ? "Voltar ao comparativo" : "Preparar para a consulta"}
        </Button>
      </div>
      {presentation ? (
        <div className="mri-presentation" aria-live="polite">
          <span className="preview-kicker">APRESENTAÇÃO PARA O MÉDICO</span>
          <h3>Dois momentos. Uma leitura conduzida com contexto.</h3>
          <div className="presentation-sequence">
            <span><small>PRIMEIRO MOMENTO</small><strong>Laudo de fevereiro</strong></span>
            <ChevronRight size={20} />
            <span><small>MOMENTO ATUAL</small><strong>Laudo de agosto</strong></span>
          </div>
          <p>Segmentos e descrições organizados lado a lado para você apresentar a sequência dos laudos durante a consulta.</p>
        </div>
      ) : (
        <div className="mri-documents">
          {["Laudo · Fevereiro", "Laudo · Agosto"].map((title, reportIndex) => (
            <article className="mri-document" key={title}>
              <div className="mri-doc-head"><FileText size={17} /><strong>{title}</strong><span>0{reportIndex + 1}</span></div>
              <h4>Ressonância magnética · Coluna lombar</h4>
              <div className="mri-doc-lines">
                <span><small>L3–L4</small><i /><i /></span>
                <span className={reportIndex === 1 ? "highlight" : ""}><small>L4–L5</small><i /><i /></span>
                <span><small>L5–S1</small><i /><i /></span>
              </div>
              <p>Descrição do laudo organizada para revisão e conversa com o profissional.</p>
            </article>
          ))}
          <div className="comparison-link" aria-hidden="true"><span /><ScanLine size={20} /><span /></div>
        </div>
      )}
      <div className="mri-caption"><span>Comparativo visual lado a lado</span><span>Você leva o contexto. O médico conduz a leitura.</span></div>
    </div>
  );
}

type Audience = "familia" | "profissionais";
type VaultDrawer = "exames" | "arquivos" | "registros";
const SHARE_CATEGORIES = ["Exames", "Laudos", "Rotina", "Protocolos"];
const VAULT_DRAWERS: Record<VaultDrawer, { label: string; detail: string; content: string }> = {
  exames: { label: "Exames e laudos", detail: "Evolução e documentos", content: "Resultados, comparativos e laudos organizados para cada nova conversa." },
  arquivos: { label: "Arquivos pessoais", detail: "A sua documentação", content: "Documentos e arquivos de saúde reunidos em uma gaveta que acompanha você." },
  registros: { label: "Protocolos e registros", detail: "A jornada completa", content: "Protocolos, rotina e anotações pessoais conectados à mesma história." },
};

export function SharingPreview() {
  const [audience, setAudience] = useState<Audience>("familia");
  const [drawer, setDrawer] = useState<VaultDrawer>("exames");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(["Exames", "Laudos"]));
  const [reviewing, setReviewing] = useState(false);

  function toggleCategory(category: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category); else next.add(category);
      return next;
    });
    setReviewing(false);
  }

  return (
    <div className="sharing-preview vault-cabinet">
      <div className="vault-cabinet-top"><span><LockKeyhole size={14} /> COFRE PESSOAL</span><BrandArtwork compact /></div>
      <div className="vault-drawers" role="tablist" aria-label="Gavetas do cofre">
        {(Object.keys(VAULT_DRAWERS) as VaultDrawer[]).map((key, index) => (
          <button key={key} type="button" role="tab" aria-selected={drawer === key} className={`vault-drawer ${drawer === key ? "active" : ""}`} onClick={() => setDrawer(key)}>
            <span className="vault-drawer-number">0{index + 1}</span>
            <span className="vault-drawer-copy"><strong>{VAULT_DRAWERS[key].label}</strong><small>{VAULT_DRAWERS[key].detail}</small></span>
            <span className="vault-drawer-handle" aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="vault-drawer-panel">
        <div className="vault-drawer-detail" aria-live="polite"><FolderOpen size={18} /><p>{VAULT_DRAWERS[drawer].content}</p></div>
        <div className="sharing-preview-head">
          <span className="sharing-icon"><HeartHandshake size={22} /></span>
          <div><span className="preview-kicker">REGISTROS E CONEXÕES</span><h3>A sua história circula com intenção.</h3></div>
        </div>
      <div className="audience-switch" aria-label="Com quem compartilhar">
        <button type="button" className={audience === "familia" ? "active" : ""} aria-pressed={audience === "familia"} onClick={() => { setAudience("familia"); setReviewing(false); }}><Users size={16} /> Familiares</button>
        <button type="button" className={audience === "profissionais" ? "active" : ""} aria-pressed={audience === "profissionais"} onClick={() => { setAudience("profissionais"); setReviewing(false); }}><Share2 size={16} /> Profissionais</button>
      </div>
      <p className="sharing-description">Escolha as categorias que fazem sentido para {audience === "familia" ? "quem caminha ao seu lado" : "quem participa do seu cuidado"}.</p>
      <div className="share-category-grid">
        {SHARE_CATEGORIES.map((category) => (
          <button key={category} type="button" aria-pressed={selected.has(category)} className={selected.has(category) ? "selected" : ""} onClick={() => toggleCategory(category)}>
            <span>{selected.has(category) && <Check size={13} />}</span>{category}
          </button>
        ))}
      </div>
      <Button type="button" variant="care" onClick={() => setReviewing((value) => !value)} disabled={selected.size === 0}>
        {reviewing ? "Ocultar resumo" : "Visualizar seleção"} <ArrowRight size={15} />
      </Button>
        <div className={`sharing-summary ${reviewing ? "visible" : ""}`} aria-live="polite">
          {reviewing && <><span>Seleção para {audience === "familia" ? "familiares" : "profissionais"}</span><strong>{Array.from(selected).join(" · ")}</strong><small>Você define o que faz sentido compartilhar.</small></>}
        </div>
      </div>
    </div>
  );
}
