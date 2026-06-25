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
import {
  AlertTriangle,
  Download,
  FileSearch,
  FileText,
  Lock,
  PenLine,
  Settings2,
  ShieldCheck,
  Stethoscope,
  Syringe,
  UserCog,
} from "lucide-react";
import {
  nomePapel,
  PAPEL_VISAO_LAUDO,
  permissoesDefault,
  podeUsar,
} from "../governanca/_permissoes";

/* ============================================================
   TIPOS DE LAUDO (subdivisao pedida pelo CEO)
   A disponibilidade de cada tipo NAO mora aqui: vem da MESMA
   matriz da tela de Governanca (_permissoes.ts), resolvida pelo
   PAPEL de quem usa. Neste mockup a tela e vista como o papel
   "Medico Validador", para quem a Requisicao de Insumo esta OFF.
   ============================================================ */
type TipoLaudoId = "saude" | "inss" | "insumo";
type TipoLaudo = {
  id: TipoLaudoId;
  titulo: string;
  subtitulo: string;
  tituloDoc: string;
  Icon: typeof FileText;
  permItem: string; // chave na matriz de Governanca
};

const TIPOS: TipoLaudo[] = [
  {
    id: "saude",
    titulo: "Estado de Saúde",
    subtitulo: "Apresentação geral do quadro clínico",
    tituloDoc: "Laudo Médico — Estado de Saúde",
    Icon: FileText,
    permItem: "laudo_saude",
  },
  {
    id: "inss",
    titulo: "Afastamento — INSS",
    subtitulo: "Fins previdenciários (Instituto Nacional do Seguro Social)",
    tituloDoc: "Laudo Médico para o INSS",
    Icon: ShieldCheck,
    permItem: "laudo_inss",
  },
  {
    id: "insumo",
    titulo: "Requisição de Insumo",
    subtitulo: "Ex.: insulina para diabetes",
    tituloDoc: "Laudo para Requisição de Insumo",
    Icon: Syringe,
    permItem: "laudo_insumo",
  },
];

