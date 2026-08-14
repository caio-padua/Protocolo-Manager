---
name: Workspace travando — peso do repositório e servidores simultâneos
description: Diagnóstico recorrente de lentidão/travamento do ambiente Replit deste projeto (não é bug de código).
---

# Quando o CEO diz "está travando toda hora", medir antes de mexer no código

O travamento sentido no navegador (editor, painel Git, preview) quase nunca vem
de bug da aplicação. Neste projeto a causa é **peso de repositório + número de
servidores de desenvolvimento ligados ao mesmo tempo**.

**Como medir (ordem certa, sem tocar em nada):**

1. `free -m` e `df -h` — se sobra memória e disco, o gargalo não é o servidor.
2. `du -sh .git attached_assets node_modules artifacts` — achar o peso morto.
3. `git count-objects -vH` — `size-pack` grande = painel Git lento a cada clique.
4. `git ls-files attached_assets | wc -l` — anexos versionados são o suspeito nº 1:
   cada print/PDF que o CEO envia entra no histórico para sempre.
5. `ps aux --sort=-%mem | head` — contar quantos servidores estão de pé.

**Agravantes conhecidos deste repositório:**

- Anexos ficam versionados; o histórico só cresce e nunca encolhe sozinho.
- O api-server reconstrói um pacote único gigante + mapa de código a cada
  reinício, e roda com mapa de código ligado (memória alta por processo).
- Vários servidores Vite vigiam a árvore inteira de arquivos ao mesmo tempo.

**Why:** o CEO cobra causa verificada, não palpite; e a Regra de Ouro proíbe
apagar qualquer coisa para "aliviar" sem ordem escrita dele.

**How to apply:** apresentar os números medidos e as opções (parar servidor que
não está em uso, parar de versionar anexos daqui para frente, reescrever
histórico só com ordem expressa). Nunca apagar anexo nem histórico por conta
própria.
