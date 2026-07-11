---
name: Emissão de documento clínico substitui variáveis no servidor
description: Por que a substituição de {{variáveis}} e a persistência do corpo final têm de acontecer na rota de emissão, não só no frontend.
---

# Emissão de documento: variável e corpo final moram no servidor

Regra: numa rota que emite documento a partir de um modelo com marcadores `{{chave}}`
(atestado, encaminhamento, receituário), a substituição das variáveis e a gravação
do corpo final devem acontecer **no servidor, dentro do `/emitir`**, mesmo que a tela
já resolva os marcadores antes de salvar.

**Why:** se a substituição vive só no frontend, qualquer chamada da API fora daquela
tela (outra tela, script, integração futura) grava/gera PDF com `{{...}}` cru. O
architect reprova isso como requisito funcional não atendido. A operação é
idempotente: corpo já resolvido não tem placeholders, então reaplicar é no-op seguro.

**How to apply:** ter um helper de substituição espelhado no servidor
(`artifacts/api-server/src/lib/doc-variaveis.ts`) e, no `/emitir`, montar os valores a
partir dos campos persistidos do próprio registro, aplicar no corpo, e gravar o
`corpo` final junto com `pdfData`/status. Manter os contratos de emissão idênticos
entre documentos irmãos (retornar `pdfData`; validar `clientId` inválido com 400 no
GET de lista) — divergência entre rotas gêmeas também é apontada na revisão.
