/* Popup : pilote le script de la page (content.js). Toute la recherche tourne
 * dans la page ; ce popup ne fait qu'envoyer start/stop et afficher l'état. */
const $ = (id) => document.getElementById(id);
let pollTimer = null;

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function send(action, extra = {}) {
  const tab = await activeTab();
  if (!tab || !/^https?:/.test(tab.url || "")) {
    throw new Error("Ouvrez d'abord la page panier d'un site (http/https).");
  }
  try {
    return await chrome.tabs.sendMessage(tab.id, { action, ...extra });
  } catch (e) {
    throw new Error("Script non chargé sur cette page. Rechargez la page panier puis réessayez.");
  }
}

function fmt(n) {
  return n == null ? "—" : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ----- persistance de la liste de codes et du délai ----- */

async function loadPrefs() {
  const { codes, delay } = await chrome.storage.local.get(["codes", "delay"]);
  $("codes").value = (codes && codes.length ? codes : window.PROMO_DEFAULT_CODES).join("\n");
  $("delay").value = delay || 700;
}
function parseCodes() {
  return $("codes").value.split("\n").map((s) => s.trim()).filter(Boolean);
}
async function savePrefs() {
  await chrome.storage.local.set({ codes: parseCodes(), delay: Number($("delay").value) || 700 });
}

/* ----- rendu de l'état ----- */

function render(st) {
  const dot = $("dot"), stext = $("statusText");
  dot.className = "dot";
  if (!st) { stext.textContent = "Prêt."; return; }

  if (st.picking) {
    stext.textContent = st.picking === "field"
      ? "Cliquez sur le champ code promo dans la page…"
      : "Cliquez sur le montant total dans la page…";
  } else {
    stext.textContent = st.message || "Prêt.";
  }

  if (st.running) dot.classList.add("run");
  else if (st.phase === "done" || st.phase === "stopped") dot.classList.add("ok");
  else if (st.phase === "error") dot.classList.add("err");

  // tags détection
  const ft = $("fieldTag"), tt = $("totalTag");
  ft.textContent = "Champ : " + (st.fieldFound ? "OK" : "?");
  ft.className = "tag " + (st.fieldFound ? "good" : "bad");
  tt.textContent = "Total : " + (st.totalFound ? "OK" : "?");
  tt.className = "tag " + (st.totalFound ? "good" : "bad");

  // progression
  const showProg = st.running || st.best || st.phase === "done" || st.phase === "stopped";
  $("progressBox").classList.toggle("hidden", !showProg);
  if (showProg) {
    $("progLabel").textContent = `${st.index}${st.running ? "" : ""} / ${st.count}`;
    $("curCode").textContent = st.running ? (st.currentCode || "") : "";
    $("fill").style.width = st.count ? Math.round((st.index / st.count) * 100) + "%" : "0%";
    $("baseVal").textContent = fmt(st.baseline);
    $("curVal").textContent = fmt(st.currentTotal);
    $("bestVal").textContent = st.best ? fmt(st.best.total) : "—";
    const hasBest = !!st.best;
    $("bestCodeBox").classList.toggle("hidden", !hasBest);
    if (hasBest) {
      $("bestCode").textContent = st.best.code;
      const save = st.baseline != null ? st.baseline - st.best.total : null;
      $("saveVal").textContent = save != null ? `(−${fmt(save)})` : "";
    }
  }

  // boutons
  $("startBtn").classList.toggle("hidden", st.running);
  $("stopBtn").classList.toggle("hidden", !st.running);
}

async function poll() {
  try {
    const st = await send("status");
    render(st);
  } catch (e) {
    render(null);
    $("statusText").textContent = e.message;
    $("fieldTag").className = "tag bad"; $("fieldTag").textContent = "Champ : ?";
    $("totalTag").className = "tag bad"; $("totalTag").textContent = "Total : ?";
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  poll();
  pollTimer = setInterval(poll, 500);
}

/* ----- actions ----- */

$("startBtn").addEventListener("click", async () => {
  try {
    await savePrefs();
    await send("start", { codes: parseCodes(), delay: Number($("delay").value) || 700 });
  } catch (e) { $("statusText").textContent = e.message; }
});
$("stopBtn").addEventListener("click", () => send("stop").catch((e) => ($("statusText").textContent = e.message)));
$("pickFieldBtn").addEventListener("click", () => send("pickField").catch((e) => ($("statusText").textContent = e.message)));
$("pickTotalBtn").addEventListener("click", () => send("pickTotal").catch((e) => ($("statusText").textContent = e.message)));
$("detectBtn").addEventListener("click", () => send("detect").catch((e) => ($("statusText").textContent = e.message)));
$("saveCodes").addEventListener("click", async () => { await savePrefs(); $("statusText").textContent = "Liste enregistrée."; });
$("resetCodes").addEventListener("click", async () => {
  $("codes").value = window.PROMO_DEFAULT_CODES.join("\n");
  await savePrefs();
  $("statusText").textContent = "Liste par défaut restaurée.";
});

loadPrefs();
startPolling();
