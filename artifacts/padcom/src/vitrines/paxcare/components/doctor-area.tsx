import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  FileCheck2,
  FileText,
  Pill,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Syringe,
} from "lucide-react";
import { Button } from "@paxcare/components/ui/button";
import { BrandArtwork } from "@paxcare/components/pax-care";

type PermissionKey = "exames" | "laudos" | "rotina" | "protocolos";

const PERMISSION_ITEMS: Array<{ key: PermissionKey; label: string; detail: string }> = [
  { key: "exames", label: "Exames de múltiplos laboratórios", detail: "Resultados reunidos por data, sem precisar de vários logins" },
  { key: "laudos", label: "Laudos de imagem e ressonância", detail: "Comparativo cronológico pronto para a consulta" },
  { key: "rotina", label: "Medicamentos e suplementos", detail: "Adesão diária informada pelo paciente" },
  { key: "protocolos", label: "Protocolos injetáveis", detail: "Histórico da clínica e de outros serviços" },
];

const LAB_EXAMS = [
  { exam: "Vitamina D (25-OH)", value: "42,5 ng/mL", date: "Ago · 2026", lab: "Laboratório Fleury (exemplo)" },
  { exam: "Hemoglobina glicada", value: "5,2 %", date: "Jul · 2026", lab: "Laboratório Sabin (exemplo)" },
  { exam: "TSH ultrassensível", value: "2,1 mUI/L", date: "Mai · 2026", lab: "Diagnósticos Dasa (exemplo)" },
  { exam: "Ferritina sérica", value: "71 ng/mL", date: "Fev · 2026", lab: "Laboratório Einstein (exemplo)" },
];

export function validateDoctorAdhesion(input: { name: string; crm: string; cpf: string }) {
  const name = input.name.trim();
  const crm = input.crm.trim();
  const cpfDigits = input.cpf.replace(/\D/g, "");
  if (name.length < 5 || !name.includes(" ")) {
    return { ok: false as const, error: "Informe seu nome completo para confirmar a adesão." };
  }
  if (!/^\d{4,7}(\s*[-/]?\s*[A-Za-z]{2})?$/.test(crm)) {
    return { ok: false as const, error: "Informe um número de CRM válido (ex.: 141444-SP)." };
  }
  if (cpfDigits.length !== 11 || /^(\d)\1{10}$/.test(cpfDigits)) {
    return { ok: false as const, error: "Informe um CPF com 11 dígitos válidos." };
  }
  return { ok: true as const, doctor: { name, crm: crm.toUpperCase(), cpfMasked: `***.***.***-${cpfDigits.slice(-2)}` } };
}

