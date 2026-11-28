import { useState } from "react";
import { getCollabToken } from "@/lib/collab-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function NovaCategoria({ onCreated }: {
  onCreated: (category: { id: number; professionalType: "medico" | "nao_medico" }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    setError("");
    setSaving(true);
    try {
      const response = await fetch(`${BASE}/api/professional-areas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getCollabToken() ?? ""}` },
        body: JSON.stringify({ name, professionalType: type }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível cadastrar a categoria.");
      onCreated(data);
      setName("");
      setType("");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível cadastrar a categoria.");
    } finally { setSaving(false); }
  };

  if (!open) return <Button type="button" className="btn-3d-soft" onClick={() => setOpen(true)}>Adicionar categoria profissional</Button>;
  return <div className="panel-3d-sub p-3 space-y-2">
    <p className="text-xs font-bold">Nova categoria profissional</p>
    <Input aria-label="Nome da categoria profissional" placeholder="Ex.: Biomedicina" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="field-engraved" />
    <label className="block text-xs" htmlFor="tipo-nova-categoria">Tipo profissional da categoria</label>
    <select id="tipo-nova-categoria" className="field-engraved w-full p-2 text-xs" value={type} onChange={(e) => setType(e.target.value)}>
      <option value="">Selecione explicitamente</option>
      <option value="medico">Médico</option>
      <option value="nao_medico">Não médico</option>
    </select>
    <p className="text-xs text-muted-foreground">A categoria é compartilhada no catálogo e não altera as permissões de acesso.</p>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <div className="flex gap-2">
      <Button type="button" className="btn-3d-soft" onClick={() => setOpen(false)}>Cancelar</Button>
      <Button type="button" className="btn-3d" disabled={saving || name.trim().length < 2 || !type} onClick={create}>Salvar categoria</Button>
    </div>
  </div>;
}
