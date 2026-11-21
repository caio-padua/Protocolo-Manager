import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { BlockTitle } from "@/components/settings/SettingsUI";
import { finApi } from "@/lib/pax-finance-api";
import { Campo, btnCls, btnSoftCls, campoCls } from "../pax-finance-ui";

type Tipo = "beneficiario_final" | "controle_efetivo" | "parte_relacionada";
type Via = "direta" | "indireta" | "contrato" | "procuracao" | "familiar" | "mesmo_grupo" | "administrador_de_fato";
type Parte = { id: number; tipo: Tipo; nome: string; tipoPessoa: "fisica" | "juridica"; cnpj: string | null; participacaoBp: number | null; via: Via; fonteDocumento: string | null; observacao: string | null; statusValidacao: "rascunho" | "validado"; encerradaEm: string | null };
type Achado = { codigo: string; gravidade: "pendencia" | "alerta" | "info"; titulo: string; detalhe: string };
type Resp = { entidadeId: number; razaoSocial: string; partes: Parte[]; parecer: { achados: Achado[]; pendencias: number; alertas: number; bloqueiaRoteador: boolean; motivoBloqueio: string | null; totais: { beneficiariosFinais: number; controleEfetivo: number; partesRelacionadas: number } } };

const TIPO: Record<Tipo, string> = { beneficiario_final: "Beneficiário final", controle_efetivo: "Controle efetivo", parte_relacionada: "Parte relacionada" };
const AJUDA_TIPO: Record<Tipo, string> = {
  beneficiario_final: "Pessoa física que, direta ou indiretamente, é dona ou controla a empresa. É sempre uma pessoa, nunca outra empresa.",
  controle_efetivo: "Quem decide de fato os rumos da empresa, mesmo sem constar no contrato social.",
  parte_relacionada: "Pessoa ou empresa ligada aos sócios (parente, outra empresa do mesmo sócio, mesmo grupo). Serve para transparência e análise do contador.",
};
const VIA: Record<Via, string> = { direta: "Participação direta", indireta: "Participação indireta (por outra empresa)", contrato: "Controle por contrato ou acordo", procuracao: "Procuração com poderes amplos", familiar: "Parentesco com sócio ou administrador", mesmo_grupo: "Mesmo grupo econômico", administrador_de_fato: "Administra de fato, sem constar no contrato" };
const VAZIO = { tipo: "beneficiario_final" as Tipo, nome: "", tipoPessoa: "fisica" as "fisica" | "juridica", cnpj: "", part: "", via: "direta" as Via, fonte: "", obs: "" };

