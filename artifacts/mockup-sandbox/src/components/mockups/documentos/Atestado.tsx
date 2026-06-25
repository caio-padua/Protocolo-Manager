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
import { CalendarDays, ClipboardCheck, Download, FileCheck2, PenLine } from "lucide-react";

const TIPOS = ["Comparecimento", "Afastamento do trabalho", "Repouso domiciliar", "Acompanhante"];

const TEXTO_PADRAO =
  "Atesto, para os devidos fins, que a Sra. Maria Silva Santos, portadora do CPF 123.456.789-00, esteve sob meus cuidados médicos nesta data, necessitando de afastamento de suas atividades laborais por 3 (três) dias, a partir de 25/06/2026, por motivo de doença.";

export function Atestado() {
  const [hds, setHds] = useState<Hd[]>([DOENCAS_CONFIRMADAS[0]]);
  const [texto, setTexto] = useState(TEXTO_PADRAO);
  const cidStr = hds.map((h) => h.codigo).join(", ");

  return (
    <div className="cockpit-root min-h-screen w-full font-sans">
      <BarraTopo titulo="Atestado Médico" Icon={FileCheck2} />

      <main className="px-7 py-6">
        <CabecalhoPaciente doc="Atestado médico" />

        {/* Ferramenta HD + CID (compartilhada, controlada) */}
        <FerramentaHdCid value={hds} onChange={setHds} />

        {/* Campos do atestado + previa */}
        <div className="grid grid-cols-[420px_1fr] gap-5">
          {/* coluna de campos */}
          <section className="panel-3d px-5 py-4">
            <TituloBloco Icon={ClipboardCheck} texto="Dados do atestado" cor="#16294a" />

            <div className="flex flex-col gap-3">
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">Tipo de atestado</div>
                <div className="field-engraved flex items-center justify-between px-3 py-2">
                  <span className="text-[13px] font-semibold text-[#16294a]">Afastamento do trabalho</span>
                  <span className="text-[#647c97]">▾</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {TIPOS.map((t, i) => (
                    <span
                      key={t}
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold ${i === 1 ? "bg-[#16294a] text-[#e7cd8f]" : "concave-3d text-[#647c97]"}`}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">Dias de afastamento</div>
                  <div className="field-engraved px-3 py-2 text-[13px] font-bold text-[#16294a]">3 dias</div>
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">A partir de</div>
                  <div className="field-engraved flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold text-[#16294a]">
                    <CalendarDays className="h-3.5 w-3.5 text-[#647c97]" /> 25/06/2026
                  </div>
                </div>
              </div>

              <label className="bevel-3d flex items-center gap-2.5 px-3 py-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-[3px]" style={{ background: "linear-gradient(180deg,#3fbf6a,#1e8449)", border: "1px solid #166938" }}>
                  <ClipboardCheck className="h-3.5 w-3.5 text-white" />
                </span>
                <span className="text-[12px] font-semibold text-[#16294a]">Incluir número do CID no atestado</span>
              </label>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">Texto do atestado</span>
                  <span className="flex items-center gap-1 text-[10px] text-[#647c97]"><PenLine className="h-3 w-3" /> editável · reflete na prévia</span>
                </div>
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  className="field-engraved h-40 w-full resize-none px-3 py-2 text-[12.5px] leading-relaxed text-[#2c3e52] outline-none"
                />
              </div>
            </div>
          </section>

          {/* previa do documento (derivada do estado) */}
          <section className="panel-3d px-5 py-4">
            <div className="mb-2 flex items-center justify-between">
              <TituloBloco Icon={FileCheck2} texto="Prévia do atestado (PDF)" cor="#16294a" />
              <button type="button" className="btn-3d-soft inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide">
                <Download className="h-3.5 w-3.5" /> Baixar
              </button>
            </div>
            <div className="screen-3d px-8 py-7" style={{ minHeight: 380 }}>
              <div className="flex items-center justify-between border-b border-[#d9cdb0] pb-3">
                <span className="font-serif text-[16px] font-bold tracking-wide text-[#16294a]">Instituto Pádua</span>
                <span className="text-[9px] uppercase tracking-wide text-[#647c97]">Atestado · 25/06/2026</span>
              </div>
              <h2 className="mt-5 text-center text-[15px] font-bold uppercase tracking-[0.2em] text-[#16294a]">Atestado Médico</h2>
              <p className="mt-5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#3a4a57]">{texto}</p>
              {cidStr && (
                <p className="mt-3 text-[12px] text-[#3a4a57]">
                  <strong>CID:</strong> {hds.map((h) => `${h.nome} (${h.codigo})`).join("; ")}.
                </p>
              )}
              <p className="mt-4 text-[12px] text-[#647c97]">São Paulo, 25 de junho de 2026.</p>
              <BlocoAssinatura />
            </div>
          </section>
        </div>

        {/* acoes */}
        <section className="panel-3d mt-5 flex items-center justify-end gap-3 px-5 py-4">
          <button type="button" className="btn-3d-soft inline-flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-bold uppercase tracking-wide">
            <PenLine className="h-4 w-4" /> Salvar rascunho
          </button>
          <button type="button" className="btn-3d inline-flex items-center gap-1.5 px-5 py-2.5 text-[12px] font-bold uppercase tracking-wide">
            <FileCheck2 className="h-4 w-4" /> Assinar e gerar PDF
          </button>
        </section>

        <RodapeDoc rotulo="Atestado Médico" />
      </main>
    </div>
  );
}

export default Atestado;
