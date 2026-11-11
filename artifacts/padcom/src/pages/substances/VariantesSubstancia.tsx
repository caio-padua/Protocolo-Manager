import { AlertCircle, Archive, Beaker, FileText, FlaskConical, Package, Pill, RefreshCw, Syringe } from "lucide-react";

export interface OfertaVarianteSubstancia {
  fornecedor: string;
  quantidadeEmbalagem: string;
  custoUnitarioReais: number | null;
  custoEmbalagemReais: number | null;
  documento: string;
  pagina: string | number | null;
  linha: string | number | null;
  fonteHistorica?: boolean;
}

export interface VarianteSubstancia {
  id: string | number;
  doseTotal: string | null;
  forma: string | null;
  volume: string | null;
  concentracao: string | null;
  composicao: string | null;
  subtipoImplante: string | null;
  vias: string[];
  ofertas: OfertaVarianteSubstancia[];
}

export interface VariantesSubstanciaProps {
  dados: VarianteSubstancia[] | null | undefined;
  carregando: boolean;
  erro: string | null;
}

const informado = (valor: string | null | undefined) => valor?.trim() || "Não informado na fonte";

function dinheiro(valor: number | null): string {
  if (valor === null || !Number.isFinite(valor)) return "Não informado";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function FieldValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-sm border border-amber-900/10 bg-white/65 px-3 py-2 shadow-[inset_0_2px_5px_rgba(7,22,43,0.07)]">
      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold leading-snug text-slate-800">{value}</dd>
    </div>
  );
}

