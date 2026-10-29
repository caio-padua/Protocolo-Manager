import { useClinicalIdentity } from "@/hooks/use-clinical-identity";

export function ClinicalIdentityPanel({ identity }: { identity: ReturnType<typeof useClinicalIdentity> }) {
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
    <section className="panel-3d-sub p-3" aria-label="Identificação clínica validada">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[
          ["Cliente", client.name, `Identificador ${client.id}`],
          ["Médico responsável", professional.name, `CRM ${professional.crm} / ${professional.uf ?? "unidade federativa pendente"}`],
          ["Clínica", clinic.name, `Identificador ${clinic.id}`],
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
  );
}
