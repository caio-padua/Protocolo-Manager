---
name: Object Storage — rota pública de servir exige prefixo
description: Por que o GET público de objetos deve restringir o prefixo, e o padrão de upload presigned em 2 passos.
---

# Servir objeto do Object Storage por rota pública exige prefixo explícito

**Regra:** uma rota HTTP pública (sem ACL) que serve arquivos do `PRIVATE_OBJECT_DIR`
deve aceitar SOMENTE caminhos sob um prefixo conhecido (ex.: `uploads/`). Qualquer
outro caminho retorna 404 antes de tocar o storage.

**Why:** o `PRIVATE_OBJECT_DIR` é um diretório único e compartilhado por todo o
sistema. Se amanhã algum fluxo gravar arquivo sensível ali, uma rota pública que
serve "qualquer objeto" vira vazamento. Restringir ao prefixo onde nascem os
uploads presigned mantém a porta pública limitada ao conteúdo institucional
(vídeo de apresentação), que é de fato público.

**How to apply:** ao expor `GET /storage/objects/*`, cheque
`wildcardPath.startsWith("uploads/")`; senão 404. Conteúdo que precisa de ACL
deve usar a rota com verificação de permissão, nunca a pública.

# Upload presigned em 2 passos (padrão da equipe interna)

1. Cliente pede `POST /storage/uploads/request-url` (gateado por colaborador),
   mandando só metadados (name, size, contentType). O servidor valida
   `contentType` no presign (ex.: `video/*`) e devolve `uploadURL` + `objectPath`.
2. Cliente faz `PUT` do arquivo DIRETO ao `uploadURL`. O servidor nunca recebe o
   binário.

**Atenção:** a validação de tipo/tamanho no passo 1 é declarativa — a URL assinada
não revalida o objeto final. Para escopo interno é aceitável; defesa em
profundidade (revalidar metadata real do objeto após o PUT) fica como melhoria.
