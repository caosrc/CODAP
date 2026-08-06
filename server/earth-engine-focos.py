#!/usr/bin/env python3
"""Consulta focos MODIS do Google Earth Engine dentro do município de Ouro Branco."""

import datetime
import json
import os
import sys

import ee


PROJECT_ID = os.environ.get("EARTH_ENGINE_PROJECT", "studio-6342191983-7ea1e")


def main():
    ee.Initialize(project=PROJECT_ID)

    hoje = datetime.datetime.now(datetime.timezone.utc).date()
    data_fim = hoje.strftime("%Y-%m-%d")
    data_inicio = (hoje - datetime.timedelta(days=2)).strftime("%Y-%m-%d")

    municipios = ee.FeatureCollection("FAO/GAUL/2015/level2")
    ouro_branco = (
        municipios
        .filter(ee.Filter.eq("ADM2_NAME", "Ouro Branco"))
        .filter(ee.Filter.eq("ADM1_NAME", "Minas Gerais"))
    )

    if ouro_branco.size().getInfo() == 0:
        raise RuntimeError("Município de Ouro Branco não encontrado no catálogo do Earth Engine")

    imagens = (
        ee.ImageCollection("MODIS/006/MOD14A1")
        .filterDate(data_inicio, data_fim)
        .filterBounds(ouro_branco.geometry())
    )

    if imagens.size().getInfo() == 0:
        print(json.dumps({
            "focos": [],
            "fonte": "EARTH-ENGINE-MODIS",
            "periodo": {"inicio": data_inicio, "fim": data_fim},
        }))
        return

    mascara_fogo = imagens.mosaic().select("FireMask").gte(7)
    pontos = mascara_fogo.reduceToVectors(
        geometry=ouro_branco.geometry(),
        scale=1000,
        geometryType="point",
        labelProperty="fogo",
        bestEffort=True,
        maxPixels=100000000,
    )
    resultado = pontos.getInfo()
    focos = []

    for feature in resultado.get("features", []):
        geometry = feature.get("geometry") or {}
        coords = geometry.get("coordinates") or []
        if len(coords) < 2:
            continue
        focos.append({
            "lat": float(coords[1]),
            "lng": float(coords[0]),
            "confidence": "h",
            "frp": 0,
            "data": data_fim,
            "hora": "",
            "satelite": "MODIS",
            "fonte": "EARTH-ENGINE-MODIS",
        })

    print(json.dumps({
        "focos": focos,
        "fonte": "EARTH-ENGINE-MODIS",
        "periodo": {"inicio": data_inicio, "fim": data_fim},
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)