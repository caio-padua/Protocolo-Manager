// Servidor LOCAL mínimo (somente 127.0.0.1) que serve as páginas de teste e um PDF inofensivo.
// Sem dependências extras, sem rede externa, sem credenciais.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.POC_PORT || 19099);

// PDF mínimo válido de 1 página com a frase "TESTE INOFENSIVO". Não representa nenhum documento real.
function pdfDeTeste() {
  const stream = "BT /F1 18 Tf 72 720 Td (TESTE INOFENSIVO - Padua Lottery Engine POC) Tj ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offs.forEach((o) => { out += `${String(o).padStart(10, "0")} 00000 n \n`; });
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const paginas = new Map([["/", "index.html"], ["/segunda", "segunda.html"]]);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/health") { res.writeHead(200, { "Content-Type": "text/plain" }); res.end("ok"); return; }
  if (url.pathname === "/arquivo-teste.pdf") {
    res.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="arquivo-teste.pdf"' });
    res.end(pdfDeTeste());
    return;
  }
  const arq = paginas.get(url.pathname);
  if (!arq) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("nao encontrado"); return; }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(await readFile(path.join(dir, "fixtures", arq)));
});

server.listen(PORT, "127.0.0.1", () => console.log(`[poc] fixtures em http://127.0.0.1:${PORT}`));
