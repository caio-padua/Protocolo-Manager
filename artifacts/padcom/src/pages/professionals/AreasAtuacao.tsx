import { useEffect, useState } from "react";
import { getCollabToken } from "@/lib/collab-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
type Area = { id: number; name: string; requiredForCategories?: string[] };
export type EstadoAreas = { ids: number[]; disponivel: boolean; alterado: boolean };

export function AreasAtuacao({ professionalId, canEdit, onChange, categorySlug }: {
  professionalId: number | null;
  canEdit: boolean;
  onChange: (state: EstadoAreas) => void;
  categorySlug: string | null;
}) {
  const [areas, setAreas] = useState<Area[]>([]);
  const [ids, setIds] = useState<number[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const headers = () => ({ Authorization: `Bearer ${getCollabToken() ?? ""}` });

  useEffect(() => {
    let alive = true;
    setReady(false);
    setError("");
    onChange({ ids: [], disponivel: false, alterado: false });
    (async () => {
      try {
        const [catalog, links] = await Promise.all([
          fetch(`${BASE}/api/professional-work-areas`, { headers: headers() }),
          professionalId ? fetch(`${BASE}/api/professionals/${professionalId}/work-areas`, { headers: headers() }) : null,
        ]);
        if (!catalog.ok || (links && !links.ok)) throw new Error("Não foi possível carregar as áreas de atuação. Os vínculos existentes serão preservados.");
        const all = await catalog.json() as Area[];
        const selected = links ? await links.json() as number[] : [];
        if (!Array.isArray(all) || !Array.isArray(selected)) throw new Error("Resposta inválida ao consultar as áreas.");
        if (!alive) return;
        setAreas(all);
        setIds(selected);
        setReady(true);
        onChange({ ids: selected, disponivel: true, alterado: false });
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Não foi possível carregar as áreas.");
      }
    })();
    return () => { alive = false; };
  }, [professionalId, onChange]);

  const requiredArea = areas.find((area) => categorySlug && area.requiredForCategories?.includes(categorySlug));
  useEffect(() => {
    if (!ready || !requiredArea || ids.includes(requiredArea.id)) return;
    const next = [...ids, requiredArea.id];
    setIds(next);
    onChange({ ids: next, disponivel: true, alterado: true });
  }, [ready, requiredArea, ids, onChange]);

  const toggle = (id: number) => {
    const next = ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id];
    setIds(next);
    onChange({ ids: next, disponivel: true, alterado: true });
  };
  const add = async () => {
    setAdding(true);
    setError("");
    try {
      const response = await fetch(`${BASE}/api/professional-work-areas`, {
        method: "POST", headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível cadastrar a área.");
      const area = body as Area;
      setAreas((all) => [...all, area].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      const next = [...ids, area.id];
      setIds(next);
      onChange({ ids: next, disponivel: true, alterado: true });
      setNewName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível cadastrar a área.");
    } finally { setAdding(false); }
  };
  return <section className="space-y-2" aria-label="Áreas de atuação">
    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Áreas de atuação</p>
    <p className="text-xs text-muted-foreground">
      Escolha uma ou mais áreas para {professionalId ? "a clínica em uso" : "a empresa de origem"}.
      Isso não altera cargo nem permissões.
    </p>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {!ready && !error && <p className="text-xs text-muted-foreground">Carregando áreas...</p>}
    {ready && areas.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma área cadastrada.</p>}
    {ready && <div className="grid gap-2 sm:grid-cols-2">
      {areas.map((area) => <label key={area.id} className="concave-3d flex items-center gap-2 p-2 text-xs">
        <input type="checkbox" checked={ids.includes(area.id)} disabled={!canEdit || area.id === requiredArea?.id} onChange={() => toggle(area.id)} />
        {area.name}{area.id === requiredArea?.id ? " (obrigatória para esta profissão)" : ""}
      </label>)}
      {ids.filter((id) => !areas.some((area) => area.id === id)).map((id) => <label key={id} className="concave-3d flex items-center gap-2 p-2 text-xs">
        <input type="checkbox" checked disabled={!canEdit} onChange={() => toggle(id)} />
        Área inativa ou indisponível ({id}); retire para salvar outras alterações.
      </label>)}
    </div>}
    {ready && canEdit && <div className="flex gap-2">
      <Input aria-label="Nome da nova área de atuação" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex.: Saúde ou Gestão" maxLength={100} className="field-engraved" />
      <Button type="button" className="btn-3d-soft shrink-0" disabled={adding || newName.trim().length < 2} onClick={add}>Adicionar área</Button>
    </div>}
  </section>;
}
