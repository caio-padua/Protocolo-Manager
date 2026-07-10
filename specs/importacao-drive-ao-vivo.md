# Spec — Importação do Drive AO VIVO (acompanhar juntos, minuto a minuto)

Decisão do CEO (Dr. Caio), 10/07/2026: acompanhar a importação em massa em tempo real,
vendo o passo a passo e a LISTA do que já foi importado, minuto a minuto.

## Problema
- O motor de importação já existe e roda dentro do processo do servidor.
- Hoje o `status` só devolve CONTADORES agregados (sem a lista do que acabou de entrar).
- Não existe tela no padcom para acompanhar; só dá para consultar por `curl`.
- Ao reiniciar o servidor a varredura morre e o estado em memória zera (dados no banco ficam).

## Alvo (o que entregar)
1. Backend: adicionar um FEED dos últimos exames lançados ao estado da importação.
   - Campos por item: `clientName`, `fileName`, `kind` ("lab" | "imagem"), `at` (ISO).
   - Lista limitada (últimos ~80), mais recente no topo. Exposta em `GET /api/importar-drive/status`.
2. Frontend (padcom): tela nova `/importar-drive` (protegida por colaborador) que:
   - Faz polling do `status` a cada 3 segundos (tempo real).
   - Mostra: barra de progresso (pastas X/Y), pasta atual, e CARTÕES de contadores
     (lançados, laboratoriais, imagem, já existentes, erros, sem cliente).
   - Mostra o FEED ao vivo (lista rolável) do que já foi importado: cliente, arquivo, tipo, hora.
   - Botões: "Iniciar / Re-disparar importação" (POST run scope=all) e "Baixar relatório (Excel)".
   - Estado honesto: se `status=idle` avisa que está parada e oferece o botão de disparo.
3. Menu lateral: link para a tela nova no grupo Consultório/Clínica, ao lado de "Exames do Cliente".

## Fora de escopo (não construir agora)
- Tornar a varredura à prova de reinício (persistir progresso e auto-retomar). Fica como
  opção futura; hoje o re-disparo manual pela tela resolve, com deduplicação preservando tudo.

## Regras de marca / formato
- Sistema de design Paxter (navy/ouro, relevo 3D onde couber); densidade B na comunicação ao CEO.
- Termo "cliente" (nunca "paciente").

## Prova de pronto
- Abrir `/importar-drive`, ver contadores subindo e o feed listando exames em tempo real.
- Re-disparar pela tela e ver a deduplicação pular o que já existe.
- Architect PASS.
