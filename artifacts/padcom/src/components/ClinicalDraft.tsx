import { useRef, type ReactNode } from "react";
import { ClinicalIdentityPanel } from "./ClinicalIdentityPanel";
import type { ClinicalIdentity, useClinicalIdentity } from "@/hooks/use-clinical-identity";
import type { useClinicalDraft } from "@/hooks/use-clinical-draft";

export type IdentityQuery = ReturnType<typeof useClinicalIdentity>;

export function ClinicalDraftGate({ identity, clientId, kind, children }: {
  identity: IdentityQuery; clientId: number; kind: string;
  children: (scope: string) => ReactNode;
}) {
  const data = identity.data;
  const validated = useRef<ClinicalIdentity | null>(null);
  if (!identity.isFetching && !identity.isError && data?.canPrescribe
    && data.client.id === clientId && data.professional.id && data.clinic.id && data.clinic.empresaId) {
    validated.current = data;
  }
  if (identity.isError || (data && !data.canPrescribe) || validated.current?.client.id !== clientId) {
    validated.current = null;
  }
  const context = validated.current;
  const checking = identity.isFetching || !data;
  const validationNotice = <div className="space-y-3">
      <ClinicalIdentityPanel identity={identity} />
      <p role="status" className="text-sm">Valide o médico, a clínica e o paciente para acessar o rascunho.</p>
      <button className="btn-3d-soft px-3 py-2" onClick={() => void identity.refetch()}>Validar identidade</button>
    </div>;
  if (!context) return validationNotice;
  const scope = `paxter:clinical-draft:v1:${context.clinic.empresaId}:${context.clinic.id}:${context.professional.id}:${clientId}:${kind}`;
  return <div className="space-y-3">
    {checking && validationNotice}
    {/* Keep unsaved in-memory edits mounted during a background identity check.
        Hide and disable them until authorization is confirmed; a refused or
        changed context removes/rekeys the editor instead. */}
    <fieldset className="min-w-0" hidden={checking} disabled={checking} aria-busy={checking}>
      {children(scope)}
    </fieldset>
  </div>;
}

export function ClinicalDraftNotice<T extends object>({ draft, identity }: {
  draft: ReturnType<typeof useClinicalDraft<T>>; identity: IdentityQuery;
}) {
  return <section aria-label="Rascunho clínico" className="panel-3d-sub space-y-2 rounded-md p-3 text-sm">
    <p className="font-semibold">{draft.pending ? "Rascunho encontrado" : "Rascunho clínico"}</p>
    <p className="text-xs text-muted-foreground">{identity.data?.client.name} · {identity.data?.professional.name} · {identity.data?.clinic.name}</p>
    <p role="status" className="text-xs">{draft.pending
      ? "Recupere o rascunho ou confirme seu descarte antes de editar."
      : draft.saved ? "Rascunho salvo neste navegador." : "As alterações serão salvas neste navegador."}
      {" "}Não sincroniza entre aparelhos. Recuperar não gera documentos nem envia mensagens.</p>
    {draft.error && <p role="alert" className="text-xs text-red-400">{draft.error}</p>}
    <div className="flex flex-wrap gap-2">
      {draft.pending && <button type="button" className="btn-3d-soft px-3 py-2 text-xs" onClick={draft.recover}>Recuperar rascunho</button>}
      {!draft.pending && draft.error && <button type="button" className="btn-3d-soft px-3 py-2 text-xs" onClick={draft.retry}>Tentar salvar novamente</button>}
      <button type="button" className="btn-3d-soft px-3 py-2 text-xs text-red-400" onClick={draft.discard}>Descartar rascunho</button>
    </div>
  </section>;
}
