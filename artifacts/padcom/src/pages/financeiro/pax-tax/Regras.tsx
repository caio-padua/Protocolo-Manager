import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BlockTitle } from "@/components/settings/SettingsUI";
import { Percentual, Valor } from "@/components/numeral/Numeral";
import { ScrollText } from "lucide-react";
import { centavosDeTexto, finApi, type FinRegra } from "@/lib/pax-finance-api";
import { Campo, btnCls, btnSoftCls, campoCls, InputReais } from "../pax-finance-ui";

const ROTULO_STATUS: Record<string, string> = { rascunho: "Rascunho", pendente: "Pendente de aprovação", aprovada: "Aprovada", ativa: "Ativa", substituida: "Substituída" };

export function Regras({ agir }: { agir: (a: { path: string; method?: string; body?: unknown }) => void }) {
  const regras = useQuery({ queryKey: ["fin", "rules"], queryFn: () => finApi<FinRegra[]>("/rules") });
  const [nr, setNr] = useState({ ruleKey: "", tributo: "", esfera: "federal", regime: "", anexo: "", aliquota: "", parcela: "", min: "", max: "", fonteOficial: "", fonteUrl: "", consulta: "", inicio: "" });
  const acoes = (r: FinRegra) => (
    <>
      {r.status === "rascunho" && <button type="button" className={btnSoftCls} onClick={() => agir({ path: `/rules/${r.id}/submit` })}>Enviar para aprovação</button>}
      {r.status === "pendente" && <button type="button" className={btnSoftCls} onClick={() => agir({ path: `/rules/${r.id}/approve` })}>Aprovar</button>}
      {r.status === "aprovada" && <button type="button" className={btnSoftCls} onClick={() => agir({ path: `/rules/${r.id}/activate` })}>Ativar</button>}
    </>
  );
  return (
    <section className="panel-3d p-4" data-testid="fin-regras">
      <BlockTitle icon={ScrollText}>Parâmetros e alíquotas versionados</BlockTitle>
      <p className="mb-3 text-[12px] text-muted-foreground">Nenhuma alíquota ou limite está fixo no sistema. Uma regra só entra em simulação depois de aprovada e ativada, com fonte oficial, endereço e data de consulta. Mudar uma taxa cria uma nova versão; a anterior fica no histórico.</p>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-[12px]">
          <thead><tr className="text-left text-[10px] uppercase text-muted-foreground"><th>Regra</th><th>Versão</th><th>Tributo</th><th>Alíquota</th><th>Deduzir</th><th>Faixa</th><th>Vigência</th><th>Fonte</th><th>Situação</th><th /></tr></thead>
          <tbody>{(regras.data ?? []).map((r) => (
            <tr key={r.id} className="border-t border-border/40 align-top">
              <td>{r.ruleKey}</td><td>v{r.version}</td><td>{r.tributo} ({r.esfera})</td>
              <td><Percentual valor={r.aliquotaPct} casas={2} /></td><td><Valor valor={r.parcelaDeduzirCents == null ? null : r.parcelaDeduzirCents / 100} /></td>
              <td><Valor valor={r.limiteMinCents == null ? null : r.limiteMinCents / 100} semCentavos /> a <Valor valor={r.limiteMaxCents == null ? null : r.limiteMaxCents / 100} semCentavos /></td>
              <td>{r.vigenciaInicio} → {r.vigenciaFim ?? "aberta"}</td>
              <td>{r.fonteUrl ? <a className="underline" href={r.fonteUrl} target="_blank" rel="noreferrer">{r.fonteOficial}</a> : <span className="italic text-muted-foreground">sem fonte</span>}</td>
              <td><b>{ROTULO_STATUS[r.status] ?? r.status}</b></td><td className="whitespace-nowrap">{acoes(r)}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <div className="space-y-2 md:hidden">
        {(regras.data ?? []).map((r) => (
          <div key={r.id} className="panel-3d-sub space-y-1 p-3 text-[12px]">
            <div className="flex justify-between"><b>{r.ruleKey} v{r.version}</b><span>{ROTULO_STATUS[r.status] ?? r.status}</span></div>
            <div>{r.tributo} ({r.esfera}) · alíquota <Percentual valor={r.aliquotaPct} casas={2} /></div>
            <div>Vigência {r.vigenciaInicio} → {r.vigenciaFim ?? "aberta"}</div>
            <div>{r.fonteUrl ? <a className="underline" href={r.fonteUrl} target="_blank" rel="noreferrer">{r.fonteOficial}</a> : <i className="text-muted-foreground">Aguardando verificação (sem fonte)</i>}</div>
            <div className="flex gap-2">{acoes(r)}</div>
          </div>))}
      </div>
      {regras.data?.length === 0 && <p className="text-[12px] italic text-muted-foreground" data-testid="regras-vazio">Nenhuma regra cadastrada: aguardando verificação em fonte oficial. O sistema não traz valores prontos.</p>}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <Campo rotulo="Chave da regra" ajuda="Identificador estável, por exemplo simples.anexo3.faixa1. Nova versão usa a mesma chave."><input className={campoCls} value={nr.ruleKey} onChange={(e) => setNr({ ...nr, ruleKey: e.target.value })} /></Campo>
        <Campo rotulo="Tributo" ajuda="Por exemplo DAS (guia única do Simples Nacional), ISS (imposto municipal sobre serviços) ou FATOR_R."><input className={campoCls} value={nr.tributo} onChange={(e) => setNr({ ...nr, tributo: e.target.value })} /></Campo>
        <Campo rotulo="Regime" ajuda="simples_nacional ou lucro_presumido."><input className={campoCls} value={nr.regime} onChange={(e) => setNr({ ...nr, regime: e.target.value })} /></Campo>
        <Campo rotulo="Anexo" ajuda="Anexo do Simples Nacional, quando houver."><input className={campoCls} value={nr.anexo} onChange={(e) => setNr({ ...nr, anexo: e.target.value })} /></Campo>
        <Campo rotulo="Esfera" ajuda="Quem arrecada."><select className={campoCls} value={nr.esfera} onChange={(e) => setNr({ ...nr, esfera: e.target.value })}><option value="federal">Federal</option><option value="estadual">Estadual</option><option value="municipal">Municipal</option></select></Campo>
        <Campo rotulo="Alíquota (%)" ajuda="Alíquota nominal conforme a fonte."><input className={campoCls} value={nr.aliquota} onChange={(e) => setNr({ ...nr, aliquota: e.target.value })} /></Campo>
        <Campo rotulo="Parcela a deduzir (R$)" ajuda="Valor a deduzir conforme a fonte."><InputReais className={campoCls} value={nr.parcela} onChange={(e) => setNr({ ...nr, parcela: e.target.value })} /></Campo>
        <Campo rotulo="Faixa de (R$)" ajuda="Limite inferior da faixa de receita."><InputReais className={campoCls} value={nr.min} onChange={(e) => setNr({ ...nr, min: e.target.value })} /></Campo>
        <Campo rotulo="Faixa até (R$)" ajuda="Limite superior da faixa."><InputReais className={campoCls} value={nr.max} onChange={(e) => setNr({ ...nr, max: e.target.value })} /></Campo>
        <Campo rotulo="Fonte oficial" ajuda="Nome da norma ou órgão."><input className={campoCls} value={nr.fonteOficial} onChange={(e) => setNr({ ...nr, fonteOficial: e.target.value })} /></Campo>
        <Campo rotulo="Endereço da fonte" ajuda="Link da norma publicada."><input className={campoCls} value={nr.fonteUrl} onChange={(e) => setNr({ ...nr, fonteUrl: e.target.value })} /></Campo>
        <Campo rotulo="Consultada em" ajuda="Data da consulta."><input className={campoCls} type="date" value={nr.consulta} onChange={(e) => setNr({ ...nr, consulta: e.target.value })} /></Campo>
        <Campo rotulo="Vigência desde" ajuda="Início da vigência."><input className={campoCls} type="date" value={nr.inicio} onChange={(e) => setNr({ ...nr, inicio: e.target.value })} /></Campo>
      </div>
      <button type="button" className={`${btnCls} mt-3`} data-testid="fin-add-regra" onClick={() => agir({ path: "/rules", body: {
        ruleKey: nr.ruleKey, tributo: nr.tributo, esfera: nr.esfera, regime: nr.regime || null, anexo: nr.anexo || null, aliquotaPct: nr.aliquota ? Number(nr.aliquota.replace(",", ".")) : null,
        parcelaDeduzirCents: centavosDeTexto(nr.parcela), limiteMinCents: centavosDeTexto(nr.min), limiteMaxCents: centavosDeTexto(nr.max),
        fonteOficial: nr.fonteOficial || null, fonteUrl: nr.fonteUrl || null, fonteConsultadaEm: nr.consulta || null, vigenciaInicio: nr.inicio } })}>Criar rascunho de regra</button>
    </section>
  );
}
