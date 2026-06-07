/**
 * Zeineuski WASM — UI logic
 */
import { loadModels, predict, DIALECT_NAMES, BADGE_CLASS } from "./zeineuski.js";

// ── DOM ──
const $ = (id) => document.getElementById(id);
const el = {
  statusDot: $("statusDot"),
  statusText: $("statusText"),
  sizeHint: $("sizeHint"),
  variantSize: $("variantSize"),
  input: $("input"),
  btnPredict: $("btnPredict"),
  btnClear: $("btnClear"),
  result: $("result"),
  dialectBadge: $("dialectBadge"),
  confidence: $("confidence"),
  confidenceFill: $("confidenceFill"),
  predictionsList: $("predictionsList"),
  exampleCards: $("exampleCards"),
};

// ── Example sentences ──
const EXAMPLES = [
  {
    dialect: "batua",
    text: "Euskal Herriko Unibertsitateak ikastaro berria antolatu du datorren ikasturterako.",
  },
  {
    dialect: "batua",
    text: "Emakumeen aurkako indarkeria matxistaren biktima izan diren emakumeei buruzko dokumentala aurkeztu dute gaur.",
  },
  {
    dialect: "western",
    text: "Baleike espediente judizialak itzuli biher izetie inglesa ez dan hizkuntza batien irakurtzen daben bezeroentzat.",
  },
  {
    dialect: "western",
    text: "Askatasun zibilen historixa tamalgarri horretaz gain, beste hainbat kontu argitzeke dagoz.",
  },
  {
    dialect: "central",
    text: "Gu inguru hontan bizi gea, eta oso gustora gainera.",
  },
  {
    dialect: "central",
    text: "Ezarpen-proiektu baten fase hori osatzeko, gitxi gorabehera 17 hillabete bihar'txu SCRk.",
  },
  {
    dialect: "nav-lab",
    text: "Bena atzuek eskarmentu haundioa zan berko lukete holako lanetan aritzeko.",
  },
  {
    dialect: "nav-lab",
    text: "Ene exenpluik maiteena igela ta uliaina da, beti kontatzen duten bezela.",
  },
];

const DIALECT_COLORS = {
  batua: "#2a9d8f",
  western: "#e76f51",
  central: "#457b9d",
  "nav-lab": "#6d597a",
};

function buildExampleCards() {
  el.exampleCards.innerHTML = EXAMPLES.map((ex, i) => {
    const color = DIALECT_COLORS[ex.dialect];
    const label = DIALECT_NAMES[ex.dialect] || ex.dialect;
    return `
      <div class="example-card" data-idx="${i}">
        <div class="card-header">
          <span class="card-badge" style="background:${color}">${label}</span>
        </div>
        <div class="card-text">${ex.text}</div>
      </div>`;
  }).join("");

  // Attach click handlers
  el.exampleCards.querySelectorAll(".example-card").forEach((card) => {
    card.addEventListener("click", () => {
      const idx = parseInt(card.dataset.idx);
      const ex = EXAMPLES[idx];

      // Visual feedback: highlight selected card
      el.exampleCards.querySelectorAll(".example-card").forEach((c) =>
        c.classList.remove("active")
      );
      card.classList.add("active");

      // Set text + auto-predict
      el.input.value = ex.text;
      doPredict();
    });
  });
}

// ── Buttons ──
el.btnPredict.addEventListener("click", doPredict);
el.btnClear.addEventListener("click", () => {
  el.input.value = "";
  el.result.classList.remove("visible");
  el.exampleCards.querySelectorAll(".example-card").forEach((c) =>
    c.classList.remove("active")
  );
});

el.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    doPredict();
  }
});

// ── Predict ──
function doPredict() {
  const text = el.input.value.trim();
  if (!text) return;

  try {
    const res = predict(text, 0.7);

    const badgeClass = BADGE_CLASS[res.dialect] || "badge-uncertain";
    el.dialectBadge.innerHTML = `<span class="dialect-badge ${badgeClass}">${res.dialectName}</span>`;

    const confPct = (res.confidence * 100).toFixed(1);
    el.confidence.textContent = `${confPct}%`;
    el.confidenceFill.style.width = `${res.confidence * 100}%`;

    // Color the confidence bar
    if (res.confidence >= 0.9) {
      el.confidenceFill.style.background = "var(--green)";
    } else if (res.confidence >= 0.7) {
      el.confidenceFill.style.background = "var(--yellow)";
    } else {
      el.confidenceFill.style.background = "var(--accent)";
    }

    el.predictionsList.innerHTML = "";
    const preds = res.predictions.length > 0
      ? res.predictions
      : [{ label: "batua", confidence: res.confidence || 1.0 }];

    preds.forEach((p) => {
      const li = document.createElement("li");
      const name = DIALECT_NAMES[p.label] || p.label;
      li.innerHTML = `<span class="pred-label">${name}</span><span class="pred-conf">${(p.confidence * 100).toFixed(1)}%</span>`;
      el.predictionsList.appendChild(li);
    });

    el.result.classList.add("visible");

    // Scroll result into view on mobile
    el.result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    console.error("Prediction error:", err);
    el.statusText.textContent = "Prediction error: " + err.message;
  }
}

// ── Initialize ──
async function init() {
  buildExampleCards();

  try {
    await loadModels((msg) => {
      el.statusText.textContent = msg;
      if (msg === "✓ Ready") {
        el.statusDot.className = "status-dot ready";
        el.btnPredict.disabled = false;
        el.sizeHint.style.display = "block";
        el.variantSize.textContent = "34";
      }
    });
  } catch (err) {
    console.error("Failed to load models:", err);
    el.statusDot.className = "status-dot error";
    el.statusText.textContent =
      "Error loading models. Check console for details.";
  }
}

init();
