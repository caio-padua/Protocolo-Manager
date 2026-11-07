"""Testes sintéticos do extrator preliminar; não acessam o banco de dados."""
import importlib.util
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location(
    "extrator", Path(__file__).with_name("extrair-fichas-exames.py")
)
extrator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extrator)


def linha(page, x, y, text):
    line = ET.SubElement(page, f"{extrator.NS}line", {"xMin": str(x), "yMin": str(y)})
    for word in text.split():
        ET.SubElement(line, f"{extrator.NS}word").text = word


def ficha_sintetica():
    page = ET.Element(f"{extrator.NS}page")
    linha(page, 20, 50, "Pessoa sintética que não deve ser exportada")
    linha(page, 29, 88, "Exame sintético")
    linha(page, 400, 102, "UNIDADE DE REFERÊNCIA: mg/dL")
    linha(page, 29, 111, "GRUPO DO EXAME: Grupo sintético")
    for index in range(5):
        linha(page, 50 + 100 * index, 172, f"Rótulo{index + 1}")
        linha(page, 50 + 100 * index, 188, f"Faixa{index + 1}")
    for column in range(2):
        for index in range(3):
            number = index + 1 + 3 * column
            linha(page, 39 + column * 274, 392 + index * 109, f"0{number} · Seção {number}")
            linha(page, 39 + column * 274, 416 + index * 109, f"Conteúdo sintético {number}")
    return page


class ExtratorTest(unittest.TestCase):
    def test_extrai_sem_dados_da_pessoa(self):
        result = extrator.parse_page(ficha_sintetica(), 1)
        self.assertEqual(result["nome"], "Exame sintético")
        self.assertEqual(len(result["faixas_literais"]), 5)
        self.assertEqual(result["faixas_literais"][3]["valor"], "Faixa4")
        self.assertEqual(result["secoes"]["6"]["texto"], "Conteúdo sintético 6")
        self.assertNotIn("Pessoa sintética", str(result))

    def test_rejeita_pagina_incompleta(self):
        page = ficha_sintetica()
        page.remove(page[-1])
        with self.assertRaises(ValueError):
            extrator.parse_page(page, 1)


if __name__ == "__main__":
    unittest.main()
