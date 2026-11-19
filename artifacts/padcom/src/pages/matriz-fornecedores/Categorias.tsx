import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { collabAuthHeaders } from "@/lib/collab-auth";
import type { Linha } from "./calculo";
import { Modal } from "./Modais";

export type CategoriaSubst = { id: number; chave: string; nome: string; sigla: string; cor: string; ativo: boolean };
export const chaveClasse = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, " ");

export const SIGLAS = ["Atx", "Horm", "Vita", "Min", "Orto", "Meta", "Derm", "Neuro", "Oste", "Imun", "Mito", "Lipo", "Hepa", "Infl", "Impl", "Ger", "Peptd", "Aminoa"];
export const CORES_CAT: { nome: string; hex: string }[] = [
  { nome: "Verde", hex: "#2f7d6b" }, { nome: "Roxo", hex: "#8a4fb0" }, { nome: "Dourado", hex: "#c9962b" }, { nome: "Azul", hex: "#2d73b5" },
  { nome: "Laranja", hex: "#c4572f" }, { nome: "Rosa", hex: "#b0507a" }, { nome: "Índigo", hex: "#5b4fb0" }, { nome: "Cinza", hex: "#6d7a8f" },
  { nome: "Turquesa", hex: "#3a8fa0" }, { nome: "Marinho", hex: "#16284a" }, { nome: "Vermelho", hex: "#c4503f" }, { nome: "Oliva", hex: "#7a6a2f" },
];

async function carregar(): Promise<CategoriaSubst[]> {
  const r = await fetch("/api/matriz-fornecedores/categorias", { headers: collabAuthHeaders() });
  if (!r.ok) throw new Error("Categorias indisponíveis.");
  return r.json();
}
export function useCategorias() {
  const q = useQuery({ queryKey: ["matriz-categorias"], queryFn: carregar });
  const lista = q.data ?? [];
  const porChave = new Map(lista.map((c) => [c.chave, c]));
  const de = (l: Pick<Linha, "classe">): CategoriaSubst => {
    const k = chaveClasse(l.classe || "");
    return porChave.get(k) ?? { id: 0, chave: k, nome: l.classe || "Sem categoria", sigla: (l.classe || "—").slice(0, 4), cor: "#6d7a8f", ativo: true };
  };
  return { lista, de };
}

/** Quadradinho do ativo: cor + sigla da categoria. Blend leva uma tarja inferior. */
export function Quadrado({ cat, blend, tam = 32 }: { cat: CategoriaSubst; blend?: boolean; tam?: number }) {
  return (
    <span className="mx-cat-q" style={{ width: tam, height: tam, background: cat.cor }} title={`${cat.nome}${blend ? " · Blend" : ""}`}>
      <b>{cat.sigla}</b>{blend && <i>Blend</i>}
    </span>
  );
}

export function GerenciarCategorias({ lista, onFechar }: { lista: CategoriaSubst[]; onFechar: () => void }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState(""); const [sigla, setSigla] = useState(SIGLAS[0]); const [cor, setCor] = useState(CORES_CAT[0].hex);
  const [erro, setErro] = useState<string | null>(null);
  const enviar = useMutation({
    mutationFn: async (a: { url: string; metodo: string; corpo: unknown }) => {
      const r = await fetch(a.url, { method: a.metodo, headers: { ...collabAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(a.corpo) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Não foi possível gravar.");
      return j;
    },
    onSuccess: (j) => { setErro(null); qc.setQueryData(["matriz-categorias"], j); },
    onError: (e: Error) => setErro(e.message),
  });
  const patch = (id: number, corpo: object) => enviar.mutate({ url: `/api/matriz-fornecedores/categorias/${id}`, metodo: "PATCH", corpo });
  return (
    <Modal titulo="Categorias de substância" onFechar={onFechar}>
      <div className="mx-catg">
        <div className="mx-catg-row mx-catg-new">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da nova categoria" aria-label="Nome da categoria" />
          <select value={sigla} onChange={(e) => setSigla(e.target.value)} aria-label="Sigla">{SIGLAS.map((s) => <option key={s}>{s}</option>)}</select>
          <select value={cor} onChange={(e) => setCor(e.target.value)} aria-label="Cor" style={{ borderLeft: `10px solid ${cor}` }}>{CORES_CAT.map((c) => <option key={c.hex} value={c.hex}>{c.nome}</option>)}</select>
          <button type="button" className="mx-btn mx-btn-gold" disabled={!nome.trim() || enviar.isPending} onClick={() => { enviar.mutate({ url: "/api/matriz-fornecedores/categorias", metodo: "POST", corpo: { nome, sigla, cor } }); setNome(""); }}>Cadastrar</button>
        </div>
        {erro && <div className="mx-catg-erro" role="alert">{erro}</div>}
        {lista.map((c) => (
          <div key={c.id} className="mx-catg-row" data-off={c.ativo ? 0 : 1}>
            <Quadrado cat={c} />
            <span className="mx-catg-n">{c.nome}</span>
            <select value={c.sigla} onChange={(e) => patch(c.id, { sigla: e.target.value })} aria-label={`Sigla de ${c.nome}`}>{[...new Set([c.sigla, ...SIGLAS])].map((s) => <option key={s}>{s}</option>)}</select>
            <select value={CORES_CAT.some((x) => x.hex === c.cor) ? c.cor : ""} onChange={(e) => patch(c.id, { cor: e.target.value })} aria-label={`Cor de ${c.nome}`}>
              {!CORES_CAT.some((x) => x.hex === c.cor) && <option value="">Outra</option>}{CORES_CAT.map((x) => <option key={x.hex} value={x.hex}>{x.nome}</option>)}
            </select>
            <label className="mx-check"><input type="checkbox" checked={c.ativo} onChange={(e) => patch(c.id, { ativo: e.target.checked })} />Ativa</label>
          </div>
        ))}
      </div>
    </Modal>
  );
}
