import { useState } from "react";
import { BotaoAjuda } from "../BotaoAjuda";
import { JanelaAjuda } from "../JanelaAjuda";
import { ReferenciaLista } from "../ReferenciaLista";
import { FAIXAS_IMC } from "./classificacaoImc";
import { CONFERIDO_EM, medidaDaMetrica, referenciasDaMedida } from "./referenciasAntropometria";
import "../pulso-niveis.css";

type Faixa = { key: string; name: string; color: string; texto: string };

// Mesmo molde de todo "?" (JanelaAjuda): botões coloridos em cima, explicação no meio, referências embaixo.
export function AjudaAntropometria({ nome, metrica, faixasPeso, alturaCm, adulto, escuro }: {
  nome: string; metrica: string; faixasPeso: Faixa[] | null; alturaCm: number | null; adulto: boolean; escuro: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const imc = metrica === "imc";
  const peso = metrica === "peso";
  const faixas: Faixa[] | null = imc ? [...FAIXAS_IMC] : peso ? faixasPeso : null;
  const alturaTxt = alturaCm?.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return (
    <>
      <BotaoAjuda aberto={aberto} onClick={() => setAberto((a) => !a)} rotulo={nome} />
      {aberto && (
        <JanelaAjuda onClose={() => setAberto(false)} escuro={escuro} titulo={`${nome}: parâmetros`} subtitulo="Adultos. Valores usados por este consultório."
          rotuloTopo="Níveis"
          topo={faixas ? (
            <table className="pn-tab" style={{ tableLayout: "auto" }}>
              <thead><tr><th style={{ textAlign: "left" }}>Nível</th><th>{imc ? "kg/m²" : "kg"}</th></tr></thead>
              <tbody>
                {faixas.map((f) => (
                  <tr key={f.key}>
                    <td style={{ textAlign: "left" }}><span className="bevel-3d pn-chip" style={{ ["--c" as string]: f.color }}>{f.name}</span></td>
                    <td>{f.texto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="pn-texto">{peso
              ? `As faixas do peso não aparecem agora: exigem adulto em todas as medições, nascimento cadastrado e uma única altura registrada.${adulto ? "" : " Verifique o nascimento e a idade em cada medição."}`
              : "Esta medida não tem faixa colorida: o gráfico não classifica o resultado. A interpretação depende do contexto clínico."}</p>
          )}
          porque={<p className="pn-texto">{imc
            ? "O índice de massa corporal relaciona peso e altura (peso em quilogramas dividido pela altura em metros ao quadrado). Ajuda a acompanhar a evolução, mas não mede a gordura corporal diretamente."
            : peso
              ? "O peso, acompanhado ao longo do tempo e medido sempre da mesma forma, mostra a direção do tratamento."
              : `A medida de ${nome.toLowerCase()}, repetida sempre da mesma forma, mostra a evolução do corpo ao longo do tempo.`}</p>}
          lembrar={
            <ul className="pn-lista-pontos">
              {imc && <li>Faixas gerais de adultos (18 anos ou mais). Não são diagnóstico.</li>}
              {peso && faixas && <li>As faixas são as do índice de massa corporal convertidas em quilos para a altura de {alturaTxt} cm (peso = índice × altura × altura).</li>}
              <li>Medir sempre com a mesma técnica, no mesmo ponto do corpo, de preferência no mesmo horário.</li>
              <li>Não se aplica a menores de 18 anos, gestação ou amamentação; a tela não confirma isso, o profissional verifica.</li>
              <li>Para 60 anos ou mais, o Ministério da Saúde usa pontos de corte próprios (SISVAN), que esta tela ainda não aplica.</li>
              <li>Em pessoas muito musculosas ou com outras particularidades, individualize e avalie também outras medidas.</li>
              <li>Endereços das fontes conferidos em {CONFERIDO_EM}.</li>
            </ul>
          }
          referencias={<ReferenciaLista itens={referenciasDaMedida(medidaDaMetrica(metrica))} />} />
      )}
    </>
  );
}
