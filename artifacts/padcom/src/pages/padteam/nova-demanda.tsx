/**
 * PADTEAM — Nova Demanda
 * Formulário de criação de demanda manual.
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Send, Bot, User2 } from "lucide-react";
import { Link } from "wouter";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";

interface Member {
  id: number;
  nome: string;
  tipo: string;
  cargo_nome?: string;
}

interface Client {
  id: number;
  name: string;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, opts);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export default function NovaDemanda() {
  const [, navigate] = useLocation();
  const [members, setMembers] = useState<Member[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const [clientId, setClientId] = useState<number | null>(null);
  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    tipo: "manual",
    prioridade: "normal",
    assigned_role: "",
    assigned_member_id: "",
    client_id: "",
    prazo_horas: "24",
    notas: "",
  });

  useEffect(() => {
    Promise.all([
      apiFetch("/padteam/members").then(setMembers).catch(() => {}),
      apiFetch("/clients?limit=200").then((r: unknown) => {
        const arr = Array.isArray(r) ? r : (r as Record<string, unknown>).clients ?? (r as Record<string, unknown>).data ?? [];
        setClients(arr as Client[]);
      }).catch(() => {}),
    ]);
  }, []);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titulo.trim()) { setErro("Título é obrigatório."); return; }
    setLoading(true);
    setErro("");
    try {
      await apiFetch("/padteam/demandas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          assigned_member_id: form.assigned_member_id ? parseInt(form.assigned_member_id) : null,
          client_id: clientId,
          prazo_horas: parseInt(form.prazo_horas),
        }),
      });
      navigate("/padteam");
    } catch (err) {
      setErro("Erro ao criar demanda. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const ROLES = [
    "ceo","medico_01","medico_02","enfermeira_01","enfermeira_02",
    "adm_01","adm_02","financeiro_01","financeiro_02","agente_ia",
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-1">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <Link href="/padteam">
          <button className="btn-3d-soft p-2 rounded-[6px]">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        <div>
          <h1 className="text-lg font-black uppercase tracking-widest">Nova Demanda</h1>
          <p className="text-sm text-muted-foreground">PADTEAM — Delegação manual</p>
        </div>
      </div>

      <form onSubmit={submeter} className="space-y-5">
        {/* Título */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Título *</label>
          <input
            required
            placeholder="Ex: Ligar para cliente Gomes — cobrar boleto vencido"
            value={form.titulo}
            onChange={e => setForm({ ...form, titulo: e.target.value })}
            className="w-full bg-background border border-border rounded-[6px] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-sidebar-primary"
          />
        </div>

        {/* Descrição */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Descrição</label>
          <textarea
            rows={3}
            placeholder="Detalhe o que precisa ser feito, contexto, links relevantes..."
            value={form.descricao}
            onChange={e => setForm({ ...form, descricao: e.target.value })}
            className="w-full bg-background border border-border rounded-[6px] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-sidebar-primary resize-none"
          />
        </div>

        {/* Tipo + Prioridade */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Tipo</label>
            <select
              value={form.tipo}
              onChange={e => setForm({ ...form, tipo: e.target.value })}
              className="w-full bg-background border border-border rounded-[6px] px-3 py-2.5 text-sm"
            >
              <option value="manual">Manual (CEO / ADM)</option>
              <option value="auto_protocolo">Protocolo Automático</option>
              <option value="auto_pagamento">Pagamento Automático</option>
              <option value="auto_agente">Agente IA</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Prioridade</label>
            <select
              value={form.prioridade}
              onChange={e => setForm({ ...form, prioridade: e.target.value })}
              className="w-full bg-background border border-border rounded-[6px] px-3 py-2.5 text-sm"
            >
              <option value="urgente">🔴 Urgente</option>
              <option value="alta">🟠 Alta</option>
              <option value="normal">🔵 Normal</option>
              <option value="baixa">⚫ Baixa</option>
            </select>
          </div>
        </div>

        {/* Operador */}
        <div className="panel-3d-sub rounded-[6px] p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Atribuir a</div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground">Papel (role) — para atribuição por grupo</label>
            <select
              value={form.assigned_role}
              onChange={e => setForm({ ...form, assigned_role: e.target.value })}
              className="w-full bg-background border border-border rounded-[6px] px-3 py-2 text-sm"
            >
              <option value="">Sem papel definido</option>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground">Membro específico (opcional)</label>
            <select
              value={form.assigned_member_id}
              onChange={e => setForm({ ...form, assigned_member_id: e.target.value })}
              className="w-full bg-background border border-border rounded-[6px] px-3 py-2 text-sm"
            >
              <option value="">Nenhum específico</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>
                  {m.tipo === "agente_ia" ? "🤖 " : "👤 "}{m.nome}{m.cargo_nome ? ` — ${m.cargo_nome}` : ""}
                </option>
              ))}
            </select>
          </div>

          {form.assigned_member_id && members.find(m => m.id === parseInt(form.assigned_member_id))?.tipo === "agente_ia" && (
            <div className="flex items-start gap-2 bg-purple-500/10 border border-purple-500/30 rounded-[6px] px-3 py-2">
              <Bot className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-purple-300 leading-relaxed">
                Esta demanda será atribuída a um <strong>Agente IA (Claude)</strong>.
                O agente processará automaticamente quando a integração estiver ativa.
                Por ora, a demanda ficará no board aguardando ativação.
              </p>
            </div>
          )}
        </div>

        {/* Prazo + Cliente */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Prazo (horas)</label>
            <select
              value={form.prazo_horas}
              onChange={e => setForm({ ...form, prazo_horas: e.target.value })}
              className="w-full bg-background border border-border rounded-[6px] px-3 py-2.5 text-sm"
            >
              <option value="2">2 horas</option>
              <option value="4">4 horas</option>
              <option value="8">8 horas</option>
              <option value="12">12 horas</option>
              <option value="24">24 horas (padrão)</option>
              <option value="48">48 horas</option>
              <option value="72">72 horas</option>
              <option value="168">1 semana</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Cliente (opcional)</label>
            <PaxterClientSelector
              clientes={clients}
              value={clientId}
              onChange={setClientId}
              placeholder="Selecionar cliente…"
            />
          </div>
        </div>

        {/* Notas internas */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notas Internas</label>
          <textarea
            rows={2}
            placeholder="Observações para uso interno da equipe..."
            value={form.notas}
            onChange={e => setForm({ ...form, notas: e.target.value })}
            className="w-full bg-background border border-border rounded-[6px] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-sidebar-primary resize-none"
          />
        </div>

        {erro && (
          <div className="bg-red-500/10 border border-red-500/40 rounded-[6px] px-3 py-2 text-sm text-red-400">{erro}</div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={loading}
            className="bevel-3d px-6 py-2.5 flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {loading ? "Criando..." : "Criar Demanda"}
          </button>
          <Link href="/padteam">
            <button type="button" className="btn-3d-soft px-6 py-2.5 text-sm">Cancelar</button>
          </Link>
        </div>
      </form>
    </div>
  );
}
