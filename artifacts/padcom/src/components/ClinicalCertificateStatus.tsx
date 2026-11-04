import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { getCollabToken } from "@/lib/collab-auth";

type CertificateState =
  | "valid"
  | "expired"
  | "not_yet_valid"
  | "missing"
  | "invalid"
  | "owner_mismatch"
  | "unavailable";

type CertificateResult = {
  state: CertificateState;
  validFrom: string | null;
  validTo: string | null;
  professionalType?: string | null;
};

type Props = {
  scope?: "professional" | "system";
  professionalType?: string | null;
  responsibleDoctorName?: string | null;
  allowUnsignedPrescription?: boolean;
  canGenerateUnsigned?: boolean;
  pending?: boolean;
  onGenerateUnsigned?: () => void;
};

const STATUS_COPY: Record<CertificateState, { title: string; detail: string; tone: string }> = {
  valid: { title: "Certificado válido", detail: "Assinatura digital disponível.", tone: "text-emerald-800 dark:text-emerald-300" },
  expired: { title: "Certificado vencido", detail: "A assinatura digital está bloqueada.", tone: "text-amber-800 dark:text-amber-300" },
  not_yet_valid: { title: "Certificado ainda não vigente", detail: "A assinatura digital está bloqueada.", tone: "text-amber-800 dark:text-amber-300" },
  missing: { title: "Certificado não cadastrado", detail: "Cadastre o certificado do médico responsável.", tone: "text-amber-800 dark:text-amber-300" },
  invalid: { title: "Certificado não validado", detail: "Confira o arquivo e a senha cadastrados.", tone: "text-destructive" },
  owner_mismatch: { title: "Titular do certificado divergente", detail: "O certificado não corresponde ao médico autenticado.", tone: "text-destructive" },
  unavailable: { title: "Validação indisponível", detail: "Não foi possível confirmar o estado do certificado.", tone: "text-destructive" },
};

function formatDate(value: string | null): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export function ClinicalCertificateStatus({
  scope = "professional",
  professionalType,
  responsibleDoctorName,
  allowUnsignedPrescription = false,
  canGenerateUnsigned = false,
  pending = false,
  onGenerateUnsigned,
}: Props) {
  const [certificate, setCertificate] = useState<CertificateResult | null>(null);
  const [checking, setChecking] = useState(true);
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setChecking(true);
      setCertificate(null);
      if (scope === "professional" && professionalType && professionalType !== "medico") {
        setChecking(false);
        return;
      }
      const token = getCollabToken();
      if (!token) {
        if (active) setChecking(false);
        return;
      }
      const endpoint = scope === "system"
        ? `${import.meta.env.BASE_URL}api/protocols/carta-pdf-certcheck`
        : `${import.meta.env.BASE_URL}api/settings/certificate`;
      try {
        const response = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await response.json() as {
          state?: CertificateState;
          validFrom?: string | null;
          validTo?: string | null;
          professionalType?: string | null;
          cert?: { validFrom?: string; validTo?: string };
        };
        if (!active) return;
        const state = data.state ?? (response.ok && data.cert?.validTo ? "valid" : "unavailable");
        setCertificate({
          state,
          validFrom: data.validFrom ?? data.cert?.validFrom ?? null,
          validTo: data.validTo ?? data.cert?.validTo ?? null,
          professionalType: data.professionalType ?? null,
        });
      } catch {
        if (active) setCertificate({ state: "unavailable", validFrom: null, validTo: null });
      } finally {
        if (active) setChecking(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [scope, professionalType]);

  const effectiveProfessionalType = professionalType ?? certificate?.professionalType;
  const waitingForDoctor = scope === "professional" &&
    effectiveProfessionalType !== null && effectiveProfessionalType !== undefined &&
    effectiveProfessionalType !== "medico";
  const state = waitingForDoctor ? null : certificate?.state ?? null;
  const copy = state ? STATUS_COPY[state] : null;
  const expiry = formatDate(certificate?.validTo ?? null);
  const start = formatDate(certificate?.validFrom ?? null);
  const showUnsignedAction = allowUnsignedPrescription && state === "expired" && !!onGenerateUnsigned;

  return (
    <section className="panel-3d-sub mt-3 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
      aria-label={scope === "system" ? "Validade do certificado global" : "Validade do certificado do médico"}>
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden="true"
          className={[
            "paxter-led",
            state === "valid" ? "paxter-led-green paxter-led-breathe" : "paxter-led-amber",
            "mt-1 shrink-0",
          ].join(" ")}
        />
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {scope === "system" ? "Certificado digital do sistema" : "Certificado digital do médico"}
          </p>
          {waitingForDoctor ? (
            <>
              <p className="text-sm font-semibold">Aguardando o médico que fará a emissão</p>
              <p className="text-xs text-muted-foreground">
                {responsibleDoctorName
                  ? `A validade será conferida na sessão de ${responsibleDoctorName}.`
                  : "A validade será conferida na sessão do médico responsável."}
              </p>
            </>
          ) : checking ? (
            <p className="text-sm font-semibold" role="status">Verificando certificado com o servidor…</p>
          ) : copy ? (
            <>
              <p className={`flex items-center gap-1.5 text-sm font-semibold ${copy.tone}`}>
                {state === "valid" ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                {copy.title}
                {expiry && <span className="font-normal">
                  · {state === "expired" ? "venceu em" : state === "not_yet_valid" ? "inicia em" : "válido até"} {expiry}
                </span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {state === "not_yet_valid" && start ? `Inicia em ${start}. ` : ""}
                {copy.detail}
              </p>
            </>
          ) : (
            <p className="text-sm font-semibold" role="status">Faça login para consultar a validade.</p>
          )}
        </div>
      </div>

      {showUnsignedAction && !confirmationOpen && (
        <button
          type="button"
          className="btn-3d-soft shrink-0 px-3 py-2 text-xs font-bold uppercase"
          disabled={!canGenerateUnsigned || pending || checking}
          onClick={() => setConfirmationOpen(true)}
        >
          Gerar sem assinatura digital
        </button>
      )}

      {showUnsignedAction && confirmationOpen && (
        <div className="bevel-3d w-full space-y-2 p-3 sm:max-w-md" role="alertdialog" aria-label="Confirmar documento sem assinatura">
          <p className="text-xs font-semibold">
            O arquivo ficará marcado como não assinado, não será enviado nem compartilhado e exigirá assinatura manual antes de uso clínico.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-3d-soft px-3 py-2 text-xs"
              disabled={pending} onClick={() => setConfirmationOpen(false)}>
              Cancelar
            </button>
            <button type="button" className="btn-3d px-3 py-2 text-xs font-bold"
              disabled={!canGenerateUnsigned || pending} onClick={() => {
                setConfirmationOpen(false);
                onGenerateUnsigned?.();
              }}>
              {pending ? "Gerando…" : "Confirmar geração sem assinatura"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
