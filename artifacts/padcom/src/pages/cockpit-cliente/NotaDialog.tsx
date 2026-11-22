import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Numeral } from "@/components/numeral/Numeral";
import { ReferenciaLista } from "./ReferenciaLista";
import "./pulso-niveis.css";

// Janela do "?" de Energia, Libido e Sono: o que é, como dar a nota, por que perguntamos e referências.
// Fonte única: abre igual no registro, no gráfico, na Área do Cliente e no cockpit.
const ESCALA_LIBIDO = [
  { de: 0, ate: 2, nome: "Muito baixa", cor: "muitoalto", sente: "Quase nenhum desejo. Vontade em nenhum ou em apenas 1 dia da semana." },
  { de: 3, ate: 4, nome: "Baixa", cor: "alto", sente: "Desejo raro. Vontade em cerca de 2 dias da semana, e fraca." },
  { de: 5, ate: 6, nome: "Moderada", cor: "baixo", sente: "Desejo ocasional. Vontade em 3 a 4 dias da semana." },
  { de: 7, ate: 8, nome: "Boa", cor: "normal", sente: "Desejo frequente. Vontade em 5 a 6 dias da semana. Com nota 8, o desejo aparece quase todos os dias e é fácil de sentir." },
  { de: 9, ate: 10, nome: "Alta", cor: "normal", sente: "Desejo forte e constante. Vontade todos os dias da semana." },
] as const;
const ESCALA = [
  { de: 0, ate: 2, nome: "Muito mal", cor: "muitoalto" }, { de: 3, ate: 4, nome: "Ruim", cor: "alto" }, { de: 5, ate: 6, nome: "Regular", cor: "baixo" },
  { de: 7, ate: 8, nome: "Bom", cor: "normal" }, { de: 9, ate: 10, nome: "Ótimo", cor: "normal" },
] as const;
export const SIGNIFICADO: Record<string, { nome: string; apelido: string; texto: string; zero: string; dez: string }> = {
  energia: { nome: "Energia", apelido: "O combustível do seu dia", texto: "Quanta força você sente para fazer as coisas do dia.", zero: "Sem força nenhuma, sem conseguir fazer o básico.", dez: "Cheio de força, fazendo tudo sem cansar." },
  libido: { nome: "Libido", apelido: "O Termômetro de saúde", texto: "O quanto de desejo você sentiu nos últimos 7 dias. Dê a nota pelo que sentiu, sem comparar com outras fases da vida.", zero: "Nenhum desejo.", dez: "Desejo muito forte, mais que o seu normal." },
  sono: { nome: "Sono", apelido: "A fase de reparação do corpo", texto: "Como foi a sua noite de sono.", zero: "Quase não dormi, acordei muito cansado.", dez: "Dormi a noite toda e acordei descansado." },
};

const SONO_REPARADOR: Array<[string, string]> = [
  ["Duração", "Dormiu 7 horas ou mais na noite."],
  ["Para pegar no sono", "Levou até cerca de 30 minutos para dormir."],
  ["Durante a noite", "Acordou poucas vezes e voltou a dormir logo."],
  ["Ao acordar", "Levantou descansado, sem cansaço pesado."],
];

export function EscalaDialog({ foco, escuro, onClose }: { foco: string | null; escuro: boolean; onClose: () => void }) {
  if (!foco) return null;
  const m = SIGNIFICADO[foco]!;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`${escuro ? "dark " : ""}pn-escopo !top-[8vh] !translate-y-0 max-h-[84vh] w-[min(94vw,480px)] max-w-none overflow-y-auto border border-border bg-background p-5`} style={{ color: "var(--pn-tinta)" }}>
        <DialogTitle className="pr-8 text-base font-black uppercase tracking-wide">{m.nome}: como dar a nota</DialogTitle>
        <p className="pn-apelido">{m.apelido}</p>
        <h4 className="pn-sec-rotulo mt-4">O que é</h4>
        <DialogDescription className="pn-texto">{m.texto}</DialogDescription>
        <h4 className="pn-sec-rotulo mt-5">Como dar a nota</h4>
        <ul className="space-y-2.5">
          {(foco === "libido" ? ESCALA_LIBIDO : ESCALA).map((e) => (
            <li key={e.nome} className="grid grid-cols-[84px_1fr] items-center gap-3">
              <span className="bevel-3d pn-chip text-center" data-nivel={e.cor}>{e.nome}</span>
              <span className="text-sm font-bold"><Numeral peso={700}>{`${e.de} a ${e.ate}`}</Numeral>
                {"sente" in e && <span className="pn-texto mt-0.5 block font-medium">{e.sente}</span>}</span>
            </li>
          ))}
        </ul>
        {foco !== "libido" && (
          <ul className="pn-lista-pontos mt-3">
            <li><b>Nota 0:</b> {m.zero}</li>
            <li><b>Nota 10:</b> {m.dez}</li>
          </ul>
        )}
        {foco === "sono" && (
          <>
            <h4 className="pn-sec-rotulo mt-5">Como saber se o sono foi reparador</h4>
            <ul className="space-y-2">
              {SONO_REPARADOR.map(([t, x]) => (
                <li key={t} className="concave-3d px-3 py-2 text-[13px] leading-snug"><b className="block text-[11px] font-black uppercase tracking-wider">{t}</b>{x}</li>
              ))}
            </ul>
            <p className="pn-texto mt-2" style={{ color: "var(--pn-mudo)" }}>Quanto mais itens estiverem bons, mais alta é a nota. Se só um estiver ruim, a nota fica no meio.</p>
          </>
        )}
        <h4 className="pn-sec-rotulo mt-5">{foco === "libido" ? "O porquê do questionário sobre libido" : "Por que perguntamos"}</h4>
        {foco === "libido" ? (
          <div className="grid gap-3">
            <p className="pn-texto">Não é algo relacionado a entrar na sua intimidade ou algo parecido. Não queremos entrar na sua intimidade e não temos nenhum intuito de causar constrangimento. Queremos que você entenda.</p>
            <p className="pn-texto">A libido hoje está relacionada a muitos fatores, como qualidade do sono, níveis hormonais e nível de cortisol (o hormônio do estresse). Também se relaciona com comorbidades, como pressão alta, diabetes e síndrome metabólica.</p>
            <h5 className="pn-sub-rotulo">Por que é um termômetro da saúde?</h5>
            <p className="pn-texto">Porque, quando o corpo está fora de equilíbrio, o desejo costuma acompanhar essa mudança. Acompanhar a nota ao longo das semanas nos ajuda a ver se o tratamento está funcionando. Responder é opcional: se preferir, deixe em branco.</p>
          </div>
        ) : foco === "sono" ? (
          <p className="pn-texto">É durante o sono que o corpo se repara. Um sono curto ou ruim pesa sobre a pressão, a glicemia, os hormônios e o humor. Por isso a nota do sono ajuda a interpretar todas as outras medidas.</p>
        ) : (
          <p className="pn-texto">A energia acompanha o sono, os hormônios, a alimentação e o estresse. Ver a nota ao longo das semanas ajuda a saber se o tratamento está trazendo mais força para o seu dia.</p>
        )}
        {(foco === "energia" || foco === "libido" || foco === "sono") && <div className="mt-5"><ReferenciaLista tipo={foco} /></div>}
      </DialogContent>
    </Dialog>
  );
}

