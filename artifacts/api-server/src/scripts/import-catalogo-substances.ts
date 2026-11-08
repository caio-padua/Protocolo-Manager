import { importarCatalogoSubstancias } from "../lib/importar-catalogo-substancias";

// Ponto de entrada exclusivo do comando; a função de importação é testável sem
// executar process.exit quando carregada como biblioteca.
importarCatalogoSubstancias()
  .then(result => {
    console.log("=== Importacao catalogo_itens -> substances ===");
    console.log("Itens elegiveis (injetaveis+implantes):", result.itens);
    console.log("Criados:", result.criados);
    console.log("Atualizados:", result.atualizados);
    console.log("Pulados (sem codigo/nome):", result.pulados);
    console.log("Por categoria:", result.porCategoria);
    console.log("Total em substances agora:", result.total);
    process.exit(0);
  })
  .catch(error => { console.error(error); process.exit(1); });
