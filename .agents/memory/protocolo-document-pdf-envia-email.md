---
name: Separação entre prévia e emissão clínica
description: Não confundir geração, validação clínica e entrega externa ao verificar documentos.
---

# Prévia não autoriza emissão nem entrega

Conferir aparência de um documento não autoriza comunicar o cliente, compartilhar
arquivos ou iniciar cadernos jurídicos.
Validar um protocolo clínico também não deve ser usado como simples ferramenta
para produzir uma amostra visual.

**Why:** houve envio repetido de mensagens ao conferir documentos porque geração
e entrega eram tratadas como a mesma operação.
O verbo de uma rota não garante ausência de efeitos externos, e descrições
históricas podem ficar desatualizadas quando a aplicação separa esses caminhos.

**How to apply:** antes de testar, ler o fluxo atual até o fim e distinguir
geração, persistência, validação e entrega.
Regressão usa dados sintéticos e integrações simuladas.
Operação real exige autorização específica e prova por canal; não presumir
que baixar um documento significa que ele foi enviado ao Drive.
