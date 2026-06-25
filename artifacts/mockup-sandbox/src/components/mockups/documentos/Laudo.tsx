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
import { Download, FileSearch, PenLine, Stethoscope } from "lucide-react";

const ACHADOS_PADRAO =
  "À avaliação clínica e laboratorial, observam-se sinais compatíveis com hipotireoidismo e resistência à insulina, com TSH elevado, vitamina D reduzida e perfil lipídico alterado.";
const CONCLUSAO_PADRAO =
  "Conclui-se quadro de hipotireoidismo associado a resistência à insulina, com indicação de protocolo de longevidade e acompanhamento clínico seriado.";

export function Laudo() {
  const [hds, setHds] = useState<Hd[]>([DOENCAS_CONFIRMADAS[0], DOENCAS_CONFIRMADAS[1]]);
  const [achados, setAchados] = useState(ACHADOS_PADRAO);
  const [conclusao, setConclusao] = useState(CONCLUSAO_PADRAO);
  const hdStr = hds.map((h) => `${h.nome} (${h.codigo})`).join("; ");

  return (
    <div className="cockpit-root min-h-screen w-full font-sans">
      <BarraTopo titulo="Laudo Médico" Icon={FileSearch} />

      <main className="px-7 py-6">
        <CabecalhoPaciente doc="Laudo médico" />

        {/* mesma ferramenta HD + CID do atestado (controlada) */}
        <FerramentaHdCid value={hds} onChange={setHds} />

        <div className="grid grid-cols-[420px_1fr] gap-5">
          {/* campos */}
          <section className="panel-3d px-5 py-4">
            <TituloBloco Icon={Stethoscope} texto="Dados do laudo" cor="#16294a" />
            <div className="flex flex-col gap-3">
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">Finalidade do laudo</div>
                <div className="field-engraved flex items-center justify-between px-3 py-2">
                  <span className="text-[13px] font-semibold text-[#16294a]">Avaliação clínica para protocolo</span>
                  <span className="text-[#647c97]">▾</span>
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">Achados / exame</span>
                  <span className="flex items-center gap-1 text-[10px] text-[#647c97]"><PenLine className="h-3 w-3" /> reflete na prévia</span>
                </div>
                <textarea
                  value={achados}
                  onChange={(e) => setAchados(e.target.value)}
                  className="field-engraved h-28 w-full resize-none px-3 py-2 text-[12.5px] leading-relaxed text-[#2c3e52] outline-none"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">Conclusão</span>
                  <span className="flex items-center gap-1 text-[10px] text-[#647c97]"><PenLine className="h-3 w-3" /> reflete na prévia</span>
                </div>
                <textarea
                  value={conclusao}
                  onChange={(e) => setConclusao(e.target.value)}
                  className="field-engraved h-28 w-full resize-none px-3 py-2 text-[12.5px] leading-relaxed text-[#2c3e52] outline-none"
                />
              </div>
            </div>
          </section>

          {/* previa (derivada do estado) */}
          <section className="panel-3d px-5 py-4">
            <div className="mb-2 flex items-center justify-between">
              <TituloBloco Icon={FileSearch} texto="Prévia do laudo (PDF)" cor="#16294a" />
              <button type="button" className="btn-3d-soft inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide">
                <Download className="h-3.5 w-3.5" /> Baixar
              </button>
            </div>
            <div className="screen-3d px-8 py-7" style={{ minHeight: 420 }}>
              <div className="flex items-center justify-between border-b border-[#d9cdb0] pb-3">
                <span className="font-serif text-[16px] font-bold tracking-wide text-[#16294a]">Instituto Pádua</span>
                <span className="text-[9px] uppercase tracking-wide text-[#647c97]">Laudo · 25/06/2026</span>
              </div>
              <h2 className="mt-5 text-center text-[15px] font-bold uppercase tracking-[0.2em] text-[#16294a]">Laudo Médico</h2>

              <div className="mt-5 space-y-3 text-[12.5px] leading-relaxed text-[#3a4a57]">
                <p><strong>Cliente:</strong> Maria Silva Santos · 47 anos · CPF 123.456.789-00</p>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[#647c97]">Hipóteses diagnósticas (HD / CID)</div>
                  <p>{hdStr || "—"}.</p>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[#647c97]">Achados</div>
                  <p className="whitespace-pre-wrap">{achados}</p>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[#647c97]">Conclusão</div>
                  <p className="whitespace-pre-wrap">{conclusao}</p>
                </div>
              </div>
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
            <FileSearch className="h-4 w-4" /> Assinar e gerar PDF
          </button>
        </section>

        <RodapeDoc rotulo="Laudo Médico" />
      </main>
    </div>
  );
}

export default Laudo;
