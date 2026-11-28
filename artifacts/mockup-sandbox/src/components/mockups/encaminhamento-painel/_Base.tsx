import { useState } from "react";
import { Eye, FolderInput, Mail, MessageCircle, Send, Check, History, SendHorizonal } from "lucide-react";
import "./_group.css";

type Aba = "enviar" | "historico";
type Linha = { id: number; arquivo: string; dia: string; hora: string; destino: string; tipo: "canal" | "drive"; resultado: string; ok: boolean; obs: string };

const HISTORICO: Linha[] = [
  { id: 1, arquivo: "Receita 1482 — Fórmula Foco e Sono", dia: "21/11/2026", hora: "14:07", destino: "WhatsApp (11) 9****-4821", tipo: "canal", resultado: "Aceito pelo provedor; entrega não confirmada", ok: false, obs: "" },
  { id: 2, arquivo: "Receita 1482 — Fórmula Foco e Sono", dia: "21/11/2026", hora: "14:07", destino: "Drive › MARIA SOUZA › RECEITAS", tipo: "drive", resultado: "Guardado", ok: true, obs: "Rhodiola 200 mg. Reavaliar adaptação em 30 dias." },
  { id: 3, arquivo: "Receita 1377 — Fórmula Foco e Sono", dia: "21/10/2026", hora: "09:42", destino: "Telegram @m****uza", tipo: "canal", resultado: "Aceito pelo provedor; entrega não confirmada", ok: false, obs: "Rhodiola 100 mg. Cliente relatou boa tolerância." },
  { id: 4, arquivo: "Receita 1377 — Fórmula Foco e Sono", dia: "21/10/2026", hora: "09:42", destino: "Drive › MARIA SOUZA › RECEITAS", tipo: "drive", resultado: "Guardado", ok: true, obs: "" },
  { id: 5, arquivo: "Receita 1290 — Fórmula Base", dia: "19/09/2026", hora: "16:20", destino: "E-mail m****@gmail.com", tipo: "canal", resultado: "Falha confirmada", ok: false, obs: "" },
];

