/**
 * Nongoeuskara — Load original SVG, render in monochrome grey,
 * highlight dialect zones on hover/click/match.
 */

const LAYERS = [
  { label: "Zuberoa",                     fill: "#ccaaff", towns: 36 },
  { label: "Erronkari",                   fill: "#d8bfd8", towns: 14 },
  { label: "Zaraitzu",                    fill: "#f5deb3", towns: 28 },
  { label: "Aezkoa",                      fill: "#d1c821", towns: 20 },
  { label: "Nafarroa Beherea",            fill: "#d38d5f", towns: 102 },
  { label: "Baztan",                      fill: "#ffd00f", towns: 2 },
  { label: "Hegoaldeko Nafarroa Garaia",  fill: "#5fd35f", towns: 375 },
  { label: "Iparraldeko Nafarroa Garaia", fill: "#ffff3e", towns: 115 },
  { label: "Burunda",                     fill: "#dedede", towns: 200 },
  { label: "Lapurdi",                     fill: "#ffa955", towns: 24 },
  { label: "Erdialde",                    fill: "#aaeeff", towns: 220 },
  { label: "Mendebalde",                  fill: "#ffeabf", towns: 435 },
];

const DISABLED_FILL = "#d0d5da";
const DISABLED_STROKE = "#bcc4cc";

const container = document.getElementById("mapContainer");
const legend = document.getElementById("legend");
const tooltip = document.getElementById("tooltip");
const NS_INKSCAPE = "http://www.inkscape.org/namespaces/inkscape";

let svgRoot = null;
let highlightedLayer = null;

function buildLegend() {
  LAYERS.forEach((layer) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.dataset.layer = layer.label;

    const swatch = document.createElement("div");
    swatch.className = "legend-swatch";
    swatch.style.backgroundColor = layer.fill;

    const name = document.createElement("span");
    name.textContent = layer.label;

    item.append(swatch, name);

    item.addEventListener("click", () => {
      if (highlightedLayer === layer.label) {
        clearHighlight();
      } else {
        highlightLayer(layer.label);
      }
    });

    legend.appendChild(item);
  });
}

function findLayerGroup(el) {
  let current = el;
  while (current && current !== svgRoot) {
    const label = current.getAttributeNS?.(NS_INKSCAPE, "label");
    if (label) return { elem: current, label };
    current = current.parentElement;
  }
  return null;
}

/**
 * Turn all paths into a uniform muted grey.
 */
function greyOutAll() {
  if (!svgRoot) return;
  const paths = svgRoot.querySelectorAll("path");
  paths.forEach((p) => {
    p.setAttribute("data-original-fill", p.style.fill || p.getAttribute("fill") || "");
    p.setAttribute("data-original-stroke", p.style.stroke || p.getAttribute("stroke") || "");
    p.style.fill = DISABLED_FILL;
    p.style.fillOpacity = "1";
    p.style.stroke = DISABLED_STROKE;
    p.style.strokeOpacity = "1";
    p.style.strokeWidth = "";
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

  // Make sure SVG fills container
  svgRoot.setAttribute("width", "100%");
  svgRoot.setAttribute("height", "100%");

  // Turn all paths grey
  greyOutAll();

  // Attach hover listeners
  const allPaths = svgRoot.querySelectorAll("path");
  allPaths.forEach((path) => {
    path.addEventListener("mouseenter", (e) => {
      const group = findLayerGroup(path);
      if (group) {
        highlightLayer(group.label);
        showTooltip(e, path, group.label);
      }
    });

    path.addEventListener("mouseleave", () => {
      if (highlightedLayer !== findLayerGroup(path)?.label) {
        resetHighlight();
      }
      hideTooltip();
    });

    path.addEventListener("mousemove", (e) => {
      moveTooltip(e);
    });
  });
}

/**
 * Highlight one dialect zone with its original color.
 */
function highlightLayer(layerLabel) {
  resetHighlight();

  if (!svgRoot) return;

  const layerInfo = LAYERS.find((l) => l.label === layerLabel);

  // Find all layer groups with matching inkscape:label
  for (const g of svgRoot.querySelectorAll("g")) {
    const label = g.getAttributeNS?.(NS_INKSCAPE, "label");
    if (label === layerLabel) {
      const paths = g.querySelectorAll("path");
      paths.forEach((p) => {
        if (layerInfo) {
          p.style.fill = layerInfo.fill;
          p.style.fillOpacity = "0.85";
        }
        p.style.stroke = "#333";
        p.style.strokeOpacity = "0.6";
        p.style.filter = "drop-shadow(0 0 2px rgba(0,0,0,0.25))";
      });
    }
  }

  highlightedLayer = layerLabel;
  legend.querySelectorAll(".legend-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.layer === layerLabel);
  });
}

function clearHighlight() {
  resetHighlight();
  highlightedLayer = null;
  legend.querySelectorAll(".legend-item").forEach((item) => {
    item.classList.remove("active");
  });
}

function resetHighlight() {
  if (!svgRoot) return;
  const paths = svgRoot.querySelectorAll("path");
  paths.forEach((p) => {
    p.style.fill = DISABLED_FILL;
    p.style.fillOpacity = "1";
    p.style.stroke = DISABLED_STROKE;
    p.style.strokeOpacity = "1";
    p.style.strokeWidth = "";
    p.style.filter = "";
  });
}

/** Tooltip **/
function showTooltip(event, path, layerName) {
  const name = path.getAttribute("id") || "";
  if (name && !name.startsWith("path")) {
    tooltip.textContent = `${name} — ${layerName}`;
  } else {
    tooltip.textContent = layerName;
  }
  tooltip.classList.add("visible");
  moveTooltip(event);
}

function moveTooltip(event) {
  tooltip.style.left = `${event.clientX + 14}px`;
  tooltip.style.top = `${event.clientY + 14}px`;
}

function hideTooltip() {
  tooltip.classList.remove("visible");
}

// Init
buildLegend();
loadMap();

// Expose for programmatic use (after model inference)
window.euskalkid = {
  highlightLayer,
  clearHighlight,
  LAYERS,
};
