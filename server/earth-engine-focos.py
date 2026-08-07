#!/usr/bin/env python3
"""Consultas de monitoramento ambiental do Google Earth Engine para Ouro Branco."""

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


def obter_municipio():
    """Retorna a geometria oficial de Ouro Branco no catálogo do Earth Engine."""
    municipios = ee.FeatureCollection("FAO/GAUL/2015/level2")
    ouro_branco = (
        municipios
        .filter(ee.Filter.eq("ADM2_NAME", "Ouro Branco"))
        .filter(ee.Filter.eq("ADM1_NAME", "Minas Gerais"))
    )
    if ouro_branco.size().getInfo() == 0:
        raise RuntimeError("Município de Ouro Branco não encontrado no catálogo do Earth Engine")
    return ouro_branco.geometry()


def gerar_url_tiles(imagem, vis_params):
    """Gera a URL de tiles autenticada que o Leaflet consegue consumir."""
    mapa = imagem.getMapId(vis_params)
    return mapa["tile_fetcher"].url_format


def estatistica_media(imagem, regiao, escala=1000, banda=None, multiplicador=1):
    """Calcula uma média territorial sem interromper o restante do monitoramento."""
    try:
        alvo = imagem.select(banda) if banda else imagem
        valor = alvo.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=regiao,
            scale=escala,
            bestEffort=True,
            maxPixels=100000000,
        ).getInfo()
        if not valor:
            return None
        numero = next((v for v in valor.values() if isinstance(v, (int, float))), None)
        return round(float(numero) * multiplicador, 2) if numero is not None else None
    except Exception:
        return None


