// ─────────────────────────────────────────────────────────────────────────────
// RECEITUÁRIO HTML — Gera HTML idêntico ao ReceituarioPreview.tsx para captura
// Puppeteer → PNG → generatePdfFromPngBase64 → PDF assinado ICP-Brasil
// ─────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";

// PNG embutido como base64 — evita qualquer dependência de rede no Puppeteer
// CWD varia: workspace root quando node direto, ou artifacts/api-server quando via pnpm filter
let _arabesqueDataUrl: string | null = null;
function getArabesqueDataUrl(): string {
  if (_arabesqueDataUrl !== null) return _arabesqueDataUrl;
  const rel = "artifacts/padcom/public/assets/arabesques/padua-01-floral-islamico.png";
  const candidates = [
    path.join(process.cwd(), rel),                          // CWD = workspace root
    path.join(process.cwd(), "../..", rel),                 // CWD = artifacts/api-server
    path.join(process.cwd(), "..", rel),                    // CWD = artifacts
    "/home/runner/workspace/" + rel,                        // absoluto garantido
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p);
        _arabesqueDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
        return _arabesqueDataUrl;
      }
    } catch { /* tenta próximo */ }
  }
  _arabesqueDataUrl = "";
  return _arabesqueDataUrl;
}

export interface PrescricaoHtmlData {
  medicoNome: string;
  medicoCrm: string;
  medicoRqe?: string;
  medicoTelefone?: string;
  clinicaNome: string;
  clinicaEndereco: string;
  clinicaTelefone?: string;
  pacienteNome: string;
  pacienteCpf: string;
  pacienteNascimento?: string;
  pacienteTelefone?: string;
  pacienteEndereco?: string;
  formulas: {
    numero: number;
    nome: string;
    ativos: string;
    posologia: string;
    via?: string;
    forma?: string;
  }[];
  tipoReceita: "especial" | "simples";
  dataEmissao: string;
  assetsBaseUrl: string;
}

function fmtData(iso: string): string {
  const [y, m, d] = iso.split("-");
  const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return `${parseInt(d, 10)} de ${MESES[parseInt(m, 10) - 1] ?? ""} de ${y}`;
}

function fieldLine(label: string, value?: string): string {
  const val = value
    ? `<span style="color:#111;font-weight:400;font-size:7px">${value}</span>`
    : `<span style="flex:1;border-bottom:0.4px dotted #bbb;display:block;min-height:10px"></span>`;
  return `
    <div style="display:flex;align-items:baseline;gap:5px;font-size:6.5px;margin-bottom:3.5px;color:#111">
      <span style="font-weight:700;color:#555;white-space:nowrap;flex-shrink:0;font-size:6px;letter-spacing:0.3px;text-transform:uppercase">${label}:</span>
      ${val}
    </div>`;
}

function fieldRow(fields: { label: string; value?: string }[]): string {
  const cols = fields.map(f => fieldLine(f.label, f.value)).join("");
  return `<div style="display:grid;grid-template-columns:repeat(${fields.length},1fr);gap:0 6mm;margin-bottom:1px">${cols}</div>`;
}

function identBox(titulo: string, rows: (string | { label: string; value?: string }[])[]): string {
  const rowsHtml = rows.map(r => {
    if (Array.isArray(r)) return fieldRow(r);
    return r;
  }).join("");
  return `
    <div style="
      background:#fff;
      border:1px solid #454545;
      border-radius:1px;
      border-left:3px solid #3D7A7A;
      padding:3mm 4mm;
      box-shadow:0.4mm 0.4mm 0 rgba(0,0,0,0.05);
    ">
      <div style="text-align:center;font-weight:700;font-size:7px;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:5px;border-bottom:0.4px solid #ddd;padding-bottom:3px;color:#222">${titulo}</div>
      ${rowsHtml}
    </div>`;
}

function arabesqueBand(children: string, align: "flex-start" | "flex-end" = "flex-start"): string {
  const dataUrl = getArabesqueDataUrl();
  const bgStyle = dataUrl
    ? `background-image:url('${dataUrl}');background-size:cover;background-position:center center;`
    : `background-color:#f3f3f0;`;
  return `
    <div style="
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:5mm;
      padding:6mm 10mm;
      margin:3mm 0;
      ${bgStyle}
      border-top:0.8px solid #8f8f8b;
      border-bottom:0.8px solid #8f8f8b;
      align-items:${align};
      min-height:80px;
    ">
      ${children}
    </div>`;
}

function linhaDecorativa(): string {
  return `
    <div style="margin:3mm 0;display:flex;flex-direction:column;gap:2px">
      <div style="border-top:0.6px solid #bbb;width:100%"></div>
      <div style="border-top:0.3px solid #ddd;width:100%"></div>
    </div>`;
}

