import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListSubstancesQueryKey } from "@workspace/api-client-react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { Valor } from "@/components/numeral/Numeral";

type Linha = { linha: number; produto: string; dose: string; volumeMl: number | null; concentracao: string | null; quantidadeEmbalagem: number; precoCaixaCentavos: number };
type Opcao = { varianteId: number; produto: string; dose: string; volumeMl: string | null; concentracao: string | null };
type Resultado =
  | { tipo: "casada"; semAlteracao: boolean; ofertaAtual: { precoCaixaCentavos: number } | null }
  | { tipo: "nova" } | { tipo: "nova_apresentacao"; produto: string }
  | { tipo: "duvidosa"; motivo: string; opcoes: Opcao[] };
type Previa = { arquivo: string; fornecedorId: number; itens: { linha: Linha; resultado: Resultado }[]; invalidas: { linha: number; produto: string; motivo: string }[] };
type Aplicado = { linha: number; produto: string; situacao: string; detalhe?: string };

const ROTULO: Record<string, string> = {
  criada: "Substância nova criada", oferta_nova: "Oferta nova", oferta_atualizada: "Oferta atualizada",
  sem_alteracao: "Sem alteração", ignorada: "Ignorada", pulada: "Pulada (sem decisão)", erro: "Erro",
};

async function erroDe(r: Response): Promise<string> {
  try { const j = await r.json(); if (j?.error) return String(j.error); } catch { /* corpo ilegível */ }
  return r.status === 403 ? "Seu acesso não permite importar listas." : r.status === 401 ? "Entre novamente para importar." : "A importação está indisponível neste momento.";
}

