// IDENTIDADE DO CEO DA PAXMED — /configuracoes/medico
// O CEO é uma entidade empresarial. O cadastro MÉDICO (Dr. Caio) é outra coisa:
// aqui ele é apenas IMPORTADO (somente leitura) e liberado por um interruptor.
// Todo documento clínico sai no nome do médico que fez o login.

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Stethoscope, Landmark, AlertCircle, RefreshCw, ShieldOff, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { SettingsPanel, FieldRow } from "@/components/settings/SettingsUI";
import { baixarFoto, ceoApi as api } from "@/lib/ceo-api";
import { usePermissoes } from "@/lib/permissoes";

interface Identidade {
  medicoAtivo: boolean;
  temFotoCeo: boolean;
  fotoExibida: "medico" | "ceo" | "nenhuma";
  medico: { id: number; nome: string; crm: string | null; especialidade: string | null; cpfFinal: string | null; cpf: string | null; temFoto: boolean } | null;
}
interface Clinicas {
  clinicas: Array<{ empresaId: number; nome: string; administradorId: number | null; responsavelTecnicoId: number | null }>;
  profissionais: Array<{ id: number; nome: string; tipo: string; categoria: string; empresaId: number | null }>;
}

type Destaque = "ouro" | "pulso" | null;

/** Moldura com sinalização. O brilho vive num elemento próprio (não no retrato 3D) para não apagar o relevo. */
function Retrato({ url, vazio, destaque, legenda, estado }: { url: string | null; vazio: string; destaque: Destaque; legenda: string; estado: string }) {
  const anel = destaque === "ouro"
    ? "ring-2 ring-amber-400 shadow-[0_0_22px_4px_rgba(251,191,36,0.55)]"
    : destaque === "pulso"
      ? "ring-2 ring-sky-400 shadow-[0_0_26px_6px_rgba(56,189,248,0.55)] animate-pulse"
      : "";
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <div aria-hidden className={`pointer-events-none absolute -inset-1.5 rounded-[12px] transition-all duration-500 ${anel}`} />
        <div className={`concave-3d relative w-[130px] h-[165px] p-1.5 flex items-center justify-center overflow-hidden shrink-0 transition-opacity duration-500 ${destaque ? "" : "opacity-60"}`}>
          {url ? <img src={url} alt={legenda} className="w-full h-full object-cover rounded-[6px]" />
            : <p className="text-xs text-muted-foreground text-center px-2">{vazio}</p>}
        </div>
      </div>
      <p className="text-xs font-bold uppercase tracking-wide">{legenda}</p>
      <p className={`text-[11px] font-semibold ${destaque ? "text-amber-600" : "text-muted-foreground"}`}>{estado}</p>
    </div>
  );
}

