#!/usr/bin/env python3
"""Extrai dados textuais das fichas para conferência, sem alterar o banco.

Uso: python3 scripts/extrair-fichas-exames.py ARQUIVO.pdf SAIDA.json

Esta é uma extração preliminar, não uma importação clínica. As faixas são
mantidas literalmente; não são convertidas em limites para classificação.
Trechos sobre coletas e identificação, quando presentes, não são extraídos.
"""

import hashlib
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

NS = "{http://www.w3.org/1999/xhtml}"
HEADING = re.compile(r"^0([1-6])\s*·\s*(.+)$")


def lines(page):
    result = []
    for line in page.iter(f"{NS}line"):
        text = " ".join((word.text or "") for word in line.findall(f"{NS}word")).strip()
        if text:
            result.append((float(line.attrib["xMin"]), float(line.attrib["yMin"]), text))
    return result


def parse_page(page, number):
    entries = lines(page)
    titles = [text for x, y, text in entries if x < 40 and 75 < y < 110]
    groups = [text.removeprefix("GRUPO DO EXAME:").strip() for _, _, text in entries if text.startswith("GRUPO DO EXAME:")]
    units = [text.removeprefix("UNIDADE DE REFERÊNCIA:").strip() for _, _, text in entries if text.startswith("UNIDADE DE REFERÊNCIA:")]
    labels = sorted([(x, text) for x, y, text in entries if 165 < y < 180])
    values = sorted([(x, text) for x, y, text in entries if 180 < y < 198])
    headings = [(x, y, HEADING.match(text)) for x, y, text in entries if HEADING.match(text)]
    if not (len(titles) == len(groups) == len(units) == 1 and len(labels) == len(values) == 5 and len(headings) == 6):
        raise ValueError(f"Página {number}: estrutura inesperada; extração interrompida.")

    sections = {}
    for column in (0, 1):
        col_heads = sorted(
            [(y, match) for x, y, match in headings if (x >= 300) == bool(column)],
            key=lambda item: item[0],
        )
        if len(col_heads) != 3:
            raise ValueError(f"Página {number}: colunas inesperadas; extração interrompida.")
        for index, (start, match) in enumerate(col_heads):
            end = col_heads[index + 1][0] if index + 1 < len(col_heads) else 740
            body = sorted(
                [(y, x, text) for x, y, text in entries
                 if (x >= 300) == bool(column) and start + 1 < y < end
                 and not HEADING.match(text)],
            )
            text = " ".join(item[2] for item in body)
            if not text:
                raise ValueError(f"Página {number}: seção {match.group(1)} vazia.")
            sections[match.group(1)] = {"titulo": match.group(2), "texto": text}
    return {
        "pagina": number,
        "nome": titles[0],
        "grupo": groups[0],
        "unidade": units[0],
        "faixas_literais": [
            {"rotulo": label[1], "valor": value[1]}
            for label, value in zip(labels, values)
        ],
        "secoes": sections,
    }


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Informe o arquivo de origem e o arquivo de saída.")
    source, destination = Path(sys.argv[1]), Path(sys.argv[2])
    if source.resolve() == destination.resolve():
        raise SystemExit("O arquivo de saída não pode sobrescrever o documento de origem.")
    if destination.exists():
        raise SystemExit("O arquivo de saída já existe; escolha outro nome para não sobrescrevê-lo.")
    bbox = subprocess.run(
        ["pdftotext", "-bbox-layout", str(source), "-"],
        check=True, capture_output=True,
    ).stdout
    root = ET.fromstring(bbox)
    pages = root.findall(f".//{NS}page")
    if len(pages) != 115:
        raise SystemExit(f"Documento inesperado: {len(pages)} páginas, esperadas 115.")
    records = [parse_page(page, number) for number, page in enumerate(pages, 1)]
    payload = {
        "estado": "extracao_preliminar_nao_importada",
        "origem_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "fichas": records,
    }
    with destination.open("x", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
        file.write("\n")
    print(f"Extração preliminar: {len(records)} fichas; nenhum dado foi importado para o banco.")


if __name__ == "__main__":
    main()
