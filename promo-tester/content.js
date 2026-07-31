/* Promo Code Tester — script injecté dans la page.
 * Rôle : détecter le champ code promo + le bouton « appliquer » + le total,
 * essayer une liste de codes, mémoriser celui qui donne le total le plus bas,
 * puis réappliquer le meilleur à l'arrêt. Tout l'état vit ici (le popup peut
 * se fermer sans interrompre la recherche).
 */
(function () {
  if (window.__promoTesterLoaded) return;
  window.__promoTesterLoaded = true;

  const FIELD_RE = /(promo|coupon|voucher|discount|gift[\s-]?card|code|rabais|r[ée]duc|bon|cadeau)/i;
  const APPLY_RE = /(appliquer|valider|utiliser|ajouter|ok|apply|redeem|submit|add|use|activer)/i;
  const TOTAL_RE = /(total|à\s*payer|a\s*payer|montant|net\s*à\s*payer|order\s*total|grand\s*total|amount\s*due|sous[\s-]?total|subtotal)/i;
  // déclencheur qui déplie/ouvre le champ code promo (accordéon, modale…)
  const OPENER_RE = /((ajouter|saisir|entrer|utiliser|renseigner|j['e]?\s*ai|avez[\s-]?vous)[^]{0,20}code|code\s*(promo|avantage|cadeau|de\s*r[ée]duction)|bon\s*de\s*r[ée]duc\w*|promo\s*code|coupon|voucher)/i;

  const state = {
    running: false,
    phase: "idle",           // idle | running | done | stopped | error
    message: "",
    codes: [],
    index: 0,
    delay: 700,
    baseline: null,
    currentTotal: null,
    currentCode: "",
    best: null,              // { code, total }
    field: null,
    applyBtn: null,
    totalEl: null,
    opener: null,            // déclencheur « Ajouter un code promo » (panneau repliable)
    error: "",
  };

  let picking = null;         // "field" | "total" | "opener" | null
  let pickOverlayCleanup = null;
  let widgetHost = null;      // panneau flottant déplaçable injecté dans la page
  let widgetTimer = null;

  /* ---------- utilitaires ---------- */

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Clic « réaliste » : beaucoup de sites (React/Vue) n'ouvrent leur volet que
  // sur une vraie séquence pointer/souris, pas sur un simple .click().
  function clickReal(el) {
    if (!el) return;
    const o = { bubbles: true, cancelable: true, view: window };
    try { el.scrollIntoView({ block: "center" }); } catch (e) {}
    try { el.dispatchEvent(new PointerEvent("pointerover", { ...o, pointerType: "mouse" })); } catch (e) {}
    try { el.dispatchEvent(new PointerEvent("pointerdown", { ...o, pointerType: "mouse" })); } catch (e) {}
    el.dispatchEvent(new MouseEvent("mousedown", o));
    try { el.focus(); } catch (e) {}
    try { el.dispatchEvent(new PointerEvent("pointerup", { ...o, pointerType: "mouse" })); } catch (e) {}
    el.dispatchEvent(new MouseEvent("mouseup", o));
    try { el.click(); } catch (e) { el.dispatchEvent(new MouseEvent("click", o)); }
  }

  function isVisible(el) {
    if (!el) return false;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function attrsOf(el) {
    return [
      el.id, el.name, el.className,
      el.getAttribute("placeholder"), el.getAttribute("aria-label"),
      el.getAttribute("data-testid"), el.getAttribute("title"),
    ].filter(Boolean).join(" ");
  }

  function parsePrice(str) {
    if (str == null) return null;
    const m = String(str).match(/-?\d[\d., \s]*\d|\d/);
    if (!m) return null;
    let s = m[0].replace(/[\s ]/g, "");
    const hasComma = s.includes(","), hasDot = s.includes(".");
    let norm;
    if (hasComma && hasDot) {
      norm = s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
    } else if (hasComma) {
      const p = s.split(",");
      norm = (p.length === 2 && p[1].length === 2) ? p[0] + "." + p[1] : s.replace(/,/g, "");
    } else if (hasDot) {
      const p = s.split(".");
      norm = (p.length === 2 && p[1].length === 2) ? s : s.replace(/\./g, "");
    } else {
      norm = s;
    }
    const v = parseFloat(norm);
    return isNaN(v) ? null : v;
  }

  /* ---------- détection automatique ---------- */

  function findField() {
    if (state.field && document.contains(state.field) && isVisible(state.field)) return state.field;
    const inputs = [...document.querySelectorAll("input")].filter((el) => {
      const t = (el.type || "text").toLowerCase();
      return ["text", "search", "", "tel"].includes(t) && isVisible(el) && !el.disabled;
    });
    // 1) champ dont les attributs évoquent un code promo
    let hit = inputs.find((el) => FIELD_RE.test(attrsOf(el)));
    // 2) sinon champ dont le label/voisinage évoque un code promo
    if (!hit) {
      hit = inputs.find((el) => {
        const around = (el.closest("form,div,section,li") || el.parentElement);
        return around && FIELD_RE.test(around.textContent || "");
      });
    }
    state.field = hit || null;
    return state.field;
  }

  function findApplyButton(field) {
    if (state.applyBtn && document.contains(state.applyBtn) && isVisible(state.applyBtn)) return state.applyBtn;
    if (!field) return null;
    const scope = field.closest("form,div,section,li") || document.body;
    const btns = [...scope.querySelectorAll('button, input[type=submit], input[type=button], a[role=button]')]
      .filter(isVisible);
    let hit = btns.find((b) => APPLY_RE.test((b.textContent || "") + " " + attrsOf(b)));
    if (!hit) {
      // bouton visible le plus proche après le champ
      hit = btns.find((b) => field.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) || btns[0];
    }
    state.applyBtn = hit || null;
    return state.applyBtn;
  }

  // Déclencheur qui déplie le champ code promo (ex. « Ajouter un code promo »).
  function findOpener() {
    if (state.opener && document.contains(state.opener) && isVisible(state.opener)) return state.opener;
    const matches = (el) => {
      if (!isVisible(el) || el === state.applyBtn) return false;
      const txt = (el.textContent || "").trim();
      if (!txt || txt.length > 45) return false;
      if (APPLY_RE.test(txt) && !OPENER_RE.test(txt)) return false; // pas « Appliquer »
      return OPENER_RE.test(txt) || OPENER_RE.test(attrsOf(el));
    };
    // 1) éléments clairement cliquables
    let hit = [...document.querySelectorAll(
      "button, a, summary, [role=button], [role=link], [aria-controls], [aria-expanded]"
    )].find(matches);
    // 2) repli : n'importe quel élément court avec un curseur « pointer »
    if (!hit) {
      hit = [...document.querySelectorAll("label, span, div, p, li")].find((el) => {
        if (!matches(el) || el.querySelector("input")) return false;
        try { return getComputedStyle(el).cursor === "pointer"; } catch (e) { return false; }
      });
    }
    state.opener = hit || null;
    return state.opener;
  }

  // Garantit que le champ est présent et visible : rouvre le panneau si besoin.
  async function ensureFieldReady() {
    let field = findField();
    if (field && isVisible(field)) return field;
    // jusqu'à 2 tentatives d'ouverture (le volet peut mettre du temps à répondre)
    for (let attempt = 0; attempt < 2; attempt++) {
      const opener = findOpener();
      if (!opener) break;
      clickReal(opener);
      for (let i = 0; i < 18; i++) {
        await sleep(120);
        state.field = null;            // force une nouvelle recherche
        field = findField();
        if (field && isVisible(field)) return field;
      }
    }
    return findField();
  }

  function findTotal() {
    if (state.totalEl && document.contains(state.totalEl)) return state.totalEl;
    const candidates = [];
    const all = document.querySelectorAll("body *");
    for (const el of all) {
      if (el.children.length > 3) continue;              // on veut des feuilles
      const txt = (el.textContent || "").trim();
      if (txt.length > 60) continue;
      if (!TOTAL_RE.test(txt) && !TOTAL_RE.test(attrsOf(el))) continue;
      const price = parsePrice(txt) ?? parsePrice((el.parentElement && el.parentElement.textContent) || "");
      if (price == null) continue;
      if (!isVisible(el)) continue;
      const isGrand = /(net\s*à\s*payer|grand\s*total|order\s*total|total\s*(ttc|à\s*payer)?|amount\s*due|à\s*payer)/i.test(txt);
      const isSub = /(sous[\s-]?total|subtotal)/i.test(txt);
      candidates.push({ el, price, score: (isGrand ? 2 : 0) - (isSub ? 1 : 0) });
    }
    if (!candidates.length) return null;
    // meilleur score, puis le plus bas dans la page (souvent le total final)
    candidates.sort((a, b) => (b.score - a.score) ||
      (b.el.getBoundingClientRect().top - a.el.getBoundingClientRect().top));
    state.totalEl = candidates[0].el;
    return state.totalEl;
  }

  function readTotal() {
    const el = findTotal();
    if (!el) return null;
    return parsePrice(el.textContent) ??
           parsePrice(el.parentElement && el.parentElement.textContent);
  }

  /* ---------- saisie du code ---------- */

  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function applyCode(code) {
    const field = await ensureFieldReady();
    if (!field) throw new Error("no-field");
    field.focus();
    setNativeValue(field, "");
    await sleep(30);
    setNativeValue(field, code);
    await sleep(60);
    const btn = findApplyButton(field);
    if (btn) {
      clickReal(btn);
    } else {
      // pas de bouton : on tente Entrée + submit du formulaire
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
      field.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", keyCode: 13, bubbles: true }));
      const form = field.closest("form");
      if (form && form.requestSubmit) form.requestSubmit();
    }
  }

  // Attend que le total se stabilise (2 lectures identiques) ou le délai max.
  async function waitForTotal(maxMs) {
    const start = Date.now();
    let last = readTotal(), stable = 0;
    while (Date.now() - start < maxMs) {
      await sleep(150);
      const now = readTotal();
      if (now != null && now === last) {
        if (++stable >= 2) return now;
      } else {
        stable = 0;
      }
      last = now;
    }
    return last;
  }

  /* ---------- boucle principale ---------- */

  async function run() {
    state.error = "";
    const field = await ensureFieldReady();
    if (!field) { fail("Champ « code promo » introuvable. Ouvrez le panneau code promo, ou sélectionnez le champ / le bouton d'ouverture manuellement."); return; }
    if (!findTotal()) { fail("Total introuvable. Sélectionnez le total manuellement (bouton dans l'extension)."); return; }

    state.baseline = readTotal();
    state.currentTotal = state.baseline;
    state.best = null;
    state.phase = "running";
    state.message = "Recherche en cours…";

    let noFieldStreak = 0;
    for (state.index = 0; state.index < state.codes.length; state.index++) {
      if (!state.running) break;
      const code = state.codes[state.index];
      state.currentCode = code;
      try {
        await applyCode(code);
        noFieldStreak = 0;
      } catch (e) {
        // le volet ne s'est pas rouvert : on n'abandonne pas tout de suite
        if (++noFieldStreak >= 3) {
          fail("Le champ code promo reste introuvable après réouverture. Cliquez sur « 🎯 Ouvrir » puis sur le bouton « Ajouter un code promo » de la page, et relancez.");
          return;
        }
        await sleep(state.delay);
        continue;
      }
      const total = await waitForTotal(Math.max(state.delay, 500));
      state.currentTotal = total;
      if (total != null && (state.best == null ? total < (state.baseline ?? Infinity) : total < state.best.total)) {
        state.best = { code, total };
        state.message = `Nouveau meilleur code : ${code}`;
      }
      await sleep(state.delay);
    }

    // fin ou arrêt : on réapplique le meilleur code trouvé
    state.running = false;
    if (state.best) {
      state.message = `Réapplication du meilleur code : ${state.best.code}`;
      try {
        await applyCode(state.best.code);
        await waitForTotal(Math.max(state.delay, 800));
      } catch (e) { /* ignore */ }
      state.currentTotal = readTotal();
      state.phase = state.index >= state.codes.length ? "done" : "stopped";
      state.message = `Meilleur code appliqué : ${state.best.code} (total ${fmt(state.best.total)})`;
    } else {
      state.phase = state.index >= state.codes.length ? "done" : "stopped";
      state.message = "Aucun code n'a réduit le total.";
      // on remet le champ propre
      const f = findField();
      if (f) setNativeValue(f, "");
    }
  }

  function fmt(n) { return n == null ? "?" : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function fail(msg) {
    state.running = false;
    state.phase = "error";
    state.error = msg;
    state.message = msg;
  }

  /* ---------- sélection manuelle (clic) ---------- */

  function startPicking(kind) {
    stopPicking();
    picking = kind;
    document.body.style.cursor = "crosshair";
    const inWidget = (e) => widgetHost && e.composedPath && e.composedPath().includes(widgetHost);
    const onOver = (e) => { if (inWidget(e)) return; e.target.style.outline = "2px solid #ff3b6b"; e.target.style.outlineOffset = "1px"; };
    const onOut = (e) => { if (inWidget(e)) return; e.target.style.outline = ""; };
    const onClick = (e) => {
      if (inWidget(e)) return;   // ne pas capturer les clics sur notre propre panneau
      e.preventDefault(); e.stopPropagation();
      if (kind === "field") { state.field = e.target.closest("input") || e.target; state.message = "Champ enregistré ✓"; }
      else if (kind === "opener") { state.opener = e.target.closest("button, a, summary, label, [role=button]") || e.target; state.message = "Bouton d'ouverture enregistré ✓ — cliquez « Lancer la recherche »."; }
      else { state.totalEl = e.target; state.message = "Total enregistré ✓"; }
      stopPicking();
    };
    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mouseout", onOut, true);
    document.addEventListener("click", onClick, true);
    pickOverlayCleanup = () => {
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("mouseout", onOut, true);
      document.removeEventListener("click", onClick, true);
      document.querySelectorAll('[style*="outline"]').forEach((el) => (el.style.outline = ""));
      document.body.style.cursor = "";
    };
  }
  function stopPicking() {
    picking = null;
    if (pickOverlayCleanup) { pickOverlayCleanup(); pickOverlayCleanup = null; }
  }

  /* ---------- panneau flottant déplaçable (injecté dans la page) ----------
   * Contrairement au popup de la barre d'outils, ce panneau vit dans la page :
   * on peut le glisser où on veut pour dégager le champ code promo, et il ne se
   * ferme pas quand on clique ailleurs.
   */
  async function startFromStorage() {
    if (state.running) return;
    let codes = [], delay = 700;
    try { const g = await chrome.storage.local.get(["codes", "delay"]); codes = g.codes || []; delay = g.delay || 700; } catch (e) {}
    state.codes = codes.length ? codes : (window.PROMO_DEFAULT_CODES || []);
    state.delay = Math.max(150, delay);
    state.running = true;
    state.index = 0;
    run();
  }

  function mountWidget() {
    if (widgetHost && document.documentElement.contains(widgetHost)) { widgetHost.style.display = "block"; return; }
    widgetHost = document.createElement("div");
    widgetHost.id = "__promoTesterWidget";
    widgetHost.style.cssText = "all:initial; position:fixed; top:80px; right:20px; z-index:2147483647;";
    const root = widgetHost.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host,* { box-sizing:border-box; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
        .w { width:270px; background:#1c1f28; color:#eef1f7; border:1px solid #2c313d; border-radius:12px;
             box-shadow:0 12px 34px rgba(0,0,0,.5); overflow:hidden; font-size:13px; }
        .hd { display:flex; align-items:center; gap:6px; padding:9px 10px; background:#14161c; cursor:move; user-select:none; }
        .hd b { flex:1; font-size:13px; }
        .hd button { background:none; border:none; color:#97a0b3; cursor:pointer; font-size:15px; line-height:1; padding:2px 4px; }
        .bd { padding:10px; }
        .st { background:#232733; border:1px solid #2c313d; border-radius:8px; padding:8px; margin-bottom:9px; min-height:34px; }
        .st .msg { font-weight:600; }
        .st .best { color:#2ec16a; margin-top:4px; font-size:12px; }
        .tags { margin-top:6px; display:flex; gap:5px; }
        .tag { font-size:10.5px; padding:1px 6px; border-radius:20px; border:1px solid #2c313d; color:#97a0b3; }
        .tag.ok { color:#2ec16a; border-color:#2ec16a55; }
        .tag.no { color:#ff7a7a; border-color:#ff7a7a55; }
        button.b { width:100%; cursor:pointer; border:1px solid #2c313d; border-radius:8px; padding:9px; font-weight:600; color:#eef1f7; background:#232733; margin-bottom:7px; }
        button.b:hover { filter:brightness(1.15); }
        .b.go { background:#ff3b6b; border-color:#ff3b6b; }
        .b.stop { background:#33262b; border-color:#ff3b6b; color:#ff3b6b; }
        .b.find { background:#23303a; border-color:#3aa0ff; color:#7ec2ff; }
        .row { display:flex; gap:6px; }
        .row .b { font-size:12px; font-weight:500; }
        .hint { color:#97a0b3; font-size:10.5px; margin:2px 0 0; line-height:1.35; }
      </style>
      <div class="w">
        <div class="hd" id="hd"><span>🏷️</span><b>Promo Code Tester</b><button id="min" title="Réduire">–</button><button id="cls" title="Fermer">✕</button></div>
        <div class="bd" id="bd">
          <div class="st"><div class="msg" id="msg">Prêt.</div><div class="best" id="best"></div>
            <div class="tags"><span class="tag" id="tF">Champ</span><span class="tag" id="tO">Ouvrir</span><span class="tag" id="tT">Total</span></div>
          </div>
          <button class="b go" id="go">▶ Lancer la recherche</button>
          <button class="b stop" id="stop" style="display:none">■ Stopper &amp; garder le meilleur</button>
          <button class="b find" id="find">🔎 Trouver les codes du site</button>
          <div class="row"><button class="b" id="pO">🎯 Ouvrir</button><button class="b" id="pF">🎯 Champ</button><button class="b" id="pT">🎯 Total</button></div>
          <p class="hint">Glissez la barre du haut pour déplacer ce panneau et dégager le champ. « 🎯 Ouvrir » = le bouton « Ajouter un code promo ».</p>
        </div>
      </div>`;
    document.documentElement.appendChild(widgetHost);

    const $ = (id) => root.getElementById(id);
    $("go").addEventListener("click", () => startFromStorage());
    $("stop").addEventListener("click", () => { state.running = false; });
    $("pO").addEventListener("click", () => startPicking("opener"));
    $("pF").addEventListener("click", () => startPicking("field"));
    $("pT").addEventListener("click", () => startPicking("total"));
    $("find").addEventListener("click", async () => {
      $("find").textContent = "🔎 Analyse…";
      try {
        const found = await collectSiteCodes();
        if (found.length) {
          const g = await chrome.storage.local.get(["codes"]);
          const merged = [...new Set([...found, ...(g.codes || window.PROMO_DEFAULT_CODES || [])])];
          await chrome.storage.local.set({ codes: merged });
          state.message = `${found.length} code(s) trouvé(s) sur le site, ajoutés en tête.`;
        } else {
          state.message = "Aucun code détecté dans la page.";
        }
      } catch (e) { state.message = "Découverte impossible ici."; }
      $("find").textContent = "🔎 Trouver les codes du site";
    });
    $("cls").addEventListener("click", unmountWidget);
    $("min").addEventListener("click", () => {
      const bd = $("bd"); bd.style.display = bd.style.display === "none" ? "block" : "none";
    });

    // glisser-déposer via la barre de titre
    $("hd").addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") return;
      e.preventDefault();
      const r = widgetHost.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      const move = (ev) => {
        widgetHost.style.left = Math.max(0, ev.clientX - ox) + "px";
        widgetHost.style.top = Math.max(0, ev.clientY - oy) + "px";
        widgetHost.style.right = "auto";
      };
      const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });

    if (widgetTimer) clearInterval(widgetTimer);
    widgetTimer = setInterval(() => updateWidget(root), 400);
    updateWidget(root);
  }

  function updateWidget(root) {
    if (!widgetHost) return;
    const $ = (id) => root.getElementById(id);
    $("msg").textContent = picking
      ? (picking === "field" ? "Cliquez sur le champ code promo…" : picking === "opener" ? "Cliquez sur « Ajouter un code promo »…" : "Cliquez sur le total…")
      : (state.message || "Prêt.");
    $("best").textContent = state.best ? `Meilleur : ${state.best.code} → ${fmt(state.best.total)}` +
      (state.baseline != null ? ` (−${fmt(state.baseline - state.best.total)})` : "") : "";
    const setTag = (id, ok) => { const el = $(id); el.className = "tag " + (ok ? "ok" : "no"); };
    setTag("tF", !!(state.field || findField()));
    setTag("tO", !!(state.opener || findOpener()));
    setTag("tT", !!state.totalEl);
    $("go").style.display = state.running ? "none" : "block";
    $("stop").style.display = state.running ? "block" : "none";
  }

  function unmountWidget() {
    if (widgetTimer) { clearInterval(widgetTimer); widgetTimer = null; }
    if (widgetHost) { widgetHost.remove(); widgetHost = null; }
  }

  /* ---------- découverte des codes présents dans la page ----------
   * On lit UNIQUEMENT ce que le site a déjà envoyé à ce navigateur : texte
   * visible, HTML, scripts en ligne, objets globaux (dataLayer, __NEXT_DATA__…)
   * et scripts same-origin déjà chargés. Aucune requête pour « deviner » des
   * codes côté serveur, aucun accès à quoi que ce soit de privé.
   */
  const CODE_STOP = new Set([
    "CODE", "PROMO", "COUPON", "VOUCHER", "DISCOUNT", "PROMOCODE", "COUPONCODE",
    "NULL", "TRUE", "FALSE", "UNDEFINED", "TOTAL", "PRICE", "VALUE", "AMOUNT",
    "EMAIL", "LOGIN", "PASSWORD", "SUBMIT", "BUTTON", "ERROR", "SUCCESS",
    "FUNCTION", "RETURN", "STRING", "NUMBER", "OBJECT", "DEFAULT", "ENABLED",
  ]);

  function addCandidate(out, raw) {
    if (!raw) return;
    let c = raw.trim().toUpperCase();
    if (c.length < 3 || c.length > 22) return;
    if (!/[A-Z]/.test(c)) return;                 // au moins une lettre
    if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(c)) return;
    if (CODE_STOP.has(c)) return;
    // doit ressembler à un code : chiffre présent, OU tout en capitales (>=4)
    const looksCode = /\d/.test(c) || (raw === raw.toUpperCase() && c.length >= 4);
    if (!looksCode) return;
    out.add(c);
  }

  function scanText(text, out) {
    if (!text || out.size > 400) return;
    // 1) mot-clé de contexte suivi d'un token (« code: SUMMER20 », « coupon=WELCOME10 »)
    const ctx = /(?:code(?:\s*promo)?|coupon|voucher|promo(?:tion)?|rabais|r[ée]duc\w*|bon\s*(?:de|d')?\s*r[ée]duc\w*|discount|use\s*code|utilisez?[^.<>{}]{0,15}code)[\s:="'>\]\-]{0,8}([A-Za-z0-9][A-Za-z0-9._-]{2,21})/gi;
    let m;
    while ((m = ctx.exec(text)) && out.size <= 400) addCandidate(out, m[1]);
    // 2) clés JSON de type coupon/promo/voucher/discount
    const key = /"[a-z_]*(?:coupon|promo|voucher|discount|rabais)[a-z_]*(?:code|_code)?"\s*:\s*"([A-Za-z0-9._-]{3,21})"/gi;
    while ((m = key.exec(text)) && out.size <= 400) addCandidate(out, m[1]);
  }

  async function collectSiteCodes() {
    const out = new Set();
    // texte visible + HTML complet
    try { scanText(document.body.innerText, out); } catch (e) {}
    try { scanText(document.documentElement.outerHTML, out); } catch (e) {}
    // objets globaux fréquents
    for (const k of ["dataLayer", "__NEXT_DATA__", "__NUXT__", "__INITIAL_STATE__", "__APOLLO_STATE__", "__PRELOADED_STATE__"]) {
      try { if (window[k]) scanText(JSON.stringify(window[k]), out); } catch (e) {}
    }
    // scripts en ligne
    try { for (const s of document.scripts) if (!s.src && s.textContent) scanText(s.textContent, out); } catch (e) {}
    // scripts same-origin déjà chargés (relecture depuis le cache, best effort)
    try {
      const urls = [...document.scripts].map((s) => s.src).filter(Boolean).filter((u) => {
        try { return new URL(u, location.href).origin === location.origin; } catch (e) { return false; }
      }).slice(0, 8);
      await Promise.all(urls.map(async (u) => {
        try {
          const r = await fetch(u, { credentials: "omit" });
          if (r.ok) scanText(await r.text(), out);
        } catch (e) {}
      }));
    } catch (e) {}
    return [...out];
  }

  /* ---------- messagerie avec le popup ---------- */

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.action) {
      case "ping":
        sendResponse({ ok: true });
        break;
      case "start":
        if (state.running) { sendResponse({ ok: false, error: "already-running" }); break; }
        state.codes = (msg.codes && msg.codes.length ? msg.codes : (window.PROMO_DEFAULT_CODES || []));
        state.delay = Math.max(150, msg.delay || 700);
        state.running = true;
        state.index = 0;
        run();
        sendResponse({ ok: true });
        break;
      case "stop":
        state.running = false;
        sendResponse({ ok: true });
        break;
      case "reapplyBest":
        if (state.best) applyCode(state.best.code);
        sendResponse({ ok: true, best: state.best });
        break;
      case "pickField":
        startPicking("field");
        sendResponse({ ok: true });
        break;
      case "pickTotal":
        startPicking("total");
        sendResponse({ ok: true });
        break;
      case "pickOpener":
        startPicking("opener");
        sendResponse({ ok: true });
        break;
      case "showWidget":
        mountWidget();
        sendResponse({ ok: true });
        break;
      case "hideWidget":
        unmountWidget();
        sendResponse({ ok: true });
        break;
      case "discover":
        collectSiteCodes().then((codes) => sendResponse({ ok: true, codes }))
          .catch(() => sendResponse({ ok: true, codes: [] }));
        return true;   // réponse asynchrone
      case "detect": {
        const f = findField(), t = findTotal();
        sendResponse({ ok: true, field: !!f, total: !!t, totalValue: readTotal() });
        break;
      }
      case "status":
        sendResponse({
          ok: true,
          running: state.running,
          phase: state.phase,
          message: state.message,
          picking,
          index: state.index,
          count: state.codes.length,
          currentCode: state.currentCode,
          currentTotal: state.currentTotal,
          baseline: state.baseline,
          best: state.best,
          fieldFound: !!(state.field || findField()),
          totalFound: !!(state.totalEl),
          openerFound: !!(state.opener || findOpener()),
        });
        break;
      default:
        sendResponse({ ok: false, error: "unknown-action" });
    }
    return true;
  });
})();
