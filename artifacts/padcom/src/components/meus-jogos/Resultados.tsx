import { Loader2, RefreshCw } from "lucide-react";
import { brData, brDataHora, dz, type ResultadosModalidade } from "./tipos";

// Ultimos 5 resultados da modalidade escolhida, lidos da fonte publica da CAIXA pelo servidor.
// Nunca mostra dado inventado: falha = "Resultados indisponíveis", dado antigo = "Desatualizado" com o horario real da ultima leitura.
export default function Resultados({ dados, carregando, erro, onAtualizar }: {
  dados: ResultadosModalidade | undefined; carregando: boolean; erro: string; onAtualizar: () => void;
}) {
  return (
    <section className="space-y-3" aria-label="Últimos resultados oficiais" data-testid="mj-resultados">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-primary text-xs font-black uppercase tracking-widest">Últimos 5 resultados</h3>
        <button type="button" onClick={onAtualizar} disabled={carregando} className="btn-3d-soft min-h-[44px] px-3 text-[11px] font-black uppercase tracking-wider inline-flex items-center gap-2 disabled:opacity-60">
          {carregando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-4 h-4" aria-hidden="true" />} Atualizar
        </button>
      </div>
      {erro && <p role="alert" className="concave-3d rounded-lg px-3 py-2 text-xs text-red-700 dark:text-red-300">{erro}</p>}
      {!dados && !erro && <p className="concave-3d rounded-lg px-3 py-3 text-xs text-muted-foreground text-center">Carregando resultados…</p>}
      {dados && (
        <>
          <p className="text-[11px] text-muted-foreground leading-snug" data-testid="mj-resultados-estado" data-estado={dados.estado}>
            {dados.estado === "ok" && <>Fonte: {dados.fonte}. Atualizado em {dados.atualizadoEm ? brDataHora(dados.atualizadoEm) : "—"}.</>}
            {dados.estado === "desatualizado" && <><strong className="text-amber-700 dark:text-amber-300">Desatualizado.</strong> A última leitura bem-sucedida da fonte oficial foi em {dados.atualizadoEm ? brDataHora(dados.atualizadoEm) : "—"}; a tentativa mais recente falhou.</>}
            {dados.estado === "indisponivel" && <><strong className="text-red-700 dark:text-red-300">Resultados indisponíveis.</strong> A fonte oficial não respondeu{dados.ultimaTentativaEm ? ` (tentativa em ${brDataHora(dados.ultimaTentativaEm)})` : ""}. Nenhum resultado é exibido sem confirmação da fonte.</>}
          </p>
          <ol className="space-y-2">
            {dados.itens.map((r) => (
              <li key={r.concurso} className="panel-3d-sub rounded-xl p-3" data-testid="mj-resultado">
                <p className="text-primary text-xs font-black">Concurso {r.concurso} <span className="text-muted-foreground font-semibold">· {brData(r.data)}</span></p>
                <div className="flex flex-wrap gap-1.5 mt-2" aria-label={`Dezenas sorteadas: ${r.dezenas.map(dz).join(", ")}`}>
                  {r.dezenas.map((d) => <span key={d} className="mj-bola-resultado" aria-hidden="true">{dz(d)}</span>)}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
