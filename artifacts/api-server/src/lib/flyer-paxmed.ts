/**
 * FLYER DE COMUNICACAO PAXMED (Telegram e WhatsApp) — molde unico, copia fiel da previa aprovada
 * "Receituario" / app PaxMed Member (skill-layout-paxter/references/previa-de-link.md).
 * NAO REDESENHAR: largura 1200 px, pilha de 800 px, placa 208 px, gaveta recuada 34 px, mesmas cores.
 * So a ALTURA cresce, conforme a quantidade de linhas da gaveta. A placa PaxMed nunca muda.
 * Campos imutaveis: mesma ordem e posicao; dado ausente aparece como "Não localizado".
 * A clinica (nome real do cadastro) fica SEMPRE por ultimo.
 */
import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

export interface LinhaFlyer { rotulo: string; valor: string | null }
export interface EntradaFlyer { titulo: string; destaque?: string; linhas: LinhaFlyer[]; clinica: string }

export const FLYER_LARGURA = 1200;
const MARGEM = 55;       // mesma folga vertical da previa (630 - 520) / 2
const PILHA_X = 200;     // pilha de 800 px centrada em 1200
const PILHA_L = 800;
const PLACA_H = 208;
export const NAO_LOCALIZADO = "Não localizado";

function achar(rel: string): string {
  for (const base of [path.resolve(import.meta.dirname, "../assets"), path.resolve(import.meta.dirname, "../../assets"), path.resolve(import.meta.dirname, "assets")]) {
    const p = path.join(base, rel);
    if (existsSync(p)) return p;
  }
  throw new Error(`Arquivo do flyer ausente: ${rel}`);
}
let fontes = false;
function registrarFontes(): void {
  if (fontes) return;
  GlobalFonts.registerFromPath(achar("fonts/EBGaramond-SemiBold.ttf"), "FlyerGaramond");
  GlobalFonts.registerFromPath(achar("fonts/EBGaramond-Regular.ttf"), "FlyerGaramondReg");
  GlobalFonts.registerFromPath(achar("fonts/EBGaramond-SemiBoldItalic.ttf"), "FlyerGaramondIt");
  GlobalFonts.registerFromPath(achar("fonts/Jost-Variable.ttf"), "FlyerJost");
  fontes = true;
}

function rr(c: SKRSContext2D, x: number, y: number, w: number, h: number, r: number | [number, number, number, number]): void {
  c.beginPath(); c.roundRect(x, y, w, h, r);
}
/** Texto com espacamento entre letras, centrado em cx. */
function txt(c: SKRSContext2D, s: string, cx: number, y: number, esp: number): void {
  const larg = [...s].reduce((a, ch) => a + c.measureText(ch).width + esp, -esp);
  let x = cx - larg / 2;
  c.textAlign = "left";
  for (const ch of s) { c.fillText(ch, x, y); x += c.measureText(ch).width + esp; }
}

