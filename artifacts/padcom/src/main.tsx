import { vitrineDoEndereco } from "./lib/host-vitrine";

const vitrine = vitrineDoEndereco(window.location.hostname, window.location.pathname);

if (vitrine === "paxcare") {
  // Vitrine pública: pacote próprio (carregado só neste domínio), sem o Manager e sem o service worker do aplicativo.
  void import("./vitrines/paxcare/main").then((m) => m.montarVitrinePaxcare());
} else if (vitrine === "paxmed") {
  void import("./vitrines/paxmed/main").then((m) => m.montarVitrinePaxmed());
} else {
  void import("./boot-manager");
}
