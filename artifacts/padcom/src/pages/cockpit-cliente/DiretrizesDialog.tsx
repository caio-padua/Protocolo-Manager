import { JanelaAjuda } from "./JanelaAjuda";
import { ReferenciaLista } from "./ReferenciaLista";
import { EscalaDialog } from "./NotaDialog";
import type { TipoReferencia } from "./pulso-referencias";
import { NIVEIS, NIVEIS_FC, faixasFrequencia, faixasGlicemia, faixasPressao } from "./pulso-faixas";
import "./pulso-niveis.css";

// Parâmetros e diretrizes de referência, para consulta rápida durante a conversa com o cliente.
export function DiretrizesDialog({ tipo, escuro, onClose }: { tipo: TipoReferencia | null; escuro: boolean; onClose: () => void }) {
  if (!tipo) return null;
  if (tipo === "energia" || tipo === "libido" || tipo === "sono") return <EscalaDialog foco={tipo} escuro={escuro} onClose={onClose} />;
  const pressao = tipo === "pressao";
  const freq = tipo === "frequencia";
  const fp = faixasPressao(), fg = faixasGlicemia(), ff = faixasFrequencia();
  return (
    <JanelaAjuda onClose={onClose} escuro={escuro}
      titulo={pressao ? "Pressão arterial: parâmetros" : freq ? "Frequência cardíaca: parâmetros" : "Glicemia de jejum: parâmetros"}
      subtitulo="Adultos. Valores usados por este consultório."
      rotuloTopo="Níveis"
      topo={<>
        <table className="pn-tab" style={{ tableLayout: "auto" }}>
          <thead><tr><th style={{ textAlign: "left" }}>Nível</th>{pressao ? <><th>Máxima (mmHg)</th><th>Mínima (mmHg)</th></> : <th>{freq ? "bpm" : "mg/dL"}</th>}</tr></thead>
          <tbody>
            {(freq ? NIVEIS_FC : NIVEIS).map((n) => (
              <tr key={n.id}>
                <td style={{ textAlign: "left" }}><span className="bevel-3d pn-chip" data-nivel={n.id}>{n.nome}</span></td>
                {pressao ? <><td>{fp[n.id][0]}</td><td>{fp[n.id][1]}</td></> : <td>{freq ? ff[n.id] : fg[n.id]}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </>}
      porque={<>
        <p className="pn-texto">{pressao
          ? "A pressão alta costuma não dar sintoma e, com o tempo, lesa o coração, os rins e o cérebro. Medir em casa mostra como ela se comporta no dia a dia."
          : freq
            ? "A frequência cardíaca em repouso mostra como o coração responde ao corpo, ao estresse, aos remédios e ao condicionamento físico."
            : "A glicemia de jejum mostra como o corpo controla o açúcar. Acompanhar ajuda a perceber o pré-diabetes e o diabetes cedo."}</p>
      </>}
      lembrar={<>
        <ul className="pn-lista-pontos">
          {pressao ? (
            <>
              <li>Vale o pior dos dois números da leitura.</li>
              <li>Pressão medida em casa: a meta é ficar abaixo de 130 / 80. É a média de 7 dias que orienta a conduta, não uma leitura isolada.</li>
              <li>Referência: Diretrizes Brasileiras de Hipertensão Arterial (Sociedade Brasileira de Cardiologia).</li>
              <li>Os níveis "baixo" e "muito baixo" seguem critério clínico do consultório.</li>
              <li>180 / 110 ou mais: procurar atendimento.</li>
            </>
          ) : freq ? (
            <>
              <li>Medida em repouso, sentado e calmo, com o cliente acordado.</li>
              <li>Abaixo de 50: bradicardia sinusal. De 50 a 99: faixa normal. 100 ou mais: taquicardia sinusal.</li>
              <li>Pessoas muito treinadas podem ter frequência baixa sem doença; febre, dor, ansiedade, café, álcool e alguns remédios elevam a frequência.</li>
              <li>Frequência alta ou baixa acompanhada de tontura, desmaio, falta de ar ou dor no peito: procurar atendimento.</li>
              <li>Referência: Diretriz da Sociedade Brasileira de Cardiologia sobre a Análise e Emissão de Laudos Eletrocardiográficos (2022).</li>
            </>
          ) : (
            <>
              <li>Jejum de pelo menos 8 horas.</li>
              <li>Normal: abaixo de 100. De 100 a 125: faixa de pré-diabetes. 126 ou mais: faixa de diabetes, sempre confirmada em outro dia, com exame de laboratório.</li>
              <li>Abaixo de 70: hipoglicemia. Abaixo de 54: hipoglicemia importante.</li>
              <li>Referência: Diretrizes da Sociedade Brasileira de Diabetes e Standards of Care da American Diabetes Association.</li>
            </>
          )}
        </ul>
      </>}
      referencias={<ReferenciaLista tipo={tipo} />} />
  );
}
