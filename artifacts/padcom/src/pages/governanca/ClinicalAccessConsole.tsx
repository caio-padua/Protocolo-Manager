import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getCountClinicalApprovalsQueryKey,
  getListClinicalAccessLocationsQueryKey,
  getListClinicalApprovalsQueryKey,
  getListClinicalProfessionalAccessQueryKey,
  useCountClinicalApprovals,
  useEmitExamRequest,
  useEmitPrescription,
  useListClinicalAccessLocations,
  useListClinicalApprovals,
  useListClinicalProfessionalAccess,
  useRejectClinicalApproval,
  useUpdateClinicalProfessionalAccess,
  useUpdateClinicalProfessionalAdministration,
  type ClinicalApproval,
  type ClinicalProfessionalAccess,
  type EmitBody,
  type ExamRequestEmitBody,
} from "@workspace/api-client-react";
import { getCollabToken } from "@/lib/collab-auth";
import { usePermissoes } from "@/lib/permissoes";
import { AlertTriangle, Check, ClipboardList, RotateCw, ShieldCheck, Stethoscope, X } from "lucide-react";
import { useClinicalCacheScope } from "@/hooks/use-clinical-cache-scope";

const authRequest = () => {
  const token = getCollabToken();
  return { headers: token ? { Authorization: `Bearer ${token}` } : undefined };
};

