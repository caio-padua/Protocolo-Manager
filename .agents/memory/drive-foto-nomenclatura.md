---
name: Drive — nomenclatura canônica de fotos de perfil
description: Regra oficial de nomes de arquivo para fotos de perfil no Google Drive (PADAXOR). Qualquer agente que tocar upload de foto deve obedecer este contrato.
---

# Drive — Nomenclatura Canônica de Fotos de Perfil

## A Regra
`AA.MM.DD FOTO PERFIL NOME PACIENTE.ext`

| Parte | Significado | Exemplo |
|---|---|---|
| `AA` | Ano em 2 dígitos (BRT) | `26` |
| `MM` | Mês em 2 dígitos | `08` |
| `DD` | Dia em 2 dígitos | `10` |
| `FOTO PERFIL` | Label fixo — nunca mudar | `FOTO PERFIL` |
| `NOME PACIENTE` | Nome completo, sem acento, maiúsculo | `CAIO HENRIQUE FERNANDES PADUA` |
| `.ext` | Extensão original do arquivo | `.jpg`, `.png` |

Exemplo completo: `26.08.10 FOTO PERFIL CAIO HENRIQUE FERNANDES PADUA.jpg`

## Pasta destino
- SEMPRE: `FOTO PERFIL` (subpasta da pasta do cliente no Drive)
- NUNCA: `IMAGENS` (para fotos de perfil — `IMAGENS` serve para outras imagens clínicas)

## Por que o ano vem primeiro (`AA.MM.DD` e não `DD.MM.AA`)
O Drive ordena arquivos por nome. Com ano primeiro, a ordenação alfabética = cronológica.
A foto com a data mais recente (maior string) = foto de perfil ATIVA no momento.

**Why:** Aprovado pelo CEO em 10/08/2026. Sem código extra de controle de versão — a data no nome é a fonte de verdade.

## allowDuplicates
Usar `allowDuplicates=true` ao subir para Drive/FOTO PERFIL.
Se dois uploads ocorrem no mesmo dia, o Drive mantém ambos com o mesmo nome (comportamento nativo do Drive). Ambos ficam visíveis; o mais recente por timestamp interno = ativo.

## Onde está implementado
- `artifacts/api-server/src/routes/client-photo.ts`
  - `buildPhotoFileName(clientName, ext)` — gera o nome com a convenção
  - `backupFotoAnterior(...)` — usa `buildPhotoFileName` ao salvar a foto antiga em FOTO PERFIL
  - `afterPhotoSaved(...)` — usa `buildPhotoFileName` ao subir a foto nova em FOTO PERFIL

## Quem cobre
- Upload público do cliente (`/upload`) — via `afterPhotoSaved`
- Upload admin da equipe (`/admin-upload/:id`) — via `backupFotoAnterior` + `afterPhotoSaved`

## Regra sobre assertSquare
- `assertSquare` (validação 1:1 ±5px) aplica-se APENAS ao `/upload` público (cliente crop no celular)
- Admin-upload NÃO valida proporção — equipe pode subir fotos retrato, paisagem, qualquer formato

## How to apply
Toda rota ou script que salvar uma foto de perfil no Drive DEVE:
1. Chamar `buildPhotoFileName(clientName, ext)` para gerar o nome
2. Salvar na pasta `FOTO PERFIL` do cliente (via `ensureClientFolderStructure`)
3. Usar `allowDuplicates=true`
4. Nunca usar `IMAGENS` para fotos de perfil
