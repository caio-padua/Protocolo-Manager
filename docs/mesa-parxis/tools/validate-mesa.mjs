#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REQUIRED_COMMON = [
  '00_BRIEFING-CEO.md',
  '01-fronteiras-manager-ihe-saas.md',
  '02-protocolo-mesa-arquitetural.md',
  '03-especificacao-parxis-saas-v1.md',
  '04-matriz-decisoes.md',
  'DECISION_LOG.md',
  'anexos/diagramas/01-arquitetura-alvo.svg',
  'anexos/diagramas/02-catalogos-clinicos.svg',
  'anexos/diagramas/03-roadmap-migracao.svg',
  'anexos/evidencias/tenant-schema-summary-manager.txt',
  'anexos/parxis-bridge-colaboracao.md',
  'templates/PARECER-R1-TEMPLATE.md',
  'templates/CONTRADITORIO-R2-TEMPLATE.md',
  'tools/validate-mesa.mjs',
  'manifest.sha256',
];

const FORBIDDEN_FILE_PATTERNS = [
  /(^|\/)\.env($|\.)/i,
  /\.(pfx|p12|pem|key|crt|cer)$/i,
  /(^|\/)(secret|secrets|credentials?)(\/|\.|$)/i,
];

function fail(message, details = []) {
  console.error(`ERRO: ${message}`);
  for (const detail of details) console.error(`- ${detail}`);
  process.exitCode = 1;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function assertInside(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const resolvedFile = path.resolve(root, relativePath);
  if (resolvedFile !== resolvedRoot && !resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`caminho fora do pacote: ${relativePath}`);
  }
  return resolvedFile;
}

function listFiles(root, current = root) {
  const result = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) result.push(...listFiles(root, absolute));
    else if (entry.isFile()) result.push(path.relative(root, absolute).split(path.sep).join('/'));
  }
  return result.sort();
}

function validatePayload(root) {
  root = path.resolve(root);
  const errors = [];
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    fail('diretorio do pacote inexistente', [root]);
    return false;
  }

  for (const required of REQUIRED_COMMON) {
    const absolute = assertInside(root, required);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      errors.push(`arquivo obrigatorio ausente: ${required}`);
    }
  }

  for (const relative of listFiles(root)) {
    if (FORBIDDEN_FILE_PATTERNS.some((pattern) => pattern.test(relative))) {
      errors.push(`arquivo potencialmente sensivel proibido: ${relative}`);
    }
  }

  const manifestPath = path.join(root, 'manifest.sha256');
  if (fs.existsSync(manifestPath)) {
    const lines = fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/).filter(Boolean);
    const seen = new Set();
    for (const [index, line] of lines.entries()) {
      const match = line.match(/^([a-f0-9]{64})\s+\*?(\.\/.+)$/i);
      if (!match) {
        errors.push(`manifest invalido na linha ${index + 1}`);
        continue;
      }
      const expected = match[1].toLowerCase();
      const relative = match[2].slice(2);
      if (relative === 'manifest.sha256') {
        errors.push('manifest nao pode assinar a si mesmo');
        continue;
      }
      if (seen.has(relative)) errors.push(`entrada duplicada no manifest: ${relative}`);
      seen.add(relative);
      let absolute;
      try {
        absolute = assertInside(root, relative);
      } catch (error) {
        errors.push(error.message);
        continue;
      }
      if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
        errors.push(`arquivo do manifest ausente: ${relative}`);
        continue;
      }
      const actual = sha256File(absolute);
      if (actual !== expected) errors.push(`hash divergente: ${relative}`);
    }

    for (const required of REQUIRED_COMMON.filter((item) => item !== 'manifest.sha256')) {
      if (!seen.has(required)) errors.push(`arquivo obrigatorio nao coberto pelo manifest: ${required}`);
    }
  }

  if (errors.length) {
    fail('pacote invalido', errors);
    return false;
  }

  console.log(`PACOTE_VALIDO: ${root}`);
  console.log(`ARQUIVOS_COMUNS_ASSINADOS: ${fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/).filter(Boolean).length}`);
  return true;
}

