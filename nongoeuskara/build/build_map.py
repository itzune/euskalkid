#!/usr/bin/env python3
"""
Build a clean, interactive map.svg of Euskal Herria from real municipality
boundaries (GeoJSON), replacing the old artistic Wiki Commons SVG.

Every municipality becomes ONE named <path> in a SINGLE coordinate system:

    <path id="donostia" data-name="Donostia" data-model-label="erdialde-sartaldea" d="..."/>

Pipeline:
  1. Load municipality boundaries:
       - municipios-eae.geojson      (Araba 01, Gipuzkoa 20, Bizkaia 48; opendatasoft georef-spain)
       - municipios-nafarroa.geojson (Nafarroa 31)
       - communes-64.geojson         (Pyrenees-Atlantiques; france-geojson)
  2. Map INE/INSEE codes -> Basque names via Wikidata dumps
       (wikidata-ine-eu.json / wikidata-insee-eu.json).
  3. Match Basque names against the Ahotsak town -> azpieuskalki assignments,
     translated to the 12 tier-3 model labels.
  4. Keep ALL Hegoalde municipalities (unlabelled ones render as background);
     keep only Iparralde communes (Basque Country part of dept 64).
  5. Simplify geometry topologically (shapely.coverage_simplify: shared
     borders stay shared, no slivers).
  6. Project lon/lat -> SVG coords (equirectangular, aspect-corrected).
  7. Emit map.svg (one path per line, no transforms, no inline styles)
     and build_report.json with match statistics.

Usage:  python3 build_map.py
Deps:   shapely >= 2.1
"""

import json
import math
import re
import unicodedata
from pathlib import Path

import shapely
from shapely.geometry import shape, GeometryCollection
from shapely.ops import unary_union

HERE = Path(__file__).parent
OUT_SVG = HERE.parent / "map.svg"
OUT_REPORT = HERE / "build_report.json"
AHOTSAK_JSON = Path("/home/xezpeleta/Dev/itzune/zeineuski/data/reference/ahotsak_azpieuskalki_towns.json")

SVG_WIDTH = 1000.0
SIMPLIFY_TOLERANCE_DEG = 0.0015  # ~0.5 px at 1000px width
PRECISION = 1                    # decimals in SVG path coords

AHOTSAK_TO_MODEL = {
    "sartaldekoa-m": "mendebal-sartaldea",
    "sortaldekoa-m": "mendebal-sortaldea",
    "tartekoa-m": "mendebal-sortaldea",
    "erdigunekoa-g": "erdialde-sartaldea",
    "sartaldekoa-g": "erdialde-sartaldea",
    "sortaldekoa-g": "erdialde-sortaldea",
    "baztangoa": "nafar-sortaldea",
    "erdigunekoa-n": "nafar-erdigunea",
    "hegoaldeko-nafarra": "nafar-erdigunea",
    "hego-sartaldekoa": "nafar-hego-sartaldea",
    "ipar-sartaldekoa": "nafar-ipar-sartaldea",
    "sortaldekoa-n": "nafar-sortaldea",
    "erdigunekoa-nl": "naflap-sartaldea",
    "sartaldekoa-nl": "naflap-sartaldea",
    "sortaldekoa-nl": "naflap-sortaldea",
    "basaburua": "zuberera",
    "pettarrakoa": "zuberera",
    "zaraitzukoa": "ekialde-nafarra",
    "erronkarikoa": "ekialde-nafarra",
}

# Manual aliases: normalized municipality name -> normalized Ahotsak name.
# Filled in after inspecting the unmatched report.
MANUAL_ALIASES = {
    "villabona amasa": "amasa villabona",
    "esparza de salazar": "espartza zaraitzu",
    "espartza": "espartza zaraitzu",
    "montori": "montori berorize",
    "oiz": "oitz",
    "isturits": "izturitze",
}

# Overrides by INE/INSEE code for towns whose Basque name is ambiguous
# (same name exists in another province with a different dialect).
# None = explicitly no label (false-positive name collision).
CODE_OVERRIDES = {
    "64249": "getaria (l)",      # Guethary (Lapurdi), != Getaria (Gipuzkoa)
    "64283": "jatsu garazi",     # Jaxu (Nafarroa Beherea), != Jatxou/Jatsu (Lapurdi)
    "64327": "lekunberri (nb)",  # Lecumberry (NB), != Lekunberri (Nafarroa)
    "01028": None,               # Labastida (Araba), != Bastida (NB)
    "31083": None,               # Echarri Etxauribar (Nafarroa), != Etxarri/Etcharry (NB)
}