export function PainelEncaminhamentoModelo({ inicial }: { inicial: Aba }) {
  const [aba, setAba] = useState<Aba>(inicial);
  const [canais, setCanais] = useState<Record<string, boolean>>({ WHATSAPP: true, TELEGRAM: false, EMAIL: false });
  const [pasta, setPasta] = useState(true);
  const [obs, setObs] = useState<Record<number, string>>(Object.fromEntries(HISTORICO.map((l) => [l.id, l.obs])));
  const [salvo, setSalvo] = useState<number | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const alvo = Object.values(canais).filter(Boolean).length;
  const slots = [
    { id: "WHATSAPP", nome: "WhatsApp", I: MessageCircle, contato: "(11) 9****-4821", on: true },
    { id: "TELEGRAM", nome: "Telegram", I: Send, contato: "@m****uza", on: true },
    { id: "EMAIL", nome: "E-mail", I: Mail, contato: null as string | null, on: false },
  ];
  return (
    <div className="ep">
      <div className="ep-top">
        <div><b>COCKPIT · PRESCRIÇÃO</b><br /><small>MARIA SOUZA · CPF ***.***.***-21 · Dra. emitente com certificado vigente</small></div>
        <small>Receita <span className="ep-num" style={{ fontSize: 15 }}>1482</span> · emitida em 21/11/2026 às 14:02</small>
      </div>

      <div className="ep-card" style={{ marginTop: 14 }}>
        <div className="ep-rx">
          <div><div className="ep-label">Fórmula</div><b>Foco e Sono</b> — Rhodiola rosea <span className="ep-num">200</span> mg · L-teanina <span className="ep-num">200</span> mg · Magnésio treonato <span className="ep-num">144</span> mg</div>
          <button className="ep-btn ep-btn--soft" type="button"><Eye size={14} style={{ verticalAlign: -2 }} /> Abrir receita</button>
        </div>
      </div>

      <section className="ep-card" style={{ marginTop: 16 }} aria-label="Painel de encaminhamento">
        <div className="ep-zone">PAINEL DE ENCAMINHAMENTO</div>
        <div className="ep-tabs" role="tablist">
          <button role="tab" aria-selected={aba === "enviar"} className={`ep-tab${aba === "enviar" ? " ep-tab--on" : ""}`} onClick={() => setAba("enviar")}><SendHorizonal size={12} style={{ verticalAlign: -2 }} /> Enviar e guardar</button>
          <button role="tab" aria-selected={aba === "historico"} className={`ep-tab${aba === "historico" ? " ep-tab--on" : ""}`} onClick={() => setAba("historico")}><History size={12} style={{ verticalAlign: -2 }} /> Histórico (<span className="ep-num">{HISTORICO.length}</span>)</button>
        </div>

        {aba === "enviar" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div className="ep-sub">
              <div className="ep-zone">1 · Para onde enviar</div>
              <div className="ep-slots">
                {slots.map((s) => (
                  <button key={s.id} type="button" disabled={!s.on} className={`ep-slot${canais[s.id] ? " ep-slot--on" : ""}${!s.on ? " ep-slot--off" : ""}`} onClick={() => setCanais({ ...canais, [s.id]: !canais[s.id] })} aria-pressed={!!canais[s.id]}>
                    <h4><span className={`ep-led${canais[s.id] ? " ep-led--on" : ""}`} /><s.I size={14} />{s.nome}</h4>
                    <div className="ep-well" style={{ padding: "6px 8px", fontSize: 12 }}>{s.contato ?? <span style={{ color: "#7a8499" }}>— sem contato no cadastro</span>}</div>
                    <span className="ep-label">{canais[s.id] ? "Marcado" : s.on ? "Toque para marcar" : "Cadastre o contato"}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="ep-sub">
              <div className="ep-zone">2 · Guardar na pasta do cliente</div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div className="ep-label" style={{ marginBottom: 4 }}>Subpasta definida pelo tipo do documento</div>
                  <div className="ep-path"><span>Drive da clínica</span>›<span>MARIA SOUZA</span>›<span>RECEITAS</span></div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, fontSize: 12, fontWeight: 700 }}>
                  <input type="checkbox" checked={pasta} onChange={(e) => setPasta(e.target.checked)} style={{ width: 20, height: 20 }} />
                  <FolderInput size={16} /> Guardar uma cópia
                </label>
              </div>
            </div>

            <div className="ep-sub" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontSize: 12 }}>
                <div className="ep-zone">3 · Confirmar</div><br />
                {alvo === 0 && !pasta ? "Marque ao menos um destino." : <>Serão feitas <b className="ep-num">{alvo + (pasta ? 1 : 0)}</b> ações; todas entram no histórico.</>}
              </div>
              {!confirmar
                ? <button className="ep-btn" type="button" disabled={alvo === 0 && !pasta} onClick={() => setConfirmar(true)}>Enviar e guardar</button>
                : <div style={{ display: "flex", gap: 8 }}><button className="ep-btn ep-btn--soft" type="button" onClick={() => setConfirmar(false)}>Voltar</button><button className="ep-btn" type="button" onClick={() => { setConfirmar(false); setAba("historico"); }}><Check size={14} style={{ verticalAlign: -2 }} /> Confirmo o envio</button></div>}
            </div>
            <p style={{ fontSize: 11, color: "#5a6680", margin: 0 }}>O arquivo enviado é sempre o PDF já emitido. O destino vem do cadastro; nada digitado aqui vira destinatário. Não há botão de baixar.</p>
          </div>
        )}

        {aba === "historico" && (
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div className="ep-label">Tudo o que já saiu deste cliente nesta ferramenta · mais recente primeiro</div>
              <button className="ep-btn ep-btn--soft" type="button" disabled title="Fase seguinte">Comparar selecionadas (em breve)</button>
            </div>
            <table className="ep-hist">
              <thead><tr className="ep-label"><th></th><th>Arquivo</th><th>Data e hora</th><th>Destino</th><th>Resultado</th><th>Observação do médico</th><th></th></tr></thead>
              <tbody>
                {HISTORICO.map((l) => (
                  <tr key={l.id}>
                    <td><input type="checkbox" aria-label={`Selecionar ${l.arquivo}`} style={{ width: 18, height: 18 }} /></td>
                    <td style={{ fontWeight: 700 }}>{l.arquivo}</td>
                    <td className="ep-num" style={{ whiteSpace: "nowrap", fontSize: 14 }}>{l.dia}<br /><span style={{ fontSize: 13 }}>{l.hora}</span></td>
                    <td><span className={`ep-chip ${l.tipo === "drive" ? "ep-chip--drive" : ""}`}>{l.tipo === "drive" ? "PASTA" : "ENVIO"}</span><br />{l.destino}</td>
                    <td><span className={`ep-chip ${l.ok ? "ep-chip--ok" : "ep-chip--warn"}`}>{l.resultado}</span></td>
                    <td style={{ minWidth: 200 }}>
                      <textarea className="ep-note" rows={2} placeholder="Escreva uma observação (ex.: adaptou bem, trocou a dose)" value={obs[l.id]} onChange={(e) => setObs({ ...obs, [l.id]: e.target.value })} onBlur={() => setSalvo(l.id)} />
                      {salvo === l.id && <div className="ep-note-saved">Observação salva.</div>}
                    </td>
                    <td><button className="ep-btn ep-btn--soft" type="button"><Eye size={13} style={{ verticalAlign: -2 }} /> Abrir</button></td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
