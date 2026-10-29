import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Exercise the actual effect with a deterministic clock and deferred requests.
const source = readFileSync("artifacts/padcom/src/pages/comunicacao/guia-paciente.tsx", "utf8");
const effect = source.slice(
  source.indexOf("    const controller = new AbortController();"),
  source.indexOf("  }, [clientId, tick, authHeaders]);"),
);
const code = ts.transpile(`(function () { ${effect} })()`);
const flush = () => new Promise(resolve => setImmediate(resolve));

function mount() {
  const timers = new Map();
  const requests = [];
  const states = [];
  let id = 0;
  const cleanup = vm.runInNewContext(code, {
    AbortController, Error, API_BASE: "", clientId: 42,
    authHeaders: () => ({}),
    fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })),
    setInterval: (fn, delay) => { assert.equal(delay, 30_000); timers.set(++id, fn); return id; },
    clearInterval: id => timers.delete(id),
    setStatus: value => states.push(value),
    setErro() {}, setLoading() {}, setActivationResult() {},
    setNoEmailWarning() {}, setCountdown() {}, countdownRef: { current: null },
  });
  const answer = async (index, vinculado) => {
    requests[index].resolve({ ok: true, json: async () => ({ vinculado, desde: null }) });
    await flush();
  };
  return { cleanup, timers, requests, states, answer };
}

test("polls pending status silently, prevents overlap, and stops when linked", async () => {
  const h = mount();
  await h.answer(0, false);
  assert.equal(h.timers.size, 1);
  const poll = [...h.timers.values()][0];
  poll();
  poll();
  assert.equal(h.requests.length, 2);
  await h.answer(1, true);
  assert.equal(h.states.at(-1).vinculado, true);
  assert.equal(h.timers.size, 0);
  h.cleanup();
});

test("already linked patients never start polling", async () => {
  const h = mount();
  await h.answer(0, true);
  assert.equal(h.timers.size, 0);
  h.cleanup();
});

test("cleanup cancels polling and ignores stale responses on unmount or patient change", async () => {
  const h = mount();
  await h.answer(0, false);
  [...h.timers.values()][0]();
  h.cleanup();
  assert.equal(h.timers.size, 0);
  assert.equal(h.requests[1].options.signal.aborted, true);
  await h.answer(1, true);
  assert.equal(h.states.at(-1).vinculado, false);
});
