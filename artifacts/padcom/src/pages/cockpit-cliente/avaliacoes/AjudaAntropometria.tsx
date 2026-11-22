import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { BotaoAjuda } from "../BotaoAjuda";
import { FAIXAS_IMC } from "./classificacaoImc";
import { CONFERIDO_EM, medidaDaMetrica, referenciasDaMedida, type Referencia } from "./referenciasAntropometria";

type FaixaPeso = { key: string; name: string; color: string; texto: string };

function ListaReferencias({ titulo, itens }: { titulo: string; itens: Referencia[] }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">{titulo}</p>
      <ul className="space-y-2">
        {itens.map((r) => (
          <li key={r.id} className="concave-3d p-3">
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-2">{r.titulo}</a>
            {r.maisRecente && <span className="bevel-3d ml-2 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest">Mais recente</span>}
            <p className="mt-1 text-xs text-muted-foreground">{r.orgao} · {r.ano}</p>
            <p className="mt-1 text-xs">{r.paraQue}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TabelaFaixas({ cabecalho, linhas }: { cabecalho: [string, string]; linhas: { key: string; name: string; color: string; texto: string }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="pn-tab w-full">
        <thead><tr><th className="text-left">{cabecalho[0]}</th><th>{cabecalho[1]}</th></tr></thead>
        <tbody>{linhas.map((faixa) => (
          <tr key={faixa.key}><td className="text-left"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: faixa.color }} /> {faixa.name}</td><td>{faixa.texto}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function AjudaAntropometria({ nome, metrica, faixasPeso, alturaCm, adulto, escuro }: {
  nome: string; metrica: string; faixasPeso: FaixaPeso[] | null; alturaCm: number | null; adulto: boolean; escuro: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const telaCheia = document.fullscreenElement;
  const destino = aberto ? (telaCheia instanceof HTMLElement ? telaCheia : document.querySelector<HTMLElement>(".tela-cheia-fallback")) : null;
  const medida = medidaDaMetrica(metrica);
  const { nacionais, internacionais } = referenciasDaMedida(medida);
  const imc = metrica === "imc";
  const peso = metrica === "peso";
  return (
    <>
      <BotaoAjuda aberto={aberto} onClick={() => setAberto(true)} rotulo={nome} />
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className={`${escuro ? "dark " : ""}pn-escopo !top-[6vh] !translate-y-0 max-h-[88vh] w-[min(94vw,640px)] max-w-none overflow-y-auto border border-border bg-background p-5 text-foreground`}>
          <div className="pr-8">
            <DialogTitle className="text-base font-black uppercase tracking-wide">Como interpretar: {nome}</DialogTitle>
            <DialogDescription className="mt-1 text-xs text-muted-foreground">Orientações para a conversa clínica.</DialogDescription>
          </div>
          <div className="space-y-4 text-sm">
            {imc ? (
              <>
                <p>O índice de massa corporal relaciona peso e altura: peso em quilogramas dividido pela altura em metros ao quadrado. Não mede diretamente a gordura corporal.</p>
                <TabelaFaixas cabecalho={["Classificação geral de adultos", "Índice em kg/m²"]} linhas={[...FAIXAS_IMC]} />
              </>
            ) : peso ? (
              <>
                <p>O gráfico compara os valores registrados de peso ao longo do tempo. Use a mesma técnica de medição em cada avaliação.</p>
                {faixasPeso ? (
                  <>
                    <p>As faixas coloridas são as faixas do índice de massa corporal convertidas em quilos para a altura de {alturaCm?.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cm (peso = índice × altura × altura).</p>
                    <TabelaFaixas cabecalho={["Classificação geral de adultos", "Peso em kg"]} linhas={faixasPeso} />
                  </>
                ) : (
                  <p>As faixas coloridas do peso não aparecem agora porque exigem adulto (18 anos ou mais) em todas as medições, nascimento cadastrado e uma única altura registrada.{adulto ? "" : " Verifique o nascimento e a idade em cada medição."}</p>
                )}
              </>
            ) : (
              <>
                <p>O gráfico compara os valores registrados de {nome.toLowerCase()} ao longo do tempo. Use a mesma técnica de medição em cada avaliação, no mesmo ponto do corpo e com a fita sem apertar a pele.</p>
                <p>Esta medida não tem faixa colorida no gráfico. O gráfico não classifica o resultado como normal ou alterado; a interpretação depende do contexto clínico. As fontes abaixo trazem os pontos de corte, quando existem.</p>
              </>
            )}
            {(imc || peso) && (
              <p>Estas faixas são uma referência geral, não um diagnóstico. Não se aplicam a menores de 18 anos, à gestação ou à amamentação. A tela não confirma gestação nem amamentação: o profissional deve verificar antes de interpretar. Para pessoas com 60 anos ou mais, o Ministério da Saúde usa pontos de corte próprios (SISVAN), que esta tela ainda não aplica. Em pessoas muito musculosas ou com outras particularidades, individualize e avalie também outras medidas.</p>
            )}
            <ListaReferencias titulo="Referências nacionais" itens={nacionais} />
            <ListaReferencias titulo="Referências internacionais" itens={internacionais} />
            <p className="text-[11px] text-muted-foreground">Endereços conferidos em {CONFERIDO_EM}. Lista mantida em um único arquivo, conforme a regra da ajuda da antropometria.</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
