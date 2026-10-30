---
name: Cache do Vite após alinhar React
description: Um cache antigo do Vite pode continuar servindo versões incompatíveis de React e React DOM depois de as dependências do projeto já estarem alinhadas.
---

Quando o navegador ainda acusa versões diferentes de React e React DOM, mas a resolução de dependências do artefato aponta para a mesma versão, confira o cache de dependências do próprio artefato antes de alterar novamente o catálogo global do monorepo.

**Why:** o Vite manteve uma cópia otimizada de React DOM anterior à atualização, mesmo após reiniciar o serviço; remover somente o cache gerado do artefato fez o Vite reotimizar e a página voltou a carregar.

**How to apply:** valide as versões resolvidas, remova apenas `artifacts/<artefato>/node_modules/.vite`, reinicie o serviço do artefato e confirme pelo navegador que o erro desapareceu. Não altere versões globais sem evidência de incompatibilidade nos pacotes atuais.
