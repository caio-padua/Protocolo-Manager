import { useState } from "react";
import { ChevronLeft, ChevronRight, ShieldCheck, Stethoscope } from "lucide-react";
import CockpitHeader from "./_source/CockpitHeader";
import CockpitTabs, { type AbaId } from "./_source/CockpitTabs";
import { client } from "./_source/preview-deps";
import "./_group.css";
import "./_source/cockpit-identidade.css";
import "./_base.css";

/**
 * Uses the current application's extracted identity, header and navigation.
 * All data, controls and certificate status are demonstrative; no service runs.
 */
export function CockpitSuperficie({ variant }: { variant: "a" | "b" | "c" | "d" }) {
  const [closed, setClosed] = useState(false);
  const [tab, setTab] = useState<AbaId>("prescricao");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  return (
    <div className={`cs-preview cs-${variant}`}>
      <aside className={`cs-sidebar${closed ? " cs-sidebar--closed" : ""}`} aria-label="Menu demonstrativo">
        <div className="cs-brand"><span>P</span>{!closed && <strong>PAXTER</strong>}</div>
        <button className="cs-collapse" type="button" onClick={() => setClosed(!closed)}
          aria-label={closed ? "Expandir menu" : "Recolher menu"}>{closed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}</button>
        <div className="cs-sidebar-items">
          <div>{closed ? "⌂" : "Painel de controle"}</div>
          <small>{closed ? "•" : "AGENDA E RECEPÇÃO"}</small>
          <div>{closed ? "▦" : "Marcação de Consulta"}</div>
          <div>{closed ? "▤" : "Agenda Diária"}</div>
          <div>{closed ? "○" : "Clientes"}</div>
          <small>{closed ? "•" : "O ATO MÉDICO"}</small>
          <div className="cs-menu-current">{closed ? "✚" : "Cockpit da Consulta"}</div>
          <div>{closed ? "≡" : "Cockpit da Anamnese"}</div>
          <div>{closed ? "▣" : "Cartório"}</div>
        </div>
        <div className="cs-professional">
          <div className="cs-professional-photo"><Stethoscope size={18} /></div>
          {!closed && <div><strong>PROFISSIONAL EXEMPLO</strong><small><ShieldCheck size={12} /> Certificado: exemplo visual</small></div>}
        </div>
      </aside>
      <div className="cs-page">
        <div className="cs-notice">PRÉVIA VISUAL · DADOS FICTÍCIOS · NENHUMA AÇÃO CLÍNICA</div>
        <div className={`cc-shell${theme === "dark" ? " dark" : ""}`}>
          <div className="cs-surface">
            <CockpitHeader theme={theme} onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
              client={client} clientId={client.id} sessionScope="preview" onSelectClient={() => {}}
              driveSetupPending={false} onDriveSetup={() => {}} onEvolucao={() => setTab("evolucao")}
              onMensagens={() => setTab("telegram")} onBeforeEdit={() => false} />
            <div className="cc-rail-wrap"><CockpitTabs aba={tab} onAba={setTab} modo="abas" /></div>
          </div>
          <main className="cc-main cs-main">
            <div className="cs-panel"><h2>✦ &nbsp;PULSO DIÁRIO</h2><div className="cs-well">Sem registros demonstrativos.</div></div>
            <div className="cc-workspace-bar"><div><span>FERRAMENTA DA CONSULTA</span><h2>{tab === "prescricao" ? "Prescrição" : "Ferramenta selecionada"}</h2></div>
              <div className="cc-modes"><button data-active="true">ABAS</button><button>PAINÉIS</button><button>FICHA CONTÍNUA</button></div>
            </div>
            <div className="cs-panel"><h2>ÁREA DE TRABALHO</h2><div className="cs-well">Conteúdo clínico ilustrativo nesta prévia visual.</div></div>
          </main>
        </div>
      </div>
    </div>
  );
}
