-- ATENÇÃO: apaga também as regras versionadas e os apelidos de nome, e o histórico de verificações de identidade. Documentos em status 'quarentena'
-- continuam existindo e precisarão ser tratados à mão (o JSON extraído deles mora nesta tabela).
-- Só executar com ordem escrita do responsável.
DROP TRIGGER IF EXISTS tg_exam_identity_rule_sets_imutavel ON exam_identity_rule_sets;
DROP TABLE IF EXISTS exam_identity_rule_sets;
DROP TABLE IF EXISTS exam_identity_aliases;
DROP TRIGGER IF EXISTS tg_exam_identity_checks_imutavel ON exam_identity_checks;
DROP FUNCTION IF EXISTS exam_identity_checks_imutavel();
DROP TABLE IF EXISTS exam_identity_checks;
