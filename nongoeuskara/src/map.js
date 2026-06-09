/**
 * Nongoeuskara — Monochrome map with model-label-based zone highlighting.
 *
 * Loads the remapped SVG where each <g> and <path> has a `data-model-label`
 * attribute matching one of the 12 tier-3 azpieuskalki model output classes.
 *
 * Default: all paths in muted grey.
 * On hover/tooltip: highlight zone + show town name.
 * Programmatic: window.euskalkid.highlightLabel("mendebal-sartaldea")
 */

const MODEL_LABELS = {
  "mendebal-sartaldea":   { name: "Mendebal-sartaldea",    color: "#8b5cf6" },
  "mendebal-sortaldea":   { name: "Mendebal-sortaldea",    color: "#7c3aed" },
  "erdialde-sartaldea":   { name: "Erdialde-sartaldea",    color: "#06b6d4" },
  "erdialde-sortaldea":   { name: "Erdialde-sortaldea",    color: "#0ea5e9" },
  "nafar-ipar-sartaldea": { name: "Nafar ipar-sartaldea",  color: "#f59e0b" },
  "nafar-erdigunea":      { name: "Nafar erdigunea",        color: "#10b981" },
  "nafar-hego-sartaldea": { name: "Nafar hego-sartaldea",  color: "#84cc16" },
  "nafar-sortaldea":      { name: "Nafar sortaldea",        color: "#f97316" },
  "naflap-sartaldea":     { name: "Naf-lapur sartaldea",    color: "#ec4899" },
  "naflap-sortaldea":     { name: "Naf-lapur sortaldea",    color: "#d946ef" },
  "zuberera":             { name: "Zuberera",               color: "#14b8a6" },
  "ekialde-nafarra":      { name: "Ekialdeko nafarra",      color: "#ef4444" },
};

const DISABLED_FILL = "#d0d5da";
const DISABLED_STROKE = "#bcc4cc";

const container = document.getElementById("mapContainer");
const tooltip = document.getElementById("tooltip");
const badge = document.getElementById("predictionBadge");
const badgeSwatch = document.getElementById("predictionSwatch");
const badgeName = document.getElementById("predictionName");
const mapHint = document.getElementById("mapHint");

let svgRoot = null;
let highlightedLabel = null;
let pinnedLabel = null;  // set by model prediction to override hover

const NS_INKSCAPE = "http://www.inkscape.org/namespaces/inkscape";

/**
 * Find the model label for a given SVG element.
 */
function getModelLabel(el) {
  if (el.dataset?.modelLabel) return el.dataset.modelLabel;
  let current = el;
  while (current && current !== svgRoot) {
    if (current.dataset?.modelLabel) return current.dataset.modelLabel;
    current = current.parentElement;
  }
  return null;
}

/**
 * Find a human-readable town name for the hovered element.
 */
function getElementName(el) {
  if (el.id && !el.id.startsWith("path") && !el.id.startsWith("use")) return el.id;

  const parent = el.closest("g[id]");
  if (parent && parent.id) {
    if (parent.hasAttributeNS?.(NS_INKSCAPE, "label")) return null;
    const gid = parent.id;
    if (!gid.startsWith("g") && !gid.startsWith("layer") && !gid.startsWith("svg")) {
      return gid;
    }
  }
  return null;
}

function greyOutAll() {
  if (!svgRoot) return;
  svgRoot.querySelectorAll("path").forEach((p) => {
    p.style.fill = DISABLED_FILL;
    p.style.fillOpacity = "1";
    p.style.stroke = DISABLED_STROKE;
    p.style.strokeOpacity = "1";
    p.style.filter = "";
  });
}

async function loadMap() {
  const resp = await fetch("./map.svg");
  const text = await resp.text();

  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(text, "image/svg+xml");
  const importedSvg = svgDoc.documentElement;

  container.innerHTML = "";
  container.appendChild(document.importNode(importedSvg, true));
  svgRoot = container.querySelector("svg");
  if (!svgRoot) return;

  svgRoot.setAttribute("width", "100%");
  svgRoot.setAttribute("height", "100%");

  greyOutAll();

  const allPaths = svgRoot.querySelectorAll("path");
  allPaths.forEach((path) => {
    path.addEventListener("mouseenter", (e) => {
      const label = getModelLabel(path);
      if (label && pinnedLabel !== label) {
        highlightLabel(label);
      }
      const townName = getElementName(path);
      const zoneName = MODEL_LABELS[label]?.name || label || "";
      if (townName) {
        tooltip.textContent = `${townName} — ${zoneName}`;
      } else if (zoneName) {
        tooltip.textContent = zoneName;
      } else {
        tooltip.textContent = "";
        return;
      }
      tooltip.classList.add("visible");
      moveTooltip(e);
    });

    path.addEventListener("mouseleave", () => {
      if (pinnedLabel) {
        // On pin, stay highlighted but clear tooltip
        if (highlightedLabel !== pinnedLabel) {
          highlightLabel(pinnedLabel);
        }
      } else {
        resetHighlight();
      }
      tooltip.classList.remove("visible");
    });

    path.addEventListener("mousemove", (e) => {
      moveTooltip(e);
    });
  });

  // Hide hint once user has hovered
  if (mapHint) {
    svgRoot.addEventListener("mouseover", () => {
      mapHint.style.display = "none";
    }, { once: true });
  }
}

