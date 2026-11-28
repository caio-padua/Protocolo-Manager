import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { BASE } from "../comunicacao/_shared";

interface ErroRow {
  id: string;
  quando: string;
  metodo: string;
  rota: string;
  status: number;
  mensagem: string | null;
  codigo: string | null;
  profissional: string | null;
}
interface Payload {
  resumo: { ultima_hora: number; ultimas_24h: number };
  erros: ErroRow[];
}

const INTERVALO_MS = 5000;

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium",
  });
}

// Central de Erros: erros do servidor (HTTP 500 ou mais) com hora, rota, codigo e motivo.
// Atualiza sozinha a cada 5 segundos (consulta periodica, nao transmissao continua).
export default function CentralErros() {
  const [dados, setDados] = useState<Payload | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pausado, setPausado] = useState(false);
  const [ultimaLeitura, setUltimaLeitura] = useState<Date | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/system-errors?limit=200`, { headers: collabAuthHeaders() });
      if (!r.ok) throw new Error(r.status === 401 || r.status === 403
        ? "Sem permissão. Esta tela é só do dono da plataforma."
        : `Falha ao carregar (código ${r.status}).`);
      setDados(await r.json());
      setErro(null);
      setUltimaLeitura(new Date());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar.");
    }
  }, []);

  useEffect(() => {
    void carregar();
    if (pausado) return;
    const t = setInterval(() => void carregar(), INTERVALO_MS);
    return () => clearInterval(t);
  }, [carregar, pausado]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wide text-primary">Central de Erros</h1>
          <p className="text-sm text-muted-foreground">
            Erros do servidor (código 500 ou mais). Atualiza a cada 5 segundos.
            {ultimaLeitura && ` Última leitura: ${ultimaLeitura.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void carregar()} className="btn-3d rounded-md px-3 py-1.5 text-xs font-semibold">
            Atualizar agora
          </button>
          <button onClick={() => setPausado((p) => !p)} className="btn-3d rounded-md px-3 py-1.5 text-xs font-semibold">
            {pausado ? "Retomar atualização" : "Pausar atualização"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <Card className="p-3">
          <div className="text-xs uppercase text-muted-foreground">Última hora</div>
          <div className="text-2xl font-bold">{dados?.resumo.ultima_hora ?? "—"}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs uppercase text-muted-foreground">Últimas 24 horas</div>
          <div className="text-2xl font-bold">{dados?.resumo.ultimas_24h ?? "—"}</div>
        </Card>
      </div>

      <Card className="border-l-4 border-l-primary p-0">
        {erro ? (
          <p className="p-6 text-sm text-red-600">{erro}</p>
        ) : !dados ? (
          <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
        ) : dados.erros.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhum erro registrado desde que a Central foi ligada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-primary/5">
                <TableHead>Quando</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Rota</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Usuário</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.erros.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-sm">{fmt(e.quando)}</TableCell>
                  <TableCell>
                    <Badge className="border-0 bg-red-100 text-red-800">{e.status}</Badge>
                    {e.codigo && <span className="ml-1 text-xs text-muted-foreground">{e.codigo}</span>}
                  </TableCell>
                  <TableCell className="text-sm"><span className="font-semibold">{e.metodo}</span> {e.rota}</TableCell>
                  <TableCell className="max-w-md text-sm text-muted-foreground">{e.mensagem ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.profissional ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
