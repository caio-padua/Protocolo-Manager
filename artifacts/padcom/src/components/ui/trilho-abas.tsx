import { TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Trilho de abas dos cadastros (Padrões 36 e 40 da skill-layout-paxter).
 * UMA linha só, retângulos de mesma altura com o nome escrito (sem símbolo, sem contador), nunca quebra em
 * duas linhas: a altura do trilho é sempre a mesma, então o miolo do diálogo nunca "pula".
 * Em tela estreita o trilho rola para o lado em vez de quebrar. Aba escolhida = afundada (insert bevel), sem trocar de cor.
 * Itens de grupos diferentes ficam separados por um respiro maior (grupo = assunto).
 * Precisa ficar dentro de um <Tabs>.
 */
export interface ItemTrilho {
  value: string;
  label: string;
  grupo: string;
}

export function TrilhoAbas({ itens, rotulo, testidPrefixo }: {
  itens: ItemTrilho[];
  rotulo: string;
  testidPrefixo: string;
}) {
  return (
    <TabsList
      aria-label={rotulo}
      className="w-full h-12 flex flex-nowrap items-stretch justify-start gap-1 overflow-x-auto overflow-y-hidden bg-transparent p-1 border-b border-border/30 rounded-none"
    >
      {itens.map(({ value, label, grupo }, i) => (
        <TabsTrigger
          key={value}
          value={value}
          data-testid={`${testidPrefixo}-${value}`}
          title={label}
          className={`bevel-3d empresa-aba flex-1 min-w-[5rem] h-full whitespace-normal px-1 py-1 text-[9px] font-black uppercase leading-tight tracking-wide ${
            i > 0 && itens[i - 1].grupo !== grupo ? "ml-2" : ""
          }`}
        >
          <span className="text-center">{label}</span>
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
