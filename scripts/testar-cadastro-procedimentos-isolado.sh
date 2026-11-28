#!/usr/bin/env bash
# Prova local em banco e rede descartáveis; não inicia a entrada do servidor.
set -Eeuo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
for command in unshare setsid setpriv python3 node pnpm curl initdb pg_ctl; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Teste não iniciado: comando obrigatório ausente: %s\n' "$command" >&2
    exit 1
  fi
done

scratch="$(mktemp -d /tmp/paxter-procedimentos.XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
mkdir -p "$scratch/home" "$scratch/tmp"

# Nenhuma variável de integração ou conexão da aplicação passa para o teste.
env -i HOME="$scratch/home" TMPDIR="$scratch/tmp" PATH="$PATH" LANG=C.UTF-8 \
  PAXTER_REPO_ROOT="$root" unshare -Unc --keep-caps bash -s <<'ISOLATED'
set -Eeuo pipefail
cd -- "$PAXTER_REPO_ROOT"

# Vite e Vitest carregam estes arquivos automaticamente, mesmo com env -i.
for directory in artifacts/padcom artifacts/api-server; do
  for name in .env .env.local .env.development .env.development.local .env.test .env.test.local; do
    if [[ -e "$directory/$name" || -L "$directory/$name" ]]; then
      printf 'Teste não iniciado: arquivo de ambiente presente em %s/%s\n' "$directory" "$name" >&2
      exit 1
    fi
  done
done

python3 - <<'PY'
import errno
import fcntl
import socket
import struct

interfaces = [name for _, name in socket.if_nameindex()]
if "lo" not in interfaces or set(interfaces) - {"lo", "sit0"}:
    raise SystemExit("Teste não iniciado: rede isolada inesperada.")

control = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
for name in interfaces:
    if name == "lo":
        continue
    request = struct.pack("16sH14x", name.encode(), 0)
    flags = struct.unpack("16sH14x", fcntl.ioctl(control, 0x8913, request))[1]
    if flags & 1:
        raise SystemExit("Teste não iniciado: interface externa ativa.")
request = struct.pack("16sH14x", b"lo", 0)
flags = struct.unpack("16sH14x", fcntl.ioctl(control, 0x8913, request))[1]
fcntl.ioctl(control, 0x8914, struct.pack("16sH14x", b"lo", flags | 1))
control.close()

probe = socket.socket()
probe.settimeout(1)
result = probe.connect_ex(("192.0.2.1", 443))
probe.close()
if result != errno.ENETUNREACH:
    raise SystemExit("Teste não iniciado: bloqueio da rede externa não comprovado.")
print("Rede externa bloqueada; acesso local isolado disponível.", flush=True)
PY

log="$TMPDIR/interface.log"
vite_pid=""
proxy_pid=""
cleanup() {
  for pid in "$vite_pid" "$proxy_pid"; do
    if [[ -n "$pid" ]]; then
      kill -TERM -- "-$pid" 2>/dev/null || true
    fi
  done
  for pid in "$vite_pid" "$proxy_pid"; do
    if [[ -n "$pid" ]]; then
      wait "$pid" 2>/dev/null || true
    fi
  done
  # Se um teste for interrompido antes do afterAll, pare seu banco descartável.
  for directory in "$TMPDIR"/paxter-pg-isolado-*; do
    if [[ -d "$directory/dados" ]]; then
      pg_ctl -D "$directory/dados" -m fast -w stop >/dev/null 2>&1 || true
    fi
  done
}
trap cleanup EXIT

PORT=18148 BASE_PATH=/ NODE_ENV=development \
  setsid setpriv --bounding-set=-all --inh-caps=-all --ambient-caps=-all \
  pnpm --filter @workspace/padcom run dev >"$log" 2>&1 &
vite_pid=$!

# Uma das suítes existentes usa a porta 80; a outra usa a porta 18148.
# Somente o encaminhador precisa da permissão para abrir a porta local 80.
setsid setpriv --bounding-set=-all,+net_bind_service --inh-caps=+net_bind_service \
  --ambient-caps=+net_bind_service node -e '
const http = require("node:http");
http.createServer((req, res) => {
  const upstream = http.request({
    host: "127.0.0.1", port: 18148, path: req.url, method: req.method,
    headers: { ...req.headers, host: "localhost:18148" }
  }, response => {
    res.writeHead(response.statusCode, response.headers);
    response.pipe(res);
  });
  upstream.on("error", () => { res.statusCode = 502; res.end(); });
  req.pipe(upstream);
}).listen(80, "127.0.0.1");
' >"$TMPDIR/proxy.log" 2>&1 &
proxy_pid=$!

ready=0
for _ in $(seq 1 60); do
  if curl --noproxy '*' -fsS http://127.0.0.1:18148/procedimentos >/dev/null 2>&1 &&
     curl --noproxy '*' -fsS http://127.0.0.1:80/procedimentos >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then
  printf 'Teste não iniciado: interface temporária indisponível.\n' >&2
  tail -40 "$log" >&2
  tail -20 "$TMPDIR/proxy.log" >&2
  exit 1
fi
printf 'Interface temporária disponível somente na rede isolada.\n'

NODE_ENV=test SESSION_SECRET=segredo-exclusivamente-sintetico-para-testes \
  setpriv --bounding-set=-all --inh-caps=-all --ambient-caps=-all \
  pnpm --filter @workspace/api-server exec vitest run \
  src/tests/procedimentos-isolado.test.ts \
  src/tests/procedimentos-equipes-isolado.test.ts \
  --maxWorkers=1 --no-file-parallelism
ISOLATED
