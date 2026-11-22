---
name: Redes sociais (cliente e profissional)
description: submenu Redes sociais com tabela própria; Instagram do cliente segue na coluna
---
Instagram do CLIENTE continua em clients.instagram; as demais redes ficam na tabela redes_sociais (catálogo fechado no servidor). Aba própria com botão de salvar próprio.
**Why:** painel de encaminhamento e crachá leem clients.instagram; o salvar geral do cliente não pode reenviar Instagram e sobrescrever.
**How to apply:** nova rede = só adicionar ao catálogo em lib/redes-sociais.ts; celular oficial da empresa é somente leitura.