/**
 * Highlight all paths matching a given model label.
 * 
 * Two modes:
 * - Per-path: highlights only paths with the exact data-model-label (used by hover).
 * - Layer-wide: also highlights paths in the same parent layer that inherit
 *   a different default label, but where some towns matched the target label.
 *   Used by pinLabel() for model predictions, because the model can't 
 *   disambiguate unnamed polygons within a split layer.
 */
function highlightLabel(modelLabel, layerWide = false) {
  if (highlightedLabel === modelLabel) return;
  resetHighlight();

  if (!svgRoot) return;
  const info = MODEL_LABELS[modelLabel];
  const color = info?.color || "#e85d75";

  // Collect matching paths and their parent layers
  const matchingPaths = [];
  const parentLayers = new Set();

  svgRoot.querySelectorAll("path").forEach((p) => {
    const pathLabel = getModelLabel(p);
    if (pathLabel === modelLabel) {
      matchingPaths.push(p);
      // Track parent layer for layer-wide mode
      let current = p.parentElement;
      while (current && current !== svgRoot) {
        if (current.dataset?.modelLabel) {
          parentLayers.add(current);
          break;
        }
        current = current.parentElement;
      }
    }
  });

  // Highlight direct matches
  matchingPaths.forEach((p) => {
    p.style.fill = color;
    p.style.fillOpacity = "0.85";
    p.style.stroke = "#333";
    p.style.strokeOpacity = "0.6";
    p.style.filter = "drop-shadow(0 0 2px rgba(0,0,0,0.25))";
  });

  // In layer-wide mode, highlight all paths in the parent layer(s)
  // that don't have an explicit different sub-label.
  // This makes model predictions light up the full dialect region
  // even though the SVG can't split unnamed polygons by sub-zone.
  if (layerWide) {
    parentLayers.forEach((layer) => {
      layer.querySelectorAll("path").forEach((p) => {
        const pl = getModelLabel(p);
        // Skip if path has a different known model label
        if (pl && pl !== modelLabel && MODEL_LABELS[pl]) return;
        // Highlight: no label, or same label, or unknown label
        p.style.fill = color;
        p.style.fillOpacity = "0.85";
        p.style.stroke = "#333";
        p.style.strokeOpacity = "0.6";
        p.style.filter = "drop-shadow(0 0 2px rgba(0,0,0,0.25))";
      });
    });
  }

  highlightedLabel = modelLabel;
}

function clearHighlight() {
  pinnedLabel = null;
  resetHighlight();
  highlightedLabel = null;
  if (badge) badge.classList.remove("visible");
}

function resetHighlight() {
  if (!svgRoot) return;
  svgRoot.querySelectorAll("path").forEach((p) => {
    p.style.fill = DISABLED_FILL;
    p.style.fillOpacity = "1";
    p.style.stroke = DISABLED_STROKE;
    p.style.strokeOpacity = "1";
    p.style.filter = "";
  });
}

/**
 * Pin a zone (from model prediction). Updates the header badge.
 * Uses layer-wide highlighting so unnamed polygons also light up.
 */
function pinLabel(modelLabel) {
  pinnedLabel = modelLabel;
  highlightLabel(modelLabel, true);

  const info = MODEL_LABELS[modelLabel];
  if (info && badge && badgeSwatch && badgeName) {
    badgeSwatch.style.backgroundColor = info.color;
    badgeName.textContent = info.name;
    badge.classList.add("visible");
  }
}

function moveTooltip(event) {
  tooltip.style.left = `${event.clientX + 14}px`;
  tooltip.style.top = `${event.clientY + 14}px`;
}

// Init
loadMap();

// Public API for model integration / chatbot
window.euskalkid = {
  highlightLabel,
  clearHighlight,
  pinLabel,
  MODEL_LABELS,
};
