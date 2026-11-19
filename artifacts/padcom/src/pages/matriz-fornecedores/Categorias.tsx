import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { collabAuthHeaders } from "@/lib/collab-auth";
import type { Linha } from "./calculo";
import { Modal } from "./Modais";
import { SeletorCorVidro } from "@/components/VidroCor";

export type CategoriaSubst = { id: number; chave: string; nome: string; sigla: string; cor: string; fonte: "branca" | "preta"; ativo: boolean };
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
    return porChave.get(k) ?? { id: 0, chave: k, nome: l.classe || "Sem categoria", sigla: (l.classe || "—").slice(0, 4), cor: "#6d7a8f", fonte: "branca", ativo: true };
  };
  return { lista, de };
}

/** Quadradinho do ativo: placa em relevo (Up Bevel) na cor escolhida; a sigla usa SEMPRE a letra do cadastro (branca ou preta). Blend leva uma tarja inferior. */
export function Quadrado({ cat, blend, tam = 32 }: { cat: CategoriaSubst; blend?: boolean; tam?: number }) {
  const letra = cat.fonte === "preta" ? "#111" : "#fff";
  return (
    <span data-len={Math.min(cat.sigla.length, 5)} className={`mx-cat-q bevel-3d ${tam >= 48 ? "mx-cat-q-forte" : ""}`} style={{
      width: tam, height: tam, color: letra,
      background: `linear-gradient(180deg, rgba(255,255,255,.30) 0%, rgba(255,255,255,0) 48%, rgba(0,0,0,.16) 100%), ${cat.cor}`,
      borderColor: `color-mix(in srgb, ${cat.cor} 55%, #b8924d)`,
    }} title={`${cat.nome}${blend ? " · Blend" : ""}`}>
      <b style={{ fontSize: Math.max(10.5, Math.round(tam * 0.3)), color: letra, textShadow: cat.fonte === "preta" ? "0 1px 0 rgba(255,255,255,.35)" : "0 1px 1px rgba(0,0,0,.35)" }}>{cat.sigla}</b>{blend && <i style={{ color: "#fff" }}>Blend</i>}
    </span>
  );
}

export function GerenciarCategorias({ lista, onFechar }: { lista: CategoriaSubst[]; onFechar: () => void }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState(""); const [sigla, setSigla] = useState(SIGLAS[0]); const [cor, setCor] = useState(CORES_CAT[0].hex);
  const [fonte, setFonte] = useState<"branca" | "preta">("branca");
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
  const previa: CategoriaSubst = { id: 0, chave: "", nome: nome || "Nova categoria", sigla, cor, fonte, ativo: true };
  const FonteSel = ({ valor, onChange }: { valor: "branca" | "preta"; onChange: (f: "branca" | "preta") => void }) => (
    <div className="mx-fonte" role="group" aria-label="Cor da letra">
      {(["branca", "preta"] as const).map((f) => <button key={f} type="button" aria-pressed={valor === f} className={valor === f ? "concave-3d" : "bevel-3d"} onClick={() => onChange(f)}>{f === "branca" ? "Letra branca" : "Letra preta"}</button>)}
    </div>
  );
  return (
    <Modal titulo="Categorias de substância" onFechar={onFechar}>
      <div className="mx-catg">
        <div className="panel-3d-sub mx-catg-novo">
          <span className="bevel-3d mx-catg-tit">+ Nova categoria</span>
          <label className="mx-catg-campo"><span>Nome da categoria</span>
            <input className="field-engraved" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Antioxidante" aria-label="Nome da categoria" /></label>
          <div className="mx-catg-duo">
            <label className="mx-catg-campo"><span>Sigla</span>
              <select className="field-engraved" value={sigla} onChange={(e) => setSigla(e.target.value)} aria-label="Sigla">{SIGLAS.map((s) => <option key={s}>{s}</option>)}</select></label>
            <div className="mx-catg-campo"><span>Cor do quadradinho</span><SeletorCorVidro rotulo="Cor da categoria" valor={cor} onChange={setCor} /></div>
          </div>
          <div className="mx-catg-campo"><span>Cor da letra</span><FonteSel valor={fonte} onChange={setFonte} /></div>
          <div className="mx-catg-campo"><span>Como fica</span><div className="concave-3d mx-catg-previa"><Quadrado cat={previa} tam={40} /><b>{previa.nome}</b></div></div>
          <button type="button" className="btn-3d mx-catg-add" disabled={!nome.trim() || enviar.isPending}
            onClick={() => { enviar.mutate({ url: "/api/matriz-fornecedores/categorias", metodo: "POST", corpo: { nome, sigla, cor, fonte } }); setNome(""); }}>Adicionar</button>
        </div>
        {erro && <div className="mx-catg-erro" role="alert">{erro}</div>}
        <div className="mx-catg-lista">
          {lista.map((c) => (
            <div key={c.id} className="tecla-3d mx-catg-item" data-off={c.ativo ? 0 : 1}>
              <Quadrado cat={c} />
              <span className="mx-catg-n">{c.nome}</span>
              <select className="field-engraved" value={c.sigla} onChange={(e) => patch(c.id, { sigla: e.target.value })} aria-label={`Sigla de ${c.nome}`}>{[...new Set([c.sigla, ...SIGLAS])].map((s) => <option key={s}>{s}</option>)}</select>
              <SeletorCorVidro rotulo={`Cor de ${c.nome}`} valor={c.cor} onChange={(v) => patch(c.id, { cor: v })} />
              <FonteSel valor={c.fonte} onChange={(f) => patch(c.id, { fonte: f })} />
              <label className="mx-check"><input type="checkbox" checked={c.ativo} onChange={(e) => patch(c.id, { ativo: e.target.checked })} />Ativa</label>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
