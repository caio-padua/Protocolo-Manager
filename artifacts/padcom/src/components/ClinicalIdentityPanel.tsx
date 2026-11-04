import { useClinicalIdentity } from "@/hooks/use-clinical-identity";
import { ClinicalCertificateStatus } from "@/components/ClinicalCertificateStatus";

export function ClinicalIdentityPanel({
  identity,
  allowUnsignedPrescription = false,
  canGenerateUnsigned = false,
  unsignedGenerationPending = false,
  onGenerateUnsigned,
}: {
  identity: ReturnType<typeof useClinicalIdentity>;
  allowUnsignedPrescription?: boolean;
  canGenerateUnsigned?: boolean;
  unsignedGenerationPending?: boolean;
  onGenerateUnsigned?: () => void;
}) {
  if (identity.isPending) return <div className="concave-3d p-3 text-sm" role="status">Validando cliente, médico e clínica…</div>;
  if (identity.error) return (
    <div className="concave-3d p-3 text-sm" role="alert">
      <p className="text-red-600">{identity.error.message}</p>
      <button type="button" className="btn-3d-soft mt-2 px-3 py-2" onClick={() => identity.refetch()}>Verificar novamente</button>
    </div>
  );
  if (!identity.data) return null;
  const { client, professional, clinic, issue } = identity.data;
  return (
    <>
    <section className="panel-3d-sub p-3" aria-label="Identificação clínica validada">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Cliente selecionado", client.name, `Identificador ${client.id}`],
          ["Profissional autenticado", professional.name, professional.professionalType === "medico"
            ? `CRM ${professional.crm ?? "pendente"} / ${professional.uf ?? "UF pendente"}`
            : professional.professionalType ?? "Equipe clínica"],
          ["Médico responsável", identity.data.responsibleDoctorName ?? "Não designado", "Revisão e emissão sob identidade própria"],
          ["Clínica", clinic.name, `Unidade ${clinic.id}`],
        ].map(([label, value, detail]) => (
          <div key={label} className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="truncate text-sm font-semibold" title={value}>{value}</p>
            <p className="text-xs text-muted-foreground">{detail}</p>
          </div>
        ))}
      </div>
      {issue && <p className="mt-3 text-sm text-amber-700" role="alert">{issue}</p>}
    </section>
    <ClinicalCertificateStatus
      professionalType={professional.professionalType}
      responsibleDoctorName={identity.data.responsibleDoctorName}
      allowUnsignedPrescription={allowUnsignedPrescription && identity.data.canPrescribe}
      canGenerateUnsigned={canGenerateUnsigned}
      pending={unsignedGenerationPending}
      onGenerateUnsigned={onGenerateUnsigned}
    />
    </>
  );
}
