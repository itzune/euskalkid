#!/usr/bin/env bash
# Download the source data needed by build_map.py.
# Run from this directory: ./fetch_data.sh
set -euo pipefail
cd "$(dirname "$0")"

UA="euskalkid-map-build/1.0"

echo "Iparralde communes (france-geojson, dept 64)..."
curl -sL -o communes-64.geojson \
  "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements/64-pyrenees-atlantiques/communes-64-pyrenees-atlantiques.geojson"

echo "EAE municipalities (opendatasoft georef-spain: Araba 01, Gipuzkoa 20, Bizkaia 48)..."
curl -sL -o municipios-eae.geojson \
  "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/georef-spain-municipio/exports/geojson?where=prov_code%20IN%20(%2701%27,%2720%27,%2748%27)&limit=-1"

echo "Nafarroa municipalities (opendatasoft georef-spain: 31)..."
curl -sL -o municipios-nafarroa.geojson \
  "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/georef-spain-municipio/exports/geojson?where=prov_code%3D%2731%27&limit=-1"

echo "Trebiñu enclave (opendatasoft georef-spain: Condado de Treviño 09109, La Puebla de Arganzón 09276)..."
curl -sL -o municipios-trebinu.geojson \
  "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/georef-spain-municipio/exports/geojson?where=mun_code%20IN%20(%2709109%27,%2709276%27)&limit=-1"

echo "Wikidata: Basque labels for Spanish municipalities (INE P772)..."
curl -sG "https://query.wikidata.org/sparql" -H "User-Agent: $UA" \
  --data-urlencode "format=json" \
  --data-urlencode "query=SELECT ?ine ?eulabel WHERE { ?m wdt:P772 ?ine . FILTER(REGEX(?ine,'^((01|20|48|31)[0-9]{3}|09109|09276)\$')) ?m rdfs:label ?eulabel . FILTER(LANG(?eulabel)='eu') }" \
  -o wikidata-ine-eu.json

echo "Wikidata: Basque labels for dept-64 communes (INSEE P374)..."
curl -sG "https://query.wikidata.org/sparql" -H "User-Agent: $UA" \
  --data-urlencode "format=json" \
  --data-urlencode "query=SELECT ?insee ?eulabel WHERE { ?m wdt:P374 ?insee . FILTER(STRSTARTS(?insee,'64')) FILTER(STRLEN(?insee)=5) ?m rdfs:label ?eulabel . FILTER(LANG(?eulabel)='eu') }" \
  -o wikidata-insee-eu.json

echo "Done. Now run: python3 build_map.py"
