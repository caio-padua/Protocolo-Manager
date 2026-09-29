export * from "./generated/api";
// generated/api já expõe os schemas e tipos usados pelas rotas. Reexportar
// generated/types também cria colisões (por exemplo, *Body) no barrel.
