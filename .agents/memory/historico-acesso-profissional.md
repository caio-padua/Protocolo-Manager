---
name: Historico de alteracoes de acesso
description: Regra de privacidade para o historico da conta profissional.
---

O titular ve seu proprio historico; o CEO autenticado pode ver historicos de qualquer clinica somente quando a permissao global for confirmada no servidor. O historico distingue ator de titular, mostra valores anteriores e novos completos de campos permitidos, inclusive e-mail e CPF, e nunca inclui senha, hash, token, codigo de recuperacao ou identidade Google.

E-mail principal e a fonte unica para entrada/recuperacao e precisa coincidir com o e-mail Google verificado para vincular a conta; e-mail secundario e apenas contato. Login Google nao concede acesso ao Drive. Eventos antigos com valores mascarados nao podem ser reconstruidos. A interface e a API nao oferecem exclusao dos eventos.

**Why:** Em 01/11/2026, o CEO autorizou visao global do historico para governanca multiclínica, mantendo os segredos fora da trilha e distinguindo quem alterou do cadastro alterado.

**How to apply:** Aplicar em telas de conta e corpo clínico; autorizar leitura global só por identidade de proprietário verificada no servidor, registrar ator/titular/empresa, manter lista permitida de campos e nunca confiar em IDs ou permissões enviados pelo navegador.
