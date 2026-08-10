# SPEC — Histórico de fotos: banco de dados + botão no painel interno

**Data:** 10/08/2026  
**Solicitante:** CEO (Dr. Caio)  
**Status:** ESPECIFICADO

---

## Objetivo

Sempre que o cliente atualizar a foto de perfil, a foto anterior deve ser preservada em um histórico acessível pela equipe no painel interno (tela de edição do cliente).

---

## Requisitos de banco de dados

### REQ 1 — Tabela client_photo_history
Criar via raw SQL (ALTER TABLE / CREATE TABLE — fora do schema Drizzle):

```sql
CREATE TABLE IF NOT EXISTS client_photo_history (
  id          SERIAL PRIMARY KEY,
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  photo_url   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cph_client ON client_photo_history(client_id);
```

### REQ 2 — Seed da tabela no boot
- Adicionar criação da tabela no boot do servidor (sequência de seed/migration existente).
- Idempotente: usar `CREATE TABLE IF NOT EXISTS`.

---

## Requisitos de backend

### REQ 3 — Salvar foto antiga antes de sobrescrever
- Nas rotas `/upload` (token público) e `/admin-upload/:id`:
  1. Antes de gravar o novo `photo_url` no banco, ler o valor atual de `photo_url` do cliente.
  2. Se existir, inserir em `client_photo_history` (client_id, photo_url, created_at=now()).
  3. Copiar o arquivo do Object Storage para o Drive (ver spec `foto-drive-imagens.md`).
  4. Só então atualizar `clients.photo_url` com o novo valor.
- Falha no histórico/Drive NÃO deve bloquear o upload principal (try-catch silencioso com log de warn).

### REQ 4 — Rota GET /api/client-photo/history/:clientId
- Exige `requireCollaborator`.
- Retorna array `{ id, photoUrl, createdAt }` ordenado por `created_at DESC`.
- Máximo de 50 registros.

---

## Requisitos de frontend (painel interno — photo-card.tsx)

### REQ 5 — Botão de histórico sempre visível
- Adicionar botão "HISTÓRICO" abaixo dos três botões atuais.
- Classe: `btn-3d-soft`, ícone `History` (lucide-react).
- Sempre visível, independente de haver fotos antigas.

### REQ 6 — Badge de contagem quando há fotos antigas
- Ao montar o card, buscar `GET /api/client-photo/history/:clientId`.
- Se retornar ≥1 item: exibir badge dourado (classe `paxter-alert` ou badge bevel-3d-ok) com o número de fotos no canto superior direito do botão de histórico. Ex.: "3".
- Se retornar 0: botão sem badge, levemente opaco (opacity-50) com tooltip "Nenhuma foto anterior".

### REQ 7 — Galeria modal ao clicar
- Clicar no botão abre um modal sobre a tela.
- Modal: fundo navy semitransparente, título "FOTOS ANTERIORES", grade de miniaturas quadradas (80×80px cada), 4 por linha.
- Cada miniatura: data/hora abaixo no formato `DD/MM/AAAA HH:MM` (BRT).
- Clique na miniatura: abre imagem em tamanho maior (600px) em lightbox simples.
- Botão "FECHAR" (bevel-3d) no canto superior direito.

### REQ 8 — Estado local
- Contagem e lista carregadas uma vez ao montar o componente.
- Recarregar após envio bem-sucedido de nova foto (para o badge atualizar).

---

## Casos extremos

- clientId sem foto atual: saltar passo de histórico.
- Falha na leitura do histórico: botão aparece sem badge (sem travar a tela).
- Modal com 0 fotos: mensagem "Nenhuma foto anterior registrada." centralizada.
