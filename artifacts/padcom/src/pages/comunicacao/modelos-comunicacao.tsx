/**
 * Modelos de comunicação padronizada (texto + flyer). Texto e regra de flyer por clínica; o flyer usa o molde
 * versionado do PaxMed (nunca gerado por IA). Só o CEO grava; a clínica vem da sessão.
 */
import { useEffect, useState } from "react";
import { BASE } from "./_shared";
import { getCollabToken } from "@/lib/collab-auth";
import { ChaveOuro } from "@/components/ui/chave-ouro";

interface Item {
  categoria: string; nome: string; texto: string; versao: number; origem: "clinica" | "padrao"; padrao: string; variaveis: string[];
  flyer: { enviar: boolean; modeloVersao: number; titulo: string; linhas: string[] };
  anexo: { enviar: boolean; maxBytes: number; arquivos: Array<{ posicao: 1 | 2; nome: string; mime: string; tamanho: number }> };
}
interface Envio {
  id: number; ambiente: string; categoria: string; modelo_texto_versao: number | null; modelo_flyer_versao: number | null;
  flyer_enviado: boolean; status: string; status_flyer: string | null; anexos_enviados: number; status_anexo: string | null; erro: string | null; criado_em: string;
}
const auth = (): Record<string, string> => { const t = getCollabToken(); return t ? { Authorization: `Bearer ${t}` } : {}; };

