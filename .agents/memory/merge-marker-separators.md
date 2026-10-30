---
name: Separadores e verificação de conflitos
description: A conclusão automática de uma integração pode confundir comentários decorativos com marcadores de conflito.
---

Usar hífens, não sequências de sete ou mais sinais de igualdade, nos separadores de comentários de arquivos que precisarem de resolução de conflito.

**Why:** a verificação automática da plataforma já rejeitou um arquivo corretamente conciliado porque encontrou sinais de igualdade dentro de comentários, mesmo sem marcadores reais de conflito.

**How to apply:** se a continuação disser que ainda há conflitos e a busca mostrar somente separadores comentados, preservar todos os comandos e trocar apenas os separadores decorativos por hífens antes de continuar.
