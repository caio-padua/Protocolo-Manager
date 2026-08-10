# Spec: Confirmar fluxo ponta-a-ponta da tela pública /foto

**Data:** 10/08/2026  
**Origem:** Task #83 (test_gaps) — Paxter Loop

---

## Objetivo

Provar, com execução real (não só análise de código), que o paciente consegue:
1. Receber um link de foto válido
2. Acessar a tela pública `/foto?token=...`
3. O servidor validar o token e retornar o nome do cliente
4. Enviar uma imagem e tê-la gravada no Object Storage com `photoUrl` atualizado no banco

---

## Requisitos exatos

1. `GET /api/client-photo/info?token=<token_valido>` retorna 200 com `{ name, photoUrl }`.
2. `GET /api/client-photo/info?token=<token_invalido>` retorna 401.
3. `GET /api/client-photo/info?token=<token_expirado>` retorna 401.
4. `POST /api/client-photo/upload` com token válido + imagem PNG aceita retorna 200 com `{ photoUrl }`.
5. `POST /api/client-photo/upload` com token válido + arquivo não-imagem retorna 400.
6. `POST /api/client-photo/upload` com token ausente/inválido retorna 401.
7. Após upload bem-sucedido, a coluna `photoUrl` do cliente está atualizada no banco.
8. A URL `photoUrl` devolvida é servível: `GET <photoUrl>` retorna 200 com `Content-Type: image/*`.
9. A tela `/foto` carrega sem erros de JavaScript no console.

---

## Casos extremos a tratar

- Token com escopo errado (`cadastro` em vez de `foto`) → 401.
- Imagem de 0 bytes → 400.
- Cliente inexistente no banco (token para id que foi apagado) → 404.

---

## Definição de PRONTO

- Todos os 9 requisitos verificados por `curl` real contra `localhost:8080`.
- Requisito 7 verificado por `SELECT photoUrl FROM clients WHERE id = ?` via psql ou curl.
- Requisito 9 verificado por screenshot da tela `/foto?token=<token_valido>`.
- Zero erros nos logs do api-server durante os testes.

---

## Linhas vermelhas

- NÃO apagar nem modificar dados de clientes reais. Usar cliente de teste (id já existente).
- NÃO alterar o motor de token (`portal-token.ts`) — só testar a camada de rota.