def normalize(name: str) -> str:
    """Lowercase, strip accents, treat hyphens as spaces, collapse spaces."""
    name = name.replace("\\u002D", "-").replace("-", " ")
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    name = name.lower().strip()
    name = re.sub(r"\s+", " ", name)
    return name


def slugify(name: str) -> str:
    s = normalize(name)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "mun"


def name_variants(raw: str):
    """Yield normalized variants of a municipality name for matching."""
    n = normalize(raw)
    yield n
    # bilingual official names: "Donostia / San Sebastián", "Aoiz <> Agoitz"
    for sep in ("/", "<>"):
        if sep in n:
            for part in n.split(sep):
                part = part.strip()
                if part:
                    yield part
    # parenthetical disambiguation: "Noain (Elortzibar)"
    cleaned = re.sub(r"\([^)]*\)", "", n)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if cleaned and cleaned != n:
        yield cleaned
        if "/" in cleaned:
            for part in cleaned.split("/"):
                part = part.strip()
                if part:
                    yield part


def load_wikidata_labels(path: Path, code_key: str) -> dict:
    """SPARQL JSON -> {code: [eu labels]}"""
    data = json.loads(path.read_text())
    out = {}
    for b in data["results"]["bindings"]:
        code = b[code_key]["value"]
        label = b["eulabel"]["value"]
        out.setdefault(code, []).append(label)
    return out


def build_town_lookup() -> dict:
    """normalized Ahotsak town name -> model label"""
    data = json.loads(AHOTSAK_JSON.read_text())
    lookup = {}
    for ahotsak_label, towns in data.items():
        model = AHOTSAK_TO_MODEL[ahotsak_label]
        for town in towns:
            lookup[normalize(town)] = model
    return lookup


def load_municipalities():
    """Load all features as dicts: {code, names: [candidates], geometry, province}."""
    muns = []

    for fname in ("municipios-eae.geojson", "municipios-nafarroa.geojson"):
        data = json.loads((HERE / fname).read_text())
        for feat in data["features"]:
            props = feat["properties"]
            if props.get("mun_type") != "municipality":
                continue
            names = [props["mun_name"]]
            if props.get("mun_name_local"):
                names.append(props["mun_name_local"])
            muns.append({
                "code": props["mun_code"],
                "official_name": props["mun_name"],
                "names": names,
                "province": props["prov_code"],
                "geometry": shape(feat["geometry"]),
                "source": "ine",
            })

    data = json.loads((HERE / "communes-64.geojson").read_text())
    for feat in data["features"]:
        props = feat["properties"]
        muns.append({
            "code": props["code"],
            "official_name": props["nom"],
            "names": [props["nom"]],
            "province": "64",
            "geometry": shape(feat["geometry"]),
            "source": "insee",
        })

    return muns


def project_factory(minx, miny, maxx, maxy):
    """Equirectangular projection with latitude aspect correction."""
    # 1 deg of longitude is cos(lat) times shorter than 1 deg of latitude
    mid_lat = math.radians((miny + maxy) / 2)
    k = math.cos(mid_lat)
    width = SVG_WIDTH
    height = (maxy - miny) / ((maxx - minx) * k) * SVG_WIDTH

    def project(lon, lat):
        x = (lon - minx) / (maxx - minx) * width
        y = (maxy - lat) / (maxy - miny) * height
        return x, y

    return project, width, height


def ring_to_path(ring, project):
    pts = [project(x, y) for x, y in ring]
    parts = [f"M{pts[0][0]:.{PRECISION}f} {pts[0][1]:.{PRECISION}f}"]
    prev = pts[0]
    for p in pts[1:-1]:
        dx, dy = p[0] - prev[0], p[1] - prev[1]
        if abs(dx) < 0.05 and abs(dy) < 0.05:
            continue
        parts.append(f"l{dx:.{PRECISION}f} {dy:.{PRECISION}f}")
        prev = p
    parts.append("Z")
    return "".join(parts)


def geom_to_path(geom, project):
    polys = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
    d = []
    for poly in polys:
        d.append(ring_to_path(poly.exterior.coords, project))
        for interior in poly.interiors:
            d.append(ring_to_path(interior.coords, project))
    return "".join(d)


