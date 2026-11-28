import type React from "react";
import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { cabineJson } from "./api";

// Renderização simples e segura (sem HTML bruto): títulos, listas, tabelas e texto.
function Bloco({ texto }: { texto: string }) {
  const linhas = texto.split("\n");
  const out: React.ReactElement[] = [];
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (l.startsWith("|")) {
      const tab: string[] = [];
      while (i < linhas.length && linhas[i].startsWith("|")) tab.push(linhas[i++]);
      const cel = (s: string) => s.split("|").slice(1, -1).map((c) => c.trim());
      const [cab, , ...corpo] = tab;
      out.push(
        <table key={i} className="w-full text-sm my-2 border-collapse">
          <thead><tr>{cel(cab).map((c, k) => <th key={k} className="text-left border-b p-1">{c}</th>)}</tr></thead>
          <tbody>{corpo.map((r, k) => <tr key={k}>{cel(r).map((c, j) => <td key={j} className="border-b p-1 align-top">{c}</td>)}</tr>)}</tbody>
        </table>,
      );
      continue;
    }
    if (l.startsWith("# ")) out.push(<h2 key={i} className="text-lg font-semibold uppercase mt-2">{l.slice(2)}</h2>);
    else if (l.startsWith("## ")) out.push(<h3 key={i} id={`sec-${l.slice(3).split(".")[0]}`} className="font-semibold mt-4 mb-1">{l.slice(3)}</h3>);
    else if (/^(-|\d+\.) /.test(l)) out.push(<p key={i} className="text-sm pl-4">{l}</p>);
    else if (l.trim()) out.push(<p key={i} className="text-sm">{l}</p>);
    i++;
  }
  return <>{out}</>;
}

export default function DocumentacaoReferencia() {
  const [arquivos, setArquivos] = useState<string[]>([]);
  const [nome, setNome] = useState<string | null>(null);
  const [conteudo, setConteudo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    cabineJson<{ arquivos: string[] }>("/ceo/docs-referencia")
      .then((r) => { setArquivos(r.arquivos); setNome(r.arquivos[0] ?? null); })
      .catch((e: Error) => setErro(e.message));
  }, []);
  useEffect(() => {
    if (!nome) return;
    cabineJson<{ conteudo: string }>(`/ceo/docs-referencia/${nome}`).then((r) => setConteudo(r.conteudo)).catch((e: Error) => setErro(e.message));
  }, [nome]);

  return (
    <div className="space-y-3" data-testid="documentacao">
      <div className="flex flex-wrap items-center gap-2">
        <BookOpen className="h-4 w-4" />
        {arquivos.map((a) => (
          <button key={a} onClick={() => setNome(a)} className={`${a === nome ? "bevel-3d" : "concave-3d"} px-3 py-1 text-xs`}>{a}</button>
        ))}
      </div>
      {erro ? <p role="alert" className="text-sm text-red-700">{erro}</p> : null}
      <div className="panel-3d-sub p-4" data-testid="doc-conteudo"><Bloco texto={conteudo} /></div>
    </div>
  );
}
