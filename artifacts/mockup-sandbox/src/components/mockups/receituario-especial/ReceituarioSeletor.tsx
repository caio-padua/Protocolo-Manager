// ─────────────────────────────────────────────────────────────────────────────
// RECEITUÁRIO SELETOR — Mockup completo com seletor de faixas
// Especial (4 boxes) + Simples (2 boxes) + Submenu editável de modelos
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { ArabesqueModelSelector } from "./ArabesqueModelSelector";
import { ArabesqueBand, InfoCard } from "./ArabesqueBand";
import {
  ARABESQUE_MODELS, DEFAULT_MODEL_ID,
  type ArabesqueModelId, type ArabesqueModel,
} from "./arabesqueModels";

// ─── Dados de exemplo ─────────────────────────────────────────────────────────
const PACIENTE_ROWS: [string, string][] = [
  ["Nome", "Maria Fernanda Souza Almeida"],
  ["CPF", "123.456.789-00"],
  ["Nasc.", "15/03/1988"],
  ["Cidade/UF", "São Paulo / SP"],
  ["Telefone", "(11) 98765-4321"],
];
const EMITENTE_ROWS: [string, string][] = [
  ["Nome", "Dr. Caio H. F. Pádua"],
  ["CRM", "SP 123.456   RQE: 56.789"],
  ["Espec.", "Medicina Integrativa"],
  ["Endereço", "Av. Brigadeiro Faria Lima, 3000"],
  ["Telefone", "(11) 3090-0010"],
];
const COMPRADOR_ROWS: [string, string][] = [
  ["Nome", "Maria Fernanda Souza Almeida"],
  ["Endereço", "Rua das Acácias, 250 — Apto. 42"],
  ["Cidade", "São Paulo"],
  ["Ident.", "123.456.789-00   Org.: SSP/SP"],
];
const FARMACIA_ROWS: [string, string][] = [
  ["Razão Social", "Farmácia Santé Manipulação"],
  ["CNPJ", "12.345.678/0001-90"],
  ["Endereço", "Alameda Santos, 1234"],
  ["Cidade/UF", "São Paulo / SP"],
  ["Assinatura", "________________   Data: ___/___"],
];

// ─── Seção de prescrição (Rx) ─────────────────────────────────────────────────
function SecaoPrescricao() {
  return (
    <div style={{ padding: "8mm 16mm", minHeight: "60mm" }}>
      <div style={{ fontSize: 22, fontFamily: "Georgia, serif", fontStyle: "italic", marginBottom: 6 }}>
        R<span style={{ fontSize: 14, verticalAlign: "super" }}>x</span>
      </div>
      {[
        ["1. Zolpidem 10 mg", "Tomar 1 comprimido à noite.", "30 comprimidos"],
        ["2. Clonazepam 0,5 mg", "Tomar 1 comprimido à noite.", "30 comprimidos"],
        ["3. Anastrozol 0,5 mg", "Tomar 1 cápsula 2× por semana.", "8 cápsulas"],
      ].map(([med, inst, qtde]) => (
        <div key={med} style={{ marginBottom: 8, borderBottom: "0.3px dashed #ddd", paddingBottom: 8 }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: "#111" }}>{med}</div>
          <div style={{ fontSize: 7, color: "#555", fontStyle: "italic", marginTop: 1 }}>{inst}</div>
          <div style={{ fontSize: 7, color: "#666", textAlign: "right", marginTop: 2 }}>Qtde.: {qtde}.</div>
        </div>
      ))}
      <div style={{ fontSize: 7, color: "#555", marginTop: 8 }}>São Paulo, 24 de maio de 2025.</div>
    </div>
  );
}

