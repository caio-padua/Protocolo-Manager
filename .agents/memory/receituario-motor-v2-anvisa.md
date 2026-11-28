---
name: Receituário e assinatura de documentos clínicos
description: Identidade clínica, quadro de assinatura 3A-1C e paginação de receitas.
---

# Receituário e assinatura

Usar a identidade clínica autenticada e o certificado validado para o profissional e a clínica; nunca supor um médico, uma clínica ou um destinatário fixo.

**Why:** Uma instalação pode atender várias clínicas e profissionais, e inferir a identidade pode expor dados ou assinar pelo profissional errado.

**How to apply:** Obter a identidade e a autorização no servidor antes de gerar ou enviar qualquer documento.

O quadro de assinatura de prescrições e pedidos de exames segue o modelo 3A-1C definido em `specs/modelo-3a-1c-assinatura.md`.

**Why:** O usuário escolheu um padrão único para todos os modelos, com dados reais do certificado e sem indicar assinatura inexistente.

**How to apply:** Manter o QR do validador oficial separado de eventuais links de acesso à cópia e assinar digitalmente somente após concluir o documento.

Receitas longas do modelo com faixas devem ser paginadas em folhas reais, sem comprimir uma imagem longa em uma única folha.

**Why:** A compressão de uma captura longa reduz e deforma as fórmulas e o quadro de assinatura, prejudicando leitura e dimensões.

**How to apply:** Reservar o quadro e cada fórmula inteiros na impressão, verificar a paginação e assinar o arquivo final.
