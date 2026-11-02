import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCreateLocationSemanticCode,
  useUpdateCompanySemanticCodeClassification,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, KeyRound, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { collabAuthHeaders, getCollabToken, COLLAB_EVENT } from "@/lib/collab-auth";

const apiBase = import.meta.env.VITE_API_URL || "/api";

const RELATIONS = [
  { value: "propria", code: "PROU", label: "Própria do grupo" },
  { value: "filial_interna", code: "FILU", label: "Filial interna do grupo" },
  { value: "licenciada_direta", code: "LICD", label: "Licenciada direta" },
  { value: "licenciada_por_clinica", code: "LICI", label: "Licenciada por clínica" },
  { value: "independente", code: "INDE", label: "Empresa independente" },
  { value: "parceira", code: "PARC", label: "Parceira" },
] as const;
type RelationValue = (typeof RELATIONS)[number]["value"];

function isRelationValue(value: string): value is RelationValue {
  return RELATIONS.some((relation) => relation.value === value);
}

interface Company {
  id: number;
  nome: string;
  cnpj: string | null;
  codigoVinculoSemantico: string | null;
  codigoBaseSemantico: string | null;
  ativa: boolean;
  cnpjValido: boolean;
  cnpjDuplicado: boolean;
  empresasComMesmoCnpj: string[];
}

interface Location {
  locationId: number;
  name: string;
  empresaId: number | null;
  codigoSemantico: string | null;
  codigoSequencial: number;
  active: boolean;
}

interface CollaboratorMe {
  professional?: { isPlatformOwner?: boolean };
}

function errorMessage(error: unknown): string {
  const apiError = error as { data?: { error?: unknown }; message?: unknown };
  if (typeof apiError?.data?.error === "string") return apiError.data.error;
  if (typeof apiError?.message === "string") return apiError.message;
  return "A operação não foi concluída.";
}