/** Conformidade societaria da empresa selecionada. Transparencia e bloqueio do Roteador: nunca orienta dividir receita. */
export function Conformidade({ entidadeId }: { entidadeId: number }) {
  const qc = useQueryClient();
  const [f, setF] = useState(VAZIO);
  const [edit, setEdit] = useState<number | null>(null);
  const [erro, setErro] = useState("");
  const q = useQuery({ queryKey: ["fin", "compliance", entidadeId], queryFn: () => finApi<Resp>(`/entities/${entidadeId}/compliance`) });
  const agir = useMutation({
    mutationFn: (a: { path: string; method?: string; body?: unknown }) => finApi(a.path, { method: a.method ?? "POST", body: a.body ?? {} }),
    onSuccess: () => { setErro(""); setF(VAZIO); setEdit(null); void qc.invalidateQueries({ queryKey: ["fin", "compliance"] }); },
    onError: (e: Error) => setErro(e.message),
  });
  const d = q.data;
  const corpo = () => ({
    tipo: f.tipo, nome: f.nome, tipoPessoa: f.tipoPessoa, cnpj: f.tipoPessoa === "juridica" ? f.cnpj : null,
    participacaoBp: f.part.trim() ? Math.round(Number(f.part.replace(",", ".")) * 100) : null, via: f.via, fonteDocumento: f.fonte.trim() || null, observacao: f.obs.trim() || null,
  });
  const salvar = () => (edit ? agir.mutate({ path: `/compliance/parties/${edit}`, method: "PUT", body: corpo() }) : agir.mutate({ path: `/entities/${entidadeId}/compliance/parties`, body: corpo() }));
  const carregar = (p: Parte) => { setEdit(p.id); setF({ tipo: p.tipo, nome: p.nome, tipoPessoa: p.tipoPessoa, cnpj: p.cnpj ?? "", part: p.participacaoBp === null ? "" : String(p.participacaoBp / 100).replace(".", ","), via: p.via, fonte: p.fonteDocumento ?? "", obs: p.observacao ?? "" }); };

  return (
    <section className="panel-3d p-4 space-y-3" data-testid="tax-conformidade">
      <BlockTitle icon={ShieldCheck}>Conformidade societária: beneficiário final e partes relacionadas</BlockTitle>
      <p className="text-[12px] text-muted-foreground">Esta área serve para transparência. Ela bloqueia o Roteador de Serviços quando falta cadastro e nunca indica dividir receita, emitir nota por outra empresa nem colocar terceiros como titulares. Não digite CPF nem RG.</p>
      {erro && <p role="alert" className="text-[12px] font-bold text-destructive">{erro}</p>}
      {q.isLoading || !d ? <p role="status" className="text-[12px]">Carregando…</p> : (<>
        <div className={`rounded p-3 text-[12px] font-bold ${d.parecer.bloqueiaRoteador ? "bevel-3d paxter-alert" : "bevel-3d-ok"}`} data-testid="conf-parecer">
          {d.parecer.bloqueiaRoteador ? `Roteador BLOQUEADO. ${d.parecer.motivoBloqueio}` : "Cadastro societário sem pendências: o Roteador pode ser usado (alertas, se houver, continuam valendo)."}
        </div>
        <ul className="space-y-1.5 text-[12px]">
          {d.parecer.achados.map((a) => (
            <li key={a.codigo} className="panel-3d-sub p-2" data-testid="conf-achado"><b>{a.gravidade === "pendencia" ? "PENDÊNCIA" : "ALERTA"}:</b> {a.titulo}<br /><span className="text-muted-foreground">{a.detalhe}</span></li>))}
        </ul>

        <div className="space-y-2">
          {d.partes.length === 0 && <p className="text-[12px] italic text-muted-foreground">Nenhum registro cadastrado.</p>}
          {d.partes.map((p) => (
            <div key={p.id} className={`panel-3d-sub flex flex-wrap items-center justify-between gap-2 p-3 text-[12px] ${p.encerradaEm ? "opacity-60" : ""}`} data-testid="conf-parte">
              <div><b>{p.nome}</b> · {TIPO[p.tipo]}<br /><span className="text-muted-foreground">{VIA[p.via]}{p.participacaoBp !== null ? ` · ${(p.participacaoBp / 100).toLocaleString("pt-BR")}%` : ""}{p.cnpj ? ` · CNPJ ${p.cnpj}` : ""} · {p.encerradaEm ? "encerrado" : p.statusValidacao === "validado" ? "validado" : "rascunho"}{p.fonteDocumento ? ` · fonte: ${p.fonteDocumento}` : " · sem documento de origem"}</span></div>
              {!p.encerradaEm && <div className="flex flex-wrap gap-2">
                <button type="button" className={btnSoftCls} onClick={() => carregar(p)}>Editar</button>
                {p.statusValidacao !== "validado" && <button type="button" className={btnSoftCls} onClick={() => agir.mutate({ path: `/compliance/parties/${p.id}/validate` })}>Validar</button>}
                <button type="button" className={btnSoftCls} onClick={() => agir.mutate({ path: `/compliance/parties/${p.id}/end` })}>Encerrar vínculo</button>
              </div>}
            </div>))}
        </div>

        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-3">
          <Campo rotulo="Tipo" ajuda={AJUDA_TIPO[f.tipo]}><select className={campoCls} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as Tipo, tipoPessoa: e.target.value === "beneficiario_final" ? "fisica" : f.tipoPessoa })}>{Object.entries(TIPO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          <Campo rotulo="Nome" ajuda="Nome da pessoa ou razão social. Nunca digite CPF, RG ou endereço."><input className={campoCls} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
          <Campo rotulo="Pessoa" ajuda="Beneficiário final é sempre pessoa física."><select className={campoCls} value={f.tipoPessoa} disabled={f.tipo === "beneficiario_final"} onChange={(e) => setF({ ...f, tipoPessoa: e.target.value as "fisica" | "juridica" })}><option value="fisica">Pessoa física</option><option value="juridica">Empresa (CNPJ)</option></select></Campo>
          {f.tipoPessoa === "juridica" && <Campo rotulo="CNPJ da empresa" ajuda="Os dígitos verificadores são conferidos."><input className={campoCls} value={f.cnpj} onChange={(e) => setF({ ...f, cnpj: e.target.value })} /></Campo>}
          <Campo rotulo="Como se liga à empresa" ajuda="Forma do vínculo ou do controle."><select className={campoCls} value={f.via} onChange={(e) => setF({ ...f, via: e.target.value as Via })}>{Object.entries(VIA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          <Campo rotulo="Participação (%)" ajuda="Opcional. Deixe vazio se não houver participação no capital."><input className={campoCls} inputMode="decimal" value={f.part} onChange={(e) => setF({ ...f, part: e.target.value })} /></Campo>
          <Campo rotulo="Documento de origem" ajuda="Obrigatório para validar. Exemplo: contrato social, 1ª alteração, declaração assinada."><input className={campoCls} value={f.fonte} onChange={(e) => setF({ ...f, fonte: e.target.value })} /></Campo>
          <Campo rotulo="Observação" ajuda="Texto livre, sem dados pessoais."><input className={campoCls} value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })} /></Campo>
          <div className="flex gap-2"><button type="button" className={btnCls} disabled={agir.isPending || f.nome.trim().length < 2} onClick={salvar}>{edit ? "Salvar alteração" : "Cadastrar"}</button>{edit && <button type="button" className={btnSoftCls} onClick={() => { setEdit(null); setF(VAZIO); }}>Cancelar edição</button>}</div>
        </div>
      </>)}
    </section>
  );
}
