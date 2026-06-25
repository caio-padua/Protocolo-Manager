---
name: Laudos de imagem — padrões e armadilhas (estudo de amostra real)
description: Lições de estudar laudos de imagem reais do Drive para montar painéis de campos fixos.
---

# Laudos de imagem (USG, RMN) — o que o estudo da amostra revelou

Contexto: trilha de imagem da "Trajetória do Exame Uploadado". Painéis de campos fixos por tipo de exame
vivem na spec `specs/trajetoria-exame-upload.md`. Lições dur019áveis abaixo.

## Estrutura inesperada (muda o desenho)
- **Laudo CONJUGADO**: um único PDF pode conter VÁRIOS exames (ex.: tireoide + mamas + transvaginal no
  mesmo arquivo). Logo, UM upload pode gerar VÁRIOS painéis. O motor tem de separar por título de exame
  dentro do arquivo, não assumir "1 arquivo = 1 exame".
- **Nome do arquivo mente E cruza tipo**: um arquivo chamado "TIREOIDE" era, no conteúdo, exame de
  SANGUE (T3/T4 livre), não ultrassom. Classificar SEMPRE pelo conteúdo; a palavra "tireoide" pode cair
  no setor Sangue OU no setor Ultrassom. Nunca rotear por nome de arquivo.
- **Imagem também tem "almoço grátis"**: laudos trazem comparação com exame anterior ("em relação ao
  exame de 29/02/2024"). O antes/depois qualitativo (tinha nódulo / não tem) também deve ser colhido.

## Como os laudos de imagem são (modelagem)
- Texto LIVRE descritivo, formato varia muito por laboratório (Lavoisier, Image Memorial, RedeDor...).
  Não há tabela; a IA extrai para campos fixos guiada por APELIDOS por campo (ex.: "lobo direito"="LD").
- RMN de coluna é POR NÍVEL (L4-L5, L5-S1...). Anomalias transicionais (sacralização de L5) quebram a
  contagem ingênua de níveis — o campo de nível precisa ser flexível, não lista fixa rígida.
- USG de tireoide é o mais padronizado: dimensões, contornos, ecotextura, nódulo+TI-RADS+Chammas,
  medidas dos lobos D/E, istmo, volume (+faixa normal embutida), linfonodos, Doppler (velocidade pico).

## Método de construção (não boiar)
- Definir o painel estudando uma AMOSTRA por tipo (5-10), não abrindo milhares de arquivos. A amostra
  revela o padrão -> monta painel + aliases -> CEO valida -> só então processa em massa (mesmo motor da
  trilha de sangue, mudando só o "molde").
