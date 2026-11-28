# Dependências de publicação da vitrine PAXMED (28/11/2026)

Registro de leitura e testes isolados. Nada foi publicado, reiniciado, copiado ou enviado. Sem valores de segredos.

## 1. O que foi provado (ambiente isolado, dados sintéticos)

Teste: `artifacts/api-server/src/tests/vitrine-publica-perimetro.test.ts` (4 de 4). Build e typecheck com código 0.

| Item | Resultado |
|---|---|
| `paxmed.com.br/` e `www.paxmed.com.br/` | Abrem a vitrine dourada, não o Dashboard |
| Recursos JS, CSS e imagens | 200, nenhuma falha |
| Desafio Basic Auth | Ausente (sem `WWW-Authenticate`, sem 401) |
| Botão Médico/Clínica | Leva a `/login` (Manager) |
| Rotas protegidas sem credencial | 401 ou 403 |

## 2. Dependências

| Dependência | Fato | Ação do Dr. Caio |
|---|---|---|
| `APP_ENCRYPTION_KEY` ausente | Obrigatória em produção. Chave diferente da usada na gravação deixa o cofre ilegível; não há migração de chave; o app usa a variável de ambiente equivalente quando existe. | Informar qual chave gravou o cofre. Não criar nem trocar sem conferir. |
| `PUBLIC_API_BASE_URL` ausente | Afeta só a Evolution (WhatsApp). | Cadastrar se o WhatsApp for usado. |
| Boot altera permissões | `ensurePapeisIniciais` insere papéis por clínica (`origem='boot_categoria'`). | Conferir em cópia sintética. |
| Boot semeia dados | Dieta (antes do listen), conteúdo do site e mensageria PAXMED. | Ciente. |
| Cliente de teste | `runSeedDemoRogerio` NÃO roda mais com `NODE_ENV=production` (ajuste de 28/11/2026). | Nenhuma. |
| Colunas faltantes em produção | `device_contact_verifications.code_sent_at`, `substances.revisao_dose`, `procedimentos_clinicos.versao_edicao` (leitura de 27/11/2026). | Conferir antes de publicar. |
| Worker separado | Lembretes, farmácia, receituário, conciliação Asaas, Drive, bolões, monitor de LLMs, guarda do Telegram, certificado, confirmação por visita e fila de PDFs de exame vivem no `api-worker`. Sem ele, não rodam. | Implantar como serviço à parte. |
| Perímetro | Produção exige `ADMIN_*` ou `RAILWAY_ADMIN_*`, senão a API não sobe. | Nenhuma. |

## 3. Não verificado

Roteamento real do domínio e da API, DNS, HTTPS, Clerk em produção, cofre e banco de produção, suíte completa do api-server, subida em banco vazio com `NODE_ENV=production`, execução do worker em Node 24.