function OfferCard({ oferta }: { oferta: OfertaVarianteSubstancia }) {
  return (
    <article className="panel-3d-sub min-w-0 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-amber-900/10 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="bevel-3d flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-[#183653]">
            <Package className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Fornecedor</p>
            <h4 className="truncate text-sm font-bold text-[#173452]">{informado(oferta.fornecedor)}</h4>
          </div>
        </div>
        {oferta.fonteHistorica && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-amber-700/25 bg-amber-100/75 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-950">
            <Archive className="h-3 w-3" aria-hidden="true" /> Fonte histórica
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <FieldValue label="Embalagem" value={informado(oferta.quantidadeEmbalagem)} />
        <FieldValue label="Custo unitário" value={dinheiro(oferta.custoUnitarioReais)} />
        <div className="col-span-2">
          <div className="screen-3d rounded-sm px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Custo da embalagem</p>
            <p className="mt-0.5 text-lg font-extrabold tabular-nums text-[#173452]">{dinheiro(oferta.custoEmbalagemReais)}</p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex min-w-0 items-start gap-2 border-t border-amber-900/10 pt-3 text-xs text-slate-600">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#9a7639]" aria-hidden="true" />
        <p className="min-w-0 break-words leading-relaxed">
          <span className="font-semibold text-slate-700">{informado(oferta.documento)}</span>
          <span className="mx-1.5 text-slate-400">·</span>
          Página {oferta.pagina ?? "não informada"}
          <span className="mx-1.5 text-slate-400">·</span>
          Linha {oferta.linha ?? "não informada"}
        </p>
      </div>
      {oferta.fonteHistorica && (
        <p className="mt-2 border-l-2 border-amber-600/50 pl-2 text-[11px] leading-snug text-amber-950/80">
          Registro histórico: este valor não representa confirmação de preço vigente.
        </p>
      )}
    </article>
  );
}

function LoadingState() {
  return (
    <div role="status" aria-label="Carregando variantes" className="space-y-3">
      <span className="sr-only">Carregando variantes e ofertas...</span>
      {[0, 1].map((item) => (
        <div key={item} className="panel-3d-sub animate-pulse p-4">
          <div className="h-4 w-40 rounded-sm bg-slate-300/60" />
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((field) => <div key={field} className="h-14 rounded-sm bg-slate-200/70" />)}
          </div>
          <div className="mt-4 h-20 rounded-sm bg-slate-200/60" />
        </div>
      ))}
    </div>
  );
}

export function VariantesSubstancia({ dados, carregando, erro }: VariantesSubstanciaProps) {
  return (
    <section aria-labelledby="variantes-substancia-titulo" className="panel-3d overflow-hidden p-4 sm:p-5">
      <header className="mb-4 flex items-start gap-3 border-b border-amber-900/15 pb-4">
        <div className="bevel-3d flex h-10 w-10 shrink-0 items-center justify-center rounded-sm text-[#183653]">
          <FlaskConical className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#94743c]">Referência de apresentação</p>
          <h2 id="variantes-substancia-titulo" className="text-lg font-bold leading-tight text-[#173452] sm:text-xl">
            Variantes e ofertas
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Especificações e custos conforme os documentos de origem.
          </p>
        </div>
      </header>

      {carregando ? <LoadingState /> : erro ? (
        <div role="alert" className="panel-3d-sub flex items-start gap-3 border-l-4 border-l-rose-700 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-bold text-[#173452]">Não foi possível carregar as variantes</h3>
            <p className="mt-1 text-sm text-slate-600">{erro}</p>
          </div>
        </div>
      ) : !dados?.length ? (
        <div className="panel-3d-sub flex flex-col items-center px-5 py-8 text-center">
          <div className="concave-3d flex h-12 w-12 items-center justify-center rounded-sm text-[#597083]">
            <Beaker className="h-5 w-5" aria-hidden="true" />
          </div>
          <h3 className="mt-3 text-sm font-bold text-[#173452]">Nenhuma variante disponível</h3>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-600">
            Não há variantes ou ofertas informadas para esta substância.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {dados.map((variante, index) => (
            <article key={variante.id} className="panel-3d-sub overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-900/10 bg-[#e9e2d2]/45 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="concave-3d flex h-8 w-8 items-center justify-center rounded-sm text-[#173452]">
                    <Syringe className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <h3 className="text-sm font-bold text-[#173452]">Variante {index + 1}</h3>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-sm border border-[#173452]/15 bg-white/55 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#173452]">
                  <Pill className="h-3 w-3" aria-hidden="true" />
                  {informado(variante.forma)}
                </span>
              </div>

              <div className="p-3 sm:p-4">
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  <FieldValue label="Dose total" value={informado(variante.doseTotal)} />
                  <FieldValue label="Forma" value={informado(variante.forma)} />
                  <FieldValue label="Volume" value={informado(variante.volume)} />
                  <FieldValue label="Concentração" value={informado(variante.concentracao)} />
                  {variante.composicao && <FieldValue label="Composição" value={variante.composicao} />}
                  {variante.subtipoImplante && <FieldValue label="Tipo de implante" value={variante.subtipoImplante === "nao_absorvivel" ? "Não absorvível (silástico)" : variante.subtipoImplante === "absorvivel" ? "Absorvível" : variante.subtipoImplante} />}
                  <div className="col-span-2 min-w-0 rounded-sm border border-amber-900/10 bg-white/65 px-3 py-2 shadow-[inset_0_2px_5px_rgba(7,22,43,0.07)] sm:col-span-1">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Vias</dt>
                    <dd className="mt-1 break-words text-sm font-semibold leading-snug text-slate-800">
                      {variante.vias?.length ? variante.vias.join(", ") : "Não informado na fonte"}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#173452]">Ofertas da fonte</h4>
                    <span className="text-[10px] font-semibold text-slate-500">{variante.ofertas.length} {variante.ofertas.length === 1 ? "registro" : "registros"}</span>
                  </div>
                  {variante.ofertas.length ? (
                    <div className="grid gap-3 xl:grid-cols-2">
                      {variante.ofertas.map((oferta, offerIndex) => (
                        <OfferCard key={`${variante.id}-oferta-${offerIndex}`} oferta={oferta} />
                      ))}
                    </div>
                  ) : (
                    <div className="concave-3d flex items-center gap-2 px-3 py-3 text-xs text-slate-600">
                      <RefreshCw className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                      Nenhuma oferta foi informada para esta variante.
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default VariantesSubstancia;
