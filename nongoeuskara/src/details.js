/**
 * Nongoeuskara — "Xehetasunak" modal with the full output of all 3 models:
 *
 *   1. Binary:  batua vs dialectal        (hier_binary_web.bin, ~21MB)
 *   2. Dialect: 5-class euskalki          (hier_dialect_web.bin, ~13MB)
 *   3. Sub-dialect: 12-class azpieuskalki (azpieuskalki_q.bin, already loaded)
 *
 * The azpieuskalki model is always loaded for the map; the two zeineuski
 * models are lazy-loaded the first time the modal opens to keep the page
 * light. Includes a traceability section (label mapping, Ahotsak towns,
 * model files).
 */
import { predict as predictAzpi } from "/src/azpieuskalki.js";
import {
  loadModels as loadZeineuski,
  predictDetailed,
  DIALECT_NAMES,
} from "/src/zeineuski.js";

const HF_REPO = "https://huggingface.co/itzune/zeineuski";

const BINARY_NAMES = {
  batua: "Euskara batua",
  dialectal: "Euskalkia (ez-batua)",
};

const BINARY_COLORS = {
  batua: "#2a9d8f",
  dialectal: "#e85d75",
};

const DIALECT_COLORS = {
  batua: "#2a9d8f",
  western: "#e76f51",
  central: "#457b9d",
  "nav-lab": "#6d597a",
  navarrese: "#10b981",
  souletin: "#14b8a6",
};

const textarea = document.getElementById("textInput");
const badgeDetails = document.getElementById("badgeDetails");
const modal = document.getElementById("detailsModal");
const modalBody = document.getElementById("modalBody");
const modalClose = document.getElementById("modalClose");

let zeineuskiReady = false;
let zeineuskiLoading = null;

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

/** One prediction row: name + confidence bar + percentage. */
function row(name, confidence, color) {
  const pct = Math.max(0, Math.min(100, confidence * 100));
  return `
    <div class="detail-row">
      <span class="detail-row-name">${esc(name)}</span>
      <span class="detail-row-bar"><span style="width:${pct.toFixed(1)}%;background:${color}"></span></span>
      <span class="detail-row-pct">${pct.toFixed(1)}%</span>
    </div>`;
}

function section(title, bodyHtml) {
  return `
    <section class="detail-section">
      <h3>${title}</h3>
      ${bodyHtml}
    </section>`;
}

function renderAzpiSection(azpiResult) {
  const labels = window.euskalkid?.MODEL_LABELS || {};
  const rows = azpiResult.predictions
    .map((p) => {
      const info = labels[p.label];
      return row(info?.name || p.label, p.confidence, info?.color || "#94a3b8");
    })
    .join("");
  return section("3 · Azpieuskalkia (12 klase)", rows || "<p class='detail-empty'>—</p>");
}

function renderZeineuskiSections(detailed) {
  const binRows = detailed.binary
    .map((p) =>
      row(BINARY_NAMES[p.label] || p.label, p.confidence, BINARY_COLORS[p.label] || "#94a3b8")
    )
    .join("");
  const dialRows = detailed.dialect
    .map((p) =>
      row(DIALECT_NAMES[p.label] || p.label, p.confidence, DIALECT_COLORS[p.label] || "#94a3b8")
    )
    .join("");
  return (
    section("1 · Batua ala euskalkia?", binRows || "<p class='detail-empty'>—</p>") +
    section("2 · Euskalkia (5 klase)", dialRows || "<p class='detail-empty'>—</p>")
  );
}

function renderTraceSection(azpiResult) {
  const label = azpiResult.azpieuskalki;
  const labels = window.euskalkid?.MODEL_LABELS || {};
  const euskalkiOf = window.euskalkid?.EUSKALKI_OF || {};
  const euskalkiNames = window.euskalkid?.EUSKALKI_NAMES || {};

  let mapping = "";
  if (label) {
    const eus = euskalkiNames[euskalkiOf[label]] || "—";
    mapping = `<p><strong>Etiketa:</strong> <code>${esc(label)}</code> → ${esc(eus)} (euskalkia)</p>`;
  }

  let towns = "";
  if (azpiResult.towns?.length) {
    const sample = azpiResult.towns.slice(0, 12).join(", ");
    const more = azpiResult.towns.length > 12 ? ` … (${azpiResult.towns.length} herri)` : "";
    towns = `<p><strong>Ahotsak herriak:</strong> ${esc(sample)}${esc(more)}</p>`;
  }

  return section(
    "Trazabilitatea",
    `${mapping}${towns}
     <p><strong>Ereduak</strong> (<a href="${HF_REPO}" target="_blank" rel="noopener">HuggingFace: itzune/zeineuski</a>):</p>
     <ul class="detail-models">
       <li><code>hier_binary_web.bin</code> — batua / dialektala (21MB)</li>
       <li><code>hier_dialect_web.bin</code> — 5 euskalki (13MB)</li>
       <li><code>azpieuskalki_q.bin</code> — 12 azpieuskalki, kuantizatua</li>
     </ul>
     <p><strong>Datuak:</strong> <a href="https://ahotsak.eus/" target="_blank" rel="noopener">Ahotsak.eus</a> herri-esleipenak (430 herri, 19 etiketa → 12 klase)</p>`
  );
}

function render(text) {
  let azpiResult;
  try {
    azpiResult = predictAzpi(text);
  } catch {
    modalBody.innerHTML = "<p class='detail-empty'>Eredua ez dago kargatuta.</p>";
    return;
  }

  const azpiHtml = renderAzpiSection(azpiResult);
  const traceHtml = renderTraceSection(azpiResult);

  if (zeineuskiReady) {
    modalBody.innerHTML = renderZeineuskiSections(predictDetailed(text)) + azpiHtml + traceHtml;
    return;
  }

  // zeineuski models not yet loaded: show what we have + loading placeholder
  modalBody.innerHTML =
    `<section class="detail-section"><h3>1–2 · Batua / Euskalkia</h3>
       <p class="detail-empty" id="zeineuskiStatus">Ereduak kargatzen (34MB)…</p>
     </section>` +
    azpiHtml +
    traceHtml;

  zeineuskiLoading ||= loadZeineuski((msg) => {
    const el = document.getElementById("zeineuskiStatus");
    if (el) el.textContent = msg;
  })
    .then(() => {
      zeineuskiReady = true;
    })
    .catch((err) => {
      console.error("Failed to load zeineuski models:", err);
      zeineuskiLoading = null;
      const el = document.getElementById("zeineuskiStatus");
      if (el) el.textContent = "Errorea ereduak kargatzean.";
      throw err;
    });

  zeineuskiLoading.then(() => {
    // Re-render only if the modal is still open with the same text
    if (modal.classList.contains("open") && textarea.value.trim() === text) {
      render(text);
    }
  }).catch(() => {});
}

function openModal() {
  const text = textarea?.value.trim();
  if (!text) return;
  modal.classList.add("open");
  render(text);
}

function closeModal() {
  modal.classList.remove("open");
}

if (badgeDetails && modal && modalBody) {
  badgeDetails.addEventListener("click", openModal);
  modalClose?.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) closeModal();
  });
}
