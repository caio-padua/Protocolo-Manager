---
name: Isolamento de rede em testes
description: Particularidades do isolamento de rede descartável neste ambiente.
---

Para testes sem acesso externo, um namespace de usuário e rede pode funcionar
mesmo quando `unshare -n` isoladamente é negado. A disponibilidade depende do
ambiente e precisa ser verificada a cada execução.

**Why:** Neste ambiente, `unshare -Unc --keep-caps` permitiu configurar o
loopback mantendo a identidade não privilegiada necessária ao PostgreSQL.
A rede nova incluiu uma interface `sit0` inativa; sua simples presença não
significa acesso externo.

**How to apply:** Confirmar que não há interfaces externas ativas nem rota
externa; limitar e remover capacidades antes de iniciar os programas de teste.
Isolamento de rede não isola arquivos nem sockets Unix: limpar o ambiente,
evitar credenciais reais e usar banco descartável continuam necessários.
