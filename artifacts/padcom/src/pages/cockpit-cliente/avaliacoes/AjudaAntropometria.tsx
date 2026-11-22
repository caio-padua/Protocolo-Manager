import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { BotaoAjuda } from "../BotaoAjuda";
import { FAIXAS_IMC } from "./classificacaoImc";

const FONTE = "https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/healthy-weights/canadian-guidelines-body-weight-classification-adults/quick-reference-tool-professionals.html";

export function AjudaAntropometria({ nome, imc, escuro }: { nome: string; imc: boolean; escuro: boolean }) {
  const [aberto, setAberto] = useState(false);
  const telaCheia = document.fullscreenElement;
  const destino = aberto ? (telaCheia instanceof HTMLElement ? telaCheia : document.querySelector<HTMLElement>(".tela-cheia-fallback")) : null;
  return (
    <>
      <BotaoAjuda aberto={aberto} onClick={() => setAberto(true)} rotulo={nome} />
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent portalContainer={destino} className={`${escuro ? "dark " : ""}pn-escopo !top-[6vh] !translate-y-0 max-h-[88vh] w-[min(94vw,560px)] max-w-none overflow-y-auto border border-border bg-background p-5 text-foreground`}>
          <div className="pr-8">
            <DialogTitle className="text-base font-black uppercase tracking-wide">Como interpretar: {nome}</DialogTitle>
            <DialogDescription className="mt-1 text-xs text-muted-foreground">Orientações para a conversa clínica.</DialogDescription>
          </div>
          {imc ? (
            <div className="space-y-4 text-sm">
              <p>O índice de massa corporal relaciona peso e altura: peso em quilogramas dividido pela altura em metros ao quadrado. Não mede diretamente a gordura corporal.</p>
              <div className="overflow-x-auto">
                <table className="pn-tab w-full">
                  <thead><tr><th className="text-left">Classificação geral de adultos</th><th>Índice em kg/m²</th></tr></thead>
                  <tbody>{FAIXAS_IMC.map((faixa) => (
                    <tr key={faixa.key}><td className="text-left"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: faixa.color }} /> {faixa.name}</td><td>{faixa.texto}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <p>Estas faixas são uma referência geral, não um diagnóstico. Não se aplicam a menores de 18 anos, à gestação ou à amamentação. A tela não confirma gestação nem amamentação: o profissional deve verificar antes de interpretar.</p>
              <p>Em pessoas acima de 65 anos, muito musculosas ou com outras particularidades, a interpretação precisa ser individualizada. Avalie também outras medidas e o contexto clínico.</p>
              <a href={FONTE} target="_blank" rel="noopener noreferrer" className="btn-3d-soft inline-flex px-3 py-2 font-bold">Abrir diretriz do Health Canada, alinhada à Organização Mundial da Saúde</a>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p>O gráfico compara os valores registrados de {nome.toLowerCase()} ao longo do tempo. Use a mesma técnica de medição em cada avaliação.</p>
              <p>Não há uma faixa universal configurada para esta medida. O gráfico não classifica o resultado como normal ou alterado; a interpretação depende do contexto clínico.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
