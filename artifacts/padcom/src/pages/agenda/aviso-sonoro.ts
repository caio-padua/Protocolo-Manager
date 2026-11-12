/**
 * Aviso sonoro opcional da Agenda: um sino curto e suave, sintetizado no navegador (nenhum arquivo de áudio).
 * Nasce DESLIGADO. O navegador só libera som depois de um clique do usuário; por isso ligar o aviso é um clique,
 * e um aviso que não puder tocar é descartado em silêncio (nunca toca atrasado, nunca dá erro na tela).
 */
const CHAVE = "paxter_agenda_aviso_sonoro";
const VALIDADE_MS = 5000;

export const avisoSonoroLigado = (): boolean => {
  try { return localStorage.getItem(CHAVE) === "1"; } catch { return false; }
};
export const gravarAvisoSonoro = (ligado: boolean) => {
  try { if (ligado) localStorage.setItem(CHAVE, "1"); else localStorage.removeItem(CHAVE); } catch { /* navegador sem armazenamento: vale só nesta tela */ }
};

let contexto: AudioContext | null = null;

function notas(ctx: AudioContext, inicio: number) {
  // Sol5 e depois Dó6: intervalo de quarta, sempre agradável; volume baixo; ataque curto e cauda longa.
  [[784, 0], [1046.5, 0.2]].forEach(([freq, atraso]) => {
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq!;
    const t = inicio + atraso!;
    ganho.gain.setValueAtTime(0.0001, t);
    ganho.gain.exponentialRampToValueAtTime(0.07, t + 0.03);
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    osc.connect(ganho).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1.6);
  });
}

/** Toca o sino. Devolve false quando o navegador não permite (sem clique prévio ou sem suporte a áudio). */
export function tocarSino(): boolean {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    contexto ??= new Ctor();
    const ctx = contexto;
    if (ctx.state === "running") { notas(ctx, ctx.currentTime); return true; }
    const pedidoEm = Date.now();
    void ctx.resume().then(() => { if (Date.now() - pedidoEm <= VALIDADE_MS && ctx.state === "running") notas(ctx, ctx.currentTime); }).catch(() => undefined);
    return false;
  } catch {
    return false;
  }
}
