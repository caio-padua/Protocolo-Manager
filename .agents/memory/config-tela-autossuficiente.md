---
name: Tela autossuficiente para credenciais (campo na própria tela)
description: Toda ferramenta que depende de chave/token/segredo/upload entrega o campo na sua tela; rota que devolve metadado de segredo também exige login.
---

# Tela autossuficiente — toda chave tem campo na própria tela

Regra (Art. 65 do Código Paxter, onda Fechar Lacunas de Configuração, 28/06/2026). Nenhuma
integração pode nascer como menu só-leitura tipo "configure no servidor". Referência mental: ZapSign
mostra o campo do token na própria tela.

**Why:** o CEO não administra variáveis de ambiente no servidor; trocar uma chave tem que ser ato de
tela. E um menu de leitura "inofensivo" que mostra cauda mascarada + origem do segredo SEM login é
inconsistente com as rotas que gravam (que pedem login) — vaza informação de segredo de graça.

**How to apply:**
- Segredo entra por `<input type="password">`. O GET nunca devolve o valor em claro — só metadado:
  `isSet` + cauda mascarada + `source` (`env` | cofre).
- O PUT envia SÓ os campos preenchidos. Campo vazio = "não mexer", nunca apaga o que já existe.
- Valor persiste no cofre cifrado (`secure-settings`/`getSecret`) preservando o fallback de variável
  de ambiente (a chave continua funcionando se vier do env).
- LIÇÃO DE SEGURANÇA (o achado que reprovou no architect): a rota GET que devolve metadado de segredo
  (máscara/`source`) também é segredo — protege com `requireCollaborator`, igual à rota que grava.
  Comparar consistência com as irmãs (`/settings/stripe`, `/settings/telegram`) — todas pedem login.
- Ao proteger o GET, a tela precisa mandar `Authorization: Bearer <collab token>` em TODA leitura
  (load + useEffect inicial), não só na escrita, senão a tela quebra com 401.
- Status público (só booleanos, sem máscara/origem) pode continuar sem login — o que exige login é o
  metadado de segredo, não o "ligado/desligado".
