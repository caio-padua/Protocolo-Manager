import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  DollarSign,
  FileText,
  FlaskConical,
  Gem,
  MessageCircle,
  Pill,
  TrendingUp,
  UserRound,
  Utensils,
} from "lucide-react";
import "./_group.css";
import "./CockpitTelas.css";
import ActionButtons from "./_source/ActionButtons";
import type { AbaId } from "./_source/CockpitTabs";
import { PaxterClientSelector } from "./_source/PaxterClientSelector";
import { clientesDeExemplo } from "./_source/preview-deps";

type Modo = "abas" | "telas";

const ferramentas: {
  id: AbaId;
  titulo: string;
  Icon: typeof FileText;
  descricao: string;
}[] = [
  { id: "prescricao", titulo: "Prescrição", Icon: Pill, descricao: "Área de prescrição do cliente selecionado." },
  { id: "injetaveis", titulo: "Injetáveis", Icon: FlaskConical, descricao: "Área de protocolos injetáveis e aplicações." },
  { id: "implantes", titulo: "Implantes", Icon: Gem, descricao: "Área de acompanhamento de implantes." },
  { id: "exames", titulo: "Exames", Icon: ClipboardList, descricao: "Área de pedidos e exames do cliente." },
  { id: "evolucao", titulo: "Evolução", Icon: TrendingUp, descricao: "Área de registros de evolução clínica." },
  { id: "anamnese", titulo: "Anamnese Prévia", Icon: ClipboardCheck, descricao: "Área de anamnese associada ao cadastro." },
  { id: "documentos", titulo: "Documentos", Icon: FileText, descricao: "Área de documentos relacionados ao cliente." },
  { id: "protocolos", titulo: "Protocolos", Icon: Activity, descricao: "Área dos protocolos do cliente." },
  { id: "dieta-treino", titulo: "Dieta e Treino", Icon: Utensils, descricao: "Área de dieta e treino do cliente." },
  { id: "financeiro", titulo: "Financeiro", Icon: DollarSign, descricao: "Área financeira vinculada ao cadastro." },
  { id: "cadastro", titulo: "Cadastro", Icon: UserRound, descricao: "Dados cadastrais do cliente." },
  { id: "telegram", titulo: "Telegram", Icon: MessageCircle, descricao: "Área de comunicação do Cockpit." },
];

function idade(data: string | null | undefined) {
  if (!data) return "—";
  const nascimento = new Date(`${data}T12:00:00`);
  const hoje = new Date();
  let anos = hoje.getFullYear() - nascimento.getFullYear();
  if (
    hoje.getMonth() < nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate())
  ) anos -= 1;
  return `${anos} anos`;
}

function formatarCpf(cpf: string | null | undefined) {
  if (!cpf) return "—";
  const digits = cpf.replace(/\D/g, "");
  return digits.length === 11
    ? digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : cpf;
}

