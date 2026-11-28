---
name: Inicialização do preview e da API
description: Corrida de inicialização entre o frontend do preview e a API em serviços separados.
---

O preview web pode estar disponível antes de a API local terminar a inicialização; nesse intervalo, o proxy do frontend pode falhar ao conectar e a tela de login mostrar erro de rede.

**Why:** Os serviços do frontend e da API reiniciam de forma independente, então a disponibilidade visual do preview não garante que o servidor de autenticação já esteja aceitando conexões.

**How to apply:** Diagnosticar o endpoint público de saúde e os logs do proxy. Se a interface precisar de espera, repetir apenas a checagem de prontidão e enviar a tentativa de login uma única vez; não repetir operações com efeitos colaterais ou credenciais.
