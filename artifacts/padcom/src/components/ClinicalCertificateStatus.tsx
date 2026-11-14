import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { COLLAB_EVENT, getCollabToken } from "@/lib/collab-auth";

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
  professionalId?: number | null;
};

type Props = {
  scope?: "professional" | "system";
  compact?: boolean;
  /** Apenas um escudo fino dentro do painel: verde = vigente, vermelho = vencido ou com problema. */
  badge?: boolean;
  iconOnly?: boolean;
  professionalType?: string | null;
  responsibleDoctorName?: string | null;
  responsibleProfessionalId?: number | null;
  allowUnsignedPrescription?: boolean;
  canGenerateUnsigned?: boolean;
  pending?: boolean;
  onGenerateUnsigned?: () => void;
};

const STATUS_COPY: Record<CertificateState, { title: string; detail: string; tone: string }> = {
  valid: { title: "Certificado válido", detail: "A autorização será conferida ao emitir.", tone: "text-emerald-800 dark:text-emerald-300" },
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
  compact = false,
  badge = false,
  iconOnly = false,
  professionalType,
  responsibleDoctorName,
  responsibleProfessionalId,
  allowUnsignedPrescription = false,
  canGenerateUnsigned = false,
  pending = false,
  onGenerateUnsigned,
}: Props) {
  const [certificate, setCertificate] = useState<CertificateResult | null>(null);
  const [checking, setChecking] = useState(true);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const [resolvedEpoch, setResolvedEpoch] = useState(-1);

  useEffect(() => {
    const changed = () => setSessionEpoch(epoch => epoch + 1);
    const storageChanged = (event: StorageEvent) => {
      if (!event.key || event.key === "padcom_collab_token" || event.key === "padcom_collab_prof") changed();
    };
    window.addEventListener(COLLAB_EVENT, changed);
    window.addEventListener("storage", storageChanged);
    return () => {
      window.removeEventListener(COLLAB_EVENT, changed);
      window.removeEventListener("storage", storageChanged);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setChecking(true);
      setCertificate(null);
      if (scope === "professional" && professionalType && professionalType !== "medico") {
        setResolvedEpoch(sessionEpoch);
        setChecking(false);
        return;
      }
      const token = getCollabToken();
      if (!token) {
        if (active) {
          setResolvedEpoch(sessionEpoch);
          setChecking(false);
        }
        return;
      }
      const endpoint = scope === "system"
        ? `${import.meta.env.BASE_URL}api/protocols/carta-pdf-certcheck`
        : `${import.meta.env.BASE_URL}api/settings/certificate`;
      try {
        const requestOptions: RequestInit = {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
        };
        const [response, identityResponse] = await Promise.all([
          fetch(endpoint, requestOptions),
          scope === "professional"
            ? fetch(`${import.meta.env.BASE_URL}api/collaborator/me`, requestOptions)
            : Promise.resolve(null),
        ]);
        const data = await response.json() as {
          state?: CertificateState;
          validFrom?: string | null;
          validTo?: string | null;
          professionalType?: string | null;
          cert?: { validFrom?: string; validTo?: string };
        };
        const identity = identityResponse?.ok
          ? await identityResponse.json() as { professional?: { id?: number } }
          : null;
        if (!active) return;
        const professionalId = Number.isSafeInteger(identity?.professional?.id)
          ? identity!.professional!.id! : null;
        const state = response.ok && (scope === "system" || professionalId !== null) &&
          data.state && Object.prototype.hasOwnProperty.call(STATUS_COPY, data.state)
          ? data.state
          : "unavailable";
        setCertificate({
          state,
          validFrom: data.validFrom ?? data.cert?.validFrom ?? null,
          validTo: data.validTo ?? data.cert?.validTo ?? null,
          professionalType: data.professionalType ?? null,
          professionalId,
        });
      } catch {
        if (active) setCertificate({ state: "unavailable", validFrom: null, validTo: null });
      } finally {
        if (active) {
          setResolvedEpoch(sessionEpoch);
          setChecking(false);
        }
      }
    };
    void load();
    return () => { active = false; };
  }, [scope, professionalType, sessionEpoch]);

  const currentCertificate = resolvedEpoch === sessionEpoch ? certificate : null;
  const effectiveProfessionalType = professionalType ?? currentCertificate?.professionalType;
  const responsibleNotSelected = responsibleProfessionalId === null;
  const responsibleMismatch = typeof responsibleProfessionalId === "number" &&
    currentCertificate?.professionalId != null && responsibleProfessionalId !== currentCertificate.professionalId;
  const waitingForDoctor = scope === "professional" &&
    ((effectiveProfessionalType !== null && effectiveProfessionalType !== undefined &&
      effectiveProfessionalType !== "medico") || responsibleNotSelected || responsibleMismatch);
  const state = waitingForDoctor ? null : currentCertificate?.state ?? null;
  const copy = state ? STATUS_COPY[state] : null;
  const expiry = formatDate(currentCertificate?.validTo ?? null);
  const start = formatDate(currentCertificate?.validFrom ?? null);
  const showUnsignedAction = allowUnsignedPrescription && state === "expired" && !!onGenerateUnsigned;

  if (badge) {
    if (waitingForDoctor) return null;
    const verificando = checking || resolvedEpoch !== sessionEpoch;
    if (!verificando && !state) return null;
    const ok = state === "valid";
    const texto = verificando ? "Verificando certificado digital" : `${copy?.title ?? "Certificado digital"}${expiry ? ` (${ok ? "válido até" : state === "expired" ? "venceu em" : "data"} ${expiry})` : ""}`;
    const cor = verificando ? "#94a3b8" : ok ? "#22c55e" : "#ef4444";
    const Icone = ok || verificando ? ShieldCheck : ShieldAlert;
    return (
      <span role="status" aria-label={texto} title={texto} className="inline-flex shrink-0 items-center">
        <Icone aria-hidden="true" strokeWidth={1.5} className="h-[18px] w-[18px]"
          style={{ color: cor, filter: verificando ? undefined : `drop-shadow(0 0 3px ${cor}aa)` }} />
      </span>
    );
  }

  if (compact) {
    const description = waitingForDoctor
      ? "Aguardando confirmação do médico autenticado"
      : checking || resolvedEpoch !== sessionEpoch
        ? "Verificando certificado"
        : copy?.title ?? "Faça login para consultar o certificado";
    const label = `Certificado do médico autenticado: ${description}`;
    return (
      <div
        role="status"
        aria-label={label}
        title={`${label}. A autorização e a identidade do responsável são conferidas na emissão.`}
        className={`mt-2 flex min-h-8 items-center gap-1.5 rounded border border-[#c6a35a]/50 bg-[#10233e] px-2 py-1 text-[10px] font-semibold ${state === "valid" ? "text-emerald-200" : "text-amber-100"} ${iconOnly ? "justify-center" : ""}`}
      >
        {state === "valid" ? <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />}
        <span className={iconOnly ? "sr-only" : "min-w-0"}>{description}</span>
      </div>
    );
  }

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
            {scope === "system" ? "Certificado digital do sistema" : "Certificado digital do médico autenticado"}
          </p>
          {waitingForDoctor ? (
            <>
              <p className="text-sm font-semibold">
                {responsibleNotSelected ? "Selecione o médico responsável pela emissão" : "Aguardando o médico responsável pela emissão"}
              </p>
              <p className="text-xs text-muted-foreground">
                {responsibleDoctorName
                  ? `A validade será conferida na sessão de ${responsibleDoctorName}.`
                  : "A validade será conferida na sessão do médico responsável."}
              </p>
            </>
          ) : checking || resolvedEpoch !== sessionEpoch ? (
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
