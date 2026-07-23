# Skill: Drive Watcher — Vigilância de Pasta Drive

## O que é
Motor automático que vigia duas pastas Google Drive compartilhadas (exames de sangue e exames de imagem), detecta arquivos novos, extrai o nome do paciente, cria o cadastro se necessário, renomeia o arquivo com nomenclatura PAXTER e registra o exame no prontuário.

## Pastas vigiadas (hardcoded em `lib/drive-watcher.ts`)
| Tipo | ID da Pasta |
|---|---|
| Exames de Sangue | `1Nytg2IccYs5Bw6p1U8tF1X9K-MgTzRdW` |
| Exames de Imagem | `1Z2Z-NVbC8txbdNgn4R-AaTNS7Vhnf89F` |

## Fluxo de processamento
Download do arquivo → detectar nome no filename → se UUID/sem nome: ler PDF → múltiplos padrões (Lavoisier, Fleury, Hermes Pardini, genérico) → match com cliente existente → criar automaticamente se não encontrar → renomear (PAXTER) → extrair analitos (sangue) → subir pasta Drive do paciente → marcar processado

## Nomenclatura PAXTER de arquivo
`YY.MM.DD EXAME SANGUE NOME DO PACIENTE.pdf`
`YY.MM.DD EXAME IMAGEM NOME DO PACIENTE.pdf`

## Tabela de controle
`drive_watcher_files` — file_id PK, folder_type, original_name, renamed_to, client_id, client_name_raw, status, error_msg, processed_at

### Status possíveis
| Status | Significado |
|---|---|
| `pendente` | Arquivo detectado, aguardando processamento |
| `processado` | Fluxo completo com sucesso |
| `pendente_revisao` | Nome do paciente não identificado — atribuição manual necessária |
| `erro` | Falha técnica durante processamento |

## Execução automática (cron)
- Primeira execução: 2 minutos após boot do servidor
- Recorrência: a cada 4 horas
- Máximo por rodada: 50 arquivos
- Código: `app.ts` → `setInterval(runDriveWatcher, 4h)`

## Rotas da API
| Método | Rota | Função |
|---|---|---|
| GET | `/api/drive-watcher/status` | Estado do worker + stats |
| POST | `/api/drive-watcher/scan` | Lista arquivos novos (sem processar) |
| POST | `/api/drive-watcher/process` | Processa arquivos novos (body: `{maxFiles}`) |
| GET | `/api/drive-watcher/inspect-pdf/:fileId` | Extrai texto de um PDF do Drive (diagnóstico) |

## Extração de nome — padrões suportados
1. Lavoisier/DASA: `NOME\nGênero:` 
2. Linha antes de CPF: `NOME\nCPF:`
3. Fleury: `Nome do Paciente: NOME`
4. Genérico: `Paciente: NOME` ou `Nome: NOME`

## Regras de manutenção
- NUNCA remover o arquivo da pasta Drive compartilhada (apenas copia)
- Idempotente: `file_id` é chave primária — mesmo arquivo não é processado duas vezes
- Para reprocessar: DELETE da linha em `drive_watcher_files`
- Upload ao Drive do paciente: best-effort (falha não impede o processamento)
- Extração de analitos: best-effort (falha não impede o processamento)

## Tela admin
`/arsenal/drive-watcher` — Vigilância de Pasta Drive (menu Arsenal Clínico)

## Arquivos relevantes
- `artifacts/api-server/src/lib/drive-watcher.ts` — worker principal
- `artifacts/api-server/src/routes/drive-watcher.ts` — rotas
- `artifacts/padcom/src/pages/arsenal/drive-watcher.tsx` — tela admin
