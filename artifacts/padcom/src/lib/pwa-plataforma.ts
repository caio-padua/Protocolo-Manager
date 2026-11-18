// Decide o que mostrar em "PAXMED no seu celular" SEM inventar botao de instalar.
// So existe botao quando o navegador entregou o evento real (beforeinstallprompt).
export type EstadoInstalacao =
  | { tipo: "instalado" }
  | { tipo: "prompt" } // Android/Chrome/Edge com evento real disponivel
  | { tipo: "ios" } // Compartilhar > Adicionar a Tela de Inicio (manual)
  | { tipo: "android-manual" } // Android sem evento (ja recusou, ou outro navegador)
  | { tipo: "desktop" }; // computador / navegador sem suporte

export function decidirInstalacao(p: { installed: boolean; canInstall: boolean; isIOS: boolean; isAndroid: boolean }): EstadoInstalacao {
  if (p.installed) return { tipo: "instalado" };
  if (p.canInstall) return { tipo: "prompt" };
  if (p.isIOS) return { tipo: "ios" };
  if (p.isAndroid) return { tipo: "android-manual" };
  return { tipo: "desktop" };
}