// ─── Cabeçalho do receituário ─────────────────────────────────────────────────
function CabecalhoReceituario({ tipo }: { tipo: "especial" | "simples" }) {
  return (
    <div style={{ textAlign: "center", padding: "10mm 0 8mm" }}>
      <div style={{ fontFamily: "Georgia, serif", fontSize: 15, fontWeight: 700, letterSpacing: 2 }}>
        Clínica Padua — Dr. Caio H. F. Pádua
      </div>
      <div style={{ fontSize: 7, color: "#555", letterSpacing: 3, marginTop: 2, textTransform: "uppercase" }}>
        Medicina Integrativa e Longevidade
      </div>
      <div style={{ marginTop: 6, fontSize: 9, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", borderTop: "0.5px solid #ccc", borderBottom: "0.5px solid #ccc", padding: "3px 0" }}>
        {tipo === "especial" ? "Receituário de Controle Especial" : "Receituário Simples"}
      </div>
    </div>
  );
}

// ─── Receituário Especial (4 boxes) ──────────────────────────────────────────
function ReceituarioEspecial({ modelId }: { modelId: ArabesqueModelId }) {
  return (
    <div style={{ background: "#fff", width: 620, margin: "0 auto", border: "0.5px solid #bbb", boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}>
      <CabecalhoReceituario tipo="especial"/>
      {/* Faixa superior com 2 boxes */}
      <ArabesqueBand modelId={modelId}>
        <InfoCard titulo="Identificação do Paciente" rows={PACIENTE_ROWS}/>
        <InfoCard titulo="Identificação do Emitente" rows={EMITENTE_ROWS}/>
      </ArabesqueBand>
      {/* Área de prescrição */}
      <SecaoPrescricao/>
      {/* Faixa inferior com 2 boxes */}
      <ArabesqueBand modelId={modelId}>
        <InfoCard titulo="Identificação do Comprador" rows={COMPRADOR_ROWS}/>
        <InfoCard titulo="Identificação do Fornecedor / Farmácia" rows={FARMACIA_ROWS}/>
      </ArabesqueBand>
      {/* Rodapé */}
      <div style={{ padding: "4mm 8mm", fontSize: 5.5, color: "#888", borderTop: "0.3px solid #ddd", textAlign: "center" }}>
        Clínica Padua — Av. Brigadeiro Faria Lima, 3000 — 10º andar — São Paulo/SP — CEP 04538-132 | (11) 3090-0010 | www.clinicapadua.com.br
      </div>
    </div>
  );
}

// ─── Receituário Simples (2 boxes) ────────────────────────────────────────────
function ReceituarioSimples({ modelId }: { modelId: ArabesqueModelId }) {
  return (
    <div style={{ background: "#fff", width: 620, margin: "0 auto", border: "0.5px solid #bbb", boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}>
      <CabecalhoReceituario tipo="simples"/>
      {/* Faixa única com 2 boxes */}
      <ArabesqueBand modelId={modelId}>
        <InfoCard titulo="Identificação do Paciente" rows={PACIENTE_ROWS}/>
        <InfoCard titulo="Identificação do Emitente" rows={EMITENTE_ROWS}/>
      </ArabesqueBand>
      {/* Área de prescrição */}
      <SecaoPrescricao/>
      {/* Rodapé */}
      <div style={{ padding: "4mm 8mm", fontSize: 5.5, color: "#888", borderTop: "0.3px solid #ddd", textAlign: "center" }}>
        Clínica Padua — Av. Brigadeiro Faria Lima, 3000 — 10º andar — São Paulo/SP — CEP 04538-132 | (11) 3090-0010
      </div>
    </div>
  );
}

// ─── Submenu editável de configuração dos modelos ────────────────────────────
type EditableField = {
  key: keyof ArabesqueModel;
  label: string;
  type: "text" | "number" | "color";
};
const EDITABLE_FIELDS: EditableField[] = [
  { key: "name",          label: "Nome",         type: "text" },
  { key: "bandHeightPx",  label: "Altura (px)",  type: "number" },
  { key: "tileW",         label: "Tile W (px)",  type: "number" },
  { key: "tileH",         label: "Tile H (px)",  type: "number" },
  { key: "bgColor",       label: "Fundo",        type: "color" },
  { key: "strokeColor",   label: "Traço",        type: "color" },
  { key: "borderColor",   label: "Filete",       type: "color" },
  { key: "strokeWidth",   label: "Espessura",    type: "number" },
  { key: "strokeOpacity", label: "Opacidade",    type: "number" },
];

function SubMenuEditavel({ selectedId }: { selectedId: ArabesqueModelId }) {
  const m = ARABESQUE_MODELS[selectedId];
  const [open, setOpen] = useState(false);

  return (
    <div style={{ border: "1px solid #d0d0cc", borderRadius: 4, overflow: "hidden", marginTop: 12 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", padding: "8px 14px", background: "#f0f0ee",
          border: "none", cursor: "pointer", textAlign: "left",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}
      >
        <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#333" }}>
          ⚙ Configuração do Modelo: {m.name}
        </span>
        <span style={{ fontSize: 9, color: "#666" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "12px 14px", background: "#fafaf8" }}>
          {/* Aviso */}
          <div style={{ fontSize: 6.5, color: "#888", marginBottom: 10, fontStyle: "italic" }}>
            ℹ️ Este submenu é o ponto de configuração central das faixas (conforme briefing do ChatGPT PADUA Designer).
            No sistema real, as alterações são salvas por clínica e persistidas no banco de dados.
            Novos modelos são cadastrados aqui adicionando uma entrada em <code>arabesqueModels.ts</code>.
          </div>
          {/* Tabela de parâmetros */}
          <table style={{ width: "100%", fontSize: 7, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#ebebea" }}>
                {["Parâmetro", "Valor atual", "Tipo", "Descrição"].map(h => (
                  <th key={h} style={{ padding: "3px 8px", textAlign: "left", fontWeight: 700, letterSpacing: 1, borderBottom: "1px solid #ddd" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EDITABLE_FIELDS.map((f, i) => {
                const val = m[f.key];
                if (val === undefined) return null;
                return (
                  <tr key={f.key} style={{ background: i % 2 === 0 ? "#fafaf8" : "#f4f4f2" }}>
                    <td style={{ padding: "3px 8px", fontWeight: 600, color: "#444" }}>{f.label}</td>
                    <td style={{ padding: "3px 8px" }}>
                      {f.type === "color" ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <span style={{ display: "inline-block", width: 14, height: 14, background: String(val), border: "0.5px solid #aaa", borderRadius: 2 }}/>
                          <code style={{ fontSize: 6.5 }}>{String(val)}</code>
                        </span>
                      ) : (
                        <code style={{ fontSize: 6.5 }}>{String(val)}</code>
                      )}
                    </td>
                    <td style={{ padding: "3px 8px", color: "#888", fontSize: 6 }}>{f.type}</td>
                    <td style={{ padding: "3px 8px", color: "#888", fontSize: 6 }}>{f.key}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Instrução de adição de novo modelo */}
          <div style={{ marginTop: 12, padding: "8px 10px", background: "#eef6fb", border: "1px solid #b0d4e8", borderRadius: 3, fontSize: 6.5, lineHeight: 1.6 }}>
            <strong>Como adicionar um novo modelo de faixa:</strong><br/>
            1. PNG 2325×300px do PADUA Designer → salvar em <code>public/assets/arabesques/</code><br/>
            2. Registrar no catálogo em <code>arabesqueModels.ts</code> com <code>renderMode: "raster-strip"</code> e <code>assetUrl</code><br/>
            3. O novo modelo aparece automaticamente no seletor<br/>
            4. Para SVG geométrico: adicionar o tile em <code>InlinePatterns.tsx</code> e registrar com <code>renderMode: "inline-svg"</code>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function ReceituarioSeletor() {
  const [modelId, setModelId] = useState<ArabesqueModelId>(DEFAULT_MODEL_ID);
  const [aba, setAba] = useState<"especial" | "simples">("especial");

  return (
    <div className="min-h-screen bg-stone-200 flex flex-col items-center py-8 gap-6">
      {/* Header */}
      <div style={{ width: 900, background: "#111", color: "#fff", padding: "10px 20px", fontSize: 8, letterSpacing: 3, textTransform: "uppercase", fontWeight: 700 }}>
        Motor de Prescrição — Seletor de Faixa Ornamental
      </div>

      {/* Layout: seletor à esquerda | preview à direita */}
      <div style={{ width: 900, display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, alignItems: "start" }}>

        {/* COLUNA ESQUERDA: seletor + submenu */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Seletor de faixa */}
          <ArabesqueModelSelector value={modelId} onChange={setModelId}/>
          {/* Submenu editável */}
          <SubMenuEditavel selectedId={modelId}/>
        </div>

        {/* COLUNA DIREITA: preview do receituário */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Tabs: especial | simples */}
          <div style={{ display: "flex", gap: 0, border: "1px solid #ccc", borderRadius: 4, overflow: "hidden", width: "fit-content" }}>
            {(["especial", "simples"] as const).map(t => (
              <button
                key={t}
                onClick={() => setAba(t)}
                style={{
                  padding: "6px 18px", fontSize: 7.5, fontWeight: 700,
                  letterSpacing: 1, textTransform: "uppercase",
                  background: aba === t ? "#2a6a8a" : "#f4f4f2",
                  color: aba === t ? "#fff" : "#555",
                  border: "none", cursor: "pointer",
                  borderRight: t === "especial" ? "1px solid #ccc" : "none",
                }}
              >
                {t === "especial" ? "Controle Especial (4 boxes)" : "Simples (2 boxes)"}
              </button>
            ))}
          </div>

          {/* Preview do receituário */}
          <div style={{ background: "#d6d3ce", padding: 16, borderRadius: 4 }}>
            {aba === "especial"
              ? <ReceituarioEspecial modelId={modelId}/>
              : <ReceituarioSimples modelId={modelId}/>
            }
          </div>

          {/* Info do modelo selecionado */}
          <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 4, padding: "8px 12px", fontSize: 6.5 }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <tbody>
                {[
                  ["Modelo ativo", ARABESQUE_MODELS[modelId].name],
                  ["Categoria", ARABESQUE_MODELS[modelId].category],
                  ["Motor", ARABESQUE_MODELS[modelId].renderMode],
                  ["Altura da faixa", `${ARABESQUE_MODELS[modelId].bandHeightPx}px`],
                  ["Descrição", ARABESQUE_MODELS[modelId].description],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ padding: "2px 8px 2px 0", fontWeight: 700, color: "#555", whiteSpace: "nowrap" }}>{k}:</td>
                    <td style={{ padding: "2px 0", color: "#111" }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
