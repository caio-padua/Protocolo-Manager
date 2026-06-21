# Anamnese V2 — 07 · Kaizen de Ferramentas (renovacoes de front-end com data binding)

> Secao viva: o Dr. Replit Paxter PROPOE novas ferramentas de tela que facilitam o paciente
> responder e, ao serem manipuladas, entregam dado mais rico ao back-end. Cada ferramenta diz
> COMO ajuda o paciente e O QUE amarra no motor. CEO aprova item a item.

## 1. Matriz de Medicacao (aprovada na ideia pelo CEO — carta do Pactor)
- Linha = um remedio. Colunas: NOME · MG (miligramagem) · MANHA · TARDE · NOITE · DOENCA.
- Em cada periodo (manha/tarde/noite): QUANTIDADE de comprimidos (stepper, ex.: 2 de manha, 1 a noite).
- DOENCA: clica numa doenca ja citada na anamnese OU marca "doenca nova" (abre mini-campo).
- Data binding: grava `{ remedio, mg, manha, tarde, noite, doencaRef }`. Os "elevadores"
  (vertical entre remedios, horizontal buscando a doenca) sao o desenho que um FUTURO motor
  semantico vai percorrer para disparar lembrete (WhatsApp/e-mail): "tome simvastatina a noite".
- Decisao registrada: SIM, e interessante; manter nome+mg juntos no mesmo campo de identificacao,
  mas mg em coluna propria para o motor ler a dose (atende a duvida do CEO na carta).

## 2. Catalogo de ferramentas candidatas (Kaizen)
| Ferramenta | Ajuda o paciente a... | Entrega ao back-end |
|---|---|---|
| Dial de intensidade | sentir a direcao (mais a direita = pior) | numero 0-10 + rotulo de nivel |
| Barra segmentada de frequencia | dizer "quantas vezes por semana" sem digitar | inteiro normalizado |
| Cartoes Sim/Nao grandes | responder com 1 toque | booleano limpo |
| "Ligar os pontos" (sintoma->parte do corpo) | mapear queixa no corpo | par {sintoma, regiao} |
| Cronologia (quando comecou) | marcar inicio numa regua de tempo | data/intervalo |
| Contador de comprimidos | informar dose por periodo | inteiro por turno |
| Selo Diagnosticado/Suspeito | separar "tenho" de "acho que tenho" | tipo do finding |
| Mapa de grupos clicavel | navegar livre, ver o que falta | progresso por grupo |
| Termometro de humor/energia | autoavaliar leve e visual | escala validada |

## 3. Regras do Kaizen
- Toda ferramenta nova nasce no design Paxter (3D, Grade Imaginaria) e com aria/acessibilidade.
- Nenhuma ferramenta "interpreta clinica": ela so captura melhor; o motor julga.
- Ao implementar uma, REGISTRAR como padrao na skill-layout-paxter (Lei do Registro de Modelagem).
- A cada onda, o Paxter sugere 1-2 ferramentas novas ao CEO (melhoria continua), sem inflar a tela.

RESUMO EM 1 LINHA: a tela ganha ferramentas que facilitam o clique e, de quebra, entregam dado
mais rico ao motor — comecando pela matriz de medicacao (manha/tarde/noite x doenca) com seus "elevadores".
