# Especificação — Capa compartilhada da Carta de Tratamento Premium

Data: 12/09/2026

## Objetivo

Aplicar à Carta de Tratamento Premium a mesma capa Gamma do protocolo, com foto do Dr. Caio, título grande e identificação compacta.

## Requisitos exatos

1. A primeira página da carta deve ser criada por `drawPremiumCover`.
2. A capa deve carregar `dr-caio-photo.jpg` e exibi-la na coluna direita quando o arquivo estiver disponível.
3. O título principal deve ser `CARTA DE TRATAMENTO MÉDICO`, em 20 pontos, marfim, na coluna esquerda.
4. Paciente e médico devem permanecer no bloco compacto da coluna esquerda.
5. As páginas internas, o conteúdo clínico e a assinatura PAdES não devem mudar.
6. A capa do protocolo deve manter o título dinâmico atual quando não houver sobrescrita.
7. Metadados privados da foto (EXIF, XMP, IPTC e comentários) não devem ser incorporados ao PDF.

## Casos extremos

- Foto ausente: `drawPremiumCover` deve manter o fallback já existente de uma coluna.
- Nome ou título longo: deve continuar usando a quebra e os limites já definidos na capa compartilhada.
- Certificado ausente: deve permanecer o fallback explícito já existente de PDF sem assinatura.
- Foto com localização ou modelo do aparelho: os pixels devem aparecer, mas os metadados não.

## Definição de pronto

1. Os testes existentes de PDF premium passam.
2. Um teste confirma que a carta chama a capa compartilhada com título médico e foto.
3. Uma prévia real é convertida em imagens sem erro e entregue para aprovação visual.
4. A revisão do architect não aponta pendências.
5. O PDF final não contém marcadores EXIF, GPS ou identificação do aparelho.

## Linhas vermelhas

- Não alterar dados clínicos, motor financeiro, sessões ou rotas.
- Não duplicar a geometria da capa compartilhada.
- Não remover nem reimplementar a assinatura PAdES.