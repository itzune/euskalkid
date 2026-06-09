/**
 * Nongoeuskara — Monochrome map with town-name tooltips.
 *
 * Loads the remapped SVG where each <g> and <path> has a `data-model-label`
 * attribute matching one of the 12 tier-3 azpieuskalki model output classes.
 *
 * Default: all paths in muted grey.
 * On hover: tooltip shows town name (281 named towns).
 * On model prediction: full dialect zone highlights via pinLabel().
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
  // All 281 named towns have their name as the path's id.
  // Path IDs that are just "path123" are unnamed municipality polygons.
  const pid = el.getAttribute("id") || el.id;
  if (pid && !/^(path|use)\d/i.test(pid) && pid !== "false") return pid;

  // Fallback: some towns are wrapped in a parent <g>
  const parent = el.closest("g[id]");
  if (parent) {
    const gid = parent.getAttribute("id") || parent.id;
    if (gid && !/^(g|layer|svg|defs)\d/i.test(gid) && gid !== "false") {
      if (!parent.hasAttributeNS?.(NS_INKSCAPE, "label")) return gid;
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

  // Use innerHTML instead of DOMParser+importNode to preserve all SVG attributes
  container.innerHTML = text;
  svgRoot = container.querySelector("svg");
  if (!svgRoot) return;

  svgRoot.setAttribute("width", "100%");
  svgRoot.setAttribute("height", "100%");

  greyOutAll();

  // Listen on the SVG root instead of individual paths.
  // Many paths overlap (1,082 big polygons), so the topmost
  // element at mouse position may not be the named town path.
  svgRoot.addEventListener("mousemove", (e) => {
    // Get ALL elements under the cursor, sorted by DOM depth (descending)
    const elements = document.elementsFromPoint(e.clientX, e.clientY);
    let townName = null;
    for (const el of elements) {
      if (el.tagName === "path" || el.tagName === "g") {
        townName = getElementName(el);
        if (townName) break;
      }
    }

    if (townName) {
      tooltip.textContent = townName;
      tooltip.classList.add("visible");
      moveTooltip(e);
    } else {
      tooltip.classList.remove("visible");
    }
  });

  svgRoot.addEventListener("mouseleave", () => {
    tooltip.classList.remove("visible");
  });

  // Hide hint once user has hovered
  if (mapHint) {
    svgRoot.addEventListener("mouseover", () => {
      mapHint.style.display = "none";
    }, { once: true });
  }
}

function highlightLabel(modelLabel) {
  resetHighlight();

  if (!svgRoot) return;
  const info = MODEL_LABELS[modelLabel];
  const color = info?.color || "#e85d75";

  // Collect parent layers that contain any path with this label
  const parentLayers = new Set();

  svgRoot.querySelectorAll("path").forEach((p) => {
    if (getModelLabel(p) === modelLabel) {
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

  // Highlight all paths in those parent layers, skipping
  // only paths with an explicit different known model label.
  parentLayers.forEach((layer) => {
    layer.querySelectorAll("path").forEach((p) => {
      const pl = getModelLabel(p);
      if (pl && pl !== modelLabel && MODEL_LABELS[pl]) return;
      p.style.fill = color;
      p.style.fillOpacity = "0.85";
      p.style.stroke = "#333";
      p.style.strokeOpacity = "0.6";
      p.style.filter = "drop-shadow(0 0 2px rgba(0,0,0,0.25))";
    });
  });
}

function clearHighlight() {
  resetHighlight();
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
 * Highlight the predicted zone (called from the model).
 */
function pinLabel(modelLabel) {
  highlightLabel(modelLabel);

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
