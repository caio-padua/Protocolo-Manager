---
name: Fotos em PDF clínico sem metadados
description: Regra de privacidade para imagens JPEG incorporadas em documentos entregues a pacientes.
---

JPEGs usados em documentos clínicos devem ter os segmentos EXIF/XMP (APP1), IPTC (APP13) e comentários removidos antes de serem incorporados ao PDF.

**Why:** bibliotecas de PDF podem preservar o fluxo JPEG original. Uma foto aparentemente normal carregava localização e identificação do aparelho para dentro do documento distribuído.

**How to apply:** sanitize o buffer em memória antes de `embedJpg`, preservando os pixels. Valide a ausência da assinatura EXIF real e de identificadores conhecidos; busca genérica por três letras em bytes comprimidos gera falsos positivos.