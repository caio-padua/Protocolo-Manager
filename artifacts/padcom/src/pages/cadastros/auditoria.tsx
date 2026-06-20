import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getCollabToken } from "@/lib/collab-auth";

interface AuditRow {
  id: number;
  professionalId: number | null;
  professionalName: string | null;
  action: string;
  method: string | null;
  path: string | null;
  detail: unknown;
  ip: string | null;
  createdAt: string;
}

const ACTION_LABEL: Record<string, { label: string; color: string }> = {
  login_ok: { label: "Entrou", color: "bg-emerald-100 text-emerald-800" },
  login_fail: { label: "Falha de login", color: "bg-red-100 text-red-800" },
  write: { label: "Editou", color: "bg-cyan-100 text-cyan-800" },
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

// Tela de auditoria do Portao do Colaborador (Onda 8.2): quem entrou e o que
// fez. Razao declarada pelo CEO para o login por colaborador.
export default function CadastroAuditoria() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getCollabToken();
    fetch("/api/collaborator/audit?limit=200", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error("Falha ao carregar auditoria");
        return r.json();
      })
      .then((d: AuditRow[]) => setRows(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold uppercase tracking-wide text-[#3D7A7A]">
          Auditoria de Acesso
        </h1>
        <p className="text-sm text-muted-foreground">
          Registro de quem entrou e o que editou na Central de Cadastro.
        </p>
      </div>
      <Card className="border-l-4 border-l-[#3D7A7A] p-0">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
        ) : error ? (
          <p className="p-6 text-sm text-red-600">{error}</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhum evento ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-[#3D7A7A]/5">
                <TableHead>Quando</TableHead>
                <TableHead>Colaborador</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>O que fez</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const a = ACTION_LABEL[r.action] ?? {
                  label: r.action,
                  color: "bg-gray-100 text-gray-800",
                };
                const what =
                  r.action === "write" && r.method && r.path
                    ? `${r.method} ${r.path}`
                    : r.action === "login_fail"
                      ? `usuário tentado: ${(r.detail as { username?: string })?.username ?? "—"}`
                      : "—";
                return (
                  <TableRow key={r.id} data-testid={`row-audit-${r.id}`}>
                    <TableCell className="whitespace-nowrap text-sm">{fmtDate(r.createdAt)}</TableCell>
                    <TableCell className="text-sm">{r.professionalName ?? "—"}</TableCell>
                    <TableCell>
                      <Badge className={`${a.color} border-0`}>{a.label}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{what}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.ip ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