export function DoctorAdhesionPreview() {
  const [name, setName] = useState("");
  const [crm, setCrm] = useState("");
  const [cpf, setCpf] = useState("");
  const [error, setError] = useState("");
  const [admitted, setAdmitted] = useState<{ name: string; crm: string; cpfMasked: string } | null>(null);
  const [toggles, setToggles] = useState<Record<PermissionKey, boolean>>({
    exames: true,
    laudos: true,
    rotina: true,
    protocolos: false,
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateDoctorAdhesion({ name, crm, cpf });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError("");
    setAdmitted(result.doctor);
  }

  function fillExample() {
    setName("Dr. Henrique Almeida");
    setCrm("141444-SP");
    setCpf("321.654.987-09");
    setError("");
  }

  function togglePermission(key: PermissionKey) {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const activeCount = Object.values(toggles).filter(Boolean).length;

  return (
    <div className="doctor-workspace">
      <div className="doctor-adhesion-panel">
        <div className="doctor-panel-head">
          <BrandArtwork compact />
          <span>CONVITE DO PACIENTE</span>
        </div>

        {admitted ? (
          <div className="doctor-admitted-box" aria-live="polite">
            <div className="doctor-admitted-badge"><CheckCircle2 size={18} /> Adesão confirmada na prévia</div>
            <h3>Bem-vindo(a), {admitted.name}</h3>
            <p>CRM {admitted.crm} · CPF {admitted.cpfMasked}. Você aceitou o convite da paciente e agora visualiza exatamente o que ela liberou para o seu atendimento.</p>
            <Button type="button" variant="outline" onClick={() => setAdmitted(null)}>
              Testar com outro CRM
            </Button>
          </div>
        ) : (
          <form className="doctor-form" onSubmit={handleSubmit} noValidate>
            <div>
              <span className="preview-kicker">ADESÃO SIMPLES · MENOS DE 30 SEGUNDOS</span>
              <h3>Aceite o convite do seu paciente.</h3>
              <p>Confirme apenas Nome, CRM e CPF para abrir os exames e laudos reunidos de diferentes laboratórios em uma única tela.</p>
            </div>
            <div className="doctor-field">
              <label htmlFor="doctor-name">Nome completo</label>
              <input id="doctor-name" type="text" placeholder="Ex.: Dra. Carolina Mendes" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
            </div>
            <div className="doctor-field-row">
              <div className="doctor-field">
                <label htmlFor="doctor-crm">CRM</label>
                <input id="doctor-crm" type="text" placeholder="Ex.: 141444-SP" value={crm} onChange={(e) => setCrm(e.target.value)} autoComplete="off" />
              </div>
              <div className="doctor-field">
                <label htmlFor="doctor-cpf">CPF</label>
                <input id="doctor-cpf" type="text" placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(e.target.value)} autoComplete="off" />
              </div>
            </div>
            {error && <p className="explainer-error" role="alert">{error}</p>}
            <div className="doctor-form-actions">
              <Button type="submit" variant="champagne">Aceitar convite e ver exames <ArrowRight size={15} /></Button>
              <Button type="button" variant="quiet" onClick={fillExample}>Preencher exemplo</Button>
            </div>
          </form>
        )}

        <div className="doctor-toggle-panel">
          <div className="doctor-toggle-head">
            <span className="preview-kicker">CONTROLE DO PACIENTE · TOGGLES DE LIBERAÇÃO</span>
            <strong>{activeCount} de {PERMISSION_ITEMS.length} categorias liberadas</strong>
          </div>
          <div className="doctor-toggles">
            {PERMISSION_ITEMS.map((item) => {
              const on = toggles[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  role="switch"
                  aria-checked={on}
                  className={`doctor-toggle-row ${on ? "is-on" : ""}`}
                  onClick={() => togglePermission(item.key)}
                >
                  <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                  <span className="doctor-switch-track" aria-hidden="true"><i /></span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="product-window doctor-viewer-window" aria-live="polite">
        <div className="window-chrome">
          <span className="window-dots"><i /><i /><i /></span>
          <span>VISÃO DO MÉDICO · MÚLTIPLOS LABORATÓRIOS</span>
          <span>{admitted ? admitted.crm : "PRÉVIA"}</span>
        </div>
        <div className="window-content doctor-viewer-body">
          <div className="doctor-patient-bar">
            <div>
              <span className="preview-kicker">HISTÓRIA COMPARTILHADA COM VOCÊ</span>
              <h3>Exames de 4 laboratórios reunidos na sua tela.</h3>
            </div>
            <span className="doctor-verified-pill"><ShieldCheck size={14} /> Sem múltiplos logins</span>
          </div>

          {toggles.exames ? (
            <div className="doctor-lab-list">
              <div className="doctor-block-label"><Building2 size={15} /> Exames laboratoriais unificados</div>
              {LAB_EXAMS.map((row) => (
                <div key={row.exam} className="doctor-lab-row">
                  <div><strong>{row.exam}</strong><small>{row.lab}</small></div>
                  <div className="doctor-lab-meta"><strong>{row.value}</strong><small>{row.date}</small></div>
                </div>
              ))}
            </div>
          ) : (
            <p className="doctor-locked-note"><FileText size={15} /> Exames laboratoriais ocultos pelo paciente neste momento.</p>
          )}

          <div className="doctor-extra-grid">
            <div className={`doctor-extra-card ${toggles.laudos ? "" : "is-hidden"}`}>
              <span><ScanLine size={15} /> Laudos de imagem</span>
              <p>{toggles.laudos ? "Ressonância lombar · comparativo Fev e Ago pronto para leitura." : "Categoria não liberada pelo paciente."}</p>
            </div>
            <div className={`doctor-extra-card ${toggles.rotina ? "" : "is-hidden"}`}>
              <span><Pill size={15} /> Rotina em uso</span>
              <p>{toggles.rotina ? "Medicamento prescrito · Creatina 5 g · Whey protein 1 dose." : "Categoria não liberada pelo paciente."}</p>
            </div>
            <div className={`doctor-extra-card ${toggles.protocolos ? "" : "is-hidden"}`}>
              <span><Syringe size={15} /> Protocolos injetáveis</span>
              <p>{toggles.protocolos ? "Ciclo em andamento com histórico da clínica e registros externos." : "Categoria não liberada pelo paciente."}</p>
            </div>
          </div>

          <div className="preview-bottom-row">
            <span><FileCheck2 size={15} /> Tudo na palma da mão ou no computador</span>
            <span><Sparkles size={14} /> Pronto para fechar o diagnóstico</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export const FOUNDER_CHAIRS = [
  { seat: "Nº 001", tier: "Cadeira Fundadora", specialty: "Medicina Integrativa & Longevidade", status: "Reservada por convite" },
  { seat: "Nº 002", tier: "Cadeira Fundadora", specialty: "Endocrinologia & Metabolismo", status: "Reservada por convite" },
  { seat: "Nº 003", tier: "Cadeira Fundadora", specialty: "Cardiologia Preventiva", status: "Reservada por convite" },
  { seat: "Nº 004", tier: "Cadeira Fundadora", specialty: "Ortopedia & Coluna", status: "Reservada por convite" },
];

export const CIRCLE_TIERS = [
  { level: "01", name: "Médico Fundador", seats: "12 cadeiras numeradas", invites: "5 convites exclusivos", benefit: "Condição fundadora preferencial, acesso primeiro a cada nova ferramenta e voz na evolução do ecossistema PAXCARE ↔ PAXMED." },
  { level: "02", name: "Médico Patrono", seats: "Convidado por um Fundador", invites: "3 convites exclusivos", benefit: "Desconto preferencial no PAXMED, acesso antecipado às ferramentas e selo numerado do Círculo." },
  { level: "03", name: "Médico Membro", seats: "Convidado por um Patrono", invites: "1 convite exclusivo", benefit: "Condição especial de adesão no primeiro ano, acesso antecipado e integração direta com pacientes PAXCARE." },
  { level: "04", name: "Convidado pelo Paciente", seats: "Acesso via link do paciente", invites: "Entrada imediata nos exames", benefit: "Visualiza na hora os exames liberados pelo paciente e pode solicitar ingresso no Círculo PAXMED." },
];

export function CircleTiersGrid() {
  return (
    <div className="circle-tiers-grid">
      {CIRCLE_TIERS.map((tier) => (
        <article key={tier.level} className="circle-tier-card">
          <div className="circle-tier-head"><span>NÍVEL {tier.level}</span><Stethoscope size={16} /></div>
          <h3>{tier.name}</h3>
          <small className="circle-tier-seats">{tier.seats}</small>
          <p>{tier.benefit}</p>
          <div className="circle-tier-invite"><Check size={14} /> {tier.invites}</div>
        </article>
      ))}
    </div>
  );
}