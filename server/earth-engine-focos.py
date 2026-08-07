#!/usr/bin/env python3
"""Consulta focos MODIS do Google Earth Engine dentro do município de Ouro Branco."""

import datetime
import json
import os
import sys
import tempfile

import ee


def inicializar_earth_engine():
    """Inicializa o EE com a conta de serviço configurada no Secret do Replit."""
    chave_json = os.environ.get("EARTH_ENGINE_SERVICE_ACCOUNT_JSON", "").strip()
    if not chave_json:
        project_id = os.environ.get("EARTH_ENGINE_PROJECT", "studio-6342191983-7ea1e")
        ee.Initialize(project=project_id)
        return project_id

    try:
        dados = json.loads(chave_json)
        email = dados["client_email"]
        project_id = os.environ.get("EARTH_ENGINE_PROJECT") or dados["project_id"]
        arquivo = tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", prefix="ee-key-", delete=False
        )
        try:
            json.dump(dados, arquivo)
            arquivo.close()
            os.chmod(arquivo.name, 0o600)
            credenciais = ee.ServiceAccountCredentials(email, arquivo.name)
            ee.Initialize(credentials=credenciais, project=project_id)
            return project_id
        finally:
            try:
                os.unlink(arquivo.name)
            except OSError:
                pass
    except (json.JSONDecodeError, KeyError) as exc:
        raise RuntimeError(
            "EARTH_ENGINE_SERVICE_ACCOUNT_JSON inválido: "
            "use o conteúdo completo da chave JSON"
        ) from exc


def main():
    project_id = inicializar_earth_engine()

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
        "projeto": project_id,
        "periodo": {"inicio": data_inicio, "fim": data_fim},
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)