function validateResponse(filePath, expectedAgent) {
  filePath = path.resolve(filePath);
  expectedAgent = String(expectedAgent || '').toUpperCase();
  const errors = [];
  if (!['MANAGER', 'IHE'].includes(expectedAgent)) {
    fail('agente esperado deve ser MANAGER ou IHE');
    return false;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    fail('arquivo de parecer inexistente', [filePath]);
    return false;
  }

  const text = fs.readFileSync(filePath, 'utf8');
  const normalized = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const requiredPatterns = [
    [/PAC-20260718-001/, 'identificador da mesa'],
    [new RegExp(`AGENTE:\\*\\*?\\s*.*${expectedAgent}`), `agente ${expectedAgent}`],
    [/PARECER_ARQUITETURAL_SEM_CODIGO/, 'status sem codigo'],
    [/##\s*1\.\s*CONCLUSAO PRIMEIRO/, 'secao 1'],
    [/##\s*2\.\s*O QUE JA EXISTE/, 'secao 2'],
    [/##\s*3\.\s*DECISOES DO CEO/, 'secao 3'],
    [/##\s*4\.\s*CONCORDANCIAS/, 'secao 4'],
    [/##\s*5\.\s*RESSALVAS OU REJEICOES/, 'secao 5'],
    [/##\s*6\.\s*DUPLICIDADES E FRONTEIRAS PERIGOSAS/, 'secao 6'],
    [/##\s*7\.\s*MENOR GATE 0 SEGURO/, 'secao 7'],
    [/##\s*8\.\s*RESPOSTAS AS PERGUNTAS/, 'secao 8'],
    [/##\s*9\.\s*RISCOS PRIORITARIOS/, 'secao 9'],
    [/##\s*10\.\s*RECOMENDACAO FINAL/, 'secao 10'],
    [/##\s*11\.\s*DECLARACAO/, 'secao 11'],
    [/NENHUM CODIGO, MIGRATION, SEED, BANCO, SEGREDO, DADO CLINICO/, 'declaracao de nao alteracao'],
    [/RESUMO EM 1 LINHA/, 'resumo final'],
  ];

  for (const [pattern, label] of requiredPatterns) {
    if (!pattern.test(normalized)) errors.push(`faltando ou invalido: ${label}`);
  }

  if (!/(APROVAR_COM_RESSALVAS|APROVAR|REJEITAR)/.test(normalized)) {
    errors.push('recomendacao final ausente');
  }
  if (text.length < 1200) errors.push('parecer curto demais para conter evidencias minimas');

  if (errors.length) {
    fail(`parecer ${expectedAgent} invalido`, errors);
    return false;
  }

  console.log(`PARECER_VALIDO: ${expectedAgent}: ${filePath}`);
  return true;
}

function gateR1(managerPath, ihePath) {
  const managerOk = validateResponse(managerPath, 'MANAGER');
  const iheOk = validateResponse(ihePath, 'IHE');
  if (managerOk && iheOk) {
    console.log('R1_COMPLETA: SIM');
    console.log('PROXIMO_ESTADO_PERMITIDO: R2_CROSS_REVIEW');
    console.log('CONSTRUCAO_AUTORIZADA: NAO');
    return true;
  }
  console.log('R1_COMPLETA: NAO');
  console.log('PROXIMO_ESTADO_PERMITIDO: AGUARDAR_PARECERES');
  return false;
}

function usage() {
  console.log('Uso:');
  console.log('  node validate-mesa.mjs payload <diretorio-docs-mesa>');
  console.log('  node validate-mesa.mjs response <arquivo> <MANAGER|IHE>');
  console.log('  node validate-mesa.mjs gate-r1 <parecer-manager> <parecer-ihe>');
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'payload' && args.length === 1) validatePayload(args[0]);
  else if (command === 'response' && args.length === 2) validateResponse(args[0], args[1]);
  else if (command === 'gate-r1' && args.length === 2) gateR1(args[0], args[1]);
  else {
    usage();
    process.exitCode = 2;
  }
} catch (error) {
  fail('falha inesperada de validacao', [error instanceof Error ? error.message : String(error)]);
}
