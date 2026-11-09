import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Fingerprint, Mail, Phone, UserRound } from "lucide-react";
import "./_group.css";
import "./_identidade.css";
import CockpitTabs, { type AbaId } from "./_source/CockpitTabs";
import ActionButtons from "./_source/ActionButtons";
import { PaxterClientSelector } from "./_source/PaxterClientSelector";
import { clientesDeExemplo } from "./_source/preview-deps";

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

function dataPt(data: string | null | undefined) {
  if (!data) return "—";
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function cpfPt(cpf: string | null | undefined) {
  if (!cpf) return "—";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function Campo({
  label,
  valor,
  Icon,
  destaque = false,
}: {
  label: string;
  valor: string | null | undefined;
  Icon: typeof Phone;
  destaque?: boolean;
}) {
  return (
    <div className={`identity-field${destaque ? " identity-field-primary" : ""}`}>
      <span className="identity-field-icon" aria-hidden="true"><Icon size={14} strokeWidth={1.8} /></span>
      <span className="identity-field-copy">
        <span className="identity-field-label">{label}</span>
        <span className="identity-field-value" title={valor || "—"}>{valor || "—"}</span>
      </span>
    </div>
  );
}

export function IdentidadeUnificada() {
  const [clientId, setClientId] = useState<number | null>(1001);
  const [aba, setAba] = useState<AbaId>("protocolos");
  const [aviso, setAviso] = useState("");
  const client = clientesDeExemplo.find((item) => item.id === clientId) ?? null;
  const opcoes = useMemo(
    () => clientesDeExemplo.map(({ id, name, cpf, phone, photoUrl }) => ({ id, name, cpf, phone, photoUrl })),
    [],
  );

  useEffect(() => {
    const onPreviewAction = (event: Event) => setAviso((event as CustomEvent<string>).detail);
    window.addEventListener("cockpit-preview-action", onPreviewAction);
    return () => window.removeEventListener("cockpit-preview-action", onPreviewAction);
  }, []);

  const initials = client?.name.trim().split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() ?? "";

  return (
    <div className="identity-page">
      <div className="identity-preview-banner">
        <span className="identity-preview-mark" aria-hidden="true" />
        <span>PRÉVIA COM DADOS FICTÍCIOS</span>
        <span className="identity-preview-divider" />
        <span className="identity-preview-note">Não consulta nem modifica o sistema</span>
      </div>

      <header className="identity-header">
        <div className="identity-header-inner">
          <div className="identity-overline">
            <span className="identity-overline-rule" />
            COCKPIT DA CONSULTA
            <span className="identity-overline-context">IDENTIFICAÇÃO DO CLIENTE</span>
          </div>

          <section className="identity-card" aria-label="Identificação do cliente">
            <div className="identity-main">
              <div className="identity-avatar-frame" aria-label={client ? `Foto de ${client.name}` : "Sem cliente selecionado"}>
                {client?.photoUrl
                  ? <img src={client.photoUrl} alt="" className="identity-avatar" />
                  : <span className="identity-avatar-fallback">{client ? initials : <UserRound size={30} strokeWidth={1.35} />}</span>}
                <span className="identity-avatar-seal" aria-hidden="true"><Fingerprint size={14} /></span>
              </div>

              <div className="identity-name-block">
                <div className="identity-label">CLIENTE SELECIONADO</div>
                <h1 className="identity-name" title={client?.name ?? "Nenhum cliente selecionado"}>
                  {client?.name ?? "Nenhum cliente selecionado"}
                </h1>
                <div className="identity-subline">
                  <span className="identity-id-chip"><span>IDENTIFICADOR</span><strong>{client ? client.id : "—"}</strong></span>
                  <span className="identity-age">{client ? idade(client.birthDate) : "—"}</span>
                </div>
              </div>
            </div>

            <div className="identity-details">
              <Campo label="CPF" valor={client ? cpfPt(client.cpf) : null} Icon={Fingerprint} destaque />
              <Campo label="Data de nascimento" valor={client ? dataPt(client.birthDate) : null} Icon={CalendarDays} />
              <Campo label="Telefone" valor={client?.phone} Icon={Phone} destaque />
              <Campo label="E-mail" valor={client?.email} Icon={Mail} />
            </div>
          </section>

          <div className="identity-controls">
            <div className="identity-selector-wrap">
              <span className="identity-control-label">TROCAR CLIENTE</span>
              <PaxterClientSelector
                clientes={opcoes}
                value={clientId}
                onChange={(id) => { setClientId(id); setAviso(""); }}
                placeholder="Selecionar cliente…"
                className="identity-selector"
              />
            </div>
            <div className="identity-action-wrap">
              <span className="identity-control-label">AÇÕES DA CONSULTA</span>
              <ActionButtons
                clientId={clientId}
                driveSetupPending={false}
                onDriveSetup={() => setAviso("Drive: ação demonstrativa — nenhuma operação foi executada.")}
                onNewProtocol={() => setAviso("Protocolo: ação demonstrativa — nenhuma operação foi executada.")}
              />
            </div>
          </div>
          {aviso && <div className="identity-notice" role="status">{aviso}</div>}
        </div>
      </header>

      <CockpitTabs aba={aba} onAba={setAba} />
      <main className="identity-content">
        <div className="identity-tool-panel panel-3d-sub">
          <div className="identity-tool-heading">
            <span className="identity-tool-kicker">ÁREA DE TRABALHO</span>
            <span className="identity-tool-current">{aba.replace("-", " ").toUpperCase()}</span>
          </div>
          <p className="identity-tool-title">{client ? "Contexto preservado entre ferramentas" : "Selecione um cliente para continuar"}</p>
          <p className="identity-tool-description">
            {client
              ? "A ferramenta selecionada permanece no contexto do mesmo cliente. Esta área é apenas representativa e não executa ações clínicas."
              : "Os dados de identificação foram removidos. Selecione um cliente na faixa acima para retomar o contexto."}
          </p>
          <div className="identity-tool-foot">
            <span>PRÉVIA INTERATIVA</span>
            <span>Conteúdo funcional não alterado</span>
          </div>
        </div>
      </main>
    </div>
  );
}
