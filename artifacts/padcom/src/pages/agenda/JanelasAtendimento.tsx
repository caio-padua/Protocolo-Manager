import { useMemo } from "react";
import { Plus, Trash2, Clock, Copy, CalendarCheck2, Repeat } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Registro } from "@/components/MarcadorVinculo";
import {
  INTERVALOS, MENSAIS, NOME_DIA, dataInicialValida, exigeDataInicial,
  proximaDataDoDia, proximasDatas, rotuloRepeticao,
} from "@/lib/agenda-repeticao";

export type Faixa = { startTime: string; endTime: string; repeatWeeks: number; anchorDate: string };
export type JanelasRascunho = Record<number, Faixa[]>;

const DIA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const ORDEM = [1, 2, 3, 4, 5, 6, 0];
const DIAS_UTEIS = [2, 3, 4, 5];

const textoFaixas = (n: number) => (n === 0 ? "Fechado" : n === 1 ? "1 faixa" : `${n} faixas`);

/**
 * Janelas de atendimento da agenda: uma linha larga por dia da semana.
 * Cada faixa é um poço Côncavo com horário, repetição e o botão Excluir sempre visível;
 * as alterações ficam em rascunho até o botão Salvar Janelas.
 */
export function JanelasAtendimento({ rascunho, onChange, desabilitado }: {
  rascunho: JanelasRascunho;
  onChange: (proximo: JanelasRascunho) => void;
  desabilitado?: boolean;
}) {
  const resumo = useMemo(() => {
    const dias = ORDEM.filter((d) => (rascunho[d] ?? []).length > 0).length;
    const faixas = ORDEM.reduce((n, d) => n + (rascunho[d] ?? []).length, 0);
    return { dias, faixas };
  }, [rascunho]);

  const trocarFaixa = (dia: number, idx: number, parte: Partial<Faixa>) =>
    onChange({ ...rascunho, [dia]: (rascunho[dia] ?? []).map((f, i) => (i === idx ? { ...f, ...parte } : f)) });
  const adicionar = (dia: number) => {
    const lista = rascunho[dia] ?? [];
    const ultima = lista[lista.length - 1];
    const nova: Faixa = ultima && ultima.endTime < "20:00"
      ? { startTime: ultima.endTime, endTime: `${String(Math.min(23, Number(ultima.endTime.slice(0, 2)) + 2)).padStart(2, "0")}:${ultima.endTime.slice(3)}`, repeatWeeks: 1, anchorDate: "" }
      : { startTime: "08:00", endTime: "12:00", repeatWeeks: 1, anchorDate: "" };
    onChange({ ...rascunho, [dia]: [...lista, nova] });
  };
  const excluir = (dia: number, idx: number) =>
    onChange({ ...rascunho, [dia]: (rascunho[dia] ?? []).filter((_, i) => i !== idx) });
  const trocarRepeticao = (dia: number, idx: number, codigo: number) =>
    trocarFaixa(dia, idx, {
      repeatWeeks: codigo,
      // data inicial nasce preenchida (próxima ocorrência do dia): ninguém precisa digitar
      anchorDate: exigeDataInicial(codigo) ? (rascunho[dia]?.[idx]?.anchorDate || proximaDataDoDia(dia)) : "",
    });
  const replicarSegunda = () => {
    const base = rascunho[1] ?? [];
    const proximo = { ...rascunho };
    for (const d of DIAS_UTEIS) proximo[d] = base.map((f) => ({ ...f, anchorDate: exigeDataInicial(f.repeatWeeks) ? proximaDataDoDia(d) : "" }));
    onChange(proximo);
  };

  return (
    <fieldset disabled={desabilitado} className="space-y-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="concave-3d inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
          <CalendarCheck2 className="h-3.5 w-3.5 text-primary" />
          {resumo.dias === 0 ? "Nenhum dia com atendimento" : `${resumo.dias} ${resumo.dias === 1 ? "dia" : "dias"} com atendimento · ${resumo.faixas} ${resumo.faixas === 1 ? "faixa" : "faixas"}`}
        </span>
        <button
          type="button"
          onClick={replicarSegunda}
          disabled={(rascunho[1] ?? []).length === 0}
          className="btn-3d-soft inline-flex h-8 items-center gap-1.5 px-3 text-[11px] font-bold uppercase tracking-wide disabled:opacity-40"
        >
          <Copy className="h-3.5 w-3.5" /> Copiar segunda para terça a sexta
        </button>
      </div>

      {ORDEM.map((dia) => {
        const faixas = rascunho[dia] ?? [];
        return (
          <div key={dia} className="panel-3d-sub p-3 grid gap-3 md:grid-cols-[112px_minmax(0,1fr)]" data-dia-semana={dia}>
            <div className="flex md:flex-col items-center md:items-stretch gap-2">
              <span className="bevel-3d inline-flex items-center justify-center px-3 py-2 text-sm font-black uppercase tracking-widest text-primary">
                {DIA_CURTO[dia]}
              </span>
              <span className={`text-[10px] font-semibold uppercase tracking-wide md:text-center ${faixas.length ? "text-foreground" : "text-muted-foreground"}`}>
                {textoFaixas(faixas.length)}
              </span>
            </div>

            <div className="space-y-2 min-w-0">
              {faixas.length === 0 && (
                <p className="concave-3d px-3 py-2.5 text-xs text-muted-foreground">
                  Sem atendimento neste dia. Use “Adicionar faixa” para abrir um horário.
                </p>
              )}
              {faixas.map((f, idx) => {
                const precisaData = exigeDataInicial(f.repeatWeeks);
                const dataRuim = precisaData && !dataInicialValida(f.anchorDate, dia);
                const datas = f.repeatWeeks !== 1 && !dataRuim ? proximasDatas(f, dia) : [];
                return (
                  <div key={idx} className="concave-3d relative p-2.5 pt-3 space-y-2">
                    <Registro codigo="J1" nota={`${NOME_DIA[dia]}, faixa ${idx + 1}`} />
                    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Início
                        <Input type="time" className="field-engraved mt-1 h-9 w-[7.5rem] px-2 text-sm"
                          value={f.startTime} onChange={(e) => trocarFaixa(dia, idx, { startTime: e.target.value })} />
                      </label>
                      <span className="pb-2 text-muted-foreground" aria-hidden="true">até</span>
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Fim
                        <Input type="time" className="field-engraved mt-1 h-9 w-[7.5rem] px-2 text-sm"
                          value={f.endTime} onChange={(e) => trocarFaixa(dia, idx, { endTime: e.target.value })} />
                      </label>
                      <label className="min-w-[12rem] flex-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Repeat className="h-3 w-3" /> Repetição</span>
                        <select
                          className="field-engraved mt-1 h-9 w-full rounded px-2 text-sm normal-case tracking-normal text-foreground"
                          value={f.repeatWeeks}
                          onChange={(e) => trocarRepeticao(dia, idx, Number(e.target.value))}
                        >
                          <option value={1}>{rotuloRepeticao(1, dia)}</option>
                          <optgroup label="A cada algumas semanas">
                            {INTERVALOS.map((n) => <option key={n} value={n}>{rotuloRepeticao(n, dia)}</option>)}
                          </optgroup>
                          <optgroup label={`Dentro do mês (${NOME_DIA[dia]})`}>
                            {MENSAIS.map((n) => <option key={n} value={n}>{rotuloRepeticao(n, dia)}</option>)}
                          </optgroup>
                        </select>
                      </label>
                      {precisaData && (
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Primeiro dia de atendimento
                          <Input type="date" aria-invalid={dataRuim}
                            className={`field-engraved mt-1 h-9 w-[10.5rem] px-2 text-sm ${dataRuim ? "ring-2 ring-destructive" : ""}`}
                            value={f.anchorDate} onChange={(e) => trocarFaixa(dia, idx, { anchorDate: e.target.value })} />
                        </label>
                      )}
                      <button
                        type="button"
                        onClick={() => excluir(dia, idx)}
                        className="btn-3d-soft ml-auto inline-flex h-9 items-center gap-1.5 px-3 text-[11px] font-bold uppercase tracking-wide text-destructive"
                        aria-label={`Excluir faixa das ${f.startTime} às ${f.endTime} de ${NOME_DIA[dia]}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                      </button>
                    </div>
                    {dataRuim && (
                      <p className="text-[11px] font-semibold text-destructive" role="alert">
                        Escolha uma data que caia numa {NOME_DIA[dia]}.
                      </p>
                    )}
                    {datas.length > 0 && (
                      <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" /> Próximas datas:
                        {datas.map((d) => <b key={d} className="bevel-3d px-1.5 py-0.5 text-[10px] text-foreground">{d}</b>)}
                      </p>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => adicionar(dia)}
                className="btn-3d-soft inline-flex h-8 items-center gap-1.5 px-3 text-[11px] font-bold uppercase tracking-wide"
                aria-label={`Adicionar faixa em ${NOME_DIA[dia]}`}
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar faixa
              </button>
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
