# Homologação de assinatura de receitas

## Limites e evidência

Homologação usa exclusivamente pessoas sintéticas, PFX gerado em memória e serviços
externos isolados. O teste HTTP percorre autenticação real, resolução do cadastro
sintético, motor ANVISA, PAdES e retorno de bytes. OpenSSL verifica CMS e ByteRange,
titular/serial e cobertura do documento inteiro; adulteração é rejeitada. Testes
também cobrem gerador PNG e o wrapper de assinatura dos bytes regulatórios.

Certificado autoassinado de teste comprova integridade criptográfica, não confiança
da cadeia ICP-Brasil. Consulta de revogação e validação externa da cadeia não estão
implementadas pelo assinador; não se deve confundir estas garantias.

## Auditoria dos caminhos

| Caminho | Resultado |
|---|---|
| `/receituario/assinar-imagem-pdf` | Reaberto com contrato `clientId + formulas`, não PNG. Renderização server-side; médico autenticado + CRM/UF + paciente ativo + clínica + vínculo explícito; sem e-mail/Drive implícito. |
| `/receituario/emitir-prescricao`, `/emitir-cliente` | Mesmo contexto e certificado por médico no motor comum; paciente impresso deriva do cadastro autorizado. |
| `/prescriptions/emit` | Certificado validado antes de persistir/consumir numeração/enviar; PDF regulatório M3 e cópia visual assinados pelo médico autenticado. |
| `/prescriptions/:id/reenviar-email` | Fluxo de entrega separado exige confirmação de canal/destinatário. Na regeneração do PDF do paciente, prescritor original, vínculo atual e certificado são revalidados; contexto clínico validado acompanha o motor, sem cópia fixa. |
| Demos e teste de e-mail | Assinatura clínica bloqueada com 422; não usar certificado clínico para homologação. `/recipes/demo` continua sendo amostra não assinada, sem envio. |
| `/receituario/preview-html` | Exige colaborador e contexto do paciente, sem selecionar médico principal ou paciente padrão. |
| Agendas/slots/alertas/processar | Autenticação exigida. Nenhuma agenda antiga pode assinar/liberar/enviar por falta de proveniência autenticada do prescritor; worker falha antes de qualquer alteração/entrega. |
| `generateReceituarioPdf` (M1 legado) | Exige assinador validado; não retorna PDF não assinado por ausência de certificado. |
| `generateReceituarioPdfV2` e `generatePdfFromPngBase64` | Exigem assinador validado, metadados do certificado correto e vínculo dentro do conteúdo assinado. |
| `pdf-signer` | Auditado: carrega certificado global para RAS/protocolo. Não autoriza assinatura de receitas e não é usado pelos caminhos de receitas homologados. Mantido para esses outros documentos, fora deste escopo. |
| Consulta pública | Usa snapshot de certificado na emissão; documentos legados sem snapshot retornam metadados nulos, nunca o certificado global atual. |

## Configuração

Upload e status em Certificados são por médico autenticado. CPF declarado no
formulário não é prova de titularidade: vale o CPF do certificado comparado ao
cadastro. Arquivo privado e senha cifrada têm chave por profissional; não há cache
global compartilhado para os novos certificados. O certificado global legado só
pode ser usado pelo titular com CPF correspondente. Falha de leitura de certificado
individual não autoriza fallback global.

Verificações locais: abertura do PFX/senha, presença da chave privada correspondente,
RSA mínimo 2048 bits, certificado não-CA, uso de assinatura quando declarado,
CPF e vigência. Nenhuma destas verificações substitui validação de cadeia/revogação.

## Compatibilidade e segurança

Chamadores antigos que enviam PNG, nome, destinatário ou filename livres recebem
400. A tela atual envia autenticação e fórmulas e abre o PDF retornado em nova aba.
Os agendamentos históricos são preservados, mas ficam bloqueados até existir uma
autorização persistente do médico; não se presume que o médico principal os assinou.

Comandos de homologação:

```sh
pnpm run typecheck:libs
pnpm --filter @workspace/api-server exec vitest run \
  src/tests/prescription-signing.test.ts \
  src/tests/clinical-legacy-routes.test.ts \
  src/tests/clinical-prescription-routes.test.ts \
  src/tests/prescriptions-reenvio.test.ts \
  src/tests/clinical-delivery-routes.test.ts \
  src/tests/clinical-emitter.test.ts
pnpm --filter @workspace/api-server run build
```
