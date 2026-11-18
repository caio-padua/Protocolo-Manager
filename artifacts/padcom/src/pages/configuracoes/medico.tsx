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
import { getCollabToken } from "@/lib/collab-auth";
import { usePermissoes } from "@/lib/permissoes";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Identidade {
  medicoAtivo: boolean;
  temFotoCeo: boolean;
  fotoExibida: "medico" | "ceo" | "nenhuma";
  medico: { id: number; nome: string; crm: string | null; especialidade: string | null; cpfFinal: string | null; temFoto: boolean } | null;
}
interface Clinicas {
  clinicas: Array<{ empresaId: number; nome: string; administradorId: number | null; responsavelTecnicoId: number | null }>;
  profissionais: Array<{ id: number; nome: string; tipo: string; empresaId: number | null }>;
}

function authHeaders(): Record<string, string> {
  const token = getCollabToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}/api${path}`, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) }, cache: "no-store" });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error ?? "Falha na operação.");
  }
  return r.json() as Promise<T>;
}

async function baixarFoto(path: string): Promise<string | null> {
  const r = await fetch(`${BASE}/api${path}`, { headers: authHeaders(), cache: "no-store" });
  if (!r.ok) return null;
  return URL.createObjectURL(await r.blob());
}

function Retrato({ url, vazio }: { url: string | null; vazio: string }) {
  return (
    <div className="concave-3d w-[120px] h-[150px] p-1.5 flex items-center justify-center overflow-hidden shrink-0">
      {url ? <img src={url} alt="" className="w-full h-full object-cover rounded-[6px]" />
        : <p className="text-xs text-muted-foreground text-center px-2">{vazio}</p>}
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
      const [fc, fm] = await Promise.all([baixarFoto("/ceo/identidade/foto"), baixarFoto("/ceo/identidade/foto-medico")]);
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
          <p className="font-semibold">Não foi possível carregar a identidade do CEO</p>
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
        <h1 className="text-2xl font-bold tracking-tight">Identidade do CEO da PaxMed</h1>
        <p className="text-sm text-muted-foreground mt-1">
          O CEO é a entidade empresarial dona do sistema. Os documentos clínicos saem sempre no nome do médico que fez o login.
        </p>
      </header>

      <SettingsPanel icon={Building2} title="CEO da PaxMed (entidade empresarial)">
        <div className="flex gap-4 items-start">
          <Retrato url={fotoCeo} vazio="Sem foto" />
          <div className="space-y-3 min-w-0">
            <p className="text-sm" data-testid="foto-exibida">
              {id.fotoExibida === "medico"
                ? "Interruptor ligado: a foto exibida é a do médico (Dr. Caio) importado."
                : "Interruptor desligado: a foto exibida é a do CEO."}
            </p>
            <Input ref={arquivo} type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" className="field-engraved min-h-10"
              onChange={(e) => void enviarFoto(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground"><Upload className="inline w-3 h-3 mr-1" />Foto própria do CEO (JPEG ou PNG, até 2 MB). Ela aparece quando o Profissional Médico estiver desligado.</p>
          </div>
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
            <Retrato url={fotoMedico} vazio="Médico sem foto no Corpo Clínico" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
              <FieldRow label="Nome completo"><Input readOnly className="field-engraved" value={id.medico.nome} /></FieldRow>
              <FieldRow label="CRM"><Input readOnly className="field-engraved" value={id.medico.crm ?? ""} /></FieldRow>
              <FieldRow label="Especialidade"><Input readOnly className="field-engraved" value={id.medico.especialidade ?? ""} /></FieldRow>
              <FieldRow label="CPF (final)"><Input readOnly className="field-engraved" value={id.medico.cpfFinal ?? ""} /></FieldRow>
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
                    {daClinica(c.empresaId).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </FieldRow>
                <FieldRow label="Responsável técnico (médico)">
                  <select className={campo} value={c.responsavelTecnicoId ?? ""} onChange={(e) => void responsavel(c.empresaId, "responsavelTecnicoId", e.target.value)}>
                    <option value="">Não definido</option>
                    {daClinica(c.empresaId).filter((p) => p.tipo === "medico").map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
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