function formulaBlock(f: PrescricaoHtmlData["formulas"][number]): string {
  const ativos = f.ativos.split("\n").filter(Boolean).map(l => `<div>${l}</div>`).join("");
  const posologia = f.posologia.split("\n").filter(Boolean).map(l =>
    `<div style="color:#0a7a6e;font-weight:600;margin-bottom:2px">▸ ${l}</div>`
  ).join("");
  const viaForma = (f.via || f.forma) ? `
    <div style="margin-left:26px;display:flex;gap:8mm;font-size:6.5px;color:#555;margin-bottom:4px">
      ${f.via ? `<div style="display:flex;flex-direction:column"><span style="font-size:5.5px;text-transform:uppercase;letter-spacing:1px;color:#aaa">Via</span><span style="font-weight:600;color:#333">${f.via}</span></div>` : ""}
      ${f.forma ? `<div style="display:flex;flex-direction:column"><span style="font-size:5.5px;text-transform:uppercase;letter-spacing:1px;color:#aaa">Forma</span><span style="font-weight:600;color:#333">${f.forma}</span></div>` : ""}
    </div>` : "";
  return `
    <div style="margin-bottom:5mm;border-bottom:0.3px dashed #e5e5e5;padding-bottom:4mm">
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px">
        <span style="font-weight:700;font-size:9px;color:#555;min-width:18px;text-align:right">${String(f.numero).padStart(2,"0")}.</span>
        <span style="font-weight:700;font-size:10px;color:#111;font-family:Georgia,serif">${f.nome}</span>
      </div>
      ${viaForma}
      <div style="margin-left:26px;font-family:monospace;font-size:8px;color:#1a1a1a;margin-bottom:5px;line-height:1.55">${ativos}</div>
      <div style="margin-left:26px;font-size:7px">${posologia}</div>
    </div>`;
}