export async function renderFlyerPaxmed(e: EntradaFlyer): Promise<Buffer> {
  registrarFontes();
  const L = FLYER_LARGURA;
  const ALT_LINHA = 84;
  const gavetaTopo = MARGEM + 176;                       // igual a previa: placa 208 cobre 32 px da gaveta
  const conteudoTopo = MARGEM + PLACA_H + 44;
  const tituloY = conteudoTopo + 28;
  const linhasTopo = tituloY + (e.destaque ? 78 : 50);
  const clinicaY = linhasTopo + e.linhas.length * ALT_LINHA + 54;
  const gavetaFundo = clinicaY + 40;
  const H = gavetaFundo + 12 + MARGEM + 12;
  const cv = createCanvas(L, H);
  const c = cv.getContext("2d");

  // Fundo + risca de giz (164 graus, periodo 26, traco 1 px) + vinheta radial — igual a previa.
  c.fillStyle = "#0c1a34"; c.fillRect(0, 0, L, H);
  c.save(); c.translate(L / 2, H / 2); c.rotate(((164 - 90) * Math.PI) / 180);
  c.strokeStyle = "rgba(190,215,255,0.09)"; c.lineWidth = 1;
  const diag = Math.hypot(L, H);
  for (let d = -diag; d < diag; d += 26) { c.beginPath(); c.moveTo(-diag, d + 11.5); c.lineTo(diag, d + 11.5); c.stroke(); }
  c.restore();
  const rg = c.createRadialGradient(L / 2, H * 0.4, 0, L / 2, H * 0.4, Math.max(L, H) * 0.62);
  rg.addColorStop(0, "rgba(40,70,130,0.35)"); rg.addColorStop(1, "rgba(5,12,28,0.6)");
  c.fillStyle = rg; c.fillRect(0, 0, L, H);

  // GAVETA (por baixo da placa): #16294f -> #1a3160, degraus de sombra 6/12 px.
  const gx = PILHA_X + 34, gw = PILHA_L - 68, gh = gavetaFundo - gavetaTopo;
  c.save(); c.shadowColor = "rgba(0,0,0,0.58)"; c.shadowBlur = 34; c.shadowOffsetY = 28;
  rr(c, gx, gavetaTopo + 12, gw, gh, [0, 0, 16, 16]); c.fillStyle = "#050b19"; c.fill(); c.restore();
  rr(c, gx, gavetaTopo + 6, gw, gh, [0, 0, 16, 16]); c.fillStyle = "#0b1731"; c.fill();
  const gg = c.createLinearGradient(0, gavetaTopo, 0, gavetaFundo); gg.addColorStop(0, "#16294f"); gg.addColorStop(1, "#1a3160");
  rr(c, gx, gavetaTopo, gw, gh, [0, 0, 16, 16]); c.fillStyle = gg; c.fill();
  c.strokeStyle = "rgba(150,185,235,0.22)"; c.lineWidth = 1; c.stroke();
  c.fillStyle = "rgba(0,0,0,0.32)"; c.fillRect(gx + 8, gavetaFundo - 3, gw - 16, 3);

  const cx = L / 2;
  // Titulo (EB Garamond 38) e destaque dourado italico.
  c.textBaseline = "alphabetic";
  c.font = "38px FlyerGaramond"; c.fillStyle = "#f3efe3"; txt(c, e.titulo, cx, tituloY, 0.2);
  if (e.destaque) { c.font = "italic 30px FlyerGaramondIt"; c.fillStyle = "#e3b659"; txt(c, e.destaque, cx, tituloY + 40, 0); }

  // Linhas imutaveis: rotulo Jost caixa-alta (#b9c6e0) sobre dado Jost 500 (#f3efe3); losango dourado entre linhas.
  e.linhas.forEach((ln, i) => {
    const y = linhasTopo + i * ALT_LINHA;
    if (i > 0) {
      c.save(); c.translate(cx, y - 26); c.rotate(Math.PI / 4); c.fillStyle = "rgba(227,182,89,0.85)"; c.fillRect(-3.5, -3.5, 7, 7); c.restore();
    }
    c.font = "500 15px FlyerJost"; c.fillStyle = "#b9c6e0"; txt(c, ln.rotulo.toUpperCase(), cx, y + 6, 3.2);
    const ausente = !ln.valor;
    c.font = ausente ? "italic 26px FlyerGaramondIt" : "500 30px FlyerJost";
    c.fillStyle = ausente ? "#8fa0c4" : "#f3efe3";
    txt(c, ausente ? NAO_LOCALIZADO : (ln.valor as string), cx, y + 44, ausente ? 0.5 : 1);
  });

  // Clinica SEMPRE por ultimo.
  c.fillStyle = "rgba(227,182,89,0.85)"; c.save(); c.translate(cx, clinicaY - 42); c.rotate(Math.PI / 4); c.fillRect(-3.5, -3.5, 7, 7); c.restore();
  c.font = "34px FlyerGaramond"; c.fillStyle = "#e3b659"; txt(c, e.clinica, cx, clinicaY, 0.5);

  // PLACA em relevo (alto): #14264a -> #091428, 800 x 208, raio 16, degraus 5/10 px.
  const px = PILHA_X, py = MARGEM;
  c.save(); c.shadowColor = "rgba(0,0,0,0.62)"; c.shadowBlur = 34; c.shadowOffsetY = 26;
  rr(c, px, py + 10, PILHA_L, PLACA_H, 16); c.fillStyle = "#050b19"; c.fill(); c.restore();
  rr(c, px, py + 5, PILHA_L, PLACA_H, 16); c.fillStyle = "#0a1530"; c.fill();
  const pg = c.createLinearGradient(0, py, 0, py + PLACA_H); pg.addColorStop(0, "#14264a"); pg.addColorStop(0.48, "#0d1b38"); pg.addColorStop(1, "#091428");
  rr(c, px, py, PILHA_L, PLACA_H, 16); c.fillStyle = pg; c.fill();
  c.strokeStyle = "rgba(150,185,235,0.26)"; c.lineWidth = 1; c.stroke();
  c.save(); rr(c, px, py, PILHA_L, PLACA_H, 16); c.clip();
  c.fillStyle = "rgba(255,255,255,0.3)"; c.fillRect(px, py, PILHA_L, 2);
  c.fillStyle = "rgba(255,255,255,0.07)"; c.fillRect(px, py, 2, PLACA_H);
  c.fillStyle = "rgba(0,0,0,0.25)"; c.fillRect(px + PILHA_L - 2, py, 2, PLACA_H);
  c.fillStyle = "rgba(0,0,0,0.45)"; c.fillRect(px, py + PLACA_H - 3, PILHA_L, 3); c.restore();

  // Marca: simbolo 148 x 149,2 + 44 + nome 380 x 63,8; tagline ABAIXO DO NOME (nunca da logo).
  const sim = await loadImage(readFileSync(achar("flyer/paxmed-link-simbolo.png")));
  const nome = await loadImage(readFileSync(achar("flyer/paxmed-link-nome.png")));
  const conjL = 148 + 44 + 380, x0 = px + (PILHA_L - conjL) / 2, meio = py + PLACA_H / 2;
  const colH = 63.8 + 14 + 18, colTopo = meio - colH / 2;
  c.save(); c.shadowColor = "rgba(0,0,0,0.5)"; c.shadowBlur = 4; c.shadowOffsetY = 3;
  c.drawImage(sim, x0, meio - 149.2 / 2, 148, 149.2);
  c.drawImage(nome, x0 + 148 + 44, colTopo, 380, 63.8);
  c.restore();
  c.font = "500 15px FlyerJost"; c.fillStyle = "#d9bd7a";
  txt(c, "CLINICAL INTELLIGENCE SYSTEM", x0 + 148 + 44 + 190, colTopo + 63.8 + 14 + 14, 5.6);

  return cv.toBuffer("image/png");
}
