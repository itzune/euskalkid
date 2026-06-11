/**
 * Nongoeuskara — Wire the azpieuskalki WASM model to the chatbar.
 *
 * On each keystroke (debounced 300ms), runs prediction and highlights
 * the predicted azpieuskalki zone on the map. Shows loading status
 * in the prediction badge while the model loads.
 */
import { loadModel, predict } from "/src/azpieuskalki.js";

const textarea = document.getElementById("textInput");
const badge = document.getElementById("predictionBadge");
const badgeSwatch = document.getElementById("predictionSwatch");
const badgeName = document.getElementById("predictionName");

let modelReady = false;
let debounceTimer = null;
const DEBOUNCE_MS = 300;

/**
 * Show initial loading state in the badge.
 */
function showLoading() {
  if (!badge || !badgeSwatch || !badgeName) return;
  badgeSwatch.style.backgroundColor = "transparent";
  badgeName.textContent = "Kargatzen...";
  badge.classList.add("visible");
}

function showReady() {
  if (!badge || !badgeSwatch || !badgeName) return;
  badgeSwatch.style.backgroundColor = "#94a3b8";
  badgeName.textContent = "Idatzi testua";
  badge.classList.add("visible");
  setTimeout(() => {
    if (badgeName.textContent === "Idatzi testua") {
      badge.classList.remove("visible");
    }
  }, 3000);
}

/**
 * Run prediction on current textarea content.
 */
function runPrediction() {
  if (!modelReady) return;

  const text = textarea.value.trim();

  // Clear on empty text
  if (!text) {
    window.euskalkid?.clearHighlight();
    if (badge) badge.classList.remove("visible");
    return;
  }

  try {
    const result = predict(text);

    if (!result.azpieuskalki || result.confidence < 0.1) {
      // Below threshold: clear
      window.euskalkid?.clearHighlight();
      if (badge) badge.classList.remove("visible");
      return;
    }

    // Pin the predicted zone; show the runner-up faintly when it's a real
    // competitor (at least ~1/3 of the top confidence, relative threshold
    // because the quantized model outputs spiky low-magnitude scores).
    const modelLabel = result.azpieuskalki;
    const runnerUp = result.predictions
      .filter((p) => p.label !== modelLabel)
      .sort((a, b) => b.confidence - a.confidence)[0];
    const secondaryLabel =
      runnerUp && runnerUp.confidence >= Math.max(0.05, result.confidence * 0.35)
        ? runnerUp.label
        : null;
    window.euskalkid?.pinLabel(modelLabel, secondaryLabel);
  } catch (err) {
    console.error("Prediction error:", err);
  }
}

/**
 * Debounced input handler.
 */
function onInput() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runPrediction, DEBOUNCE_MS);
}

/**
 * Initialize: load model, wire textarea.
 */
async function init() {
  if (!textarea) return;

  showLoading();

  try {
    await loadModel((msg) => {
      if (msg === "Ready") {
        modelReady = true;
        showReady();
      }
    });
  } catch (err) {
    console.error("Failed to load azpieuskalki model:", err);
    if (badge && badgeName) {
      badgeSwatch.style.backgroundColor = "#ef4444";
      badgeName.textContent = "Errorea";
      badge.classList.add("visible");
    }
    return;
  }

  // Wire textarea input events
  textarea.addEventListener("input", onInput);

  // Also handle paste
  textarea.addEventListener("paste", () => {
    // Let the paste complete, then predict
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runPrediction, DEBOUNCE_MS + 50);
  });

  // Run prediction if text was already present (e.g., page reload)
  if (textarea.value.trim()) {
    runPrediction();
  }
}

init();
