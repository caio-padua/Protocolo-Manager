import * as ApiClient from "@workspace/api-client-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export type GrupoProfissional = { areaId: number; localId: number; professionalIds: number[] };

export function ProfissionaisNecessarios({ grupos, onChange, enabled, identidade }: {
  grupos: GrupoProfissional[];
  onChange: (value: GrupoProfissional[]) => void;
  enabled: boolean;
  identidade: string;
}) {
  const query = ApiClient.useListProcedimentoOpcoesProfissionais({
    request: { headers: collabAuthHeaders() },
    query: { queryKey: [...ApiClient.getListProcedimentoOpcoesProfissionaisQueryKey(), identidade], enabled, staleTime: 0 },
  });
  const alterar = (indice: number, grupo: GrupoProfissional) =>
    onChange(grupos.map((item, i) => i === indice ? grupo : item));
  return (
    <section className="panel-3d-sub space-y-3 p-4" aria-label="Profissionais necessários">
      <h3 className="text-xs font-black uppercase tracking-widest text-primary">Profissionais necessários</h3>
      <p className="text-sm text-muted-foreground">
        Escolha uma ou mais alternativas na mesma área. Todas as áreas adicionadas serão necessárias.
        As agendas são informativas; nenhum horário será reservado.
      </p>
      {query.isLoading && <p role="status">Carregando vínculos da clínica…</p>}
      {query.isError && <p role="alert" className="text-red-800">Não foi possível carregar os vínculos. Confira a sessão e tente novamente.</p>}
      {grupos.map((grupo, index) => {
        const pessoas = (query.data?.profissionais ?? []).filter((p) => p.areaId === grupo.areaId && p.localId === grupo.localId);
        return (
          <fieldset key={index} className="concave-3d space-y-3 p-3">
            <legend className="text-xs font-bold text-primary">Necessidade {index + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold">Local da clínica
                <select className="field-engraved mt-1 min-h-11 w-full px-2" value={grupo.localId || ""}
                  onChange={(e) => alterar(index, { ...grupo, localId: Number(e.target.value), professionalIds: [] })}>
                  <option value="">Selecione o local</option>
                  {(query.data?.locais ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold">Área profissional
                <select className="field-engraved mt-1 min-h-11 w-full px-2" value={grupo.areaId || ""}
                  onChange={(e) => alterar(index, { ...grupo, areaId: Number(e.target.value), professionalIds: [] })}>
                  <option value="">Selecione a área</option>
                  {(query.data?.areas ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            </div>
            {grupo.areaId > 0 && grupo.localId > 0 && pessoas.length === 0 &&
              <p className="text-sm text-amber-800">Nenhum profissional ativo desta área está vinculado a este local.</p>}
            {pessoas.map((p) => (
              <label key={p.id} className="bevel-3d flex items-start gap-3 p-3 text-sm">
                <Checkbox checked={grupo.professionalIds.includes(p.id)} onCheckedChange={(checked) => alterar(index, {
                  ...grupo, professionalIds: checked === true
                    ? [...grupo.professionalIds, p.id] : grupo.professionalIds.filter((id) => id !== p.id),
                })} aria-label={`Selecionar ${p.nome}`} />
                <span><strong>{p.nome}</strong><br />
                  <span className="text-xs text-muted-foreground">{p.agendas.length
                    ? p.agendas.map((a) => `${a.origem}: ${a.nome}`).join(" · ")
                    : "Sem agenda vinculada a este profissional e local"}</span>
                </span>
              </label>
            ))}
            {query.isSuccess && grupo.professionalIds.filter((id) => !pessoas.some((p) => p.id === id)).map((id) => (
              <div key={id} role="alert" className="concave-3d p-3 text-xs text-amber-800">
                Profissional {id} não está ativo ou não está mais vinculado a este local; confira antes de salvar.
                <Button type="button" className="btn-3d-soft ml-2" onClick={() => alterar(index, {
                  ...grupo, professionalIds: grupo.professionalIds.filter((item) => item !== id),
                })}>Retirar desta necessidade</Button>
              </div>
            ))}
            <Button type="button" className="btn-3d-soft" onClick={() => onChange(grupos.filter((_, i) => i !== index))}>
              Remover necessidade
            </Button>
          </fieldset>
        );
      })}
      <Button type="button" className="btn-3d-soft min-h-11" disabled={!query.isSuccess}
        onClick={() => onChange([...grupos, { areaId: 0, localId: 0, professionalIds: [] }])}>
        Adicionar área necessária
      </Button>
    </section>
  );
}