export function EnviarLista({ fornecedorId, nome, onFechar }: { fornecedorId: number; nome: string; onFechar: () => void }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [decisoes, setDecisoes] = useState<Record<number, string>>({});
  const [aprovado, setAprovado] = useState(false);
  const [resultados, setResultados] = useState<Aplicado[] | null>(null);

  const enviar = async (arq: File) => {
    setOcupado(true); setErro(null); setPrevia(null); setResultados(null); setDecisoes({}); setAprovado(false);
    try {
      const fd = new FormData();
      fd.append("file", arq); fd.append("fornecedorId", String(fornecedorId));
      const r = await fetch("/api/matriz-fornecedores/importar-lista/previa", { method: "POST", headers: collabAuthHeaders(), body: fd });
      if (!r.ok) throw new Error(await erroDe(r));
      setPrevia((await r.json()) as Previa);
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível ler a lista."); }
    finally { setOcupado(false); if (input.current) input.current.value = ""; }
  };

  const duvidosas = previa?.itens.filter((i) => i.resultado.tipo === "duvidosa") ?? [];
  const gravaveis = previa?.itens.filter((i) => i.resultado.tipo !== "duvidosa" && !(i.resultado.tipo === "casada" && i.resultado.semAlteracao)) ?? [];
  const decididas = duvidosas.filter((i) => decisoes[i.linha.linha]);
  const nadaParaGravar = gravaveis.length + decididas.filter((i) => decisoes[i.linha.linha] !== "ignorar").length === 0;

  const aplicar = async () => {
    if (!previa) return;
    setOcupado(true); setErro(null);
    try {
      const lista = decisoes;
      const dec = Object.entries(lista).map(([linha, v]) =>
        v === "nova" || v === "ignorar" ? { linha: Number(linha), acao: v } : { linha: Number(linha), acao: "casar", varianteId: Number(v) });
      const r = await fetch("/api/matriz-fornecedores/importar-lista/aplicar", {
        method: "POST", headers: collabAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ fornecedorId, aprovado: true, arquivo: previa.arquivo, linhas: previa.itens.map((i) => i.linha), decisoes: dec }),
      });
      if (!r.ok) throw new Error(await erroDe(r));
      setResultados(((await r.json()) as { resultados: Aplicado[] }).resultados);
      setPrevia(null);
      await qc.invalidateQueries({ queryKey: getListSubstancesQueryKey() });
      await qc.invalidateQueries({ predicate: (q) => q.queryKey.some((k) => typeof k === "string" && (k.includes("matriz-fornecedores") || k.includes("substance"))) });
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível gravar a lista."); }
    finally { setOcupado(false); }
  };

  return (
    <div className="concave-3d mt-3 space-y-3 p-3" data-testid={`enviar-lista-${fornecedorId}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-widest text-primary">Enviar lista — {nome}</p>
        <Button type="button" variant="outline" size="icon" className="btn-3d-soft h-9 w-9" aria-label="Fechar envio de lista" onClick={onFechar} disabled={ocupado}><X className="h-4 w-4" /></Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Planilha .xlsx ou .csv com as colunas: Produto, Dose, Volume (mL), Concentração, Via (IM, EV, SC ou ID), Forma (ampola ou frasco), Qtd na caixa e Preço da caixa.
        Nada é gravado antes da sua aprovação.
      </p>
      <input ref={input} type="file" accept=".xlsx,.csv" className="sr-only" data-testid={`input-lista-${fornecedorId}`}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f); }} />
      <Button type="button" className="btn-3d min-h-10 gap-2" disabled={ocupado} onClick={() => input.current?.click()}>
        <Upload className="h-4 w-4" aria-hidden="true" /> {ocupado ? "Processando…" : "Escolher planilha"}
      </Button>
      {erro && <p className="text-sm text-amber-700" role="alert" data-testid="erro-lista">{erro}</p>}

      {previa && (
        <div className="space-y-3" data-testid="previa-lista">
          <p className="text-sm font-semibold">
            {previa.arquivo}: {previa.itens.filter((i) => i.resultado.tipo === "casada").length} casadas, {previa.itens.filter((i) => i.resultado.tipo === "nova" || i.resultado.tipo === "nova_apresentacao").length} novas, {duvidosas.length} duvidosas, {previa.invalidas.length} inválidas.
          </p>
          <div className="max-h-80 space-y-2 overflow-auto">
            {previa.itens.map(({ linha, resultado }) => (
              <div key={linha.linha} className="panel-3d-sub p-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">L{linha.linha} · {linha.produto} · {linha.dose}{linha.volumeMl ? ` · ${linha.volumeMl} mL` : ""}</span>
                  <span className="tabular-nums"><Valor valor={linha.precoCaixaCentavos / 100} /> · cx {linha.quantidadeEmbalagem}</span>
                </div>
                <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {resultado.tipo === "casada" ? (resultado.semAlteracao ? "Casada — sem alteração" : resultado.ofertaAtual ? "Casada — atualiza o preço deste fornecedor" : "Casada — nova oferta deste fornecedor")
                    : resultado.tipo === "nova" ? "Substância nova (entra como indisponível até revisão clínica)"
                    : resultado.tipo === "nova_apresentacao" ? `Nova apresentação de ${resultado.produto}`
                    : `Duvidosa — ${resultado.motivo}`}
                </p>
                {resultado.tipo === "duvidosa" && (
                  <select className="field-engraved mt-2 min-h-10 w-full border border-input px-2 text-sm" value={decisoes[linha.linha] ?? ""}
                    onChange={(e) => setDecisoes((d) => ({ ...d, [linha.linha]: e.target.value }))} data-testid={`decisao-${linha.linha}`}>
                    <option value="">Decidir…</option>
                    {resultado.opcoes.map((o) => <option key={o.varianteId} value={o.varianteId}>É esta: {o.produto} · {o.dose}{o.volumeMl ? ` · ${o.volumeMl} mL` : ""}{o.concentracao ? ` · ${o.concentracao}` : ""}</option>)}
                    <option value="nova">É uma substância nova</option>
                    <option value="ignorar">Ignorar esta linha</option>
                  </select>
                )}
              </div>
            ))}
            {previa.invalidas.map((i) => (
              <div key={`i${i.linha}`} className="panel-3d-sub p-2 text-sm text-amber-700">L{i.linha} · {i.produto}: {i.motivo} (não será importada)</div>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="h-4 w-4 accent-[#16284a]" checked={aprovado} onChange={(e) => setAprovado(e.target.checked)} data-testid="checkbox-aprovar-lista" />
            Revisei a prévia e aprovo a gravação.
          </label>
          <div className="flex gap-2">
            <Button type="button" className="btn-3d min-h-10" disabled={!aprovado || ocupado || nadaParaGravar} onClick={aplicar} data-testid="button-aplicar-lista">
              {ocupado ? "Gravando…" : "Gravar lista aprovada"}
            </Button>
            <Button type="button" variant="outline" className="btn-3d-soft min-h-10" disabled={ocupado} onClick={() => setPrevia(null)}>Descartar prévia</Button>
          </div>
          {duvidosas.length > decididas.length && <p className="text-xs text-muted-foreground">Duvidosas sem decisão serão puladas, nunca adivinhadas.</p>}
        </div>
      )}

      {resultados && (
        <div className="space-y-1" data-testid="resultado-lista">
          <p className="text-sm font-black">Lista gravada. O resultado de cada linha:</p>
          {resultados.map((r) => (
            <p key={r.linha} className="text-xs"><b>L{r.linha}</b> {r.produto}: {ROTULO[r.situacao] ?? r.situacao}{r.detalhe ? ` — ${r.detalhe}` : ""}</p>
          ))}
        </div>
      )}
    </div>
  );
}
