# SPEC — Cópia da foto antiga para Drive (subpasta IMAGENS)

**Data:** 10/08/2026  
**Solicitante:** CEO (Dr. Caio)  
**Status:** ESPECIFICADO

---

## Objetivo

Ao atualizar a foto de perfil do cliente, a foto antiga deve ser copiada automaticamente para a subpasta IMAGENS da pasta do cliente no Google Drive.

---

## Contexto

A função `ensureClientFolderStructure(clientName, cpf)` já cria a subpasta IMAGENS por padrão (confirmado no código). A função retorna os IDs de cada subpasta.

---

## Requisitos

### REQ 1 — Buscar o folderId de IMAGENS
- Ao processar o backup da foto antiga, chamar `ensureClientFolderStructure(client.name, client.cpf)`.
- Extrair o `folderId` da subpasta "IMAGENS" do resultado.

### REQ 2 — Baixar o arquivo do Object Storage e subir para o Drive
- O `photo_url` antigo é uma path relativa (`/api/storage/objects/...`).
- Buscar o conteúdo via `getObject(key)` do Object Storage (lib interna).
- Subir para o Drive com `uploadFileToDrive(buffer, fileName, mimeType, folderId)`.
- Nome do arquivo no Drive: `foto-perfil-YYYY-MM-DD-HH-MM-SS.jpg` (BRT).

### REQ 3 — Tolerância a falha
- Falha no Drive (sem credencial, quota, rede) NÃO bloqueia o upload de foto.
- Logar aviso: `warn("Drive backup da foto falhou para cliente {id}: {erro}")`.

### REQ 4 — Sem duplicata na mesma data
- Não é necessário deduplicar: cada upload gera nome único por timestamp.
- Múltiplos uploads no mesmo dia geram múltiplos arquivos no Drive (comportamento correto).

### REQ 5 — Ordem de operações (garantia de consistência)
```
1. Ler photo_url atual do cliente
2. Se existir:
   a. Inserir em client_photo_history (banco)
   b. Tentar copiar para Drive/IMAGENS (falha-segura)
3. Salvar novo photo_url no banco (clients.photo_url)
4. Retornar resposta ao cliente
```
A etapa 3 só roda após as etapas 1-2 (foto antiga preservada antes de sobrescrever).

---

## Fora do escopo

- Cópia da foto nova para o Drive (só foto antiga vai para IMAGENS).
- Sincronização bidirecional Drive → banco.
- Notificação ao paciente sobre o backup.