export function ModelosComunicacao() {
  const [dados, setDados] = useState<{ itens: Item[]; envios: Envio[] } | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);

  const carregar = () =>
    fetch(`${BASE}/api/comunicacao/modelos`, { headers: auth() })
      .then(async (r) => { if (!r.ok) throw new Error("Sem acesso aos modelos."); return r.json() as Promise<{ itens: Item[]; envios: Envio[] }>; })
      .then((j) => { setDados(j); setRascunho(Object.fromEntries(j.itens.map((i) => [i.categoria, i.texto]))); })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Não foi possível carregar."));
  useEffect(() => { void carregar(); }, []);

  const salvar = async (i: Item) => {
    setAviso((a) => ({ ...a, [i.categoria]: "Gravando…" }));
    const r = await fetch(`${BASE}/api/comunicacao/modelos/${i.categoria}`, { method: "PUT", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ texto: rascunho[i.categoria] }) });
    const j = await r.json().catch(() => ({})) as { error?: string; versao?: number };
    setAviso((a) => ({ ...a, [i.categoria]: r.ok ? `Gravado. Versão ${j.versao}.` : r.status === 403 ? "Somente o CEO pode gravar." : (j.error ?? "Não gravou.") }));
    if (r.ok) void carregar();
  };
  const alternarFlyer = async (i: Item) => {
    const r = await fetch(`${BASE}/api/comunicacao/regras/${i.categoria}`, { method: "PUT", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ enviarFlyer: !i.flyer.enviar }) });
    setAviso((a) => ({ ...a, [i.categoria]: r.ok ? "Critério do flyer gravado." : r.status === 403 ? "Somente o CEO pode gravar." : "Não gravou." }));
    if (r.ok) void carregar();
  };

  const alternarAnexo = async (i: Item) => {
    const r = await fetch(`${BASE}/api/comunicacao/regras/${i.categoria}`, { method: "PUT", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ enviarAnexo: !i.anexo.enviar }) });
    setAviso((a) => ({ ...a, [i.categoria]: r.ok ? (!i.anexo.enviar ? "Anexo ligado: segue junto com a mensagem." : "Anexo desligado.") : r.status === 403 ? "Somente o CEO pode gravar." : "Não gravou." }));
    if (r.ok) void carregar();
  };
  const enviarArquivo = async (i: Item, posicao: 1 | 2, arq: File | undefined) => {
    if (!arq) return;
    if (arq.size > i.anexo.maxBytes) { setAviso((a) => ({ ...a, [i.categoria]: "O arquivo passa de 10 MB." })); return; }
    setAviso((a) => ({ ...a, [i.categoria]: "Enviando o arquivo…" }));
    const r = await fetch(`${BASE}/api/comunicacao/anexos/${i.categoria}/${posicao}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "X-Nome-Arquivo": encodeURIComponent(arq.name), ...auth() }, body: arq });
    const j = await r.json().catch(() => ({})) as { error?: string };
    setAviso((a) => ({ ...a, [i.categoria]: r.ok ? `Anexo ${posicao} gravado.` : r.status === 403 ? "Somente o CEO pode gravar." : (j.error ?? "Não gravou.") }));
    if (r.ok) void carregar();
  };
  const removerArquivo = async (i: Item, posicao: 1 | 2) => {
    const r = await fetch(`${BASE}/api/comunicacao/anexos/${i.categoria}/${posicao}`, { method: "DELETE", headers: auth() });
    setAviso((a) => ({ ...a, [i.categoria]: r.ok ? `Anexo ${posicao} removido.` : "Não removeu." }));
    if (r.ok) void carregar();
  };
  const tam = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  return (
    <div className="space-y-5" data-testid="modelos-comunicacao">
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Texto padronizado e flyer de comunicação, sem IA. O texto usa o nome real da clínica e da pessoa; o flyer usa o molde PaxMed aprovado, só com os dados da comunicação. Conversa trivial nunca leva flyer.
      </p>
      {erro && <p role="alert" className="concave-3d p-3 text-[12px] text-rose-700">{erro}</p>}
      {dados?.itens.map((i) => (
        <article key={i.categoria} className="concave-3d space-y-3 p-3" data-testid={`modelo-${i.categoria}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] font-bold uppercase tracking-wide">{i.nome}</p>
            <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase">
              <span className="bevel-3d px-2 py-1">Texto versão {i.versao} · {i.origem === "clinica" ? "da clínica" : "padrão"}</span>
              <span className="bevel-3d px-2 py-1">Flyer {i.flyer.titulo} · molde v{i.flyer.modeloVersao}</span>
            </div>
          </div>
          <textarea className="min-h-[220px] w-full rounded-md border border-border bg-background p-2 text-[13px] leading-relaxed" value={rascunho[i.categoria] ?? ""} onChange={(e) => setRascunho((r) => ({ ...r, [i.categoria]: e.target.value }))} aria-label={`Texto de ${i.nome}`} />
          <p className="text-[10px] text-muted-foreground">Variáveis: {i.variaveis.map((v) => `{${v}}`).join(", ")}. Linha em branco separa parágrafos.</p>
          <p className="text-[10px] text-muted-foreground">Campos do flyer: {i.flyer.linhas.join(", ")} e clínica (sempre por último).</p>
          <div className="panel-3d-sub space-y-3 p-3" data-testid={`anexo-${i.categoria}`}>
            <div className="concave-3d flex items-center gap-3 px-3 py-2.5">
              <ChaveOuro id={`anexo-chave-${i.categoria}`} checked={i.anexo.enviar} onCheckedChange={() => void alternarAnexo(i)} aria-label={`Enviar anexo com a mensagem de ${i.nome}`} />
              <label htmlFor={`anexo-chave-${i.categoria}`} className="text-[12px] font-bold text-primary">Enviar anexo junto com a mensagem</label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {i.anexo.enviar
                ? (i.anexo.arquivos.length === 0 ? "Ligado, mas sem arquivo: por enquanto só o texto é enviado." : `Ligado: ${i.anexo.arquivos.length === 1 ? "1 arquivo segue" : "2 arquivos seguem"} logo depois do texto.`)
                : "Desligado: só o texto é enviado. Os arquivos ficam guardados."} Aceita PDF, PNG ou JPEG, até 10 MB cada.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {([1, 2] as const).map((pos) => {
                const a = i.anexo.arquivos.find((x) => x.posicao === pos);
                return (
                  <div key={pos} className="concave-3d space-y-2 p-2.5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Anexo {pos}</p>
                    <p className="min-h-5 break-words text-[12px] text-foreground/90">{a ? `${a.nome} (${tam(a.tamanho)})` : "Nenhum arquivo"}</p>
                    <div className="flex flex-wrap gap-2">
                      <label className="btn-3d-soft inline-flex min-h-10 cursor-pointer items-center px-3 text-[11px] font-bold uppercase">
                        {a ? "Trocar arquivo" : "Escolher arquivo"}
                        <input type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" onChange={(e) => { void enviarArquivo(i, pos, e.target.files?.[0]); e.target.value = ""; }} />
                      </label>
                      {a && <button type="button" className="bevel-3d min-h-10 px-3 text-[11px] font-bold uppercase" onClick={() => void removerArquivo(i, pos)}>Remover</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-3d min-h-11 px-4 text-[12px] font-bold uppercase" disabled={rascunho[i.categoria] === i.texto} onClick={() => void salvar(i)}>Gravar texto</button>
            <button type="button" className="bevel-3d min-h-11 px-4 text-[12px] font-bold uppercase" onClick={() => setRascunho((r) => ({ ...r, [i.categoria]: i.padrao }))}>Voltar ao texto original</button>
            <button type="button" role="switch" aria-checked={i.flyer.enviar} className="bevel-3d min-h-11 px-4 text-[12px] font-bold uppercase" onClick={() => void alternarFlyer(i)} data-testid={`flyer-${i.categoria}`}>
              Enviar flyer: {i.flyer.enviar ? "SIM" : "NÃO"}
            </button>
            {aviso[i.categoria] && <span role="status" className="text-[12px]">{aviso[i.categoria]}</span>}
          </div>
        </article>
      ))}
      <div className="space-y-2" data-testid="historico-comunicacao">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#b8924d]">Últimos envios</p>
        {dados && dados.envios.length === 0 && <p className="concave-3d p-3 text-[12px]">Nenhum envio padronizado registrado ainda.</p>}
        {dados?.envios.map((e) => (
          <div key={e.id} className="bevel-3d grid gap-1 p-2 text-[11px] sm:grid-cols-6">
            <span>{new Date(e.criado_em).toLocaleString("pt-BR")}</span><span>{e.ambiente}</span><span>{e.categoria}</span>
            <span>texto v{e.modelo_texto_versao ?? "—"}</span><span>flyer {e.flyer_enviado ? `v${e.modelo_flyer_versao}` : "não enviado"}</span><span>{e.status}{e.anexos_enviados > 0 ? ` · ${e.anexos_enviados} anexo(s)` : ""}{e.erro ? ` (${e.erro})` : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
