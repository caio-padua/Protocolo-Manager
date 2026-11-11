import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Trilho de abas dos cadastros (Padrão 36 da skill-layout-paxter).
 * UMA linha só, retângulos de mesma altura (ícone em cima, nome curto embaixo), nunca quebra em
 * duas linhas: a altura do trilho é sempre a mesma, então o miolo do diálogo nunca "pula".
 * Em tela estreita o trilho rola para o lado em vez de quebrar.
 * Itens de grupos diferentes ficam separados por um respiro maior (grupo = assunto).
 * Precisa ficar dentro de um <Tabs>.
 */
export interface ItemTrilho {
  value: string;
  label: string;
  icon: LucideIcon;
  grupo: string;
}

/** pendencias[value] = quantos campos faltam na aba (0 = completa). Aba fora do mapa nao mostra selo. */
export function TrilhoAbas({ itens, rotulo, testidPrefixo, pendencias }: {
  itens: ItemTrilho[];
  rotulo: string;
  testidPrefixo: string;
  pendencias?: Record<string, number>;
}) {
  return (
    <TabsList
      aria-label={rotulo}
      className="w-full h-[4.25rem] flex flex-nowrap items-stretch justify-start gap-1 overflow-x-auto overflow-y-hidden bg-transparent p-1 border-b border-border/30 rounded-none"
    >
      {itens.map(({ value, label, icon: Icone, grupo }, i) => (
        <TabsTrigger
          key={value}
          value={value}
          data-testid={`${testidPrefixo}-${value}`}
          title={label}
          className={`relative bevel-3d empresa-aba flex-1 min-w-[5rem] h-full flex-col gap-1 whitespace-normal px-1 py-1 text-[9px] font-black uppercase leading-tight tracking-wide ${
            i > 0 && itens[i - 1].grupo !== grupo ? "ml-2" : ""
          }`}
        >
          <Icone className="w-4 h-4 shrink-0" aria-hidden />
          <span className="text-center">{label}</span>
          {pendencias && value in pendencias && (
            <span
              data-testid={`${testidPrefixo}-selo-${value}`}
              data-pendentes={pendencias[value]}
              title={pendencias[value] === 0 ? "Aba completa" : `${pendencias[value]} campo(s) sem preencher`}
              className={`absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-black leading-none text-white ${
                pendencias[value] === 0 ? "bg-emerald-600" : "bg-amber-600"
              }`}
            >
              {pendencias[value] === 0 ? <Check className="h-2.5 w-2.5" aria-hidden /> : pendencias[value]}
            </span>
          )}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
