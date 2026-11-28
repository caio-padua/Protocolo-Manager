import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FileCheck2,
  FileText,
  LayoutGrid,
  LockKeyhole,
  MessageCircle,
  Search,
  ShieldCheck,
  UserRound,
  Rows3,
} from "lucide-react";
import { ABAS, type AbaId } from "./_source/CockpitTabs";
import { PaxterClientSelector } from "./_source/PaxterClientSelector";
import { clientesDeExemplo } from "./_source/preview-deps";
import "./_group.css";
import "./CockpitIhe.css";
import { CockpitProposalRail } from "./CockpitProposalRail";
import { IdentityActions } from "./IdentityActions";

type ClienteDemo = (typeof clientesDeExemplo)[number];
type PainelId = AbaId;
type ModoVisualizacao = "abas" | "paineis" | "ficha";

const MODOS_VISUALIZACAO: {
  id: ModoVisualizacao;
  titulo: string;
  detalhe: string;
  Icon: typeof FileText;
}[] = [
  { id: "abas", titulo: "ABAS", detalhe: "uma ferramenta por vez", Icon: FileText },
  { id: "paineis", titulo: "PAINÉIS", detalhe: "blocos compactos abertos", Icon: LayoutGrid },
  { id: "ficha", titulo: "FICHA CONTÍNUA · IHE", detalhe: "ficha ampla empilhada", Icon: Rows3 },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function idade(data: string) {
  const nascimento = new Date(`${data}T12:00:00`);
  const hoje = new Date();
  let anos = hoje.getFullYear() - nascimento.getFullYear();
  if (
    hoje.getMonth() < nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate())
  ) anos -= 1;
  return `${anos} anos`;
}

function cpfLegivel(cpf: string) {
  const digits = cpf.replace(/\D/g, "");
  return digits.length === 11
    ? digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : cpf;
}

