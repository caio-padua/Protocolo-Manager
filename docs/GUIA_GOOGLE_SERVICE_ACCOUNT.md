# Guia: Service Account Google para o PADAXOR (Railway)

## O que é e por que precisamos

O PADAXOR usa o Google Workspace para: Agenda, Gmail e Drive.
Em ambiente de desenvolvimento, usa OAuth Connectors do Replit.
Em produção (Railway), usa uma Service Account com Domain-Wide Delegation
(Delegação de Domínio), que permite ao servidor agir em nome do Dr. Caio
sem abrir janela de login.

---

## Passo 1 — Criar a Service Account no Google Cloud

1. Acesse console.cloud.google.com e selecione (ou crie) o projeto do PADAXOR.
2. Menu lateral: IAM e administrador → Contas de serviço.
3. Clique em "Criar conta de serviço".
4. Nome sugerido: `padaxor-railway`.
5. Clique em "Concluído" (não precisa atribuir papel de IAM aqui).
6. Na lista, clique na conta recém-criada.
7. Aba "Chaves" → Adicionar chave → Criar nova chave → JSON.
8. Salve o arquivo `.json` em local seguro (nunca commitar no Git).

---

## Passo 2 — Ativar APIs necessárias

No painel do projeto Google Cloud, ative as APIs abaixo:
- Google Calendar API
- Gmail API
- Google Drive API

(Menu: APIs e serviços → Biblioteca → pesquisar cada uma → Ativar)

---

## Passo 3 — Configurar Domain-Wide Delegation

1. Abra o arquivo JSON da Service Account e copie o campo `client_id`.
2. Acesse admin.google.com (como Admin do Workspace).
3. Menu: Segurança → Controles de API → Gerenciar delegação em todo o domínio.
4. Clique em "Adicionar novo".
5. ID do cliente: cole o `client_id` copiado.
6. Escopos OAuth (cole tudo em uma linha):

```
https://www.googleapis.com/auth/calendar,
https://www.googleapis.com/auth/gmail.send,
https://www.googleapis.com/auth/drive
```

7. Clique em Autorizar.

---

## Passo 4 — Configurar variável no Railway

1. Abra o terminal e converta o JSON para base64:

```bash
cat chave-padaxor.json | base64 -w 0
```

2. Copie a saída (uma linha longa sem quebras).
3. No Railway, serviço `api-server` → Variables:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` = (colar o base64)
   - `GOOGLE_DELEGATED_EMAIL` = e-mail do Dr. Caio no Workspace (ex: drcaio@clinicapadua.com.br)

---

## Passo 5 — Verificar

Após deploy, chamar:

```
GET https://seu-api.railway.app/api/google/status
```

Resposta esperada:

```json
{ "calendar": true, "gmail": true, "drive": true }
```

---

## Notas importantes

| Item | Detalhe |
|---|---|
| Renovação de chave | A chave JSON não expira automaticamente; revogar manualmente se vazar |
| Ambiente dev | Usa Replit Connectors OAuth (sem Service Account); variável não definida = modo Connector |
| Backup da chave | Guardar cópia criptografada no Cofre do CEO (fora do Git) |
| Escopo mínimo | Adicionar apenas os escopos que o sistema usa (Calendar + Gmail + Drive) |

---

## Referência cruzada

- Código: `artifacts/api-server/src/lib/googleAuth.ts`
- Variáveis: `.env.railway.example` (seção Google)
- Skill relevante: `.agents/skills/skill-layout-paxter/SKILL.md`
