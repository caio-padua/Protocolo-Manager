// PARÂMETROS DE SAÚDE — /configuracoes/parametros-saude
// Fotos de orientação da antropometria: uma por região, mostrada na "Nova medição"
// do Cockpit (quadradinho que amplia ao clicar). Sem foto, a tela usa o desenho simples.
import { useRef, useState } from "react";
import { Ruler, Upload, Trash2, Loader2, ImageIcon } from "lucide-react";
import { SettingsPanel } from "@/components/settings/SettingsUI";
import { useToast } from "@/hooks/use-toast";
import { REGIOES_FITA } from "@/pages/cockpit-cliente/avaliacoes/FigurasFita";
import { useFigurasMeta, useFiguraUrl, useRemoverFigura, useSalvarFigura } from "@/pages/cockpit-cliente/avaliacoes/api";

function Cartao({ regiao, titulo, dica, versao }: { regiao: string; titulo: string; dica: string; versao: string | null }) {
  const { toast } = useToast();
  const entrada = useRef<HTMLInputElement>(null);
  const [removendo, setRemovendo] = useState(false);
  const salvar = useSalvarFigura();
  const remover = useRemoverFigura();
  const { data: url } = useFiguraUrl(versao ? regiao : null, versao);

  const aoEscolher = async (arq: File | undefined) => {
    if (entrada.current) entrada.current.value = "";
    if (!arq) return;
    try {
      await salvar.mutateAsync({ regiao, arquivo: arq });
      toast({ title: "Foto salva", description: titulo });
    } catch (e) {
      toast({ title: "Não foi possível salvar", description: e instanceof Error ? e.message : "Tente novamente.", variant: "destructive" });
    }
  };
  const aoRemover = async () => {
    setRemovendo(true);
    try { await remover.mutateAsync(regiao); toast({ title: "Foto removida", description: titulo }); }
    catch (e) { toast({ title: "Não foi possível remover", description: e instanceof Error ? e.message : "Tente novamente.", variant: "destructive" }); }
    finally { setRemovendo(false); }
  };

  return (
    <div className="panel-3d-sub flex flex-col gap-3 p-4">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-widest text-foreground">{titulo}</p>
        <p className="mt-1 text-xs text-muted-foreground">{dica}</p>
      </div>
      <div className="concave-3d flex aspect-[4/3] items-center justify-center overflow-hidden">
        {url ? <img src={url} alt={`Foto de como medir ${titulo}`} className="h-full w-full object-contain" />
          : <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground"><ImageIcon className="h-6 w-6" />Sem foto (usa o desenho simples)</span>}
      </div>
      <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
        onChange={(e) => void aoEscolher(e.target.files?.[0])} />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => entrada.current?.click()} disabled={salvar.isPending}
          className="btn-3d-soft inline-flex items-center gap-2 px-3 py-2 text-[10px] font-extrabold uppercase tracking-widest">
          {salvar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {versao ? "Trocar foto" : "Enviar foto"}
        </button>
        {versao && (
          <button type="button" onClick={() => void aoRemover()} disabled={removendo}
            className="btn-3d-soft inline-flex items-center gap-2 px-3 py-2 text-[10px] font-extrabold uppercase tracking-widest">
            {removendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Remover
          </button>
        )}
      </div>
    </div>
  );
}

export default function ParametrosSaude() {
  const { data: metas, isLoading, error } = useFigurasMeta();
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <SettingsPanel icon={Ruler} title="Antropometria: fotos de como medir">
        <p className="mb-4 text-sm text-muted-foreground">
          A foto enviada aparece no quadradinho de cada circunferência da <strong>Nova medição</strong>.
          Ao clicar nele, a foto abre em tamanho grande para o profissional ver onde passar a fita.
          Direito e esquerdo usam a mesma foto. Formatos aceitos: PNG, JPEG ou WebP, até 4 MB.
        </p>
        {error && <p className="mb-4 text-sm text-red-600">{error instanceof Error ? error.message : "Erro ao carregar."}</p>}
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {REGIOES_FITA.map((r) => (
              <Cartao key={r.regiao} regiao={r.regiao} titulo={r.titulo} dica={r.dica}
                versao={metas?.find((m) => m.regiao === r.regiao)?.atualizadoEm ?? null} />
            ))}
          </div>
        )}
      </SettingsPanel>
    </div>
  );
}