export default function SemanticCodeManager() {
  const queryClient = useQueryClient();
  const [pendingRelations, setPendingRelations] = useState<Record<number, RelationValue>>({});
  const [hasToken, setHasToken] = useState(Boolean(getCollabToken()));

  useEffect(() => {
    const refreshToken = () => setHasToken(Boolean(getCollabToken()));
    window.addEventListener(COLLAB_EVENT, refreshToken);
    return () => window.removeEventListener(COLLAB_EVENT, refreshToken);
  }, []);

  const { data: companies = [], isLoading: loadingCompanies } = useQuery<Company[]>({
    queryKey: ["semantic-code-companies"],
    enabled: hasToken,
    queryFn: async () => {
      const response = await fetch(`${apiBase}/semantic-codes/companies`, { headers: collabAuthHeaders() });
      if (!response.ok) throw new Error("Não foi possível carregar as empresas.");
      return response.json();
    },
  });

  const { data: locations = [], isLoading: loadingLocations } = useQuery<Location[]>({
    queryKey: ["semantic-code-locations"],
    enabled: hasToken,
    queryFn: async () => {
      const response = await fetch(`${apiBase}/semantic-codes/locations`, { headers: collabAuthHeaders() });
      if (!response.ok) throw new Error("Não foi possível carregar as unidades.");
      return response.json();
    },
  });

  const { data: me } = useQuery<CollaboratorMe | null>({
    queryKey: ["semantic-code-current-collaborator"],
    enabled: hasToken,
    queryFn: async () => {
      const response = await fetch(`${apiBase}/collaborator/me`, { headers: collabAuthHeaders() });
      if (!response.ok) return null;
      return response.json();
    },
  });
  const isPlatformOwner = me?.professional?.isPlatformOwner === true;

  const companyNames = useMemo(
    () => new Map(companies.map((company) => [company.id, company.nome])),
    [companies],
  );
  const companiesById = useMemo(
    () => new Map(companies.map((company) => [company.id, company])),
    [companies],
  );
  const classificationMutation = useUpdateCompanySemanticCodeClassification();
  const codeMutation = useCreateLocationSemanticCode();

  async function saveClassification(company: Company) {
    const current = company.codigoVinculoSemantico;
    const vinculo = pendingRelations[company.id] ?? (current && isRelationValue(current) ? current : null);
    if (!vinculo) {
      toast.error("Escolha a classificação interna da empresa.");
      return;
    }
    try {
      await classificationMutation.mutateAsync({
        id: company.id,
        data: { vinculo },
      });
      await queryClient.invalidateQueries({ queryKey: ["semantic-code-companies"] });
      toast.success("Classificação interna salva.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function issueCode(locationId: number) {
    try {
      await codeMutation.mutateAsync({ id: locationId });
      await queryClient.invalidateQueries({ queryKey: ["semantic-code-locations"] });
      await queryClient.invalidateQueries({ queryKey: ["semantic-code-companies"] });
      toast.success("Código semântico da unidade emitido.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const busy = loadingCompanies || loadingLocations;

  return (
    <section className="panel-3d p-4 space-y-4" aria-labelledby="semantic-code-title">
      <div className="flex items-start gap-3">
        <div className="bevel-3d p-2 shrink-0"><KeyRound className="h-4 w-4 text-primary" /></div>
        <div className="min-w-0">
          <h2 id="semantic-code-title" className="text-[12px] font-black uppercase tracking-widest">
            Código interno por unidade
          </h2>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Formato: nome da empresa · vínculo interno · início do CNPJ · sequência da unidade.
            A classificação não altera quadro societário, licenciamento, acesso ou cobrança.
          </p>
        </div>
      </div>

      {!isPlatformOwner && (
        <p className="concave-3d p-3 text-[10px] text-muted-foreground">
          Os códigos emitidos ficam visíveis para consulta. A classificação e a emissão são exclusivas do CEO.
        </p>
      )}

      {busy ? (
        <div className="flex justify-center py-5"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : !hasToken ? (
        <p className="concave-3d p-3 text-[10px] text-muted-foreground">
          Entre com uma conta de colaborador para consultar códigos e vínculos autorizados.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-primary">Classificação da empresa</p>
            {companies.map((company) => {
              const classificationLocked = locations.some(
                (location) => location.empresaId === company.id && Boolean(location.codigoSemantico),
              );
              const savedRelation = company.codigoVinculoSemantico && isRelationValue(company.codigoVinculoSemantico)
                ? company.codigoVinculoSemantico
                : "";
              const selected = pendingRelations[company.id] ?? savedRelation;
              return (
                <div key={company.id} className="concave-3d flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-bold">{company.nome}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {company.cnpj ?? (company.cnpjValido ? "CNPJ válido" : "CNPJ precisa de revisão")}
                      {company.codigoBaseSemantico
                        ? ` · Base congelada: ${company.codigoBaseSemantico}`
                        : " · Base será congelada na primeira emissão"}
                    </p>
                    {company.cnpjDuplicado && (
                      <p className="mt-1 text-[9px] font-bold text-destructive">
                        CNPJ repetido: {company.empresasComMesmoCnpj.join(", ")}.
                      </p>
                    )}
                  </div>
                  {isPlatformOwner && !classificationLocked ? (
                    <div className="flex gap-2">
                      <Select
                        value={selected}
                        onValueChange={(value) => {
                          if (isRelationValue(value)) {
                            setPendingRelations((previous) => ({ ...previous, [company.id]: value }));
                          }
                        }}
                      >
                        <SelectTrigger className="field-engraved h-9 w-full min-w-[190px] text-[10px] sm:w-[230px]">
                          <SelectValue placeholder="Escolha o vínculo" />
                        </SelectTrigger>
                        <SelectContent>
                          {RELATIONS.map((relation) => (
                            <SelectItem key={relation.value} value={relation.value}>
                              {relation.label} ({relation.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        className="btn-3d-soft h-9 px-3 text-[9px]"
                        disabled={!selected || classificationMutation.isPending}
                        onClick={() => void saveClassification(company)}
                        aria-label={`Salvar classificação de ${company.nome}`}
                      >
                        {classificationMutation.isPending
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Save className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  ) : (
                    <span className="text-[10px] font-bold text-muted-foreground">
                      {RELATIONS.find((item) => item.value === company.codigoVinculoSemantico)?.label ?? "Aguardando CEO"}
                      {classificationLocked ? " · travada após emissão" : ""}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-primary">Unidades clínicas</p>
            {locations.length === 0 ? (
              <p className="concave-3d p-3 text-[10px] text-muted-foreground">Nenhuma unidade cadastrada.</p>
            ) : locations.map((location) => (
              <div key={location.locationId} className="concave-3d flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                {(() => {
                  const company = companiesById.get(location.empresaId ?? -1);
                  return (
                    <>
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-bold">{location.name}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {companyNames.get(location.empresaId ?? -1) ?? "Empresa não vinculada"}
                      {location.codigoSequencial ? ` · Unidade ${String(location.codigoSequencial).padStart(4, "0")}` : ""}
                    </p>
                  </div>
                </div>
                {location.codigoSemantico ? (
                  <code className="select-all text-[11px] font-black tracking-wider text-primary">{location.codigoSemantico}</code>
                ) : company?.cnpjDuplicado ? (
                  <p className="text-[9px] font-bold text-destructive">
                    Bloqueado: CNPJ repetido em {company.empresasComMesmoCnpj.join(", ")}.
                  </p>
                ) : !company?.cnpjValido ? (
                  <p className="text-[9px] text-destructive">Bloqueado: CNPJ ausente ou inválido.</p>
                ) : !company.codigoVinculoSemantico ? (
                  <p className="text-[9px] text-muted-foreground">Aguardando classificação pelo CEO.</p>
                ) : isPlatformOwner ? (
                  <Button
                    type="button"
                    className="btn-3d-soft h-8 px-3 text-[9px]"
                    disabled={codeMutation.isPending || !company || !company.ativa || !location.empresaId}
                    onClick={() => void issueCode(location.locationId)}
                  >
                    {codeMutation.isPending
                      ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      : <KeyRound className="mr-1.5 h-3 w-3" />}
                    Emitir código
                  </Button>
                ) : (
                  <span className="text-[9px] text-muted-foreground">Aguardando emissão pelo CEO</span>
                )}
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
