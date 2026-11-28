import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { enderecoComoForm, textoDoLocal, useLocaisExternos } from "@/lib/locais-externos-api";
import type { EnderecoExternoForm } from "@/components/EnderecoExternoCampos";

/**
 * Escolhe um local externo cadastrado (consultório sublocado do mesmo CNPJ) e COPIA o endereço para a agenda.
 * Os campos de endereço logo abaixo continuam editáveis: dá para ajustar número/complemento ou digitar outro endereço.
 */
export function SeletorLocalExterno({ onEscolher }: { onEscolher: (e: EnderecoExternoForm) => void }) {
  const { data, isLoading, isError } = useLocaisExternos();
  const [valor, setValor] = useState("");
  const locais = data?.locais ?? [];
  return (
    <div className="space-y-1.5" data-testid="seletor-local-externo">
      <Label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Local externo cadastrado</Label>
      <Select
        value={valor}
        onValueChange={(v) => {
          if (!v) return; // Radix dispara "" ao montar/resetar: ignorar
          setValor(v);
          const local = locais.find((l) => String(l.id) === v);
          if (local) onEscolher(enderecoComoForm(local));
        }}
        disabled={isLoading || locais.length === 0}
      >
        <SelectTrigger className="field-engraved" aria-label="Local externo cadastrado">
          <SelectValue placeholder={isLoading ? "Carregando locais…" : locais.length ? "Escolha um local externo da clínica" : "Nenhum local externo cadastrado"} />
        </SelectTrigger>
        <SelectContent>
          {locais.map((l) => (
            <SelectItem key={l.id} value={String(l.id)}>
              {l.nome} — {textoDoLocal(l)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[10px] text-muted-foreground" role="status">
        {isError
          ? "Não foi possível ler os locais externos; digite o endereço abaixo."
          : "O endereço escolhido é copiado para a agenda e pode ser ajustado abaixo, ou digite outro endereço."}
      </p>
    </div>
  );
}
