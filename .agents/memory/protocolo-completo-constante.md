---
name: Protocolo completo constante (substâncias em toda visita)
description: Como as substâncias do protocolo que não caem numa visita aparecem como constantes no Google e na tela, e as armadilhas encontradas.
---

Toda visita lista TODAS as substâncias do protocolo. As sem linha na visita são "constantes": calculadas na LEITURA por uma função pura única (nunca gravadas, vale para visitas antigas), no Google com o quadrado branco e [INDI] já existentes na legenda (sem símbolo novo), na tela com "Não nesta visita". Linha "NESTA VISITA: X de Y": X = substâncias com linha disponível; Y = união dos itens do protocolo com as linhas da visita (X nunca passa de Y).

**Why:** o CEO quer que a enfermagem responda ao cliente olhando a tela quais são as substâncias do protocolo; antes, substância já concluída sumia das visitas seguintes (um teste antigo cobrava isso e foi trocado por decisão dele).

**How to apply:**
- O evento do Google é montado em TRÊS caminhos (envio por protocolo, atualização ao aplicar, rotas legadas sync-session e sync-week do botão Sincronizar). Mudou a composição do evento, mexa nos três pela mesma função exportada; a revisão independente deixou escapar as rotas legadas, quem achou foi a leitura do código.
- Itens só carregam se protocolo e visita são da MESMA empresa (referência inconsistente = vazio + aviso). Dados de desenvolvimento têm sessões com empresa nula (protocolos 26-29 e 67): já ficam fora de todas as listas.
- Os itens entram na conferência pós-reserva; testes de banco isolado precisam criar a tabela protocol_items.
- Suíte pesada: rodar com --maxWorkers=2; 10 arquivos em paralelo estouram o limite de 5 s por carga da máquina sem haver defeito.
