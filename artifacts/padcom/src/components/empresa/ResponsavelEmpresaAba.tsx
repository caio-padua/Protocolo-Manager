// Abas "Responsável médico" e "Responsável empresarial" do cadastro de cada empresa.
// Os dados do profissional são IMPORTADOS (somente leitura) do Corpo Clínico; aqui só se escolhe quem é.
// Responsável empresarial = proprietário/administrador (pode não ser médico).
// Responsável médico = o médico (responsável técnico) da clínica.
import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { usePermissoes } from "@/lib/permissoes";
import { baixarFoto, ceoApi } from "@/lib/ceo-api";

type Funcao = "medico" | "empresarial";
interface Detalhe { id: number; nome: string; tipo: string; crm: string | null; especialidade: string | null; cpfFinal: string | null; temFoto: boolean; ativo: boolean }
interface Dados {
  responsavelEmpresarial: Detalhe | null;
  responsavelMedico: Detalhe | null;
  candidatos: Array<{ id: number; nome: string; tipo: string }>;
}

const TEXTOS: Record<Funcao, { titulo: string; explica: string; vazio: string; campoApi: "responsavelTecnicoId" | "administradorId" }> = {
  medico: {
    titulo: "Responsável médico da clínica",
    explica: "Médico responsável técnico por esta clínica. Pode ser diferente do dono. Escolha entre os médicos vinculados.",
    vazio: "Nenhum médico responsável definido para esta clínica.",
    campoApi: "responsavelTecnicoId",
  },
  empresarial: {
    titulo: "Responsável empresarial (proprietário)",
    explica: "Pessoa dona ou administradora da clínica. Não precisa ser médica: o dono pode contratar médicos para trabalhar na clínica.",
    vazio: "Nenhum responsável empresarial definido para esta clínica.",
    campoApi: "administradorId",
  },
};

export function ResponsavelEmpresaAba({ empresaId, funcao }: { empresaId: number; funcao: Funcao }) {
  const { toast } = useToast();
  const { isCeo, loading: permLoading } = usePermissoes();
  const [dados, setDados] = useState<Dados | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const t = TEXTOS[funcao];

  const carregar = useCallback(async () => {
    setErro(false);
    try {
      const d = await ceoApi<Dados>(`/ceo/empresas/${empresaId}/responsaveis`);
      setDados(d);
      const f = await baixarFoto(`/ceo/empresas/${empresaId}/responsaveis/${funcao}/foto`);
      setFoto((a) => { if (a) URL.revokeObjectURL(a); return f; });
    } catch { setErro(true); }
  }, [empresaId, funcao]);

  useEffect(() => { if (!permLoading && isCeo) void carregar(); }, [permLoading, isCeo, carregar]);

  async function escolher(valor: string) {
    try {
      await ceoApi(`/ceo/clinicas-responsaveis/${empresaId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [t.campoApi]: valor === "" ? null : Number(valor) }),
      });
      toast({ title: "Responsável atualizado" });
      await carregar();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Falha ao salvar", variant: "destructive" });
    }
  }

  if (permLoading) return <Loader2 className="w-4 h-4 animate-spin" />;
  if (!isCeo) {
    return (
      <p className="concave-3d p-4 text-xs flex items-center gap-2 text-red-600"><ShieldOff className="w-4 h-4" />Somente o CEO da PaxMed altera os responsáveis da clínica.</p>
    );
  }
  if (erro) return <p className="concave-3d p-4 text-xs text-red-600">Não foi possível carregar o responsável. Feche e abra a empresa novamente.</p>;
  if (!dados) return <Loader2 className="w-4 h-4 animate-spin" />;

  const atual = funcao === "medico" ? dados.responsavelMedico : dados.responsavelEmpresarial;
  const opcoes = funcao === "medico" ? dados.candidatos.filter((c) => c.tipo === "medico") : dados.candidatos;

  return (
    <div className="space-y-4" data-testid={`responsavel-${funcao}`}>
      <div>
        <p className="text-sm font-bold">{t.titulo}</p>
        <p className="text-xs text-muted-foreground mt-1">{t.explica}</p>
      </div>
      <div>
        <label className="lbl" htmlFor={`resp-${funcao}`}>Escolher na lista</label>
        <select id={`resp-${funcao}`} className="field-engraved min-h-10 w-full rounded px-2 text-sm" value={atual?.id ?? ""} onChange={(e) => void escolher(e.target.value)}>
          <option value="">Não definido</option>
          {opcoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>
      {atual ? (
        <div className="flex gap-4 items-start">
          <div className="concave-3d w-[120px] h-[150px] p-1.5 flex items-center justify-center overflow-hidden shrink-0">
            {foto ? <img src={foto} alt="" className="w-full h-full object-cover rounded-[6px]" />
              : <p className="text-xs text-muted-foreground text-center px-2">Sem foto no Corpo Clínico</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
            <div><label className="lbl">Nome completo</label><Input readOnly className="field-engraved" value={atual.nome} /></div>
            <div><label className="lbl">Registro (CRM)</label><Input readOnly className="field-engraved" value={atual.crm ?? ""} /></div>
            <div><label className="lbl">Especialidade</label><Input readOnly className="field-engraved" value={atual.especialidade ?? ""} /></div>
            <div><label className="lbl">CPF (final)</label><Input readOnly className="field-engraved" value={atual.cpfFinal ?? ""} /></div>
            <p className="sm:col-span-2 text-xs text-muted-foreground">Dados importados do cadastro no Corpo Clínico. Para alterar, edite lá.</p>
          </div>
        </div>
      ) : (
        <p className="concave-3d p-4 text-xs">{t.vazio}</p>
      )}
    </div>
  );
}
