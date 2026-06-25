import { useState } from "react";
import {
  BarraTopo,
  BlocoAssinatura,
  CabecalhoPaciente,
  DOENCAS_CONFIRMADAS,
  FerramentaHdCid,
  type Hd,
  RodapeDoc,
  TituloBloco,
} from "./_dockit";
import { Download, PenLine, Send, Share2, Stethoscope } from "lucide-react";

/* Especialidades agrupadas por area, com subtipos */
type Area = { area: string; itens: string[] };
const ESPECIALIDADES: Area[] = [
  { area: "Cardiologia", itens: ["Cardiologia clínica", "Arritmia / eletrofisiologia", "Insuficiência cardíaca", "Hemodinâmica"] },
  { area: "Endocrinologia", itens: ["Endocrinologia clínica", "Tireoide", "Diabetes", "Obesidade / metabologia"] },
  { area: "Psicologia", itens: ["Psicologia clínica (TCC)", "Psicanálise", "Psicologia comportamental", "Neuropsicologia", "Psicologia infantil"] },
  { area: "Psiquiatria", itens: ["Psiquiatria geral", "Psiquiatria da infância", "Dependência química"] },
  { area: "Neurologia", itens: ["Neurologia clínica", "Cefaleia", "Distúrbios do sono", "Neurologia cognitiva"] },
  { area: "Ortopedia", itens: ["Joelho", "Coluna", "Ombro", "Quadril", "Pé e tornozelo"] },
  { area: "Fisioterapia", itens: ["Ortopédica", "Neurológica", "RPG", "Pélvica", "Respiratória"] },
  { area: "Nutrição", itens: ["Nutrição clínica", "Nutrologia", "Nutrição esportiva"] },
  { area: "Dermatologia", itens: ["Dermatologia clínica", "Tricologia (cabelo)", "Dermatologia estética"] },
  { area: "Gastroenterologia", itens: ["Gastroenterologia clínica", "Hepatologia", "Endoscopia"] },
  { area: "Ginecologia", itens: ["Ginecologia clínica", "Endocrinologia ginecológica", "Climatério"] },
  { area: "Urologia", itens: ["Urologia clínica", "Andrologia"] },
  { area: "Outros", itens: ["Reumatologia", "Nefrologia", "Pneumologia", "Angiologia / vascular", "Oftalmologia", "Otorrinolaringologia", "Fonoaudiologia", "Educador físico"] },
];

function textoModelo(esp: string, hds: Hd[]): string {
  const motivo = hds.length
    ? hds.map((h) => `${h.nome.toLowerCase()} (CID ${h.codigo})`).join(" e ")
    : "acompanhamento clínico";
  return (
    `Encaminho a paciente Maria Silva Santos, 47 anos, CPF 123.456.789-00, para avaliação com ` +
    `${esp}. Paciente em acompanhamento de protocolo de longevidade, com hipótese diagnóstica de ` +
    `${motivo}. Solicito avaliação especializada e conduta conjunta. Coloco-me à disposição para troca de informações.`
  );
}

