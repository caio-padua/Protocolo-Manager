import type { ReactNode } from "react";
import { LEGENDAS_ORIGEM, type CodigoLegenda } from "@/lib/legendas-origem-protocolo";

/** Placa Saliente (bevel) com o título + legenda de origem no canto direito. */
export function PlacaComOrigem({ titulo, codigo, icone, legendaAbaixo = false }: {
  titulo: string; codigo: CodigoLegenda; icone?: ReactNode;
  /** Mostra o caminho da origem por extenso logo abaixo da placa (usado quando não há poço de resposta). */
  legendaAbaixo?: boolean;
}) {
  const origem = LEGENDAS_ORIGEM[codigo];
  return (
    <div>
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="bevel-3d inline-flex items-center gap-1.5 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-muted-foreground min-w-0">
          {icone}<span>{titulo}</span>
        </span>
        <b
          className="concave-3d px-1.5 py-0.5 text-[10px] font-black leading-none text-foreground shrink-0"
          title={`${codigo} — origem: ${origem}`}
          data-legenda-origem={codigo}
        >{codigo}</b>
      </div>
      {legendaAbaixo && <LegendaOrigem codigo={codigo} />}
    </div>
  );
}

/** Caminho da tela/planilha de origem, por extenso, em letra pequena. */
export function LegendaOrigem({ codigo }: { codigo: CodigoLegenda }) {
  return (
    <p className="text-[9px] leading-tight text-muted-foreground mt-1 text-right">
      <b className="text-foreground">{codigo}</b> = {LEGENDAS_ORIGEM[codigo]}
    </p>
  );
}

/** Campo ligado: título em Saliente, resposta em Côncavo (somente leitura), legenda de origem no canto. */
export function CampoLigado({ titulo, codigo, icone, children, estado = "ok" }: {
  titulo: string; codigo: CodigoLegenda; icone?: ReactNode; children: ReactNode;
  /** "ausente" = o cadastro de origem não tem o dado; mostramos o motivo, nunca um valor inventado. */
  estado?: "ok" | "ausente";
}) {
  return (
    <div className="space-y-1.5" data-campo-ligado={codigo}>
      <PlacaComOrigem titulo={titulo} codigo={codigo} icone={icone} />
      <div
        className={`concave-3d rounded-md px-3 py-2.5 text-sm font-semibold min-h-[2.75rem] ${estado === "ausente" ? "text-destructive" : ""}`}
        aria-readonly="true"
      >
        {children}
      </div>
      <LegendaOrigem codigo={codigo} />
    </div>
  );
}