export function Laudo() {
  /* papel atual + matriz vindos da MESMA fonte da Governanca */
  const PERM = permissoesDefault();
  const papelId = PAPEL_VISAO_LAUDO;
  const papelNome = nomePapel(papelId);
  const liberadoPara = (t: TipoLaudo) => podeUsar(PERM, t.permItem, papelId);

  const [tipoId, setTipoId] = useState<TipoLaudoId>("saude");
  const [hds, setHds] = useState<Hd[]>([DOENCAS_CONFIRMADAS[0]]);

  // Estado de Saude
  const [achados, setAchados] = useState(
    "À avaliação clínica e laboratorial, observam-se sinais compatíveis com hipotireoidismo e resistência à insulina, com TSH elevado, vitamina D reduzida e perfil lipídico alterado.",
  );
  const [conclusao, setConclusao] = useState(
    "Conclui-se quadro de hipotireoidismo associado a resistência à insulina, com indicação de protocolo de longevidade e acompanhamento clínico seriado.",
  );

  // INSS
  const [inssDias, setInssDias] = useState("90");
  const [inssNatureza, setInssNatureza] = useState<"temporaria" | "permanente">("temporaria");
  const [inssFinalidade, setInssFinalidade] = useState("Auxílio-doença (B31)");

  // Requisicao de insumo
  const [insumo, setInsumo] = useState("Insulina Glargina 100 UI/mL");
  const [insumoQtd, setInsumoQtd] = useState("5 canetas / mês");
  const [insumoJustif, setInsumoJustif] = useState(
    "Paciente com diabetes mellitus em uso contínuo, dependente de insulina para controle glicêmico. A suspensão implica risco de descompensação metabólica grave.",
  );

  const tipo = TIPOS.find((t) => t.id === tipoId)!;
  const tipoLiberado = liberadoPara(tipo);
  const cidStr = hds.map((h) => `${h.nome} (${h.codigo})`).join("; ");

  return (
    <div className="cockpit-root min-h-screen w-full font-sans">
      <BarraTopo titulo="Laudo Médico" Icon={FileSearch} />

      <main className="px-7 py-6">
        <CabecalhoPaciente doc="Laudo médico" />

        {/* ---- SELETOR DE TIPO DE LAUDO ---- */}
        <section className="panel-3d mb-5 px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <TituloBloco Icon={Settings2} texto="Tipo de laudo" cor="#16294a" />
            <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-[#647c97]">
              <span className="flex items-center gap-1.5 rounded bg-[#eef2f8] px-2 py-1 text-[#16294a]">
                <UserCog className="h-3 w-3 text-[#c2a05a]" /> visto como: {papelNome}
              </span>
              <span className="flex items-center gap-1.5">
                <Lock className="h-3 w-3" /> liberação controlada pelo CEO (Governança)
              </span>
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {TIPOS.map((t) => {
              const ativo = t.id === tipoId;
              const tLib = liberadoPara(t);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTipoId(t.id)}
                  className={`relative flex items-start gap-3 px-4 py-3 text-left ${ativo ? "bevel-3d" : "concave-3d"}`}
                  style={ativo ? { outline: "2px solid #c2a05a", outlineOffset: 2 } : undefined}
                >
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded"
                    style={{ background: ativo ? "linear-gradient(180deg,#1b3260,#16294a)" : "#e7ddc8" }}
                  >
                    <t.Icon className="h-4 w-4" style={{ color: ativo ? "#e7cd8f" : "#647c97" }} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-[13px] font-bold text-[#16294a]">{t.titulo}</span>
                    <span className="mt-0.5 block text-[10.5px] leading-snug text-[#647c97]">{t.subtitulo}</span>
                    <span
                      className={`mt-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                        tLib ? "bg-[#e6f4ea] text-[#1e8449]" : "bg-[#f3e7e6] text-[#9c2b20]"
                      }`}
                    >
                      {tLib ? "Liberado" : (<><Lock className="h-2.5 w-2.5" /> Bloqueado p/ este papel</>)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* aviso se o tipo selecionado estiver bloqueado para este papel */}
        {!tipoLiberado && (
          <div
            className="mb-5 flex items-center gap-2.5 rounded px-4 py-2.5"
            style={{ background: "linear-gradient(180deg,#fff7e8,#fdeccb)", border: "1px solid #e0b860" }}
          >
            <AlertTriangle className="h-4 w-4 text-[#9c6a12]" />
            <span className="text-[12px] font-semibold text-[#7a5410]">
              Bloqueado para o papel <strong>{papelNome}</strong>. O CEO pode liberar este tipo de laudo para este papel na tela de Governança.
            </span>
          </div>
        )}

        {/* mesma ferramenta HD + CID dos outros documentos (controlada) */}
        <FerramentaHdCid value={hds} onChange={setHds} />

        <div className="grid grid-cols-[440px_1fr] gap-5">
          {/* ---- COLUNA DE CAMPOS (muda por tipo) ---- */}
          <section className="panel-3d px-5 py-4">
            <TituloBloco Icon={Stethoscope} texto={`Dados — ${tipo.titulo}`} cor="#16294a" />

            {tipoId === "saude" && (
              <div className="flex flex-col gap-3">
                <CampoTexto rotulo="Achados / exame" valor={achados} set={setAchados} h={28} />
                <CampoTexto rotulo="Conclusão" valor={conclusao} set={setConclusao} h={28} />
              </div>
            )}

            {tipoId === "inss" && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Campo rotulo="Dias de afastamento">
                    <input
                      value={inssDias}
                      onChange={(e) => setInssDias(e.target.value)}
                      className="w-full bg-transparent text-[13px] font-bold text-[#16294a] outline-none"
                    />
                  </Campo>
                  <Campo rotulo="Natureza">
                    <div className="flex gap-1">
                      {(["temporaria", "permanente"] as const).map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setInssNatureza(n)}
                          className={`rounded px-2 py-0.5 text-[10px] font-semibold ${inssNatureza === n ? "bg-[#16294a] text-[#e7cd8f]" : "text-[#647c97]"}`}
                        >
                          {n === "temporaria" ? "Temporária" : "Permanente"}
                        </button>
                      ))}
                    </div>
                  </Campo>
                </div>
                <Campo rotulo="Finalidade previdenciária">
                  <input
                    value={inssFinalidade}
                    onChange={(e) => setInssFinalidade(e.target.value)}
                    className="w-full bg-transparent text-[13px] font-semibold text-[#16294a] outline-none"
                  />
                </Campo>
                <CampoTexto rotulo="Justificativa clínica" valor={achados} set={setAchados} h={28} />
              </div>
            )}

            {tipoId === "insumo" && (
              <div className="flex flex-col gap-3">
                <Campo rotulo="Insumo solicitado">
                  <input
                    value={insumo}
                    onChange={(e) => setInsumo(e.target.value)}
                    className="w-full bg-transparent text-[13px] font-bold text-[#16294a] outline-none"
                  />
                </Campo>
                <Campo rotulo="Quantidade / período (uso contínuo)">
                  <input
                    value={insumoQtd}
                    onChange={(e) => setInsumoQtd(e.target.value)}
                    className="w-full bg-transparent text-[13px] font-semibold text-[#16294a] outline-none"
                  />
                </Campo>
                <CampoTexto rotulo="Justificativa clínica" valor={insumoJustif} set={setInsumoJustif} h={28} />
              </div>
            )}
          </section>

          {/* ---- PREVIA (derivada do estado e do tipo) ---- */}
          <section className="panel-3d px-5 py-4">
            <div className="mb-2 flex items-center justify-between">
              <TituloBloco Icon={FileSearch} texto="Prévia do laudo (PDF)" cor="#16294a" />
              <button type="button" className="btn-3d-soft inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide">
                <Download className="h-3.5 w-3.5" /> Baixar
              </button>
            </div>
            <div className="screen-3d px-8 py-7" style={{ minHeight: 440 }}>
              <div className="flex items-center justify-between border-b border-[#d9cdb0] pb-3">
                <span className="font-serif text-[16px] font-bold tracking-wide text-[#16294a]">Instituto Pádua</span>
                <span className="text-[9px] uppercase tracking-wide text-[#647c97]">Laudo · 25/06/2026</span>
              </div>
              <h2 className="mt-5 text-center text-[15px] font-bold uppercase tracking-[0.16em] text-[#16294a]">{tipo.tituloDoc}</h2>

              <div className="mt-5 space-y-3 text-[12.5px] leading-relaxed text-[#3a4a57]">
                <p><strong>Cliente:</strong> Maria Silva Santos · 47 anos · CPF 123.456.789-00</p>
                <BlocoPrevia rotulo="Hipóteses diagnósticas (HD / CID)">{cidStr || "—"}.</BlocoPrevia>

                {tipoId === "saude" && (
                  <>
                    <BlocoPrevia rotulo="Achados">{achados}</BlocoPrevia>
                    <BlocoPrevia rotulo="Conclusão">{conclusao}</BlocoPrevia>
                  </>
                )}

                {tipoId === "inss" && (
                  <>
                    <p>
                      Atesto, para fins de <strong>{inssFinalidade}</strong> junto ao INSS, que a paciente
                      necessita de afastamento de suas atividades laborais por <strong>{inssDias} dias</strong>,
                      em caráter <strong>{inssNatureza === "temporaria" ? "temporário" : "permanente"}</strong>.
                    </p>
                    <BlocoPrevia rotulo="Justificativa clínica">{achados}</BlocoPrevia>
                  </>
                )}

                {tipoId === "insumo" && (
                  <>
                    <p>
                      Solicito, em caráter de <strong>uso contínuo</strong>, o fornecimento de{" "}
                      <strong>{insumo}</strong>, na quantidade de <strong>{insumoQtd}</strong>, para a paciente
                      acima identificada.
                    </p>
                    <BlocoPrevia rotulo="Justificativa clínica">{insumoJustif}</BlocoPrevia>
                  </>
                )}
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
          <button
            type="button"
            disabled={!tipoLiberado}
            className="btn-3d inline-flex items-center gap-1.5 px-5 py-2.5 text-[12px] font-bold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileSearch className="h-4 w-4" /> Assinar e gerar PDF
          </button>
        </section>

        <RodapeDoc rotulo={tipo.tituloDoc} />
      </main>
    </div>
  );
}

/* ---- helpers locais de campo ---- */
function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">{rotulo}</div>
      <div className="field-engraved px-3 py-2">{children}</div>
    </div>
  );
}

function CampoTexto({ rotulo, valor, set, h = 112 }: { rotulo: string; valor: string; set: (v: string) => void; h?: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">{rotulo}</span>
        <span className="flex items-center gap-1 text-[10px] text-[#647c97]"><PenLine className="h-3 w-3" /> reflete na prévia</span>
      </div>
      <textarea
        value={valor}
        onChange={(e) => set(e.target.value)}
        style={{ height: h }}
        className="field-engraved w-full resize-none px-3 py-2 text-[12.5px] leading-relaxed text-[#2c3e52] outline-none"
      />
    </div>
  );
}

function BlocoPrevia({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-[#647c97]">{rotulo}</div>
      <p className="whitespace-pre-wrap">{children}</p>
    </div>
  );
}

export default Laudo;
