import { useId, useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  nomeCabecalho: string;
  rodapeLinha1: string;
  rodapeLinha2: string;
  rodapeLinha3: string;
  simbolo: string | null;
};

export function PreviaIdentidadeEmpresa({ nomeCabecalho, rodapeLinha1, rodapeLinha2, rodapeLinha3, simbolo }: Props) {
  const [ampliada, setAmpliada] = useState(false);
  const id = useId().replace(/:/g, "");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context) context.font = "bold 20px 'Times New Roman'";
  const largura = context?.measureText(nomeCabecalho).width ?? 0;
  const fontSize = largura ? 7.06 * Math.min(1, (54 * 72 / 25.4) / largura) : 7.06;
  return (
    <div className="panel-3d-sub p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-xs">Prévia de posicionamento</p>
          <p className="text-[10px] text-muted-foreground">Ilustração aproximada; confirme na prévia salva.</p>
        </div>
        <Button type="button" className="btn-3d-soft shrink-0" onClick={() => setAmpliada((value) => !value)}>
          {ampliada ? "Reduzir prévia" : "Ampliar prévia"}
        </Button>
      </div>
      <div className="concave-3d p-2 overflow-auto" aria-label="Prévia do cabeçalho e rodapé">
        <div style={{ width: ampliada ? "200%" : "100%", minWidth: ampliada ? 650 : 0 }}>
          <svg viewBox="0 0 210 39" className="w-full" role="img" aria-label="Prévia aproximada do cabeçalho">
            <defs>
              <linearGradient id={`${id}-navy`} x1="0" x2="1" y1="0" y2="1"><stop stopColor="#071326" /><stop offset="1" stopColor="#183252" /></linearGradient>
              <linearGradient id={`${id}-gold`} x1="0" x2="0" y1="0" y2="1">
                <stop stopColor="#976017" /><stop offset=".18" stopColor="#f0be53" /><stop offset=".34" stopColor="#f1d690" />
                <stop offset=".52" stopColor="#c8831b" /><stop offset=".72" stopColor="#f0be53" /><stop offset="1" stopColor="#976017" />
              </linearGradient>
              <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x="14" y="5" width="16" height="21" style={{ maskType: "alpha" }}>
                {simbolo && <image href={simbolo} x="14" y="5" width="16" height="21" preserveAspectRatio="xMidYMid meet" />}
              </mask>
            </defs>
            <rect x="5" y="1" width="200" height="32" rx="2" fill={`url(#${id}-navy)`} stroke="#d1ad61" strokeWidth=".3" />
            <rect x="14" y="5" width="16" height="21" fill={`url(#${id}-gold)`} mask={`url(#${id}-mask)`} />
            <text x="34" y="20" fill="#efd07d" fontFamily="Times New Roman, serif" fontWeight="bold" fontSize={fontSize}>{nomeCabecalho || "Nome da clínica"}</text>
            <line x1="91" x2="91" y1="8" y2="26" stroke="#d1ad61" strokeWidth=".35" />
            <text x="96.2" y="14.5" fill="#f7d994" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="5.15">PRESCRIÇÃO MÉDICA</text>
            <text x="96.2" y="22.5" fill="#f5f0e8" fontFamily="Arial, sans-serif" fontSize="3.15">PRÉVIA DE TESTE</text>
          </svg>
          <svg viewBox="0 0 210 36" className="w-full bg-white" role="img" aria-label="Prévia aproximada do rodapé">
            <line x1="11" x2="199" y1="2" y2="2" stroke="#cb9b4a" strokeWidth=".35" />
            <text x="11" y="18" fill="#ad8a43" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="5">PAXMED</text>
            <text x="105" y="13" textAnchor="middle" fill="#142238" fontFamily="Times New Roman, serif" fontWeight="bold" fontSize="4.45">{rodapeLinha1 || "Primeira linha"}</text>
            <text x="105" y="19" textAnchor="middle" fill="#142238" fontFamily="Arial, sans-serif" fontSize="2.7">{rodapeLinha2 || "Segunda linha"}</text>
            <text x="105" y="23.25" textAnchor="middle" fill="#142238" fontFamily="Arial, sans-serif" fontSize="2.7">{rodapeLinha3 || "Terceira linha"}</text>
            <rect x="180.7" y="7" width="18.3" height="18.3" fill="none" stroke="#142238" strokeWidth=".2" />
            <text x="189.85" y="16" textAnchor="middle" fill="#142238" fontFamily="Arial, sans-serif" fontSize="2">SEM CÓDIGO</text>
          </svg>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">O símbolo é centralizado automaticamente. Linhas muito longas serão recusadas ao salvar.</p>
    </div>
  );
}

// A prévia local recorta apenas as margens transparentes, como a prova no servidor.
export async function prepararSimboloLocal(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.width || !image.height || image.width > 4096 || image.height > 4096 || image.width * image.height > 8_000_000) {
      throw new Error("As dimensões da imagem são inválidas ou excessivas.");
    }
    const source = document.createElement("canvas");
    source.width = image.width; source.height = image.height;
    const context = source.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Não foi possível preparar a prévia do símbolo.");
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, image.width, image.height).data;
    let left = image.width, top = image.height, right = -1, bottom = -1, transparent = 0, visible = 0;
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const alpha = data[(y * image.width + x) * 4 + 3];
      if (alpha === 0) transparent++;
      if (alpha >= 128) visible++;
      if (alpha !== 0) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
    }
    if (transparent < image.width * image.height * 0.01 || visible < image.width * image.height * 0.005) {
      throw new Error("O símbolo precisa ter fundo transparente e conteúdo visível.");
    }
    const result = document.createElement("canvas");
    result.width = right - left + 1; result.height = bottom - top + 1;
    result.getContext("2d")!.drawImage(source, left, top, result.width, result.height, 0, 0, result.width, result.height);
    return result.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}
