import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type EnderecoExternoForm = {
  cep: string; logradouro: string; bairro: string; cidade: string; uf: string; numero: string; complemento: string;
};
export const ENDERECO_VAZIO: EnderecoExternoForm = { cep: "", logradouro: "", bairro: "", cidade: "", uf: "", numero: "", complemento: "" };

export function enderecoCompleto(e: EnderecoExternoForm): boolean {
  return e.cep.replace(/\D/g, "").length === 8 && !!e.logradouro.trim() && !!e.bairro.trim()
    && !!e.cidade.trim() && e.uf.trim().length === 2 && !!e.numero.trim();
}

const mascaraCep = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

/** CEP preenche rua, bairro, cidade e UF; a pessoa digita número e complemento. Se a busca falhar, os campos ficam editáveis. */
export function EnderecoExternoCampos({ value, onChange }: { value: EnderecoExternoForm; onChange: (v: EnderecoExternoForm) => void }) {
  const seq = useRef(0);
  const [status, setStatus] = useState<"idle" | "buscando" | "achou" | "falhou">("idle");
  const travado = status === "achou";

  async function buscar(cepMascarado: string) {
    const cep = cepMascarado.replace(/\D/g, "");
    if (cep.length !== 8) { setStatus("idle"); return; }
    const minha = ++seq.current;
    setStatus("buscando");
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await r.json();
      if (minha !== seq.current) return; // resposta de um CEP antigo: descartada
      if (d.erro || !d.logradouro) { setStatus("falhou"); return; }
      setStatus("achou");
      onChange({ ...value, cep: mascaraCep(cep), logradouro: d.logradouro ?? "", bairro: d.bairro ?? "", cidade: d.localidade ?? "", uf: d.uf ?? "" });
    } catch {
      if (minha === seq.current) setStatus("falhou");
    }
  }

  return (
    <div className="space-y-2" data-testid="endereco-externo">
      <Label className="block text-[10px] uppercase tracking-wide text-muted-foreground">CEP do endereço externo</Label>
      <Input
        className="field-engraved"
        inputMode="numeric"
        placeholder="00000-000"
        aria-label="CEP"
        value={value.cep}
        onChange={(e) => {
          const cep = mascaraCep(e.target.value);
          if (cep.replace(/\D/g, "").length < 8) { seq.current++; setStatus("idle"); }
          onChange({ ...value, cep });
          if (cep.replace(/\D/g, "").length === 8) void buscar(cep);
        }}
      />
      <p className="text-[10px] text-muted-foreground" role="status">
        {status === "buscando" && "Buscando o CEP..."}
        {status === "achou" && "Endereço encontrado. Informe número e complemento."}
        {status === "falhou" && "CEP não encontrado: preencha rua, bairro, cidade e UF à mão."}
        {status === "idle" && "Digite o CEP; rua, bairro, cidade e UF vêm sozinhos."}
      </p>
      <Input className="field-engraved" placeholder="Rua" aria-label="Rua" value={value.logradouro} readOnly={travado}
        onChange={(e) => onChange({ ...value, logradouro: e.target.value })} />
      <Input className="field-engraved" placeholder="Bairro" aria-label="Bairro" value={value.bairro} readOnly={travado}
        onChange={(e) => onChange({ ...value, bairro: e.target.value })} />
      <div className="grid grid-cols-[1fr_64px] gap-2">
        <Input className="field-engraved" placeholder="Cidade" aria-label="Cidade" value={value.cidade} readOnly={travado}
          onChange={(e) => onChange({ ...value, cidade: e.target.value })} />
        <Input className="field-engraved" placeholder="UF" aria-label="UF" maxLength={2} value={value.uf} readOnly={travado}
          onChange={(e) => onChange({ ...value, uf: e.target.value.toUpperCase() })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input className="field-engraved" placeholder="Número" aria-label="Número" value={value.numero}
          onChange={(e) => onChange({ ...value, numero: e.target.value })} />
        <Input className="field-engraved" placeholder="Complemento" aria-label="Complemento" value={value.complemento}
          onChange={(e) => onChange({ ...value, complemento: e.target.value })} />
      </div>
    </div>
  );
}