function ClinicalPayload({ approval }: { approval: ClinicalApproval }) {
  const payload = approval.payload as Record<string, unknown>;
  const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : [];
  const isPrescription = approval.kind === "prescricao";
  return (
    <div className="concave-3d space-y-2 p-3" data-testid={`approval-content-${approval.id}`}>
      {isPrescription && (
        <div className="grid gap-2 sm:grid-cols-2">
          <p className="text-xs"><b>Duração:</b> {String(payload.durationDays ?? "—")} dias</p>
          <p className="text-xs"><b>CID:</b> {String(payload.cid ?? "—")}</p>
        </div>
      )}
      {items.length ? (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={`${approval.id}-${index}`} className="panel-3d-sub p-2.5">
              <p className="text-sm font-semibold">{String(item.name ?? item.nomeExame ?? "Item clínico")}</p>
              <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                {[item.ativos, item.posologia, item.via, item.periodo, item.preparo, item.grupoPrincipal]
                  .filter(Boolean).map(String).join(" · ") || "Detalhes não informados"}
              </p>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-muted-foreground">Conteúdo clínico não disponível.</p>}
      {payload.observacao ? <p className="text-xs"><b>Observação:</b> {String(payload.observacao)}</p> : null}
    </div>
  );
}

function ApprovalQueue({ cacheScope }: { cacheScope: number }) {
  const queryClient = useQueryClient();
  const { me } = usePermissoes();
  const approvals = useListClinicalApprovals({
    query: { queryKey: [...getListClinicalApprovalsQueryKey(), cacheScope] },
    request: authRequest(),
  });
  const count = useCountClinicalApprovals({
    query: { queryKey: [...getCountClinicalApprovalsQueryKey(), cacheScope] },
    request: authRequest(),
  });
  const reject = useRejectClinicalApproval({ request: authRequest() });
  const emitPrescription = useEmitPrescription({ request: authRequest() });
  const emitExam = useEmitExamRequest({ request: authRequest() });
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: getListClinicalApprovalsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getCountClinicalApprovalsQueryKey() });
  };
  const pending = (approvals.data ?? []).filter(item => item.canReview && ["pendente", "processando"].includes(item.status));
  const myRequests = (approvals.data ?? []).filter(item => item.preparedByProfessionalId === me?.id);
  const busy = reject.isPending || emitPrescription.isPending || emitExam.isPending;

  const approveAndEmit = async (item: ClinicalApproval) => {
    setError(null);
    try {
      // The server loads and validates the authoritative payload by request id.
      if (item.kind === "prescricao") {
        await emitPrescription.mutateAsync({ data: { approvalRequestId: item.id } as EmitBody });
      } else {
        await emitExam.mutateAsync({ data: { approvalRequestId: item.id } as ExamRequestEmitBody });
      }
      invalidate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível emitir o documento.");
    }
  };
  const rejectItem = async (item: ClinicalApproval) => {
    const reason = (reasons[item.id] ?? "").trim();
    if (reason.length < 3) {
      setError("Informe um motivo com pelo menos 3 caracteres para rejeitar.");
      return;
    }
    setError(null);
    try {
      await reject.mutateAsync({ id: item.id, data: { reason } });
      invalidate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível rejeitar a solicitação.");
    }
  };

  return (
    <section className="panel-3d space-y-4 p-4 sm:p-5" aria-labelledby="approval-queue-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="lbl flex items-center gap-2"><ClipboardList className="h-3.5 w-3.5" /> Revisão clínica</p>
          <h2 id="approval-queue-title" className="mt-1 text-xl font-bold">Fila do médico responsável</h2>
          <p className="mt-1 text-xs text-muted-foreground">A emissão ocorre sob a identidade do médico autenticado. Nenhuma mensagem ao paciente é enviada.</p>
        </div>
        <div className="screen-3d min-w-16 px-3 py-2 text-center">
          <span className="lbl block">Pendentes</span>
          <strong className="font-display text-2xl">{count.data?.count ?? pending.length}</strong>
        </div>
      </div>
      {error && <p role="alert" className="bevel-3d flex items-center gap-2 p-3 text-sm text-destructive"><AlertTriangle className="h-4 w-4" />{error}</p>}
      {approvals.isPending ? (
        <div className="space-y-3" aria-label="Carregando solicitações">
          {[1, 2].map(i => <div key={i} className="panel-3d-sub h-24 animate-pulse" />)}
        </div>
      ) : approvals.isError ? (
        <div className="bevel-3d flex items-center justify-between gap-3 p-3 text-sm">
          <span>Não foi possível carregar a fila autorizada.</span>
          <button className="btn-3d-soft inline-flex items-center gap-2 px-3 py-2" onClick={() => void approvals.refetch()}><RotateCw className="h-4 w-4" /> Tentar novamente</button>
        </div>
      ) : pending.length === 0 ? (
        <div className="concave-3d flex flex-col items-center gap-2 px-4 py-8 text-center">
          <ShieldCheck className="h-6 w-6 text-emerald-700" />
          <p className="font-semibold">{myRequests.length ? "Você não tem pedidos para aprovar" : "Nenhuma revisão aguardando decisão"}</p>
          <p className="text-xs text-muted-foreground">{myRequests.length
            ? "Acompanhe o andamento das suas solicitações abaixo."
            : "Solicitações autorizadas aparecerão aqui."}</p>
        </div>
      ) : pending.map(item => (
        <article key={item.id} className="panel-3d-sub space-y-3 p-3 sm:p-4" data-testid={`approval-card-${item.id}`}>
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="lbl">{item.kind === "prescricao" ? "Prescrição" : "Pedido de exames"} · {item.status}</p>
              <h3 className="mt-1 truncate text-lg font-bold">{item.clientName}</h3>
            </div>
            <span className="bevel-3d shrink-0 px-2 py-1 text-[10px] font-bold uppercase tracking-wide">{new Date(item.createdAt).toLocaleString("pt-BR")}</span>
          </header>
          <div className="grid gap-2 text-xs sm:grid-cols-3">
            <p><span className="lbl block">Preparado por</span>{item.preparedByName}</p>
              <p><span className="lbl block">Cliente · unidade</span>{item.clientId} · {item.locationName}</p>
            <p><span className="lbl block">Responsável</span>{item.responsibleDoctorName ?? "Médico responsável"}</p>
          </div>
          <ClinicalPayload approval={item} />
          {item.canReview && item.status === "pendente" && (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <input
                value={reasons[item.id] ?? ""}
                onChange={event => setReasons(previous => ({ ...previous, [item.id]: event.target.value }))}
                placeholder="Motivo obrigatório se rejeitar"
                aria-label={`Motivo de rejeição para ${item.clientName}`}
                data-testid={`input-rejection-reason-${item.id}`}
                className="field-engraved min-w-0 rounded-md border px-3 py-2 text-sm"
              />
              <button type="button" onClick={() => void approveAndEmit(item)} disabled={busy}
                data-testid={`button-approve-emit-${item.id}`}
                className="btn-3d inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold uppercase disabled:opacity-50">
                <Check className="h-4 w-4" /> Aprovar e emitir
              </button>
              <button type="button" onClick={() => void rejectItem(item)} disabled={busy || (reasons[item.id] ?? "").trim().length < 3}
                data-testid={`button-reject-${item.id}`}
                className="btn-3d-soft inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold uppercase text-destructive disabled:opacity-50">
                <X className="h-4 w-4" /> Rejeitar
              </button>
            </div>
          )}
        </article>
      ))}
      {myRequests.length > 0 && (
        <section className="panel-3d-sub space-y-3 p-3 sm:p-4" aria-labelledby="my-clinical-requests-title">
          <div>
            <p className="lbl">Acompanhamento</p>
            <h3 id="my-clinical-requests-title" className="mt-1 text-base font-bold">Minhas solicitações</h3>
          </div>
          {myRequests.map(item => (
            <article key={`mine-${item.id}`} className="concave-3d grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <p className="font-semibold">{item.kind === "prescricao" ? "Prescrição" : "Pedido de exames"} · {item.clientName}</p>
                <p className="text-xs text-muted-foreground">{item.locationName} · {new Date(item.createdAt).toLocaleString("pt-BR")}</p>
                {item.status === "rejeitado" && item.rejectionReason && (
                  <p className="mt-1 text-xs text-destructive">Motivo da recusa: {item.rejectionReason}</p>
                )}
              </div>
              <span className="bevel-3d px-2 py-1 text-xs font-bold">
                {item.status === "pendente" ? "Aguardando conferência"
                  : item.status === "processando" ? "Em emissão — não repita"
                    : item.status === "aprovado" ? "Aprovada e emitida"
                      : item.status === "rejeitado" ? "Rejeitada"
                        : "Exige conferência técnica"}
              </span>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}

function PermissionToggle({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: () => void }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange}
    data-testid={`toggle-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
    className={`relative h-6 w-11 rounded-[4px] border transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${checked ? "border-[#8a6d2f] bg-[#c2a05a]" : "border-[#c7b98f] bg-[#e9e2d2]"}`}>
    <span className={`absolute top-[2px] h-[18px] w-[18px] rounded-[2px] bg-[#fffdf7] shadow transition-transform ${checked ? "translate-x-[20px]" : "translate-x-[2px]"}`} />
  </button>;
}

export function ClinicalAccessConsole({ platformOwner }: { platformOwner: boolean }) {
  const queryClient = useQueryClient();
  const cacheScope = useClinicalCacheScope();
  const locations = useListClinicalAccessLocations({
    query: { queryKey: [...getListClinicalAccessLocationsQueryKey(), cacheScope] },
    request: authRequest(),
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const authorizedLocations = locations.data ?? [];
  const selected = authorizedLocations.find(location => location.id === selectedId) ?? authorizedLocations[0];
  const locationId = selected?.id ?? 0;
  const professionals = useListClinicalProfessionalAccess(locationId, {
    query: {
      enabled: !!locationId && Boolean(selected?.canManage),
      queryKey: [...getListClinicalProfessionalAccessQueryKey(locationId), cacheScope],
    },
    request: authRequest(),
  });
  const updateAccess = useUpdateClinicalProfessionalAccess({ request: authRequest() });
  const updateAdministration = useUpdateClinicalProfessionalAdministration({ request: authRequest() });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getListClinicalProfessionalAccessQueryKey(locationId) });
    void queryClient.invalidateQueries({ queryKey: getListClinicalAccessLocationsQueryKey() });
  };
  const saveAccess = (professional: ClinicalProfessionalAccess, field: "canPrescribe" | "canRequestExams") => {
    setNotice(null); setError(null);
    updateAccess.mutate({
      locationId, professionalId: professional.professionalId,
      data: { canPrescribe: field === "canPrescribe" ? !professional.canPrescribe : professional.canPrescribe,
        canRequestExams: field === "canRequestExams" ? !professional.canRequestExams : professional.canRequestExams },
    }, { onSuccess: () => { setNotice("Permissão clínica atualizada."); refresh(); },
      onError: cause => setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a permissão.") });
  };
  const saveAdministration = (professional: ClinicalProfessionalAccess, field: "isClinicAdmin" | "isResponsibleDoctor") => {
    setNotice(null); setError(null);
    updateAdministration.mutate({
      locationId, professionalId: professional.professionalId,
      data: { isClinicAdmin: field === "isClinicAdmin" ? !professional.isClinicAdmin : professional.isClinicAdmin,
        isResponsibleDoctor: field === "isResponsibleDoctor" ? !professional.isResponsibleDoctor : professional.isResponsibleDoctor },
    }, { onSuccess: () => { setNotice("Designação administrativa atualizada."); refresh(); },
      onError: cause => setError(cause instanceof Error ? cause.message : "Não foi possível salvar a designação.") });
  };
  const roster = useMemo(() => professionals.data ?? [], [professionals.data]);
  const saving = updateAccess.isPending || updateAdministration.isPending;

  return (
    <div className="space-y-5">
      <section className="panel-3d space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="lbl flex items-center gap-2"><Stethoscope className="h-3.5 w-3.5" /> Acesso clínico por unidade</p>
            <h2 className="mt-1 text-xl font-bold">Concessões individuais</h2>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">A matriz global define o limite. A concessão local não supera uma permissão global bloqueada.</p>
          </div>
          <label className="min-w-[220px] text-xs font-bold uppercase tracking-wide">
            Unidade autorizada
            <select data-testid="select-clinical-location" value={selected?.id ?? ""} onChange={event => setSelectedId(Number(event.target.value))}
              className="field-engraved mt-1 block w-full rounded-md border px-3 py-2 text-sm font-normal normal-case">
              {authorizedLocations.map(location => <option key={location.id} value={location.id}>{location.name}{location.canReview ? " · responsável" : ""}</option>)}
            </select>
          </label>
        </div>
        {locations.isPending ? <div className="panel-3d-sub h-16 animate-pulse" /> :
          locations.isError ? <div className="bevel-3d flex justify-between gap-3 p-3 text-sm"><span>Não foi possível carregar unidades autorizadas.</span><button onClick={() => void locations.refetch()} className="btn-3d-soft px-3 py-1">Tentar novamente</button></div> :
          authorizedLocations.length === 0 ? <div className="concave-3d p-5 text-sm">Sua conta não possui unidades liberadas para gestão ou revisão clínica.</div> : !selected?.canManage ? (
            <div className="concave-3d p-4 text-sm">Você pode revisar solicitações desta unidade, mas não administrar concessões.</div>
          ) : professionals.isPending ? <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="panel-3d-sub h-14 animate-pulse" />)}</div> :
          professionals.isError ? <div className="bevel-3d p-3 text-sm">Falha ao carregar profissionais. <button className="underline" onClick={() => void professionals.refetch()}>Tentar novamente</button></div> :
          roster.length === 0 ? <div className="concave-3d p-4 text-sm">Nenhum profissional vinculado a esta unidade.</div> : (
            <>
              <div className="space-y-3">
                {roster.map(person => (
                  <article key={person.professionalId} className="panel-3d-sub space-y-3 p-3 sm:p-4" data-testid={`professional-access-${person.professionalId}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><h3 className="truncate font-semibold">{person.name}</h3>
                        <p className="text-xs text-muted-foreground">{person.professionalType ?? person.category ?? "Profissional"} · {person.active ? "Ativo" : "Inativo"}</p></div>
                      {!person.active && <span className="text-[10px] font-bold uppercase text-amber-700">Inativo</span>}
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {([
                        ["Prescrição", person.canPrescribe, person.globalAllowsPrescribe, () => saveAccess(person, "canPrescribe")],
                        ["Solicitar exames", person.canRequestExams, person.globalAllowsExamRequests, () => saveAccess(person, "canRequestExams")],
                      ] as const).map(([label, enabled, globalAllowed, onChange]) => (
                        <div key={label} className="concave-3d flex items-center justify-between gap-3 px-3 py-2">
                          <span className="text-sm">{label}<span className="ml-2 text-[10px] text-muted-foreground">{globalAllowed ? "global liberada" : "bloqueada na matriz global"}</span></span>
                          <PermissionToggle checked={enabled} disabled={!person.active || !globalAllowed || saving} label={`${label} ${person.name}`} onChange={onChange} />
                        </div>
                      ))}
                    </div>
                    {platformOwner && (
                      <div className="grid gap-2 md:grid-cols-2">
                        {([
                          ["Administrador da clínica", person.isClinicAdmin, () => saveAdministration(person, "isClinicAdmin"), person.category === "administrativo"],
                          ["Médico responsável", person.isResponsibleDoctor, () => saveAdministration(person, "isResponsibleDoctor"), person.professionalType === "medico" && person.category === "medico"],
                        ] as const).map(([label, checked, onChange, eligible]) => (
                          <div key={label} className="concave-3d flex items-center justify-between gap-3 px-3 py-2">
                            <span className="text-sm">{label}<span className="ml-2 text-[10px] text-muted-foreground">CEO</span></span>
                            <PermissionToggle checked={checked} disabled={!person.active || !eligible || saving} label={`${label} ${person.name}`} onChange={onChange} />
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
              {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </>
          )}
      </section>
      <ApprovalQueue cacheScope={cacheScope} />
    </div>
  );
}

