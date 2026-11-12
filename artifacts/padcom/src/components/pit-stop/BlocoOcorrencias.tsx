import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtData, fmtDataHora, fmtDiferenca, fmtDias } from "@/lib/pit-stop-formato";
import { motivoLegivel, type AjusteOcorrencia, type ItemPlano, type Ocorrencia, type ResultadoOcorrencia } from "@/lib/pit-stop-api";
import { Selo } from "./Selo";

/**
 * Visitas de um procedimento em cartões EXPANSÍVEIS. O resumo fica sempre visível (data sugerida, diferença da nominal,
 * intervalo e situação); os campos de edição só aparecem ao expandir. "Alterar data/hora" é o caminho acessível de mover:
 * abre a prévia validada no servidor, a mesma que o arrastar/soltar do calendário usa.
 */
export function BlocoOcorrencias({ item, enderecoPaciente, travado, resultados, onSalvar, salvando, onAlterar, expandirId }: {
  item: ItemPlano; enderecoPaciente: string | null; travado: boolean; resultados: ResultadoOcorrencia[]; salvando: boolean;
  onSalvar: (ajustes: AjusteOcorrencia[]) => void; onAlterar: (ocId: number) => void; expandirId?: number | null;
}) {
  const original = useMemo(() => Object.fromEntries(item.ocorrencias.map((o) => [o.id, { data: o.data ?? "", hora: o.hora ?? "", endereco: o.enderecoVisita ?? "", doPaciente: false }])), [item.ocorrencias]);
  const [valores, setValores] = useState(original);
  useEffect(() => setValores(original), [original]);
  const [abertas, setAbertas] = useState<ReadonlySet<number>>(new Set());
  const alternar = (id: number) => setAbertas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  useEffect(() => { if (expandirId) setAbertas((s) => new Set(s).add(expandirId)); }, [expandirId]);

  const mudou = (o: Ocorrencia) => {
    const v = valores[o.id], x = original[o.id];
    return v?.data !== x?.data || v?.hora !== x?.hora || (item.homeCare && (v?.endereco !== x?.endereco || v?.doPaciente));
  };
  const alteradas = item.ocorrencias.filter(mudou);
  const montar = (o: Ocorrencia): AjusteOcorrencia => {
    const v = valores[o.id]!;
    const base: AjusteOcorrencia = { id: o.id, data: v.data || null, hora: v.hora || null };
    if (!item.homeCare) return base;
    if (v.doPaciente) return { ...base, usarEnderecoPaciente: true };
    if (v.endereco.trim() && v.endereco !== original[o.id]?.endereco) return { ...base, enderecoVisita: v.endereco.trim() };
    return base;
  };
  return (
    <div className="space-y-2">
      {item.ocorrencias.map((o) => {
        const res = resultados.find((r) => r.itemId === item.id && r.numero === o.numero);
        const v = valores[o.id];
        const av = o.avaliacao;
        const problema = (res && !res.ok) || !o.data || (av && (av.abaixoDoMinimo || !av.naOrdem));
        const aberta = abertas.has(o.id) || !!problema || mudou(o);
        const painel = `oc-${o.id}-detalhe`;
        return (
          <div key={o.id} className="concave-3d" data-testid={`ocorrencia-${o.id}`} data-aberta={aberta ? "sim" : "nao"}>
            <button type="button" className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left" aria-expanded={aberta} aria-controls={painel}
              onClick={() => alternar(o.id)} data-testid={`ocorrencia-resumo-${o.id}`}>
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${aberta ? "rotate-180" : ""}`} aria-hidden />
              <span className="text-xs font-black">{o.numero}/{item.totalSessoes}</span>
              <span className="text-xs font-bold">{fmtDataHora(o.data, o.hora)}</span>
              {o.reservada && <Selo tom="ok">Reservada</Selo>}
              {o.encaixe && <Selo tom="neutro">Encaixe hoje</Selo>}
              {!o.reservada && !o.encaixe && o.data && <Selo tom="neutro">{o.origem === "manual" ? "Escolhida" : "Sugerida"}</Selo>}
              {!o.data && <Selo tom="aviso">{motivoLegivel(o.motivo, "Sem data")}</Selo>}
              {av?.foraDaJanela && <Selo tom="aviso">Fora da janela</Selo>}
              {av && !av.naOrdem && <Selo tom="erro">Fora de ordem</Selo>}
              {av?.abaixoDoMinimo && <Selo tom="erro">Abaixo do intervalo mínimo</Selo>}
              {av && o.data && (
                <span className="w-full pl-7 text-[11px] text-muted-foreground">
                  Nominal {fmtData(av.dataNominal)} · {fmtDiferenca(av.diferencaDias)} · intervalo da anterior {fmtDias(av.intervaloAnterior)} (mínimo {fmtDias(av.intervaloMinimo)})
                </span>
              )}
            </button>
            {aberta && (
              <div id={painel} className="flex flex-wrap items-end gap-3 border-t border-black/10 p-3">
                <label className="text-[11px] font-bold">Data
                  <input type="date" className="field-engraved mt-1 block min-h-10 px-2" disabled={travado || o.reservada} value={v?.data ?? ""}
                    onChange={(e) => setValores((all) => ({ ...all, [o.id]: { ...all[o.id]!, data: e.target.value } }))} />
                </label>
                <label className="text-[11px] font-bold">Hora
                  <input type="time" step={900} className="field-engraved mt-1 block min-h-10 px-2" disabled={travado || o.reservada} value={v?.hora ?? ""}
                    onChange={(e) => setValores((all) => ({ ...all, [o.id]: { ...all[o.id]!, hora: e.target.value } }))} />
                </label>
                <Button type="button" variant="outline" size="sm" disabled={travado || o.reservada} onClick={() => onAlterar(o.id)}
                  aria-label={`Alterar data e hora da sessão ${o.numero} de ${item.totalSessoes}, ${item.nome}`} data-testid={`alterar-${o.id}`}>
                  <CalendarClock className="mr-1 h-4 w-4" />Alterar data/hora
                </Button>
                {res && !res.ok && <span role="alert" className="text-xs font-bold text-red-800">{motivoLegivel(res.code, res.message)}</span>}
                {res?.ok && <span className="text-xs font-bold text-green-800">Horário livre para a equipe inteira.</span>}
                {item.homeCare && (
                  <div className="w-full space-y-1" data-testid={`endereco-visita-${o.id}`}>
                    <label className="block text-[11px] font-bold">Endereço da visita (Home Care)
                      <input type="text" maxLength={300} className="field-engraved mt-1 block min-h-10 w-full px-2" placeholder="Rua, número, complemento, bairro, cidade"
                        disabled={travado || o.reservada} value={v?.doPaciente ? enderecoPaciente ?? "" : v?.endereco ?? ""}
                        onChange={(e) => setValores((all) => ({ ...all, [o.id]: { ...all[o.id]!, endereco: e.target.value, doPaciente: false } }))} />
                    </label>
                    {!travado && !o.reservada && (
                      <button type="button" className="text-[11px] font-bold underline disabled:opacity-50" disabled={!enderecoPaciente}
                        onClick={() => setValores((all) => ({ ...all, [o.id]: { ...all[o.id]!, doPaciente: true } }))}>
                        {enderecoPaciente ? "Usar o endereço cadastrado do paciente" : "Paciente sem endereço cadastrado: informe o endereço da visita"}
                      </button>
                    )}
                    {o.enderecoVisita
                      ? <p className="text-[10px] text-muted-foreground">Gravado: {o.enderecoVisita} ({o.enderecoVisitaOrigem === "paciente" ? "copiado do cadastro do paciente" : "informado pela recepção"}).</p>
                      : <Selo tom="aviso">Endereço pendente: sem ele a visita Home Care não é reservada</Selo>}
                  </div>
                )}
                {o.visitas.length > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    {o.visitas.map((x) => `${x.agenda ?? "agenda"}: ${x.pendente ? "pendência no Google" : x.googleEventId ? "no Google" : "ainda não enviada"}`).join(" · ")}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
      {!travado && alteradas.length > 0 && (
        <Button type="button" size="sm" disabled={salvando} onClick={() => onSalvar(alteradas.map(montar))}>
          Salvar datas{item.homeCare ? " e endereços" : ""}
        </Button>
      )}
    </div>
  );
}
