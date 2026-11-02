export * from "./generated/api";
// Os schemas gerados já exportam os tipos inferidos. Não exportar generated/types:
// ele repete nomes de contratos e gera colisões no barrel.