export function Encaminhamento() {
  const [hds, setHds] = useState<Hd[]>([DOENCAS_CONFIRMADAS[0]]);
  const [esp, setEsp] = useState("Cardiologia clínica");
  const [texto, setTexto] = useState(() => textoModelo("Cardiologia clínica", [DOENCAS_CONFIRMADAS[0]]));

  // ao trocar a especialidade, regenera o texto pronto (continua editável)
  function escolher(nova: string) {
    setEsp(nova);
    setTexto(textoModelo(nova, hds));
  }

  return (
    <div className="cockpit-root min-h-screen w-full font-sans">
      <BarraTopo titulo="Encaminhamento" Icon={Share2} />

      <main className="px-7 py-6">
        <CabecalhoPaciente doc="Encaminhamento médico" />

        {/* ferramenta HD + CID (motivo do encaminhamento, controlada) */}
        <FerramentaHdCid value={hds} onChange={setHds} />

        <div className="grid grid-cols-[460px_1fr] gap-5">
          {/* seletor de especialidade + texto */}
          <section className="panel-3d px-5 py-4">
            <TituloBloco Icon={Stethoscope} texto="Para qual especialidade?" cor="#16294a" />

            {/* campo selecionado */}
            <div className="field-engraved mb-3 flex items-center justify-between px-3 py-2">
              <span className="text-[13px] font-bold text-[#16294a]">{esp}</span>
              <span className="rounded bg-[#16294a] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#e7cd8f]">selecionada</span>
            </div>

            {/* dropdown completo agrupado */}
            <div className="concave-3d max-h-[300px] overflow-auto p-2.5">
              {ESPECIALIDADES.map((g) => (
                <div key={g.area} className="mb-2 last:mb-0">
                  <div className="mb-1 px-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#9fb0c4]">{g.area}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {g.itens.map((it) => (
                      <button
                        key={it}
                        type="button"
                        onClick={() => escolher(it)}
                        className={`rounded px-2 py-1 text-[11px] font-semibold ${esp === it ? "bg-[#16294a] text-[#e7cd8f]" : "bevel-3d text-[#16294a]"}`}
                      >
                        {it}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* texto pronto editavel (muda com a especialidade, reflete na previa) */}
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">Texto do encaminhamento</span>
                <span className="flex items-center gap-1 text-[10px] text-[#647c97]"><PenLine className="h-3 w-3" /> pronto · editável · reflete</span>
              </div>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className="field-engraved h-36 w-full resize-none px-3 py-2 text-[12.5px] leading-relaxed text-[#2c3e52] outline-none"
              />
              <p className="mt-1.5 text-[10px] italic text-[#647c97]">
                O texto já vem pronto para a especialidade escolhida. Você pode editar e acrescentar livremente.
              </p>
            </div>
          </section>

          {/* previa (derivada do estado) */}
          <section className="panel-3d px-5 py-4">
            <div className="mb-2 flex items-center justify-between">
              <TituloBloco Icon={Share2} texto="Prévia do encaminhamento (PDF)" cor="#16294a" />
              <button type="button" className="btn-3d-soft inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide">
                <Download className="h-3.5 w-3.5" /> Baixar
              </button>
            </div>
            <div className="screen-3d px-8 py-7" style={{ minHeight: 420 }}>
              <div className="flex items-center justify-between border-b border-[#d9cdb0] pb-3">
                <span className="font-serif text-[16px] font-bold tracking-wide text-[#16294a]">Instituto Pádua</span>
                <span className="text-[9px] uppercase tracking-wide text-[#647c97]">Encaminhamento · 25/06/2026</span>
              </div>
              <h2 className="mt-5 text-center text-[15px] font-bold uppercase tracking-[0.2em] text-[#16294a]">Encaminhamento Médico</h2>
              <div className="mt-4 flex items-center justify-center">
                <span className="bevel-3d px-3 py-1.5 text-[12px] font-bold text-[#16294a]">
                  Especialidade: {esp}
                </span>
              </div>
              <p className="mt-5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#3a4a57]">{texto}</p>
              <p className="mt-4 text-[12px] text-[#647c97]">São Paulo, 25 de junho de 2026.</p>
              <BlocoAssinatura />
            </div>
          </section>
        </div>

        <section className="panel-3d mt-5 flex items-center justify-end gap-3 px-5 py-4">
          <button type="button" className="btn-3d-soft inline-flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-bold uppercase tracking-wide">
            <PenLine className="h-4 w-4" /> Salvar rascunho
          </button>
          <button type="button" className="btn-3d inline-flex items-center gap-1.5 px-5 py-2.5 text-[12px] font-bold uppercase tracking-wide">
            <Send className="h-4 w-4" /> Assinar e gerar PDF
          </button>
        </section>

        <RodapeDoc rotulo="Encaminhamento" />
      </main>
    </div>
  );
}

export default Encaminhamento;
