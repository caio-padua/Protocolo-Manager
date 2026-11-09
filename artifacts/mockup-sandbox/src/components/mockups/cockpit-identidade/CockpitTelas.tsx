import { useMemo, useState } from "react";
import { CalendarDays, UserRound } from "lucide-react";
import "./_group.css";
import "./CockpitTelas.css";
import { ABAS, type AbaId } from "./_source/CockpitTabs";
import { PaxterClientSelector } from "./_source/PaxterClientSelector";
import { clientesDeExemplo } from "./_source/preview-deps";
import { CockpitProposalRail } from "./CockpitProposalRail";
import { IdentityActions } from "./IdentityActions";

type Modo = "abas" | "telas";

const descricoes: Record<AbaId, string> = {
  prescricao: "Área de prescrição do cliente selecionado.",
  injetaveis: "Área de protocolos injetáveis e aplicações.",
  implantes: "Área de acompanhamento de implantes.",
  exames: "Área de pedidos e exames do cliente.",
  evolucao: "Área de registros de evolução clínica.",
  anamnese: "Área de anamnese associada ao cadastro.",
  documentos: "Área de documentos relacionados ao cliente.",
  protocolos: "Área dos protocolos do cliente.",
  "dieta-treino": "Área de dieta e treino do cliente.",
  financeiro: "Área financeira vinculada ao cadastro.",
  cadastro: "Dados cadastrais do cliente.",
  telegram: "Área de comunicação do Cockpit.",
};

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

  const cliente = clientesDeExemplo.find((item) => item.id === clientId) ?? null;
  const opcoes = useMemo(
    () => clientesDeExemplo.map(({ id, name, cpf, phone, photoUrl }) => ({ id, name, cpf, phone, photoUrl })),
    [],
  );
  const ferramentaAtual = ABAS.find((item) => item.id === aba) ?? ABAS[0];
  const indiceAtivo = ABAS.findIndex((item) => item.id === aba);
  const iniciais = (() => {
    if (!cliente) return "";
    const nomes = cliente.name.trim().split(/\s+/).filter(Boolean);
    return `${nomes[0]?.[0] ?? ""}${nomes.at(-1)?.[0] ?? ""}`.toUpperCase();
  })();

  const focarFerramenta = (id: AbaId) => {
    setAba(id);
    setModo("abas");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selecionarFerramenta = (id: AbaId) => {
    setAba(id);
    if (modo === "telas") {
      window.requestAnimationFrame(() => document.getElementById(`ct-tool-card-${id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }));
    }
  };

  const handlePreviewAction = (action: "edit" | "drive") => {
    setAviso(action === "edit"
      ? "Prévia: a edição do cadastro não foi aberta nem alterada. Nenhuma ação foi executada."
      : "Prévia: nenhuma pasta ou planilha foi criada, compartilhada ou acessada no Drive.");
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
          <div className="ct-brand-copy">
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
            <span className="ct-control-label">AÇÕES DA CONSULTA</span>
            <IdentityActions
              clientId={clientId}
              onAction={handlePreviewAction}
            />
          </div>
        </div>

        {aviso && <div className="ct-notice" role="status">{aviso}</div>}
      </header>

      <CockpitProposalRail
        active={aba}
        mode={modo === "abas" ? "tabs" : "anchors"}
        onChange={selecionarFerramenta}
      />

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
            <div className="ct-tab-helper" aria-live="polite">
              <span>FERRAMENTA {indiceAtivo + 1} DE {ABAS.length}</span>
              <span>Use as setas laterais ou o teclado para percorrer as ferramentas.</span>
            </div>
            <section className="ct-focused-tool panel-3d-sub" aria-live="polite" role="tabpanel" id="cockpit-proposal-tool-content">
              <div className="ct-focused-heading">
                <span className="ct-tool-index">{String(indiceAtivo + 1).padStart(2, "0")} / {String(ABAS.length).padStart(2, "0")}</span>
                <div className="ct-tool-icon"><ferramentaAtual.Icon size={19} strokeWidth={1.8} /></div>
                <div className="ct-focused-title">
                  <span className="ct-eyebrow">FERRAMENTA ATIVA</span>
                  <h3>{ferramentaAtual.rotulo}</h3>
                </div>
              </div>
              <div className="ct-tool-preview">
                <p>{cliente ? descricoes[aba] : "Selecione um cliente para visualizar esta ferramenta."}</p>
                <span>Conteúdo do sistema indisponível nesta prévia de design.</span>
                {aba === "protocolos" && (
                  <div className="ct-protocol-action">
                    <button type="button" disabled aria-disabled="true">NOVO PROTOCOLO</button>
                    <small>Indisponível nesta prévia · nenhum dado será criado.</small>
                  </div>
                )}
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
              {ABAS.map((ferramenta, index) => (
                <section className="ct-tool-card panel-3d-sub" key={ferramenta.id} id={`ct-tool-card-${ferramenta.id}`} aria-labelledby={`ct-title-${ferramenta.id}`}>
                  <div className="ct-tool-card-head">
                    <span className="ct-tool-number">{String(index + 1).padStart(2, "0")}</span>
                    <span className="ct-tool-icon"><ferramenta.Icon size={18} strokeWidth={1.75} aria-hidden="true" /></span>
                    <h4 id={`ct-title-${ferramenta.id}`}>{ferramenta.rotulo}</h4>
                    <span className="ct-area-indicator" aria-label="Área aberta"><i /></span>
                  </div>
                  <div className="ct-tool-card-body">
                    <p>{cliente ? descricoes[ferramenta.id] : "Selecione um cliente para retomar o contexto."}</p>
                    <span>Conteúdo demonstrativo · sem operação clínica</span>
                  </div>
                  <div className="ct-tool-card-foot">
                    <span className="ct-panel-state"><span className="ct-preview-led" aria-hidden="true" />ABERTA</span>
                    {ferramenta.id === "protocolos" && (
                      <button type="button" className="ct-protocol-grid-action" disabled aria-disabled="true">NOVO PROTOCOLO · INDISPONÍVEL</button>
                    )}
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
