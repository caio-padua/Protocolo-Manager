import { useState } from "react";
import { MapPin, Plus, Save, Pencil, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ENDERECO_VAZIO, EnderecoExternoCampos, enderecoCompleto, type EnderecoExternoForm } from "@/components/EnderecoExternoCampos";
import {
  enderecoComoForm, textoDoLocal, useInativarLocalExterno, useLocaisExternos, useSalvarLocalExterno, type LocalExterno,
} from "@/lib/locais-externos-api";

type Rascunho = { id?: number; nome: string; observacao: string; endereco: EnderecoExternoForm };
const NOVO: Rascunho = { nome: "", observacao: "", endereco: ENDERECO_VAZIO };

/** Consultórios sublocados fora da sede, do mesmo CNPJ. A agenda EXTERNA escolhe um deles e copia o endereço. */
export default function LocaisExternos() {
  const { data, isLoading, isError, error, refetch } = useLocaisExternos();
  const salvar = useSalvarLocalExterno();
  const inativar = useInativarLocalExterno();
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const podeGerir = data?.podeGerir === true;

  function gravar() {
    if (!rascunho) return;
    salvar.mutate(rascunho, {
      onSuccess: () => { toast.success(rascunho.id ? "Local externo atualizado." : "Local externo cadastrado."); setRascunho(null); },
      onError: (e) => toast.error(e.message),
    });
  }
  function tirarDeUso(l: LocalExterno) {
    inativar.mutate(l.id, {
      onSuccess: () => toast.success(`"${l.nome}" saiu da lista. Agendas que já usam o endereço continuam com ele.`),
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="panel-3d space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold uppercase tracking-wide text-primary">
            <MapPin className="h-4 w-4" /> Locais externos da Clínica Pádua
          </span>
          <Button className="btn-3d" disabled={!podeGerir || !!rascunho} onClick={() => setRascunho(NOVO)}>
            <Plus className="mr-1 h-4 w-4" /> Novo local externo
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Consultórios sublocados em outro endereço, que pertencem ao mesmo CNPJ da clínica. Na agenda, ao escolher
          "Externo (outro endereço)", você seleciona um destes locais e o endereço entra sozinho.
        </p>

        {isLoading && <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}
        {isError && (
          <div role="alert" className="paxter-alert paxter-alert-amber px-3 py-2 text-sm">
            {(error as Error).message}{" "}
            <button type="button" className="btn-3d-soft px-2 py-1" onClick={() => void refetch()}>Tentar novamente</button>
          </div>
        )}
        {data && !podeGerir && (
          <p className="paxter-alert paxter-alert-amber px-3 py-2 text-xs font-semibold">Seu acesso só consulta esta lista; quem administra as agendas da clínica cadastra e edita.</p>
        )}
        {data && data.locais.length === 0 && <p className="text-sm text-muted-foreground">Nenhum local externo cadastrado.</p>}

        <ul className="space-y-2.5" aria-label="Locais externos">
          {data?.locais.map((l) => (
            <li key={l.id} className="bevel-3d flex flex-wrap items-center justify-between gap-3 px-3 py-2.5" data-testid={`local-externo-${l.id}`}>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-extrabold uppercase tracking-wide">{l.nome}</p>
                <p className="text-xs font-semibold">{textoDoLocal(l)}</p>
                {l.observacao && <p className="text-[11px] text-muted-foreground">{l.observacao}</p>}
              </div>
              {podeGerir && (
                <div className="flex gap-2">
                  <Button type="button" className="btn-3d-soft" aria-label={`Editar ${l.nome}`}
                    onClick={() => setRascunho({ id: l.id, nome: l.nome, observacao: l.observacao ?? "", endereco: enderecoComoForm(l) })}>
                    <Pencil className="mr-1 h-4 w-4" /> Editar
                  </Button>
                  <Button type="button" className="btn-3d-soft" aria-label={`Tirar ${l.nome} de uso`} disabled={inativar.isPending} onClick={() => tirarDeUso(l)}>
                    <EyeOff className="mr-1 h-4 w-4" /> Tirar de uso
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {rascunho && (
        <div className="panel-3d-sub space-y-3 p-4">
          <p className="text-sm font-bold uppercase tracking-wide">{rascunho.id ? "Editar local externo" : "Novo local externo"}</p>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Nome do local</Label>
            <Input className="field-engraved" aria-label="Nome do local" placeholder="Ex.: Consultório Jardins"
              value={rascunho.nome} onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })} />
          </div>
          <EnderecoExternoCampos value={rascunho.endereco} onChange={(endereco) => setRascunho({ ...rascunho, endereco })} />
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Observação (opcional)</Label>
            <Textarea className="field-engraved" aria-label="Observação" rows={2}
              value={rascunho.observacao} onChange={(e) => setRascunho({ ...rascunho, observacao: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button className="btn-3d" onClick={gravar} disabled={salvar.isPending || !rascunho.nome.trim() || !enderecoCompleto(rascunho.endereco)}>
              <Save className="mr-1 h-4 w-4" /> Salvar
            </Button>
            <Button className="btn-3d-soft" onClick={() => setRascunho(null)} disabled={salvar.isPending}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