export function buildPrescricaoHtml(d: PrescricaoHtmlData): string {
  const base = d.assetsBaseUrl.replace(/\/$/, "");
  const dataExtenso = fmtData(d.dataEmissao);
  const [y, m, dd] = d.dataEmissao.split("-");
  const dataFormatada = `${dd}/${m}/${y}`;
  const crmRqe = d.medicoRqe
    ? `${d.medicoCrm} — RQE: ${d.medicoRqe}`
    : d.medicoCrm;

  // Box 1 — Emitente
  const box1 = identBox(
    "Identificação do Emitente",
    [
      fieldLine("Profissional/Prescritor", d.medicoNome),
      [
        { label: "Conselho", value: crmRqe },
        { label: "Telefone", value: d.clinicaTelefone || d.medicoTelefone },
      ],
      fieldLine("Endereço do Consultório", d.clinicaEndereco),
    ],
  );

  // Box 2 — Paciente
  const box2 = identBox(
    "Identificação do Paciente",
    [
      fieldLine("Nome Completo", d.pacienteNome),
      [
        { label: "CPF",        value: d.pacienteCpf },
        { label: "Nascimento", value: d.pacienteNascimento },
        { label: "Telefone",   value: d.pacienteTelefone },
      ],
      fieldLine("Endereço Completo", d.pacienteEndereco),
    ],
  );

  // Box 3 — Comprador (em branco)
  const box3 = identBox(
    "Identificação do Comprador",
    [
      fieldLine("Nome"),
      fieldLine("Endereço"),
      [{ label: "Cidade" }, { label: "UF" }],
      [{ label: "Identidade" }, { label: "Org. Emissora" }],
      fieldLine("Telefone"),
    ],
  );

  // Box 4 — Fornecedor (em branco)
  const box4 = identBox(
    "Identificação do Fornecedor",
    [
      fieldLine("Assinatura do Farmacêutico"),
      fieldLine("Data"),
    ],
  );

  const faixaSuperior = arabesqueBand(box1 + box2, "flex-start");
  const faixaInferior = d.tipoReceita === "especial" ? arabesqueBand(box3 + box4, "flex-end") : "";

  const formulasHtml = d.formulas.map(f => formulaBlock(f)).join("");

  // Rodapé — endereço esquerda + logo PAXTER direita
  const paxterLogoSrc = `${base}/brand/paxter-symbol.png`;
  const paxterWordmarkSrc = `${base}/brand/paxter-wordmark.png`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=794"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: white; font-family: Georgia, serif; }
    @page { size: A4; margin: 0; }
  </style>
</head>
<body>
<div id="receituario" style="
  background:#fff;
  width:794px;
  min-height:1123px;
  font-family:Georgia,serif;
  font-size:8px;
  color:#111;
  position:relative;
  box-sizing:border-box;
  padding:10mm 12mm;
">

  <!-- 1. CABEÇALHO -->
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:4mm">
    <div style="display:flex;align-items:center;gap:10px">
      <div style="display:flex;align-items:center;justify-content:center;width:48px;height:36px;border:0.5px dashed #ddd;font-size:5px;color:#ccc;border-radius:1px">LOGO</div>
      <div>
        <div style="font-weight:800;font-size:13px;color:#1a1a1a;letter-spacing:0.5px">${d.clinicaNome}</div>
        <div style="font-size:7px;color:#666;letter-spacing:1.5px;margin-top:2px">Medicina Integrativa e Longevidade</div>
      </div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-size:7px;font-weight:700;color:#555;letter-spacing:1px">RCE: ${y}</div>
      <div style="font-size:6px;color:#888">1ª via: Estabelecimento</div>
      <div style="font-size:6px;color:#888">2ª via: Paciente</div>
    </div>
  </div>

  ${linhaDecorativa()}

  <!-- 2. TÍTULO -->
  <div style="text-align:center;margin-bottom:4mm">
    <div style="font-weight:800;font-size:16px;letter-spacing:2px;text-transform:uppercase;color:#1a1a1a">
      ${d.tipoReceita === "especial" ? "RECEITUÁRIO DE CONTROLE ESPECIAL" : "RECEITUÁRIO SIMPLES — FÓRMULAS MANIPULADAS"}
    </div>
  </div>

  ${linhaDecorativa()}

  <!-- 3. FAIXA SUPERIOR + BOXES -->
  ${faixaSuperior}

  <!-- 4. CORPO / FÓRMULAS -->
  <div style="padding:5mm 2mm 3mm">
    <div style="font-size:11px;font-style:italic;margin-bottom:4mm;font-family:Georgia,serif">Prescrevo:</div>
    ${formulasHtml}
  </div>

  <!-- 5. ASSINATURA -->
  <div style="display:flex;align-items:flex-start;gap:8mm;padding:4mm 2mm 6mm;border-top:0.3px solid #eee;margin-top:2mm">
    <div style="flex:0 0 auto;min-width:140px">
      <div style="font-family:Georgia,serif;font-style:italic;font-size:18px;color:#222;letter-spacing:1px;margin-bottom:3px;border-bottom:0.5px solid #555;padding-bottom:4px;width:130px">Assinatura</div>
      <div style="font-size:6.5px;color:#333;margin-top:4px;font-family:Arial,sans-serif">
        ${d.medicoNome}<br/>
        ${crmRqe}<br/>
        São Paulo, ${dataExtenso}
      </div>
    </div>
    <!-- Bloco certificado digital ICP-Brasil -->
    <div style="flex:1;border:0.5px solid #bbb;border-radius:2px;padding:4px 6px;background:#fafafa;font-family:Arial,sans-serif">
      <div style="font-size:5.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#555;border-bottom:0.4px solid #ddd;padding-bottom:2px;margin-bottom:3px">Documento Assinado Eletronicamente</div>
      <table style="width:100%;border-collapse:collapse;font-size:5.5px;color:#333">
        <tr><td style="color:#888;padding-right:4px;white-space:nowrap">Assinante:</td><td style="font-weight:600">${d.medicoNome}</td></tr>
        <tr><td style="color:#888;padding-right:4px;white-space:nowrap">Certificado:</td><td style="font-weight:600">${crmRqe}</td></tr>
        <tr><td style="color:#888;padding-right:4px;white-space:nowrap">Assinado em:</td><td style="font-weight:600">${dataFormatada}</td></tr>
        <tr><td style="color:#888;padding-right:4px;white-space:nowrap">Verificação:</td><td style="font-weight:600">paxter.med.br/verificar</td></tr>
      </table>
    </div>
  </div>

  <!-- 6. FAIXA INFERIOR + BOXES -->
  ${faixaInferior}

  <!-- 7. RODAPÉ -->
  <div style="position:absolute;bottom:8mm;left:12mm;right:12mm;display:flex;align-items:flex-end;justify-content:space-between;border-top:0.3px solid #ddd;padding-top:3mm">
    <div>
      <div style="font-size:6px;color:#444;margin-bottom:1px">${d.clinicaEndereco}</div>
      <div style="font-size:5.5px;color:#999">Instituto Padua — CNPJ: 00.000.000/0001-00</div>
    </div>
    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
      <img src="${paxterLogoSrc}" alt="ícone" style="height:22px;width:22px;object-fit:contain;opacity:0.8"/>
      <div>
        <img src="${paxterWordmarkSrc}" alt="PAXTER" style="max-height:16px;object-fit:contain;display:block"/>
        <div style="font-size:5.5px;color:#aaa;letter-spacing:0.8px;margin-top:1px">Clinical Intelligence System</div>
      </div>
    </div>
  </div>

</div>
</body>
</html>`;

  return html;
}