function formatarNascimento(data: string | null | undefined) {
  if (!data) return "—";
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function CockpitTelas() {
  const [clientId, setClientId] = useState<number | null>(1001);
  const [aba, setAba] = useState<AbaId>("prescricao");
  const [modo, setModo] = useState<Modo>("telas");
  const [aviso, setAviso] = useState("");
  const trilhoAbasRef = useRef<HTMLDivElement>(null);
  const [deslocamento, setDeslocamento] = useState({ esquerda: false, direita: false });

  const cliente = clientesDeExemplo.find((item) => item.id === clientId) ?? null;
  const opcoes = useMemo(
    () => clientesDeExemplo.map(({ id, name, cpf, phone, photoUrl }) => ({ id, name, cpf, phone, photoUrl })),
    [],
  );
  const ferramentaAtual = ferramentas.find((item) => item.id === aba) ?? ferramentas[0];
  const iniciais = (() => {
    if (!cliente) return "";
    const nomes = cliente.name.trim().split(/\s+/).filter(Boolean);
    return `${nomes[0]?.[0] ?? ""}${nomes.at(-1)?.[0] ?? ""}`.toUpperCase();
  })();

  const atualizarDeslocamento = useCallback(() => {
    const trilho = trilhoAbasRef.current;
    if (!trilho) return;
    setDeslocamento({
      esquerda: trilho.scrollLeft > 4,
      direita: trilho.scrollLeft + trilho.clientWidth < trilho.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    const trilho = trilhoAbasRef.current;
    if (!trilho) return;
    atualizarDeslocamento();
    trilho.addEventListener("scroll", atualizarDeslocamento, { passive: true });
    const observador = new ResizeObserver(atualizarDeslocamento);
    observador.observe(trilho);
    return () => {
      trilho.removeEventListener("scroll", atualizarDeslocamento);
      observador.disconnect();
    };
  }, [atualizarDeslocamento, modo]);

  useEffect(() => {
    const ativo = trilhoAbasRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    ativo?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [aba, modo]);

  const focarFerramenta = (id: AbaId) => {
    setAba(id);
    setModo("abas");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const moverTrilho = (direcao: -1 | 1) => {
    trilhoAbasRef.current?.scrollBy({ left: direcao * 220, behavior: "smooth" });
  };

  const selecionarComTeclado = (event: KeyboardEvent<HTMLButtonElement>, atualIndex: number) => {
    let novoIndex = atualIndex;
    if (event.key === "ArrowRight") novoIndex = (atualIndex + 1) % ferramentas.length;
    else if (event.key === "ArrowLeft") novoIndex = (atualIndex - 1 + ferramentas.length) % ferramentas.length;
    else if (event.key === "Home") novoIndex = 0;
    else if (event.key === "End") novoIndex = ferramentas.length - 1;
    else return;

    event.preventDefault();
    setAba(ferramentas[novoIndex].id);
    requestAnimationFrame(() => document.getElementById(`ct-tab-${ferramentas[novoIndex].id}`)?.focus());
  };

  return (
    <div className="cockpit-telas">
      <div className="ct-preview-banner">
        <span className="ct-preview-led" aria-hidden="true" />
        <strong>PRÉVIA INTERATIVA</strong>
        <span className="ct-preview-separator" aria-hidden="true" />
        <span>Dados fictícios · nenhuma conexão com o sistema</span>
      </div>

      <header className="ct-header">
        <div className="ct-brand-line">
          <div className="ct-brand-mark" aria-hidden="true">P</div>
          <div className="ct-brand-copy">
            <span className="ct-brand-name">PAXTER</span>
            <span className="ct-brand-product">COCKPIT DA CONSULTA</span>
          </div>
          <div className="ct-version-tag">COCKPIT 02</div>
        </div>

        <section className="ct-identity panel-3d-sub" aria-label="Identificação do cliente selecionado">
          <div className="ct-avatar-frame" aria-hidden="true">
            {cliente?.photoUrl
              ? <img src={cliente.photoUrl} alt="" className="ct-avatar-image" />
              : <span className="ct-avatar-initials">{cliente ? iniciais : <UserRound size={25} />}</span>}
          </div>

          <div className="ct-identity-name">
            <span className="ct-eyebrow">CLIENTE SELECIONADO</span>
            <h1>{cliente?.name ?? "Nenhum cliente selecionado"}</h1>
            <div className="ct-identity-id">
              <span className="ct-id-label">IDENTIFICADOR</span>
              <strong>{cliente?.id ?? "—"}</strong>
              <span className="ct-age">{cliente ? idade(cliente.birthDate) : "—"}</span>
            </div>
          </div>

          <div className="ct-client-details">
            <div className="ct-detail">
              <span className="ct-detail-label">CPF</span>
              <strong>{cliente ? formatarCpf(cliente.cpf) : "—"}</strong>
            </div>
            <div className="ct-detail">
              <span className="ct-detail-label">NASCIMENTO</span>
              <strong>{cliente ? formatarNascimento(cliente.birthDate) : "—"}</strong>
            </div>
            <div className="ct-detail">
              <span className="ct-detail-label">TELEFONE</span>
              <strong>{cliente?.phone ?? "—"}</strong>
            </div>
              <div className="ct-detail ct-detail--email">
              <span className="ct-detail-label">E-MAIL</span>
              <strong title={cliente?.email ?? "—"}>{cliente?.email ?? "—"}</strong>
            </div>
          </div>
        </section>

        <div className="ct-controls">
          <div className="ct-client-picker">
              <span className="ct-control-label">CLIENTE · SELEÇÃO ÚNICA</span>
            <PaxterClientSelector
              clientes={opcoes}
              value={clientId}
              onChange={(id) => { setClientId(id); setAviso(""); }}
              placeholder="Selecionar cliente…"
              className="ct-selector"
            />
          </div>
          <div className="ct-action-group">
            <span className="ct-control-label">ATALHOS DA FICHA</span>
            <ActionButtons
              clientId={clientId}
              driveSetupPending={false}
              onDriveSetup={() => setAviso("Drive: ação demonstrativa, sem acesso ou alteração de arquivos.")}
              onNewProtocol={() => setAviso("Protocolo: ação demonstrativa, nenhum dado foi criado.")}
            />
          </div>
        </div>

        {aviso && <div className="ct-notice" role="status">{aviso}</div>}
      </header>

      <main className="ct-main">
        <div className="ct-workspace-bar">
          <div className="ct-workspace-copy">
            <span className="ct-eyebrow ct-workspace-eyebrow">ESPAÇO DE TRABALHO</span>
            <h2>Um cliente. Doze ferramentas.</h2>
            <p>Alternar o modo não troca nem perde o cliente selecionado.</p>
          </div>

          <div className="ct-mode-control concave-3d" role="group" aria-label="Modo de visualização do Cockpit">
            <button
              type="button"
              className={`ct-mode-button${modo === "abas" ? " is-active" : ""}`}
              aria-pressed={modo === "abas"}
              onClick={() => setModo("abas")}
            >
              <CalendarDays size={15} aria-hidden="true" />
              ABAS
            </button>
            <button
              type="button"
              className={`ct-mode-button${modo === "telas" ? " is-active" : ""}`}
              aria-pressed={modo === "telas"}
              onClick={() => setModo("telas")}
            >
              <span className="ct-mode-grid" aria-hidden="true"><i /><i /><i /><i /></span>
              TELAS · TODAS ABERTAS
            </button>
          </div>
        </div>

        {modo === "abas" ? (
          <div className="ct-tab-mode">
            <div className="ct-tabs-shell">
              <button
                type="button"
                className="ct-tabs-arrow"
                aria-label="Rolar ferramentas para a esquerda"
                disabled={!deslocamento.esquerda}
                onClick={() => moverTrilho(-1)}
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <div className="ct-tabs-rail" role="tablist" aria-label="Ferramentas do Cockpit" ref={trilhoAbasRef}>
                {ferramentas.map((ferramenta, index) => (
                  <button
                    type="button"
                    role="tab"
                    id={`ct-tab-${ferramenta.id}`}
                    aria-selected={aba === ferramenta.id}
                    aria-controls="ct-tabpanel"
                    tabIndex={aba === ferramenta.id ? 0 : -1}
                    key={ferramenta.id}
                    onClick={() => setAba(ferramenta.id)}
                    onKeyDown={(event) => selecionarComTeclado(event, index)}
                  >
                    <ferramenta.Icon size={13} aria-hidden="true" />
                    {ferramenta.titulo}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="ct-tabs-arrow"
                aria-label="Rolar ferramentas para a direita"
                disabled={!deslocamento.direita}
                onClick={() => moverTrilho(1)}
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="ct-tab-helper" aria-live="polite">
              <span>FERRAMENTA {ferramentas.findIndex((item) => item.id === aba) + 1} DE {ferramentas.length}</span>
              <span>Use as setas laterais para percorrer todas as ferramentas.</span>
            </div>
            <section className="ct-focused-tool panel-3d-sub" aria-live="polite" role="tabpanel" id="ct-tabpanel" aria-labelledby={`ct-tab-${aba}`}>
              <div className="ct-focused-heading">
                <span className="ct-tool-index">{String(ferramentas.findIndex((item) => item.id === aba) + 1).padStart(2, "0")} / {String(ferramentas.length).padStart(2, "0")}</span>
                <div className="ct-tool-icon"><ferramentaAtual.Icon size={19} strokeWidth={1.8} /></div>
                <div className="ct-focused-title">
                  <span className="ct-eyebrow">FERRAMENTA ATIVA</span>
                  <h3>{ferramentaAtual.titulo}</h3>
                </div>
              </div>
              <div className="ct-tool-preview">
                <p>{cliente ? ferramentaAtual.descricao : "Selecione um cliente para visualizar esta ferramenta."}</p>
                <span>Conteúdo do sistema indisponível nesta prévia de design.</span>
              </div>
              <div className="ct-panel-foot">
                <span className="ct-panel-state"><span className="ct-preview-led" aria-hidden="true" />MODO POR ABAS</span>
                <span>O cliente permanece selecionado ao alternar entre ferramentas.</span>
              </div>
            </section>
          </div>
        ) : (
          <div className="ct-open-mode">
            <div className="ct-open-mode-heading">
              <div>
                <span className="ct-eyebrow">MODO TELAS</span>
                <h3>Ferramentas abertas</h3>
              </div>
              <span className="ct-open-count screen-3d">12 ÁREAS</span>
            </div>
            <div className="ct-tool-grid">
              {ferramentas.map((ferramenta, index) => (
                <section className="ct-tool-card panel-3d-sub" key={ferramenta.id} aria-labelledby={`ct-title-${ferramenta.id}`}>
                  <div className="ct-tool-card-head">
                    <span className="ct-tool-number">{String(index + 1).padStart(2, "0")}</span>
                    <span className="ct-tool-icon"><ferramenta.Icon size={18} strokeWidth={1.75} aria-hidden="true" /></span>
                    <h4 id={`ct-title-${ferramenta.id}`}>{ferramenta.titulo}</h4>
                    <span className="ct-area-indicator" aria-label="Área aberta"><i /></span>
                  </div>
                  <div className="ct-tool-card-body">
                    <p>{cliente ? ferramenta.descricao : "Selecione um cliente para retomar o contexto."}</p>
                    <span>Conteúdo demonstrativo · sem operação clínica</span>
                  </div>
                  <div className="ct-tool-card-foot">
                    <span className="ct-panel-state"><span className="ct-preview-led" aria-hidden="true" />ABERTA</span>
                    <button type="button" onClick={() => focarFerramenta(ferramenta.id)}>
                      ABRIR EM ABAS
                      <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