def consultar_monitoramento():
    """Monta camadas úteis para prevenção e confirmação de incêndios.

    Cada dataset é isolado para que uma indisponibilidade no catálogo não
    esconda os demais indicadores. As URLs retornadas são tiles temporários
    assinados pelo Earth Engine e não expõem a chave da conta de serviço.
    """
    project_id = inicializar_earth_engine()
    regiao = obter_municipio()
    hoje = datetime.datetime.now(datetime.timezone.utc).date()
    fim = hoje.strftime("%Y-%m-%d")
    inicio_5d = (hoje - datetime.timedelta(days=5)).strftime("%Y-%m-%d")
    inicio_30d = (hoje - datetime.timedelta(days=30)).strftime("%Y-%m-%d")
    camadas = []
    indicadores = []
    erros = []

    def adicionar_camadas(nome, descricao, imagem, vis_params, estatisticas=None):
        try:
            url = gerar_url_tiles(imagem, vis_params)
            camadas.append({
                "id": nome,
                "nome": descricao[0],
                "descricao": descricao[1],
                "url": url,
                "periodo": descricao[2],
            })
            if estatisticas:
                indicadores.extend(estatisticas)
        except Exception as exc:
            erros.append(f"{nome}: {str(exc)[:180]}")

    # O VIIRS já é consultado no endpoint NASA FIRMS (VIIRS SNPP/NOAA-20/21),
    # que fornece os pontos e o FRP de forma mais atualizada que os catálogos
    # NRT disponíveis neste projeto do Earth Engine. O painel da tela combina
    # essa fonte com o MODIS abaixo.
    try:
        modis = (
            ee.ImageCollection("MODIS/061/MOD14A1")
            .filterDate(inicio_5d, fim)
            .filterBounds(regiao)
            .select("FireMask")
            .max()
        )
        adicionar_camadas(
            "modis",
            ("MODIS FireMask", "Máscara de fogo ativo do MODIS para confirmar focos de menor resolução.", f"Últimos 5 dias até {fim}"),
            modis,
            {"min": 0, "max": 9, "palette": ["000000", "fef3c7", "f97316", "dc2626", "7f1d1d"]},
            [{"id": "modis-mask", "nome": "Intensidade MODIS", "valor": estatistica_media(modis, regiao, 1000, "FireMask"), "unidade": "escala 0–9"}],
        )
    except Exception as exc:
        erros.append(f"modis: {str(exc)[:180]}")

    # CHIRPS e ERA5-Land ajudam a explicar risco de propagação e estiagem.
    try:
        chirps = (
            ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
            .filterDate(inicio_30d, fim)
            .filterBounds(regiao)
            .select("precipitation")
            .sum()
        )
        adicionar_camadas(
            "chirps",
            ("Chuva CHIRPS", "Precipitação acumulada para identificar áreas secas e úmidas.", f"Acumulado de 30 dias até {fim}"),
            chirps,
            {"min": 0, "max": 180, "palette": ["7f1d1d", "f97316", "facc15", "86efac", "2563eb"]},
            [{"id": "chirps-chuva", "nome": "Chuva CHIRPS", "valor": estatistica_media(chirps, regiao, 5000, "precipitation"), "unidade": "mm / 30 dias"}],
        )
    except Exception as exc:
        erros.append(f"chirps: {str(exc)[:180]}")

    try:
        era5 = (
            ee.ImageCollection("ECMWF/ERA5_LAND/DAILY_AGGR")
            .filterDate(inicio_30d, fim)
            .filterBounds(regiao)
        )
        chuva_era5 = era5.select("total_precipitation_sum").sum()
        temp_era5 = era5.select("temperature_2m").mean().subtract(273.15)
        adicionar_camadas(
            "era5",
            ("ERA5-Land: umidade e temperatura", "Reanálise meteorológica para indicar estresse térmico e condições de propagação.", f"Média/acumulado de 30 dias até {fim}"),
            temp_era5,
            {"min": 15, "max": 38, "palette": ["2563eb", "67e8f9", "fef08a", "fb923c", "dc2626"]},
            [
                {"id": "era5-temperatura", "nome": "Temperatura ERA5", "valor": estatistica_media(temp_era5, regiao, 10000), "unidade": "°C"},
                {"id": "era5-chuva", "nome": "Chuva ERA5", "valor": estatistica_media(chuva_era5, regiao, 10000, "total_precipitation_sum", 1000), "unidade": "mm / 30 dias"},
            ],
        )
    except Exception as exc:
        erros.append(f"era5: {str(exc)[:180]}")

    # Sentinel-2 e Landsat: índices de vegetação recentes, úteis para
    # localizar biomassa seca e conferir visualmente áreas afetadas.
    try:
        sentinel = (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterDate(inicio_30d, fim)
            .filterBounds(regiao)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 60))
            .median()
        )
        ndvi_s2 = sentinel.normalizedDifference(["B8", "B4"]).rename("NDVI")
        adicionar_camadas(
            "sentinel-ndvi",
            ("Sentinel-2 NDVI", "Índice de vegetação para observar biomassa e estresse da cobertura vegetal.", f"Composição de 30 dias até {fim}"),
            ndvi_s2,
            {"min": -0.2, "max": 0.9, "palette": ["8b0000", "f97316", "fef08a", "84cc16", "166534"]},
            [{"id": "sentinel-ndvi-valor", "nome": "NDVI Sentinel-2", "valor": estatistica_media(ndvi_s2, regiao, 20, "NDVI"), "unidade": "índice"}],
        )
    except Exception as exc:
        erros.append(f"sentinel-2: {str(exc)[:180]}")

    try:
        landsat = (
            ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
            .merge(ee.ImageCollection("LANDSAT/LC09/C02/T1_L2"))
            .filterDate(inicio_30d, fim)
            .filterBounds(regiao)
            .filter(ee.Filter.lt("CLOUD_COVER", 70))
            .median()
        )
        ndvi_landsat = landsat.normalizedDifference(["SR_B5", "SR_B4"]).rename("NDVI")
        adicionar_camadas(
            "landsat-ndvi",
            ("Landsat NDVI", "Índice de vegetação de apoio quando o Sentinel-2 estiver coberto por nuvens.", f"Composição de 30 dias até {fim}"),
            ndvi_landsat,
            {"min": -0.2, "max": 0.9, "palette": ["8b0000", "f97316", "fef08a", "84cc16", "166534"]},
            [{"id": "landsat-ndvi-valor", "nome": "NDVI Landsat", "valor": estatistica_media(ndvi_landsat, regiao, 30, "NDVI"), "unidade": "índice"}],
        )
    except Exception as exc:
        erros.append(f"landsat: {str(exc)[:180]}")

    # MCD64A1 confirma cicatrizes de queimadas (não é foco ativo).
    try:
        queimadas = (
            ee.ImageCollection("MODIS/061/MCD64A1")
            .filterDate((hoje - datetime.timedelta(days=365)).strftime("%Y-%m-%d"), fim)
            .filterBounds(regiao)
            .select("BurnDate")
            .max()
        )
        adicionar_camadas(
            "area-queimada",
            ("Área queimada MODIS", "Cicatrizes de queimadas detectadas no último ano; não representa fogo ativo.", f"Últimos 12 meses até {fim}"),
            queimadas,
            {"min": 1, "max": 366, "palette": ["fee2e2", "f97316", "dc2626", "7f1d1d"]},
        )
    except Exception as exc:
        erros.append(f"area-queimada: {str(exc)[:180]}")

    return {
        "camadas": camadas,
        "indicadores": [i for i in indicadores if i.get("valor") is not None],
        "erros": erros,
        "projeto": project_id,
        "atualizadoEm": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "periodo": {"inicio": inicio_30d, "fim": fim},
    }


def main():
    project_id = inicializar_earth_engine()

    if len(sys.argv) > 1 and sys.argv[1] == "monitoramento":
        print(json.dumps(consultar_monitoramento()))
        return

    hoje = datetime.datetime.now(datetime.timezone.utc).date()
    data_fim = hoje.strftime("%Y-%m-%d")
    data_inicio = (hoje - datetime.timedelta(days=2)).strftime("%Y-%m-%d")

    ouro_branco = ee.FeatureCollection([ee.Feature(obter_municipio())])

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