function FieldSlot({ label, value = "—", wide = false }: { label: string; value?: string; wide?: boolean }) {
  return (
    <div className={`ct3-field${wide ? " ct3-field--wide" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SubPanel({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <section className="ct3-subpanel">
      <div className="ct3-subpanel-heading">
        <div>
          {eyebrow && <span className="ct3-sub-eyebrow">{eyebrow}</span>}
          <h4>{title}</h4>
        </div>
        <span className="ct3-subpanel-mark" aria-hidden="true" />
      </div>
      <div className="ct3-subpanel-body">{children}</div>
    </section>
  );
}

function EmptyState({ title, note }: { title: string; note: string }) {
  return (
    <div className="ct3-empty-state">
      <span className="ct3-empty-mark" aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{note}</p>
      </div>
    </div>
  );
}

function EmptyRows({ labels }: { labels: string[] }) {
  return (
    <div className="ct3-table">
      <div className="ct3-table-head">
        {labels.map((label) => <span key={label}>{label}</span>)}
      </div>
      <EmptyState title="Dados não consultados nesta prévia" note="A fonte de dados de origem não é consultada por este quadro." />
    </div>
  );
}

function ProgressRail({ labels }: { labels: string[] }) {
  return (
    <div className="ct3-progress-rail" aria-label="Etapas ilustrativas da ferramenta">
      {labels.map((label, index) => (
        <div className="ct3-progress-step" key={label}>
          <span className="ct3-progress-node">{String(index + 1).padStart(2, "0")}</span>
          <strong>{label}</strong>
          {index < labels.length - 1 && <span className="ct3-progress-line" aria-hidden="true" />}
        </div>
      ))}
    </div>
  );
}

function ToolPreview({ id, client }: { id: PainelId; client: ClienteDemo | null }) {
  switch (id) {
    case "prescricao":
      return (
        <div className="ct3-tool-layout ct3-tool-layout--prescricao">
          <SubPanel title="Composição da prescrição" eyebrow="EDITOR VISUAL">
            <div className="ct3-form-grid">
              <FieldSlot label="NOME DA FÓRMULA" />
              <FieldSlot label="VIA DE ADMINISTRAÇÃO" />
              <FieldSlot label="POSOLOGIA" wide />
              <FieldSlot label="DURAÇÃO" />
              <FieldSlot label="ORIENTAÇÕES" />
            </div>
            <div className="ct3-editor-bottom">
              <span><LockKeyhole size={13} /> Catálogo e emissão não estão conectados nesta prévia.</span>
              <button type="button" disabled className="ct3-disabled-action">EMISSÃO INDISPONÍVEL</button>
            </div>
          </SubPanel>
          <SubPanel title="Itens da prescrição" eyebrow="LISTA">
            <EmptyState title="Dados de prescrição não consultados nesta prévia" note="A lista de origem não é carregada neste quadro." />
          </SubPanel>
        </div>
      );
    case "injetaveis":
      return (
        <div className="ct3-tool-layout ct3-tool-layout--wide">
          <SubPanel title="Acompanhamento do protocolo" eyebrow="INJETÁVEIS">
            <ProgressRail labels={["Protocolo", "Sessões", "Agenda", "Registro"]} />
            <div className="ct3-form-grid ct3-form-grid--three">
              <FieldSlot label="PROTOCOLO" />
              <FieldSlot label="PRÓXIMA ETAPA" />
              <FieldSlot label="UNIDADE" />
            </div>
          </SubPanel>
          <SubPanel title="Aplicações e sessões" eyebrow="HISTÓRICO">
            <EmptyRows labels={["SESSÃO", "DATA", "STATUS", "OBSERVAÇÃO"]} />
          </SubPanel>
        </div>
      );
    case "implantes":
      return (
        <div className="ct3-tool-layout">
          <SubPanel title="Dados do procedimento" eyebrow="IMPLANTES">
            <div className="ct3-form-grid ct3-form-grid--three">
              <FieldSlot label="PROCEDIMENTO" />
              <FieldSlot label="DATA" />
              <FieldSlot label="PROFISSIONAL" />
              <FieldSlot label="LOTE / IDENTIFICAÇÃO" />
              <FieldSlot label="RETORNO" />
              <FieldSlot label="DOCUMENTO" />
            </div>
          </SubPanel>
          <SubPanel title="Linha do tempo" eyebrow="ACOMPANHAMENTO">
            <EmptyState title="Dados do procedimento não consultados nesta prévia" note="A origem não é consultada por este quadro." />
          </SubPanel>
        </div>
      );
    case "exames":
      return (
        <div className="ct3-tool-layout">
          <SubPanel title="Entrada e solicitação" eyebrow="EXAMES">
            <div className="ct3-channel-grid">
              <div className="ct3-channel">
                <span className="ct3-channel-icon"><Search size={16} /></span>
                <div><strong>Busca no catálogo</strong><span>Área visual · sem consulta ao catálogo</span></div>
                <ChevronRight size={16} />
              </div>
              <div className="ct3-channel">
                <span className="ct3-channel-icon"><FileCheck2 size={16} /></span>
                <div><strong>Pedidos e resultados</strong><span>Área visual · sem dados do cliente</span></div>
                <ChevronRight size={16} />
              </div>
            </div>
            <FieldSlot label="JUSTIFICATIVA / OBSERVAÇÃO" wide />
          </SubPanel>
          <SubPanel title="Solicitações" eyebrow="HISTÓRICO">
            <EmptyRows labels={["PEDIDO", "DATA", "STATUS", "ORIGEM"]} />
          </SubPanel>
        </div>
      );
    case "evolucao":
      return (
        <div className="ct3-tool-layout ct3-tool-layout--wide">
          <SubPanel title="Registro de evolução" eyebrow="EVOLUÇÃO">
            <div className="ct3-form-grid ct3-form-grid--three">
              <FieldSlot label="DATA DO REGISTRO" />
              <FieldSlot label="PROFISSIONAL" />
              <FieldSlot label="TIPO DE ATENDIMENTO" />
              <FieldSlot label="ANOTAÇÃO CLÍNICA" wide />
            </div>
          </SubPanel>
          <SubPanel title="Linha do tempo" eyebrow="REGISTROS">
            <EmptyState title="Dados de evolução não consultados nesta prévia" note="A linha do tempo de origem não é consultada." />
          </SubPanel>
        </div>
      );
    case "anamnese":
      return (
        <div className="ct3-tool-layout ct3-tool-layout--wide">
          <SubPanel title="Dados da anamnese" eyebrow="ANAMNESE PRÉVIA">
            <div className="ct3-form-grid ct3-form-grid--two">
              <FieldSlot label="QUEIXA PRINCIPAL" />
              <FieldSlot label="HISTÓRIA ATUAL" />
              <FieldSlot label="ANTECEDENTES" />
              <FieldSlot label="MEDICAÇÕES E ALERGIAS" />
              <FieldSlot label="HÁBITOS" />
              <FieldSlot label="OBSERVAÇÕES" />
            </div>
          </SubPanel>
          <SubPanel title="Questionário" eyebrow="RESPOSTAS">
            <EmptyState title="Respostas não consultadas nesta prévia" note="Campos clínicos permanecem vazios neste quadro." />
          </SubPanel>
        </div>
      );
    case "documentos":
      return (
        <div className="ct3-tool-layout ct3-tool-layout--wide">
          <SubPanel title="Documentos do cliente" eyebrow="ARQUIVOS">
            <EmptyRows labels={["DOCUMENTO", "CATEGORIA", "DATA", "ACESSO"]} />
          </SubPanel>
          <SubPanel title="Preparar documento" eyebrow="AÇÕES">
            <div className="ct3-action-shelf">
              <span><FileText size={17} /> Dados não consultados nesta prévia.</span>
              <button type="button" disabled className="ct3-disabled-action">AÇÃO INDISPONÍVEL</button>
            </div>
          </SubPanel>
        </div>
      );
    case "protocolos":
      return (
        <div className="ct3-tool-layout ct3-tool-layout--wide">
          <SubPanel title="Protocolos do cliente" eyebrow="ACOMPANHAMENTO">
            <EmptyRows labels={["PROTOCOLO", "INÍCIO", "SESSÕES", "SITUAÇÃO"]} />
          </SubPanel>
          <SubPanel title="Resumo do protocolo" eyebrow="VISÃO GERAL">
            <div className="ct3-form-grid ct3-form-grid--three">
              <FieldSlot label="PROTOCOLO ATIVO" />
              <FieldSlot label="SESSÃO ATUAL" />
              <FieldSlot label="PRÓXIMA AÇÃO" />
            </div>
            <div className="ct3-protocol-action">
              <button type="button" disabled aria-disabled="true" className="ct3-disabled-action">NOVO PROTOCOLO</button>
              <span>Indisponível nesta prévia · nenhum dado será criado.</span>
            </div>
          </SubPanel>
        </div>
      );
    case "dieta-treino":
      return (
        <div className="ct3-tool-layout">
          <SubPanel title="Plano alimentar" eyebrow="DIETA">
            <div className="ct3-form-grid">
              <FieldSlot label="PLANO ATUAL" />
              <FieldSlot label="PROFISSIONAL" />
              <FieldSlot label="ÚLTIMA REVISÃO" />
              <FieldSlot label="OBSERVAÇÕES" />
            </div>
            <EmptyState title="Dados do plano não consultados nesta prévia" note="A origem não é consultada por este quadro." />
          </SubPanel>
          <SubPanel title="Plano de treino" eyebrow="ATIVIDADE">
            <div className="ct3-form-grid">
              <FieldSlot label="PLANO ATUAL" />
              <FieldSlot label="FREQUÊNCIA" />
              <FieldSlot label="ÚLTIMA REVISÃO" />
              <FieldSlot label="OBSERVAÇÕES" />
            </div>
          </SubPanel>
        </div>
      );
    case "financeiro":
      return (
        <div className="ct3-tool-layout ct3-tool-layout--wide">
          <SubPanel title="Visão financeira" eyebrow="RESUMO">
            <div className="ct3-metric-grid">
              {["SALDO EM ABERTO", "ÚLTIMO PAGAMENTO", "PRÓXIMO VENCIMENTO", "SITUAÇÃO"].map((label) => (
                <div className="ct3-metric" key={label}><span>{label}</span><strong>—</strong></div>
              ))}
            </div>
          </SubPanel>
          <SubPanel title="Movimentações" eyebrow="LANÇAMENTOS">
            <EmptyRows labels={["DESCRIÇÃO", "DATA", "VALOR", "SITUAÇÃO"]} />
          </SubPanel>
        </div>
      );
    case "cadastro":
      return (
        <div className="ct3-tool-layout ct3-tool-layout--wide">
          <SubPanel title="Identificação e contato" eyebrow="CADASTRO">
            <div className="ct3-form-grid ct3-form-grid--three">
              <FieldSlot label="NOME COMPLETO" value={client?.name ?? "—"} wide />
              <FieldSlot label="CPF" value={client ? cpfLegivel(client.cpf) : "—"} />
              <FieldSlot label="DATA DE NASCIMENTO" value={client?.birthDate.split("-").reverse().join("/") ?? "—"} />
              <FieldSlot label="TELEFONE" value={client?.phone ?? "—"} />
              <FieldSlot label="E-MAIL" value={client?.email ?? "—"} wide />
            </div>
          </SubPanel>
          <SubPanel title="Outras informações" eyebrow="DADOS">
            <div className="ct3-form-grid">
              <FieldSlot label="ENDEREÇO" />
              <FieldSlot label="CONTATO DE EMERGÊNCIA" />
              <FieldSlot label="OBSERVAÇÕES" wide />
            </div>
          </SubPanel>
        </div>
      );
    case "telegram":
      return (
        <div className="ct3-tool-layout ct3-tool-layout--wide">
          <SubPanel title="Conversas" eyebrow="TELEGRAM">
            <div className="ct3-message-empty">
              <span className="ct3-channel-icon"><MessageCircle size={18} /></span>
              <strong>Conversas não consultadas nesta prévia</strong>
              <p>Esta prévia não acessa mensagens nem envia comunicações.</p>
            </div>
          </SubPanel>
          <SubPanel title="Nova mensagem" eyebrow="COMUNICAÇÃO">
            <FieldSlot label="MENSAGEM" />
            <div className="ct3-editor-bottom">
              <span><LockKeyhole size={13} /> Envio desativado nesta prévia.</span>
              <button type="button" disabled className="ct3-disabled-action">ENVIAR INDISPONÍVEL</button>
            </div>
          </SubPanel>
        </div>
      );
    default:
      return null;
  }
}

function Panel({
  id,
  index,
  open,
  client,
  onToggle,
  collapsible = true,
}: {
  id: PainelId;
  index: number;
  open: boolean;
  client: ClienteDemo | null;
  onToggle: (id: PainelId) => void;
  collapsible?: boolean;
}) {
  const tool = ABAS.find((item) => item.id === id);
  if (!tool) return null;
  const Icon = tool.Icon;
  const titleId = `ct3-title-${id}`;
  const headerContent = (
    <>
      <span className="ct3-panel-order">{String(index + 1).padStart(2, "0")}</span>
      <span className="ct3-panel-icon"><Icon size={17} strokeWidth={1.8} aria-hidden="true" /></span>
      <span className="ct3-panel-title">
        <span>FERRAMENTA {String(index + 1).padStart(2, "0")} / {String(ABAS.length).padStart(2, "0")}</span>
        <strong>{tool.rotulo}</strong>
      </span>
      <span className="ct3-panel-state"><i aria-hidden="true" /> PRÉVIA</span>
      {collapsible && <ChevronDown className={`ct3-panel-chevron${open ? " is-open" : ""}`} size={17} aria-hidden="true" />}
    </>
  );

  return (
    <section className={`ct3-tool-panel panel-3d-sub${open ? " is-open" : ""}`} id={`ct3-panel-${id}`}>
      {collapsible ? (
        <button
          type="button"
          className="ct3-panel-trigger"
          onClick={() => onToggle(id)}
          aria-expanded={open}
          aria-controls={`ct3-content-${id}`}
          id={titleId}
        >
          {headerContent}
        </button>
      ) : (
        <div className="ct3-panel-trigger ct3-panel-trigger--static" role="heading" aria-level={3} id={titleId}>
          {headerContent}
        </div>
      )}
      {(open || !collapsible) && (
        <div
          className="ct3-panel-content"
          id={`ct3-content-${id}`}
          role="region"
          aria-labelledby={titleId}
        >
          <div className="ct3-content-note">
            <ShieldCheck size={14} aria-hidden="true" />
            <span>Estrutura visual de referência · sem consulta ou alteração de dados clínicos</span>
          </div>
          <ToolPreview id={id} client={client} />
        </div>
      )}
    </section>
  );
}

export { Panel as PainelFicha };

export function CockpitIhe() {
  const [clientId, setClientId] = useState<number | null>(clientesDeExemplo[0]?.id ?? null);
  const [openPanels, setOpenPanels] = useState<Set<PainelId>>(() => new Set(ABAS.map((item) => item.id)));
  const [activePanel, setActivePanel] = useState<PainelId>("prescricao");
  const [viewMode, setViewMode] = useState<ModoVisualizacao>("ficha");
  const [actionNotice, setActionNotice] = useState("");

  const client = clientesDeExemplo.find((item) => item.id === clientId) ?? null;
  const options = useMemo(
    () => clientesDeExemplo.map(({ id, name, cpf, phone, photoUrl }) => ({ id, name, cpf, phone, photoUrl })),
    [],
  );
  const allOpen = openPanels.size === ABAS.length;

  useEffect(() => {
    const elements = ABAS.map((item) => document.getElementById(`ct3-panel-${item.id}`)).filter(
      (element): element is HTMLElement => element !== null,
    );
    if (!("IntersectionObserver" in window) || !elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort(
          (first, second) => first.boundingClientRect.top - second.boundingClientRect.top,
        )[0];
        const id = visible?.target.id.replace("ct3-panel-", "") as PainelId | undefined;
        if (id) setActivePanel(id);
      },
      { rootMargin: "-14% 0px -72% 0px", threshold: 0 },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [viewMode]);

  const togglePanel = (id: PainelId) => {
    setOpenPanels((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectPanel = (id: PainelId) => {
    setActivePanel(id);
    if (viewMode === "abas") return;
    setOpenPanels((current) => new Set(current).add(id));
    window.requestAnimationFrame(() => {
      window.setTimeout(() => document.getElementById(`ct3-panel-${id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }), 30);
    });
  };

  const handlePreviewAction = (action: "edit" | "drive") => {
    setActionNotice(action === "edit"
      ? "Prévia: a edição do cadastro não foi aberta nem alterada. Nenhuma ação foi executada."
      : "Prévia: nenhuma pasta ou planilha foi criada, compartilhada ou acessada no Drive.");
  };

  const selectMode = (mode: ModoVisualizacao) => {
    if (mode !== "abas") setOpenPanels(new Set(ABAS.map((item) => item.id)));
    setViewMode(mode);
  };

  const visiblePanels = viewMode === "abas"
    ? ABAS.filter((item) => item.id === activePanel)
    : ABAS;

  return (
    <div className="cockpit-ihe">
      <div className="ct3-preview-bar">
        <span className="ct3-preview-signal" aria-hidden="true" />
        <strong>TERCEIRO MODO · FICHA CONTÍNUA</strong>
        <span className="ct3-preview-divider" aria-hidden="true" />
        <span>PRÉVIA DE DESIGN · sem conexão clínica real</span>
      </div>

      <header className="ct3-header">
        <div className="ct3-brand-line">
          <div className="ct3-brand-lockup">
            <div className="ct3-brand-copy">
              <span>COCKPIT DA CONSULTA</span>
              <strong>VISUALIZAÇÃO 03 · FICHA CONTÍNUA</strong>
            </div>
          </div>
          <div className="ct3-reference-tag">
            <span>ESTRUTURA DO IHE</span>
            <span>·</span>
            <span>LINGUAGEM PAXTER</span>
          </div>
        </div>

        <section className="ct3-client-identity" aria-label="Cliente demonstrativo selecionado">
          <div className="ct3-client-avatar" aria-hidden="true">
            {client ? initials(client.name) : <UserRound size={23} />}
          </div>
          <div className="ct3-client-main">
            <span className="ct3-kicker">CLIENTE DEMONSTRATIVO · SELEÇÃO ÚNICA</span>
            <h1>{client?.name ?? "Nenhum cliente selecionado"}</h1>
            <div className="ct3-client-meta">
              <span>ID {client?.id ?? "—"}</span>
              <span>{client ? idade(client.birthDate) : "—"}</span>
              <span>{client ? cpfLegivel(client.cpf) : "—"}</span>
            </div>
          </div>
          <div className="ct3-contact-grid">
            <div><span>TELEFONE</span><strong>{client?.phone ?? "—"}</strong></div>
            <div><span>E-MAIL</span><strong title={client?.email ?? ""}>{client?.email ?? "—"}</strong></div>
          </div>
        </section>

        <div className="ct3-selector-row">
          <span className="ct3-selector-label">
            TROCAR CLIENTE
          </span>
          <PaxterClientSelector
            clientes={options}
            value={clientId}
            onChange={(id) => { setClientId(id); setActionNotice(""); }}
            placeholder="Selecionar cliente…"
            className="ct3-client-select"
          />
          <div className="ct3-action-wrap">
            <span className="ct3-action-label">AÇÕES DO CLIENTE</span>
            <IdentityActions
              clientId={clientId}
              onAction={handlePreviewAction}
              className="ct3-client-actions"
            />
          </div>
          <span className="ct3-single-context">
            <ShieldCheck size={14} aria-hidden="true" />
            Uma seleção mantém o contexto desta prévia
          </span>
        </div>
        {actionNotice && <div className="ct3-action-notice" role="status">{actionNotice}</div>}
      </header>

      <div className="ct3-toolbar">
        <div className="ct3-mode-toolbar">
          <span className="ct3-mode-label">MODO DE VISUALIZAÇÃO</span>
          <div className="ct3-mode-switch" role="tablist" aria-label="Modos demonstrativos do Cockpit">
            {MODOS_VISUALIZACAO.map((mode) => {
              const Icon = mode.Icon;
              return (
                <button
                  type="button"
                  role="tab"
                  key={mode.id}
                  aria-selected={viewMode === mode.id}
                  className={viewMode === mode.id ? "is-active" : ""}
                  onClick={() => selectMode(mode.id)}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span className="ct3-mode-copy">
                    <strong>{mode.titulo}</strong>
                    <small>{mode.detalhe}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <CockpitProposalRail
          active={activePanel}
          mode={viewMode === "abas" ? "tabs" : "anchors"}
          onChange={selectPanel}
        />
      </div>

      <main className="ct3-main">
        <div className="ct3-section-intro">
          <div>
            <span className="ct3-kicker">
              {viewMode === "abas"
                ? "MODO ABAS · UMA FERRAMENTA POR VEZ"
                : viewMode === "paineis"
                  ? "MODO PAINÉIS · BLOCOS COMPACTOS ABERTOS"
                  : "FICHA CONTÍNUA · FERRAMENTAS EM SEQUÊNCIA"}
            </span>
            <h2>{viewMode === "abas" ? "Ferramenta selecionada" : "Todas as ferramentas, no mesmo contexto"}</h2>
          </div>
          {viewMode !== "abas" && (
            <div className="ct3-section-controls">
              <span className="ct3-open-count">{openPanels.size} / {ABAS.length} ABERTOS</span>
              <span className="ct3-count-bevel screen-3d">{ABAS.length} FERRAMENTAS</span>
              <button
                type="button"
                className="ct3-toolbar-button"
                onClick={() => setOpenPanels(new Set(ABAS.map((item) => item.id)))}
                disabled={allOpen}
              >
                <ArrowDownToLine size={14} aria-hidden="true" />
                EXPANDIR TUDO
              </button>
              <button
                type="button"
                className="ct3-toolbar-button"
                onClick={() => setOpenPanels(new Set())}
                disabled={openPanels.size === 0}
              >
                <ArrowUpToLine size={14} aria-hidden="true" />
                RECOLHER TUDO
              </button>
            </div>
          )}
        </div>

        {!client && (
          <div className="ct3-no-client" role="status">
            <UserRound size={18} />
            <span>Selecione um cliente demonstrativo. Nenhum dado real será carregado.</span>
          </div>
        )}

        <div
          className={`ct3-panels${viewMode === "paineis" ? " ct3-panels--compact" : ""}`}
          id="cockpit-proposal-tool-content"
          role={viewMode === "abas" ? "tabpanel" : undefined}
          aria-labelledby={viewMode === "abas" ? `cockpit-proposal-tool-${activePanel}` : undefined}
        >
          {visiblePanels.map((item) => {
            const index = ABAS.findIndex((tool) => tool.id === item.id);
            return (
            <Panel
              key={item.id}
              id={item.id}
              index={index}
              open={viewMode === "abas" || openPanels.has(item.id)}
              client={client}
              onToggle={togglePanel}
              collapsible={viewMode !== "abas"}
            />
            );
          })}
        </div>

        <footer className="ct3-footer">
          <span className="ct3-footer-tag">PRÉVIA DE DESIGN</span>
          <span>Visualização de referência · ações clínicas e dados reais não estão conectados</span>
        </footer>
      </main>

      <div className="ct3-mobile-message">
        <div className="ct3-mobile-message-card panel-3d">
          <CalendarDays size={24} aria-hidden="true" />
          <h2>Visualização para computador</h2>
          <p>Este terceiro modo foi desenhado para telas de computador e notebook. No celular, use o Cockpit por abas.</p>
          <span>PRÉVIA · SEM CONEXÃO CLÍNICA</span>
        </div>
      </div>
    </div>
  );
}