def main():
    town_lookup = build_town_lookup()
    print(f"Ahotsak towns: {len(town_lookup)}")

    ine_labels = load_wikidata_labels(HERE / "wikidata-ine-eu.json", "ine")
    insee_labels = load_wikidata_labels(HERE / "wikidata-insee-eu.json", "insee")
    print(f"Wikidata eu labels: INE={len(ine_labels)}, INSEE={len(insee_labels)}")

    muns = load_municipalities()
    print(f"Municipalities loaded: {len(muns)}")

    # --- match each municipality to a model label + Basque display name ---
    matched_ahotsak = set()
    for m in muns:
        code_labels = (ine_labels if m["source"] == "ine" else insee_labels).get(m["code"], [])
        candidates = code_labels + m["names"]

        m["model_label"] = None
        if m["code"] in CODE_OVERRIDES:
            override = CODE_OVERRIDES[m["code"]]
            if override:
                m["model_label"] = town_lookup[override]
                matched_ahotsak.add(override)
        else:
            for raw in candidates:
                for variant in name_variants(raw):
                    variant = MANUAL_ALIASES.get(variant, variant)
                    if variant in town_lookup:
                        m["model_label"] = town_lookup[variant]
                        matched_ahotsak.add(variant)
                        break
                if m["model_label"]:
                    break

        # display name: prefer Wikidata eu label, drop parenthetical disambiguation
        display = code_labels[0] if code_labels else m["official_name"]
        display = re.sub(r"\s*\([^)]*\)\s*$", "", display).strip()
        m["display_name"] = display

    # Iparralde: keep only dept-64 communes that matched an Ahotsak town
    before = len(muns)
    muns = [m for m in muns if m["province"] != "64" or m["model_label"]]
    print(f"Dept-64 communes kept (Iparralde): {sum(1 for m in muns if m['province'] == '64')} "
          f"(dropped {before - len(muns)} Bearn communes)")

    # report Ahotsak towns we never matched (data gaps / name mismatches)
    unmatched_towns = sorted(set(town_lookup) - matched_ahotsak)
    print(f"Matched municipalities: {sum(1 for m in muns if m['model_label'])}")
    print(f"Ahotsak towns not matched to any municipality: {len(unmatched_towns)}")

    # --- topology-preserving simplification over the whole coverage ---
    def as_polygonal(g):
        if g.geom_type in ("Polygon", "MultiPolygon"):
            return g
        polys = [p for p in getattr(g, "geoms", []) if p.geom_type in ("Polygon", "MultiPolygon")]
        return unary_union(polys)

    geoms = [as_polygonal(m["geometry"]) for m in muns]
    simplified = list(shapely.coverage_simplify(geoms, SIMPLIFY_TOLERANCE_DEG))
    for m, g in zip(muns, simplified):
        m["geometry"] = g

    # --- projection ---
    minx, miny, maxx, maxy = unary_union(simplified).bounds
    pad_x = (maxx - minx) * 0.01
    pad_y = (maxy - miny) * 0.01
    project, width, height = project_factory(minx - pad_x, miny - pad_y, maxx + pad_x, maxy + pad_y)

    # --- province outlines for context ---
    province_paths = []
    for prov in sorted({m["province"] for m in muns}):
        prov_geom = unary_union([m["geometry"] for m in muns if m["province"] == prov])
        province_paths.append((prov, geom_to_path(prov_geom, project)))

    # --- emit SVG ---
    used_ids = set()
    path_lines = []
    for m in sorted(muns, key=lambda m: (m["province"], m["code"])):
        pid = slugify(m["display_name"])
        if pid in used_ids:
            pid = f"{pid}-{m['code']}"
        used_ids.add(pid)
        d = geom_to_path(m["geometry"], project)
        label_attr = f' data-model-label="{m["model_label"]}"' if m["model_label"] else ""
        name = m["display_name"].replace("&", "&amp;").replace('"', "&quot;")
        path_lines.append(
            f'<path id="{pid}" class="mun" data-name="{name}"{label_attr} d="{d}"/>'
        )

    svg_lines = [
        '<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {width:.0f} {height:.0f}" '
        'preserveAspectRatio="xMidYMid meet" role="img" '
        'aria-label="Euskal Herriko udalerri mapa">',
        '<g id="municipalities">',
        *path_lines,
        "</g>",
        '<g id="provinces">',
        *(f'<path class="province" data-province="{prov}" d="{d}"/>' for prov, d in province_paths),
        "</g>",
        "</svg>",
    ]
    OUT_SVG.write_text("\n".join(svg_lines))
    print(f"\nWrote {OUT_SVG} ({OUT_SVG.stat().st_size / 1024:.0f} KB, {len(path_lines)} municipality paths)")

    # --- report ---
    label_counts = {}
    for m in muns:
        if m["model_label"]:
            label_counts[m["model_label"]] = label_counts.get(m["model_label"], 0) + 1
    report = {
        "municipalities_total": len(muns),
        "municipalities_labelled": sum(1 for m in muns if m["model_label"]),
        "label_counts": dict(sorted(label_counts.items())),
        "ahotsak_towns_unmatched": unmatched_towns,
    }
    OUT_REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"Wrote {OUT_REPORT}")
    print(json.dumps(report["label_counts"], indent=2))


if __name__ == "__main__":
    main()
