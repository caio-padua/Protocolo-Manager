// Toggle padrao Paxter (referencia: matriz de Governanca): trilho dourado ligado / sulco claro desligado,
// botao interno branco. Tamanhos proporcionais (trilho 11:6, botao 5:6 da altura do trilho).
const TAMANHOS = {
  sm: { trilho: "h-5 w-9", botao: 16, curso: 18, margem: 1 },
  md: { trilho: "h-6 w-11", botao: 20, curso: 22, margem: 2 },
} as const;

export function TogglePaxter({ ligado, onClick, desabilitado, rotulo, tamanho = "md", testid }: {
  ligado: boolean; onClick: () => void; desabilitado?: boolean; rotulo?: string; tamanho?: keyof typeof TAMANHOS; testid?: string;
}) {
  const t = TAMANHOS[tamanho];
  return (
    <button type="button" role="switch" aria-checked={ligado} aria-label={rotulo} disabled={desabilitado} onClick={onClick} data-testid={testid}
      className={`relative inline-flex ${t.trilho} shrink-0 items-center rounded-[5px] transition-colors disabled:cursor-not-allowed disabled:opacity-60`}
      style={{
        background: ligado ? "linear-gradient(180deg,#d8b96a,#a9863f)" : "linear-gradient(160deg,#ece6d7,#f6f1e6)",
        border: ligado ? "1px solid rgba(120,92,36,0.7)" : "1px solid rgba(184,146,77,0.4)",
        boxShadow: ligado ? "inset 0 2px 0 rgba(255,246,214,0.9), inset 0 -4px 8px rgba(120,80,20,0.3)" : "inset 0 3px 6px rgba(7,22,43,0.18)",
      }}>
      <span className="absolute rounded-[3px] transition-all" style={{
        width: t.botao, height: t.botao, left: ligado ? t.curso : t.margem,
        background: "linear-gradient(180deg,#ffffff,#efe8d6)", border: "1px solid rgba(184,146,77,0.5)",
        boxShadow: "0 2px 4px rgba(7,22,43,0.35), inset 0 1px 0 #fff",
      }} />
    </button>
  );
}
