import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { COLLAB_EVENT, collabAuthHeaders } from "@/lib/collab-auth";
import VariantesSubstancia, { type VarianteSubstancia } from "./VariantesSubstancia";

const ofertaSchema = z.object({
  id: z.number(), fornecedor: z.string(), quantidadeEmbalagem: z.number(),
  custoUnitarioCentavos: z.number().int(), custoEmbalagemCentavos: z.number().int(),
  documento: z.string(), pagina: z.number(), linha: z.number(),
  embalagemOriginal: z.string(), fonteDataNomeArquivo: z.string().nullable(),
});
const respostaSchema = z.object({ clinica: z.string(), variantes: z.array(z.object({
  id: z.number(), doseTotal: z.string(), forma: z.string(), volumeMl: z.string().nullable(),
  concentracao: z.string().nullable(), composicao: z.string().nullable(), subtipoImplante: z.string().nullable(),
  viasFonte: z.string(), ofertas: z.array(ofertaSchema),
})) });

export function VariantesSubstanciaConsulta({ substanceId }: { substanceId: number }) {
  const [revisaoSessao, setRevisaoSessao] = useState(0);
  const [dados, setDados] = useState<VarianteSubstancia[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [clinica, setClinica] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const geracaoSessao = useRef(0);

  useEffect(() => {
    const mudouSessao = () => {
      geracaoSessao.current += 1;
      setDados(null);
      setClinica(null);
      setErro(null);
      setCarregando(true);
      setRevisaoSessao(v => v + 1);
    };
    window.addEventListener(COLLAB_EVENT, mudouSessao);
    window.addEventListener("storage", mudouSessao);
    return () => {
      window.removeEventListener(COLLAB_EVENT, mudouSessao);
      window.removeEventListener("storage", mudouSessao);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const geracao = geracaoSessao.current;
    setDados(null);
    setClinica(null);
    setErro(null);
    setCarregando(true);
    void (async () => {
      try {
        const resposta = await fetch(`/api/substances/${substanceId}/variantes`, {
          headers: collabAuthHeaders(), signal: controller.signal,
        });
        if (!resposta.ok) {
          if (resposta.status === 401) throw new Error("Entre novamente para consultar as ofertas.");
          if (resposta.status === 403) throw new Error("Seu acesso não permite consultar as ofertas desta clínica.");
          throw new Error("A consulta das ofertas está indisponível neste momento.");
        }
        const parsed = respostaSchema.parse(await resposta.json());
        if (controller.signal.aborted || geracao !== geracaoSessao.current) return;
        setClinica(parsed.clinica);
        setDados(parsed.variantes.map(v => ({
          id: v.id, doseTotal: v.doseTotal, forma: v.forma,
          volume: v.volumeMl === null ? null : `${v.volumeMl} mL`,
          concentracao: v.concentracao, composicao: v.composicao, subtipoImplante: v.subtipoImplante,
          vias: v.viasFonte ? [v.viasFonte] : [],
          ofertas: v.ofertas.map(o => ({
            fornecedor: o.fornecedor, quantidadeEmbalagem: o.embalagemOriginal,
            custoUnitarioReais: o.custoUnitarioCentavos / 100,
            custoEmbalagemReais: o.custoEmbalagemCentavos / 100,
            documento: o.documento, pagina: o.pagina, linha: o.linha,
            fonteHistorica: true,
          })),
        })));
      } catch (e) {
        if (!controller.signal.aborted && geracao === geracaoSessao.current)
          setErro(e instanceof z.ZodError ? "Os dados das ofertas recebidos são inválidos." : e instanceof Error ? e.message : "Não foi possível consultar as ofertas.");
      } finally {
        if (!controller.signal.aborted && geracao === geracaoSessao.current) setCarregando(false);
      }
    })();
    return () => controller.abort();
  }, [substanceId, revisaoSessao]);

  return (
    <div className="mt-5">
      <p className="mb-2 text-xs text-muted-foreground">Consulta das ofertas registradas; edição das ofertas ainda não disponível.</p>
      {clinica && <p className="mb-2 text-xs font-semibold">Clínica da sessão: {clinica}</p>}
      <VariantesSubstancia dados={dados} erro={erro} carregando={carregando} />
    </div>
  );
}
