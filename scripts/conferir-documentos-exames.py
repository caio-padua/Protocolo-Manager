#!/usr/bin/env python3
"""Compara campos extraídos das fichas e do compêndio, sem importar dados.

Uso: python3 scripts/conferir-documentos-exames.py FICHAS.pdf COMPENDIO.pdf MODELOS.pdf
O resultado é uma conferência preliminar de extração, não validação clínica.
"""
import importlib.util
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "extrator_fichas", Path(__file__).with_name("extrair-fichas-exames.py")
)
extrator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extrator)


def paginas(caminho):
    result = subprocess.run(
        ["pdftotext", "-bbox-layout", caminho, "-"], check=True, capture_output=True
    )
    return ET.fromstring(result.stdout).findall(f".//{extrator.NS}page")


def fichas_extraidas(caminho):
    resultado = []
    for pagina, page in enumerate(paginas(caminho), 1):
        linhas = extrator.lines(page)
        if not any("INTERVALOS E FAIXAS LABORATORIAIS" in text for _, _, text in linhas):
            continue
        num = len(resultado) + 1
        rodape = [text for _, _, text in linhas if re.search(r"EXAME\s+\d{3}/115", text)]
        if len(rodape) != 1 or not re.search(rf"EXAME\s+{num:03d}/115", rodape[0]):
            raise ValueError(f"Página {pagina}: sequência da ficha não confirmada.")
        resultado.append(extrator.parse_page(page, pagina))
    if len(resultado) != 115:
        raise ValueError(f"Esperadas 115 fichas, encontradas {len(resultado)}.")
    return resultado


def comparar(fichas, compendio):
    campos = ("nome", "grupo", "unidade", "faixas_literais", "secoes")
    return [
        {"ficha": a["pagina"], "compendio": b["pagina"], "campos": [key for key in campos if a[key] != b[key]]}
        for a, b in zip(fichas, compendio)
        if any(a[key] != b[key] for key in campos)
    ]


def comparar_modelos(fichas, caminho):
    pages = paginas(caminho)
    if len(pages) != 3:
        raise ValueError(f"Esperados três modelos, encontrados {len(pages)}.")
    campos = ("nome", "grupo", "unidade", "faixas_literais")
    diferencas = []
    for number, page in enumerate(pages, 1):
        modelo = extrator.parse_page(page, number)
        candidatas = [ficha for ficha in fichas if ficha["nome"] == modelo["nome"]]
        if len(candidatas) != 1:
            raise ValueError(f"Modelo {number}: identidade da ficha não é única.")
        ficha = candidatas[0]
        campos_divergentes = [campo for campo in campos if ficha[campo] != modelo[campo]]
        if campos_divergentes:
            diferencas.append({"modelo": number, "ficha": ficha["pagina"], "campos": campos_divergentes})
    return diferencas


def main():
    if len(sys.argv) != 4:
        raise SystemExit("Informe os arquivos das fichas, do compêndio e dos três modelos.")
    fichas = fichas_extraidas(sys.argv[1])
    diferencas = comparar(fichas, fichas_extraidas(sys.argv[2]))
    if diferencas:
        for item in diferencas:
            print(f"Ficha {item['ficha']}, compêndio {item['compendio']}: {', '.join(item['campos'])}")
        raise SystemExit(f"Comparação interrompida: {len(diferencas)} diferenças.")
    modelos = comparar_modelos(fichas, sys.argv[3])
    if modelos:
        for item in modelos:
            print(f"Modelo {item['modelo']}, ficha {item['ficha']}: {', '.join(item['campos'])}")
        raise SystemExit(f"Comparação interrompida: {len(modelos)} modelos divergentes.")
    print("115 fichas e três modelos com faixas extraídas coincidentes; conferência visual ainda necessária.")


if __name__ == "__main__":
    main()
