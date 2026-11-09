import assert from "node:assert/strict";
import { test } from "node:test";
import { abreviarNomeCliente } from "./_abreviarNomeCliente";

const medir = (texto: string) => Array.from(texto).length;

test("mantém o nome completo quando ele cabe", () => {
  const nome = "Ana Beatriz Clara Duarte Silva";
  assert.equal(abreviarNomeCliente(nome, medir(nome), medir), nome);
  assert.equal(abreviarNomeCliente(nome, medir(nome) + 20, medir), nome);
});

test("abrevia do penúltimo nome para a esquerda e para quando couber", () => {
  const nome = "Ana Beatriz Clara Duarte Silva";
  for (const esperado of [
    "Ana Beatriz Clara D. Silva",
    "Ana Beatriz C. D. Silva",
    "Ana B. C. D. Silva",
    "A. B. C. D. Silva",
  ]) {
    assert.equal(abreviarNomeCliente(nome, medir(esperado), medir), esperado);
  }
});

test("preserva o sobrenome e partículas entre nomes", () => {
  const nome = "Érica Júlia de Oliveira Santos";
  assert.equal(
    abreviarNomeCliente(nome, medir("Érica J. de O. Santos"), medir),
    "Érica J. de O. Santos",
  );
  assert.equal(abreviarNomeCliente("Ana de Souza", 1, medir), "A. de Souza");
});

test("preserva caracteres acentuados na inicial e não modifica o original", () => {
  const nome = "A\u0301lvaro Cândido Oliveira";
  assert.equal(abreviarNomeCliente(nome, 1, medir), "Á. C. Oliveira");
  assert.equal(nome, "A\u0301lvaro Cândido Oliveira");
});

test("mantém nome único ou já abreviado quando não há o que encurtar", () => {
  assert.equal(abreviarNomeCliente("SobrenomeMuitoLongo", 3, medir), "SobrenomeMuitoLongo");
  assert.equal(abreviarNomeCliente("A. Silva", 3, medir), "A. Silva");
});

test("não muda nomes com espaço indisponível ou medição inválida", () => {
  const nome = "Ana Beatriz Silva";
  assert.equal(abreviarNomeCliente(nome, 0, medir), nome);
  assert.equal(abreviarNomeCliente(nome, Number.NaN, medir), nome);
  assert.equal(abreviarNomeCliente(nome, 5, () => Number.NaN), nome);
});
