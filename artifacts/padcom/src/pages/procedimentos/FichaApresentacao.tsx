import type { Substance } from "@workspace/api-client-react";
import { doseSugeridaProduto } from "./sugestao-produto";

export function viasInformadas(valor?: string | null): string {
  if (!valor?.trim()) return "não informada";
  const mapa: Record<string, string> = {
    IM: "intramuscular", INTRAMUSCULAR: "intramuscular",
    "IM PROFUNDO": "intramuscular profunda",
    EV: "endovenosa", IV: "endovenosa", ENDOVENOSA: "endovenosa",
    SC: "subcutânea", SUBCUTANEO: "subcutânea", SUBCUTANEA: "subcutânea",
    ID: "intradérmica", INTRADERMICA: "intradérmica",
  };
  return valor.split(/\s*[/,;]\s*/).map((parte) => {
    const chave = parte.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    return mapa[chave] ?? `não reconhecida: ${parte.trim()} (confira o cadastro)`;
  }).join(" / ");
}

/** Informações do catálogo, sem confundi-las com prescrição individual. */
export function FichaApresentacao({ produto }: { produto: Substance }) {
  const dose = doseSugeridaProduto(produto);
  const quantidade = produto.presentationQuantity != null ? String(produto.presentationQuantity) : "";
  const apresentacao = [quantidade, produto.presentationUnit?.trim()].filter(Boolean).join(" ");
  const volume = [
    produto.ampouleVolumeMl != null ? `${produto.ampouleVolumeMl} mL (estruturado)` : "",
    produto.volumeAmpola?.trim() ? `${produto.volumeAmpola.trim()} (legado)` : "",
  ].filter(Boolean).join(" · ");
  return (
    <span className="mt-1 block space-y-1 text-xs font-normal text-foreground" data-testid={`ficha-apresentacao-${produto.id}`}>
      <span className="block"><strong>Dose total:</strong> {dose ?? "não identificada — exige conferência"}</span>
      <span className="block"><strong>Apresentação:</strong> {apresentacao || "não informada"} · <strong>Volume:</strong> {volume || "não informado"}</span>
      <span className="block"><strong>Concentração legada:</strong> {produto.concentrationMg?.trim() || "não informada"} · <strong>Via:</strong> {viasInformadas(produto.viaUso)}</span>
      <span className="block"><strong>Identificador:</strong> {produto.id} · <strong>Cadastro original:</strong> {produto.defaultDose?.trim() || "não informado"}</span>
      {(produto.components?.length ?? 0) > 1 && produto.components?.map((c) => {
        const unit = c.doseUnit?.trim() ?? "";
        const valor = c.doseValue;
        const valido = typeof valor === "number" && Number.isFinite(valor) && valor > 0 && /^(?:mg|mcg|µg|μg|ug|g|ui|iu)$/i.test(unit);
        return <span className="block" key={c.id}>{c.componentName}: {valido
          ? `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 8 })} ${unit}`
          : "dose não identificada"}</span>;
      })}
    </span>
  );
}