export default function IdentidadeCeo() {
  const { toast } = useToast();
  const { isCeo, loading: permLoading } = usePermissoes();
  const [id, setId] = useState<Identidade | null>(null);
  const [clin, setClin] = useState<Clinicas | null>(null);
  const [fotoCeo, setFotoCeo] = useState<string | null>(null);
  const [fotoMedico, setFotoMedico] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    setErro(false);
    try {
      const dados = await api<Identidade>("/ceo/identidade");
      setId(dados);
      const [fc, fm] = await Promise.all([baixarFoto("/ceo/identidade/foto-ceo"), baixarFoto("/ceo/identidade/foto-medico")]);
      setFotoCeo((a) => { if (a) URL.revokeObjectURL(a); return fc; });
      setFotoMedico((a) => { if (a) URL.revokeObjectURL(a); return fm; });
      setClin(await api<Clinicas>("/ceo/clinicas-responsaveis"));
    } catch { setErro(true); }
  }, []);

  useEffect(() => { if (!permLoading && isCeo) void carregar(); }, [permLoading, isCeo, carregar]);

  async function alternar(ativo: boolean) {
    setSalvando(true);
    try {
      await api("/ceo/identidade/medico-ativo", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo }) });
      toast({ title: ativo ? "Profissional Médico ativado" : "Profissional Médico desativado" });
      await carregar();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Falha ao alterar", variant: "destructive" });
    } finally { setSalvando(false); }
  }

  async function enviarFoto(file: File | null) {
    if (!file) return;
    const body = new FormData(); body.append("file", file);
    try {
      await api("/ceo/identidade/foto", { method: "PUT", body });
      toast({ title: "Foto do CEO atualizada" });
      if (arquivo.current) arquivo.current.value = "";
      await carregar();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Falha ao enviar", variant: "destructive" });
    }
  }

  async function responsavel(empresaId: number, campo: "administradorId" | "responsavelTecnicoId", valor: string) {
    try {
      await api(`/ceo/clinicas-responsaveis/${empresaId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [campo]: valor === "" ? null : Number(valor) }),
      });
      toast({ title: "Responsável atualizado" });
      setClin(await api<Clinicas>("/ceo/clinicas-responsaveis"));
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Falha ao salvar", variant: "destructive" });
    }
  }

  if (permLoading) return <Skeleton className="h-64 w-full max-w-2xl mx-auto" />;
  if (!isCeo) {
    return (
      <div className="max-w-2xl mx-auto panel-3d p-6 flex items-start gap-3 text-red-600">
        <ShieldOff className="w-5 h-5 mt-0.5 shrink-0" />
        <p className="font-semibold">Acesso restrito ao CEO da PaxMed.</p>
      </div>
    );
  }
  if (erro) {
    return (
      <div className="max-w-2xl mx-auto panel-3d p-6 flex items-start gap-3 text-red-600">
        <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Não foi possível carregar a CEO da Pax Med</p>
          <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={() => void carregar()}>
            <RefreshCw className="w-4 h-4" /> Tentar novamente
          </Button>
        </div>
      </div>
    );
  }
  if (!id) return <Skeleton className="h-64 w-full max-w-2xl mx-auto" />;

  const daClinica = (empresaId: number) =>
    clin?.profissionais.filter((p) => p.empresaId === empresaId || p.id === id.medico?.id) ?? [];
  const campo = "field-engraved min-h-10 w-full rounded px-2 text-sm";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">CEO da Pax Med</h1>
        <p className="text-sm text-muted-foreground mt-1">
          O CEO é a entidade empresarial dona do sistema. Os documentos clínicos saem sempre no nome do médico que fez o login.
        </p>
      </header>

      <SettingsPanel icon={Building2} title="CEO da Pax Med (entidade empresarial)">
        <div className="flex flex-wrap gap-8 items-start justify-center" data-testid="fotos-lado-a-lado">
          <div data-testid="retrato-ceo" data-destaque={!id.medicoAtivo ? "ativo" : "inativo"}>
            <Retrato url={fotoCeo} vazio="Sem foto" legenda="CEO" destaque={id.medicoAtivo ? null : "pulso"}
              estado={id.medicoAtivo ? "Em repouso" : "Em exercício: sem emissão médica"} />
          </div>
          <div data-testid="retrato-medico" data-destaque={id.medicoAtivo ? "ativo" : "inativo"}>
            <Retrato url={fotoMedico} vazio="Médico sem foto no Corpo Clínico" legenda="Profissional Médico" destaque={id.medicoAtivo ? "ouro" : null}
              estado={id.medicoAtivo ? "Ativo: pode emitir" : "Desativado"} />
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <p className="text-sm" data-testid="foto-exibida">
            {id.fotoExibida === "medico"
              ? "Interruptor ligado: a foto exibida é a do médico (Dr. Caio) importado."
              : "Interruptor desligado: a foto exibida é a do CEO."}
          </p>
          <Input ref={arquivo} type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" className="field-engraved min-h-10"
            onChange={(e) => void enviarFoto(e.target.files?.[0] ?? null)} />
          <p className="text-xs text-muted-foreground"><Upload className="inline w-3 h-3 mr-1" />Foto própria do CEO (JPEG ou PNG, até 2 MB).</p>
        </div>
      </SettingsPanel>

      <SettingsPanel icon={Stethoscope} title="Profissional Médico">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <p className="text-sm font-semibold">Usar meu cadastro de médico para atender e assinar</p>
            <p className="text-xs text-muted-foreground mt-1">
              Ligado: o cadastro do médico abaixo pode emitir receitas, protocolos e demais documentos. Desligado: o CEO não emite nada.
            </p>
          </div>
          <Switch data-testid="toggle-profissional-medico" checked={id.medicoAtivo} disabled={salvando || !id.medico}
            onCheckedChange={(v) => void alternar(v)} aria-label="Profissional Médico" />
        </div>
        {id.medico ? (
          <div className="flex gap-4 items-start">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
              <FieldRow label="Nome completo"><Input readOnly className="field-engraved" value={id.medico.nome} /></FieldRow>
              <FieldRow label="CRM"><Input readOnly className="field-engraved" value={id.medico.crm ?? ""} /></FieldRow>
              <FieldRow label="Especialidade"><Input readOnly className="field-engraved" value={id.medico.especialidade ?? ""} /></FieldRow>
              <FieldRow label="CPF"><Input disabled readOnly aria-label="CPF (somente leitura)" data-testid="cpf-medico-ceo" className="field-engraved cursor-not-allowed opacity-60 bg-muted" value={id.medico.cpf ?? ""} /></FieldRow>
              <p className="sm:col-span-2 text-xs text-muted-foreground">
                Dados importados do cadastro do médico no Corpo Clínico. Para alterar, edite lá.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-amber-600">Nenhum cadastro médico vinculado ao CEO. Marque o médico no Corpo Clínico.</p>
        )}
      </SettingsPanel>

      <SettingsPanel icon={Landmark} title="Clínicas: administrador e responsável técnico">
        <p className="text-xs text-muted-foreground mb-3">Escolha em lista. Esta escolha não cria login nem senha.</p>
        <div className="space-y-4">
          {clin?.clinicas.map((c) => (
            <div key={c.empresaId} className="panel-3d-sub p-3" data-testid={`clinica-${c.empresaId}`}>
              <p className="text-sm font-semibold mb-2">{c.nome}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FieldRow label="Administrador da clínica">
                  <select className={campo} value={c.administradorId ?? ""} onChange={(e) => void responsavel(c.empresaId, "administradorId", e.target.value)}>
                    <option value="">Não definido</option>
                    {daClinica(c.empresaId).filter((p) => p.categoria === "administrador_clinica" || p.id === c.administradorId).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </FieldRow>
                <FieldRow label="Responsável técnico (médico)">
                  <select className={campo} value={c.responsavelTecnicoId ?? ""} onChange={(e) => void responsavel(c.empresaId, "responsavelTecnicoId", e.target.value)}>
                    <option value="">Não definido</option>
                    {daClinica(c.empresaId).filter((p) => (p.tipo === "medico" && p.categoria === "medico") || p.id === c.responsavelTecnicoId).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </FieldRow>
              </div>
            </div>
          ))}
        </div>
      </SettingsPanel>
    </div>
  );
}
