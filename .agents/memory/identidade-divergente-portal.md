---
name: Identidade divergente na Área do Cliente
description: Regra de privacidade e apresentação para dados de identidade extraídos de uploads retidos.
---

# Regra

Na Área do Cliente, uma verificação de identidade não confirmada pode mostrar, somente para o documento enviado pelo próprio cliente, os dados de identidade lidos no arquivo e o estado comparado ao cadastro. A apresentação mantém o primeiro nome e os dois componentes finais do sobrenome por extenso, abrevia os nomes intermediários, preserva partículas, mostra no máximo os quatro primeiros dígitos do Cadastro de Pessoas Físicas e exibe a data completa no formato `DD/MM/AAAA`.

Os dados devem ser identificados como leitura automática não confirmada. O documento permanece retido, sem resultados clínicos na evolução e sem ação do cliente para aprovar, rejeitar ou apagar.

**Why:** a pessoa pode enviar por engano um documento de familiar; explicar a divergência ajuda a corrigir o upload sem liberar dados clínicos ou expor o Cadastro de Pessoas Físicas completo.

**How to apply:** exigir token do portal e correspondência de cliente e clínica; selecionar somente nome, Cadastro de Pessoas Físicas, nascimento e estados salvos; mascarar antes de responder; não serializar o objeto extraído completo nem motivos internos.
