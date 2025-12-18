(() => {
  const { FG_DATA } = window;

  // ---------- helpers ----------
  const qs = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));
  const clampInt = (v, min, max) => Math.max(min, Math.min(max, (v|0)));
  const escapeHtml = (str) => String(str ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");

  // ---------- THEME ----------
  const root = document.documentElement;
  let theme = localStorage.getItem("fg_theme") || "dark";
  root.setAttribute("data-theme", theme);
  qs("#themeToggle")?.addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", theme);
    localStorage.setItem("fg_theme", theme);
  });

  // ---------- LANGUAGE ----------
  let lang = localStorage.getItem("fg_lang") || "en";
  const langSelect = qs("#langSelect");
  if (langSelect) langSelect.value = lang;

  function applyLanguage(){
    const t = FG_DATA.translations?.[lang] || FG_DATA.translations?.en;
    if (!t) return;
    const map = [
      ["troubleshooter", t.troubleshooter],
      ["parts", t.parts],
      ["orders", t.order],
      ["mechanics", t.mechanics],
      ["onboarding", t.onboarding],
      ["pricing", t.pricing],
      ["admin", t.admin],
    ];
    for (const [view, text] of map){
      const btn = document.querySelector(`.nav-btn[data-view="${view}"]`);
      if (btn) btn.textContent = text;
    }
    // Basic RTL for Arabic
    document.documentElement.dir = (lang === "ar") ? "rtl" : "ltr";
  }

  langSelect?.addEventListener("change", (e) => {
    lang = e.target.value;
    localStorage.setItem("fg_lang", lang);
    applyLanguage();
  });

  // ---------- CURRENCY ----------
  let activeCurrency = localStorage.getItem("fg_currency") || (FG_DATA.currency?.base || "NGN");
  function buildCurrencySelect(){
    const sel = qs("#currencySelect");
    if (!sel) return;
    const codes = Object.keys(FG_DATA.currency.rates || {NGN:1});
    sel.innerHTML = codes.map(code => {
      const sym = FG_DATA.currency.symbols?.[code] || "";
      return `<option value="${code}">${code} ${sym}</option>`;
    }).join("");
    sel.value = activeCurrency;
    sel.addEventListener("change", e => {
      activeCurrency = e.target.value;
      localStorage.setItem("fg_currency", activeCurrency);
      renderParts();
      renderCart();
    });
  }

  const money = (ngnPrice) => {
    const rate = FG_DATA.currency?.rates?.[activeCurrency] ?? 1;
    const symbol = FG_DATA.currency?.symbols?.[activeCurrency] ?? "";
    const converted = (Number(ngnPrice) || 0) * rate;
    return `${symbol}${converted.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  // ---------- VIEW NAV ----------
  const state = {
    view: "troubleshooter",
    selectedSymptomId: null,
    wizardAnswers: {},
    cart: loadCart(),
    tier: localStorage.getItem("fg_tier") || "FREE",
    fitment: loadFitment()
  };

  function setView(view){
    state.view = view;
    qsa(".view").forEach(v => v.classList.add("hidden"));
    qs(`#view-${view}`)?.classList.remove("hidden");
    qsa(".nav-btn").forEach(b => b.setAttribute("aria-current", b.dataset.view === view ? "page" : "false"));
    if (view === "orders") renderCart();
    if (view === "mechanics") renderMechanics();
    if (view === "pricing") renderPricing();
    if (view === "admin") renderAdmin();
    updateCartCount();
  }
  qsa(".nav-btn").forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.view)));

  // ---------- TIER GATES ----------
  const tierBadge = qs("#tierBadge");
  function setTier(t){
    state.tier = t;
    localStorage.setItem("fg_tier", t);
    if (tierBadge) tierBadge.textContent = `Tier: ${t}`;
    applyTierGates();
  }

  function applyTierGates(){
    const isPro = state.tier === "PRO" || state.tier === "BUSINESS";
    const isBiz = state.tier === "BUSINESS";

    // Pro-only: fitment toggle + invoice
    const fitToggle = qs("#fitmentOnlyToggle");
    if (fitToggle) fitToggle.disabled = !isPro;
    const invoiceBtn = qs("#invoiceBtn");
    if (invoiceBtn) invoiceBtn.disabled = !isPro;

    // Biz-only: Admin + Onboarding
    const hideIfNotBiz = ["admin", "onboarding"];
    for (const v of hideIfNotBiz){
      const btn = document.querySelector(`.nav-btn[data-view="${v}"]`);
      if (btn) btn.style.display = isBiz ? "" : "none";
    }

    // Webhook only Biz
    if (!isBiz && FG_DATA.notifications) FG_DATA.notifications.webhookUrl = "";
  }

  // ---------- LOCAL OVERRIDES (inventory + fitment) ----------
  function applyLocalOverrides(){
    // parts override
    try{
      const partsRaw = localStorage.getItem("fg_parts");
      if (partsRaw){
        const parsed = JSON.parse(partsRaw);
        if (Array.isArray(parsed)) FG_DATA.parts = parsed;
      }
    }catch{}

    // fitment override
    try{
      const raw = localStorage.getItem("fg_fitment_custom");
      if (raw){
        const parsed = JSON.parse(raw);
        if (parsed?.fitment && typeof parsed.fitment === "object") FG_DATA.fitment = parsed.fitment;
        if (parsed?.oemPartNumbers && typeof parsed.oemPartNumbers === "object") FG_DATA.oemPartNumbers = parsed.oemPartNumbers;
      }
    }catch{}
  }

  // ---------- CART ----------
  function loadCart(){
    try { return JSON.parse(localStorage.getItem("fg_cart") || "[]"); }
    catch { return []; }
  }
  function saveCart(){ localStorage.setItem("fg_cart", JSON.stringify(state.cart)); }

  function addToCart(partId){
    const part = FG_DATA.parts.find(p => p.id === partId);
    if (!part) return;
    const existing = state.cart.find(i => i.id === partId);
    if (existing) existing.qty = clampInt(existing.qty + 1, 1, 999);
    else state.cart.push({ id: partId, qty: 1 });
    saveCart();
  }
  function removeFromCart(partId){
    state.cart = state.cart.filter(i => i.id !== partId);
    saveCart();
  }
  function setQty(partId, qty){
    const item = state.cart.find(i => i.id === partId);
    if (!item) return;
    item.qty = clampInt(qty, 1, 999);
    saveCart();
  }
  function calcSubtotalNGN(){
    return state.cart.reduce((sum, i) => {
      const p = FG_DATA.parts.find(x => x.id === i.id);
      return sum + (p ? p.price * i.qty : 0);
    }, 0);
  }

  const cartCount = qs("#cartCount");
  function updateCartCount(){
    const count = state.cart.reduce((s,i)=>s+i.qty,0);
    if (cartCount) cartCount.textContent = String(count);
  }

  // ---------- FITMENT (VIN -> exact parts) ----------
  function normalizeUpper(s){ return String(s||"").trim().toUpperCase(); }

  function loadFitment(){
    try{
      const f = JSON.parse(localStorage.getItem("fg_fitment")||"null");
      if (f?.key) return f;
    }catch{}
    return { key:"", make:"", model:"", year:"", engine:"", eligiblePartIds:null };
  }

  function setFitmentFromDecoded(decoded){
    const make = normalizeUpper(decoded.Make);
    const model = normalizeUpper(decoded.Model);
    const year = String(decoded.ModelYear||"").trim();
    // engine label: use displacement L where available (e.g., 1.8)
    const engine = String(decoded.DisplacementL || decoded.Engine || "").trim();
    const key = `${make}|${model}|${year}|${engine}`;

    const list = FG_DATA.fitment?.[key] || null;
    const eligiblePartIds = Array.isArray(list) ? list : null;

    state.fitment = { key, make, model, year, engine, eligiblePartIds };
    localStorage.setItem("fg_fitment", JSON.stringify(state.fitment));
    updateFitmentUI();
    renderParts();
  }

  function updateFitmentUI(){
    const badge = qs("#fitmentBadge");
    if (!badge) return;

    if (!state.fitment?.key){
      badge.textContent = "Fitment: Not set";
      return;
    }
    const ok = Array.isArray(state.fitment.eligiblePartIds) && state.fitment.eligiblePartIds.length>0;
    badge.textContent = ok
      ? `Fitment: ${state.fitment.make} ${state.fitment.model} ${state.fitment.year} (${state.fitment.engine || "engine?"})`
      : `Fitment: ${state.fitment.make} ${state.fitment.model} ${state.fitment.year} (no catalog match)`;
  }

  function fitmentAllows(part){
    const toggle = qs("#fitmentOnlyToggle");
    if (!toggle || !toggle.checked) return true;
    if (!(state.tier === "PRO" || state.tier === "BUSINESS")) return true; // just in case
    if (!Array.isArray(state.fitment?.eligiblePartIds)) return false;
    return state.fitment.eligiblePartIds.includes(part.id);
  }

  function getOEMNumbersForPart(partId){
    const key = state.fitment?.key;
    if (!key) return null;
    const map = FG_DATA.oemPartNumbers?.[key];
    if (!map) return null;
    const arr = map[partId];
    return Array.isArray(arr) ? arr : null;
  }

  // ---------- TROUBLESHOOTER ----------
  const symptomSearch = qs("#symptomSearch");
  const categorySelect = qs("#categorySelect");
  const symptomResults = qs("#symptomResults");
  const wizard = qs("#wizard");

  function initTroubleshooter(){
    if (categorySelect){
      categorySelect.innerHTML =
        `<option value="all">All categories</option>` +
        (FG_DATA.symptomCategories||[]).map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
      categorySelect.addEventListener("change", renderSymptomResults);
    }
    symptomSearch?.addEventListener("input", renderSymptomResults);
    renderSymptomResults();
  }

  function renderSymptomResults(){
    if (!symptomResults) return;
    const q = (symptomSearch?.value || "").trim().toLowerCase();
    const cat = categorySelect?.value || "all";
    const items = (FG_DATA.symptoms||[]).filter(s => {
      const matchesQ = !q || (s.title + " " + s.summary).toLowerCase().includes(q);
      const matchesCat = (cat === "all") || (s.category === cat);
      return matchesQ && matchesCat;
    });

    if (!items.length){
      symptomResults.innerHTML = `<div class="wizard-empty">No matches. Try another keyword.</div>`;
      return;
    }

    symptomResults.innerHTML = items.map(s => `
      <div class="card">
        <div class="kv">
          <span class="badge">${escapeHtml(s.category)}</span>
          <span class="badge">Symptom</span>
        </div>
        <h4>${escapeHtml(s.title)}</h4>
        <p class="muted small">${escapeHtml(s.summary)}</p>
        <div class="row wrap">
          <button class="btn secondary" data-pick-symptom="${s.id}">Start diagnosis</button>
        </div>
      </div>
    `).join("");

    qsa("[data-pick-symptom]").forEach(b => b.addEventListener("click", () => selectSymptom(b.dataset.pickSymptom)));
  }

  function selectSymptom(symptomId){
    state.selectedSymptomId = symptomId;
    state.wizardAnswers = {};
    renderWizard();
    wizard?.scrollIntoView({ behavior:"smooth", block:"start" });
  }

  function computeOutcome(symptom){
    const ans = state.wizardAnswers;
    return symptom.wizard.outcomes.find(o =>
      Object.entries(o.when).every(([k,v]) => ans[k] === v)
    ) || null;
  }

  function renderOutcome(out){
    const severityClass = out.severity === "High" ? "tag-bad" : (out.severity === "Low" ? "tag-ok" : "");
    const parts = (out.recommendedParts||[])
      .map(pid => FG_DATA.parts.find(p => p.id === pid))
      .filter(Boolean);

    return `
      <div class="result">
        <div class="kv">
          <span class="badge">Diagnosis</span>
          <span class="badge ${severityClass}">Severity: ${escapeHtml(out.severity)}</span>
        </div>
        <h4>${escapeHtml(out.diagnosis)}</h4>

        <div class="grid-2">
          <div>
            <strong>Likely causes</strong>
            <ul class="list">
              ${(out.causes||[]).map(c => `<li>${escapeHtml(c)}</li>`).join("")}
            </ul>
          </div>
          <div>
            <strong>Recommended parts</strong>
            <div class="cards" style="grid-template-columns: 1fr;">
              ${parts.map(p => `
                <div class="card">
                  <div class="row space-between wrap">
                    <div>
                      <h4 style="margin:0 0 6px 0;">${escapeHtml(p.name)}</h4>
                      <div class="muted small">${escapeHtml(p.category)} • ${escapeHtml(p.stock||"")} • SKU: ${escapeHtml(p.sku||"")}</div>
                    </div>
                    <div style="text-align:right">
                      <div><strong>${money(p.price)}</strong></div>
                      <button class="btn secondary" data-add-part="${p.id}">Add to cart</button>
                    </div>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        </div>

        <div class="divider"></div>
        <div class="row wrap">
          <button class="btn" id="goToPartsBtn">Browse spare parts</button>
          <button class="btn ghost" id="goToCartBtn">View cart</button>
        </div>
      </div>
    `;
  }

  function renderWizard(){
    if (!wizard) return;
    const s = (FG_DATA.symptoms||[]).find(x => x.id === state.selectedSymptomId);
    if (!s){
      wizard.innerHTML = `<div class="wizard-empty"><p>Select a symptom to begin.</p></div>`;
      return;
    }

    const qBlocks = s.wizard.questions.map(q => {
      const val = state.wizardAnswers[q.id];
      const opts = q.options.map(opt => `
        <button class="opt ${val===opt ? "active":""}" data-qid="${q.id}" data-opt="${escapeHtml(opt)}">
          ${escapeHtml(opt)}
        </button>
      `).join("");

      return `
        <div class="qblock">
          <div class="q">${escapeHtml(q.text)}</div>
          <div class="opts">${opts}</div>
        </div>
      `;
    }).join("");

    const outcome = computeOutcome(s);
    const resultBlock = outcome ? renderOutcome(outcome) : `
      <div class="result">
        <h4>Answer the questions above</h4>
        <p class="muted small">As you select options, we’ll show likely causes and recommended parts.</p>
      </div>
    `;

    wizard.innerHTML = qBlocks + resultBlock;

    qsa(".opt").forEach(btn => btn.addEventListener("click", () => {
      state.wizardAnswers[btn.dataset.qid] = btn.textContent.trim();
      renderWizard();
    }));

    qsa("[data-add-part]").forEach(btn => btn.addEventListener("click", () => {
      addToCart(btn.dataset.addPart);
      updateCartCount();
    }));
  }

  // ---------- AI SYMPTOM MATCH (text -> wizard) ----------
  const aiText = qs("#aiSymptomText");
  const aiBtn = qs("#aiAnalyzeBtn");
  const aiOut = qs("#aiAnalyzeResult");

  function scoreSymptom(sym, text){
    const t = String(text||"").toLowerCase();
    const hay = (sym.title + " " + sym.summary + " " + sym.category).toLowerCase();
    const tokens = t.split(/[^a-z0-9]+/).filter(w => w.length >= 3);
    let score = 0;
    for (const w of tokens) if (hay.includes(w)) score += 3;

    const boosts = [
      ["overheat","engine-overheating",50],
      ["temperature","engine-overheating",20],
      ["click","no-start-clicking",30],
      ["won't start","no-start-clicking",40],
      ["brake","brake-squeal",25],
      ["squeal","brake-squeal",25],
      ["grind","brake-squeal",35],
      ["misfire","rough-idle-misfire",35],
      ["rough","rough-idle-misfire",15],
      ["idle","rough-idle-misfire",20],
    ];
    for (const [kw,id,pts] of boosts){
      if (t.includes(kw) && sym.id === id) score += pts;
    }
    return score;
  }

  aiBtn?.addEventListener("click", () => {
    const text = (aiText?.value || "").trim();
    if (!text){
      if (aiOut) aiOut.textContent = "Please describe the issue first.";
      return;
    }

    let best=null, bestScore=-1;
    for (const s of (FG_DATA.symptoms||[])){
      const sc = scoreSymptom(s, text);
      if (sc > bestScore){ bestScore=sc; best=s; }
    }

    if (!best || bestScore < 5){
      if (aiOut) aiOut.textContent = "Couldn’t confidently match. Add more detail (sound/smell/warning light/when it happens).";
      return;
    }

    if (aiOut) aiOut.textContent = `Matched: ${best.title}`;
    selectSymptom(best.id);
  });

  // ---------- VIN DECODER (NHTSA vPIC) ----------
  const vinInput = qs("#vinInput");
  const vinYear = qs("#vinYear");
  const vinBtn = qs("#vinDecodeBtn");
  const vinStatus = qs("#vinStatus");
  const vinResult = qs("#vinResult");

  vinBtn?.addEventListener("click", async () => {
    const vin = (vinInput?.value || "").trim();
    const year = (vinYear?.value || "").trim();

    if (vinStatus) vinStatus.textContent = "";
    if (vinResult){ vinResult.style.display="none"; vinResult.innerHTML=""; }

    if (vin.length < 11){
      if (vinStatus) vinStatus.textContent = "Enter a valid VIN (usually 17 characters).";
      return;
    }

    if (vinStatus) vinStatus.textContent = "Decoding...";
    try{
      const base = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/";
      const url = `${base}${encodeURIComponent(vin)}?format=json${year ? `&modelyear=${encodeURIComponent(year)}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();

      const row = data?.Results?.[0];
      if (!row){
        if (vinStatus) vinStatus.textContent = "No results returned.";
        return;
      }

      const out = {
        VIN: row.VIN || vin,
        Make: row.Make,
        Model: row.Model,
        ModelYear: row.ModelYear,
        BodyClass: row.BodyClass,
        VehicleType: row.VehicleType,
        EngineCylinders: row.EngineCylinders,
        DisplacementL: row.DisplacementL,
        FuelTypePrimary: row.FuelTypePrimary,
        PlantCountry: row.PlantCountry,
        Manufacturer: row.Manufacturer,
      };

      // Autofill vehicle field
      const vehicleInfo = qs("#vehicleInfo");
      if (vehicleInfo){
        const bits = [out.Make, out.Model, out.ModelYear, out.DisplacementL ? `Engine ${out.DisplacementL}L` : ""].filter(Boolean);
        vehicleInfo.value = bits.join(" ");
      }

      // Set fitment (key uses Make|Model|Year|DisplacementL)
      setFitmentFromDecoded(out);

      if (vinStatus) vinStatus.textContent = "Done.";
      if (vinResult){
        vinResult.style.display = "block";
        vinResult.innerHTML = `
          <h4>Decoded Vehicle Info</h4>
          <ul class="list">
            ${Object.entries(out).filter(([,v]) => v && v !== "0").map(([k,v]) =>
              `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}</li>`
            ).join("")}
          </ul>
          <p class="small muted">Source: NHTSA vPIC VIN Decoder API.</p>
        `;
      }
    }catch{
      if (vinStatus) vinStatus.textContent = "Decode failed (check connection or VIN).";
    }
  });

  // ---------- PARTS STORE ----------
  const partSearch = qs("#partSearch");
  const partCategorySelect = qs("#partCategorySelect");
  const sortSelect = qs("#sortSelect");
  const partsGrid = qs("#partsGrid");
  const fitmentOnlyToggle = qs("#fitmentOnlyToggle");

  function initParts(){
    if (partCategorySelect){
      partCategorySelect.innerHTML =
        `<option value="all">All part categories</option>` +
        (FG_DATA.partCategories||[]).map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
      partCategorySelect.addEventListener("change", renderParts);
    }
    partSearch?.addEventListener("input", renderParts);
    sortSelect?.addEventListener("change", renderParts);
    fitmentOnlyToggle?.addEventListener("change", renderParts);

    renderParts();
  }

  function renderParts(){
    if (!partsGrid) return;
    const q = (partSearch?.value || "").trim().toLowerCase();
    const cat = partCategorySelect?.value || "all";
    const sort = sortSelect?.value || "relevance";

    let items = (FG_DATA.parts||[]).filter(p => {
      const hay = (p.name + " " + p.category + " " + (p.tags||[]).join(" ") + " " + (p.fits||"")).toLowerCase();
      const matchesQ = !q || hay.includes(q);
      const matchesCat = (cat === "all") || (p.category === cat);
      return matchesQ && matchesCat && fitmentAllows(p);
    });

    if (sort === "priceAsc") items.sort((a,b) => a.price - b.price);
    if (sort === "priceDesc") items.sort((a,b) => b.price - a.price);
    if (sort === "nameAsc") items.sort((a,b) => a.name.localeCompare(b.name));

    if (!items.length){
      partsGrid.innerHTML = `<div class="wizard-empty">No parts found. Try another search or disable fitment-only.</div>`;
      return;
    }

    partsGrid.innerHTML = items.map(p => {
      const oems = getOEMNumbersForPart(p.id);
      const oemLine = oems ? `<div class="muted small">OEM: ${escapeHtml(oems.join(", "))}</div>` : "";
      return `
        <div class="card">
          <div class="kv">
            <span class="badge">${escapeHtml(p.category)}</span>
            <span class="badge">${escapeHtml(p.stock||"")}</span>
          </div>
          <h4>${escapeHtml(p.name)}</h4>
          <p class="muted small">SKU: ${escapeHtml(p.sku||"")} • Fits: ${escapeHtml(p.fits||"—")}</p>
          ${oemLine}
          <div class="row space-between wrap">
            <strong>${money(p.price)}</strong>
            <button class="btn secondary" data-add-part="${p.id}">Add to cart</button>
          </div>
        </div>
      `;
    }).join("");

    qsa("[data-add-part]").forEach(btn => btn.addEventListener("click", () => {
      addToCart(btn.dataset.addPart);
      updateCartCount();
    }));
  }

  // ---------- CART RENDER + ORDER ----------
  const cartList = qs("#cartList");
  const subtotalEl = qs("#subtotal");
  const clearCartBtn = qs("#clearCartBtn");

  const custName = qs("#custName");
  const custPhone = qs("#custPhone");
  const custLocation = qs("#custLocation");
  const vehicleInfo = qs("#vehicleInfo");
  const vinPlate = qs("#vinPlate");
  const custNotes = qs("#custNotes");

  const whatsappBtn = qs("#whatsappBtn");
  const emailBtn = qs("#emailBtn");
  const paystackBtn = qs("#paystackBtn");
  const stripeBtn = qs("#stripeBtn");

  function renderCart(){
    if (!cartList) return;
    if (!state.cart.length){
      cartList.innerHTML = `<div class="wizard-empty">Your cart is empty. Add parts from Spare Parts.</div>`;
      if (subtotalEl) subtotalEl.textContent = money(0);
      toggleOrderButtons();
      return;
    }

    cartList.innerHTML = state.cart.map(i => {
      const p = FG_DATA.parts.find(x => x.id === i.id);
      if (!p) return "";
      return `
        <div class="cart-item">
          <div>
            <strong>${escapeHtml(p.name)}</strong>
            <div class="muted small">${escapeHtml(p.category)} • SKU: ${escapeHtml(p.sku||"")} • ${escapeHtml(p.stock||"")}</div>
            ${getOEMNumbersForPart(p.id) ? `<div class="muted small">OEM: ${escapeHtml(getOEMNumbersForPart(p.id).join(", "))}</div>` : ""}
          </div>

          <div class="qty">
            <button data-dec="${p.id}">−</button>
            <input type="number" min="1" max="999" value="${i.qty}" data-qty="${p.id}" />
            <button data-inc="${p.id}">+</button>
          </div>

          <div>
            <div class="muted small">Unit</div>
            <strong>${money(p.price)}</strong>
          </div>

          <div class="row wrap">
            <strong>${money(p.price * i.qty)}</strong>
            <button class="btn ghost" data-remove="${p.id}">Remove</button>
          </div>
        </div>
      `;
    }).join("");

    qsa("[data-inc]").forEach(b => b.addEventListener("click", () => {
      const id = b.dataset.inc;
      const item = state.cart.find(x => x.id === id);
      setQty(id, (item?.qty || 1) + 1);
      renderCart(); updateCartCount();
    }));
    qsa("[data-dec]").forEach(b => b.addEventListener("click", () => {
      const id = b.dataset.dec;
      const item = state.cart.find(x => x.id === id);
      setQty(id, (item?.qty || 1) - 1);
      renderCart(); updateCartCount();
    }));
    qsa("[data-qty]").forEach(inp => inp.addEventListener("input", () => {
      const id = inp.dataset.qty;
      setQty(id, parseInt(inp.value, 10) || 1);
      renderCart(); updateCartCount();
    }));
    qsa("[data-remove]").forEach(b => b.addEventListener("click", () => {
      removeFromCart(b.dataset.remove);
      renderCart(); updateCartCount();
    }));

    if (subtotalEl) subtotalEl.textContent = money(calcSubtotalNGN());
    toggleOrderButtons();
  }

  function toggleOrderButtons(){
    const has = state.cart.length > 0;
    if (whatsappBtn) whatsappBtn.disabled = !has;
    if (emailBtn) emailBtn.disabled = !has;
    if (paystackBtn) paystackBtn.disabled = !has;
    if (stripeBtn) stripeBtn.disabled = !has;
  }

  clearCartBtn?.addEventListener("click", () => {
    state.cart = [];
    saveCart();
    renderCart();
    updateCartCount();
  });

  function buildOrderText(){
    const subtotal = calcSubtotalNGN();
    const items = state.cart.map(i => {
      const p = FG_DATA.parts.find(x => x.id === i.id);
      const oems = getOEMNumbersForPart(i.id);
      const oemStr = oems ? ` (OEM: ${oems.join(", ")})` : "";
      return `- ${p?.name || i.id}${oemStr} x${i.qty} = ${money((p?.price||0) * i.qty)}`;
    }).join("\n");

    const customer = [
      `Name: ${custName?.value || "-"}`,
      `Phone: ${custPhone?.value || "-"}`,
      `Location: ${custLocation?.value || "-"}`,
      `Vehicle: ${vehicleInfo?.value || "-"}`,
      `VIN/Plate: ${vinPlate?.value || "-"}`,
      `Fitment Key: ${state.fitment?.key || "-"}`,
      `Notes: ${custNotes?.value || "-"}`
    ].join("\n");

    return `F&G Auto Troubleshooter - New Order\n\nItems:\n${items}\n\nSubtotal: ${money(subtotal)}\n(Base NGN subtotal: ₦${subtotal.toLocaleString("en-NG")})\n\nCustomer:\n${customer}\n\nPlease confirm availability, delivery fee, and payment details.`;
  }

  async function notifyWebhook(payload){
    const url = FG_DATA.notifications?.webhookUrl;
    if (!url) return;
    try{
      await fetch(url, {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body: JSON.stringify(payload)
      });
    }catch{}
  }

  whatsappBtn?.addEventListener("click", () => {
    const number = FG_DATA.business.whatsappNumber;
    const text = encodeURIComponent(buildOrderText());
    const url = `https://wa.me/${number}?text=${text}`;
    window.open(url, "_blank");

    notifyWebhook({
      type:"ORDER", channel:"WHATSAPP", createdAt:new Date().toISOString(),
      cart: state.cart, subtotalNGN: calcSubtotalNGN(), fitmentKey: state.fitment?.key || "",
      customer:{ name: custName?.value||"", phone: custPhone?.value||"", location: custLocation?.value||"" }
    });
  });

  emailBtn?.addEventListener("click", () => {
    alert("Your email app will open. Please attach selected photos before sending.");
    const to = FG_DATA.business.email;
    const subject = encodeURIComponent("F&G Auto Troubleshooter - Parts Order");
    const body = encodeURIComponent(buildOrderText());
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;

    notifyWebhook({
      type:"ORDER", channel:"EMAIL", createdAt:new Date().toISOString(),
      cart: state.cart, subtotalNGN: calcSubtotalNGN(), fitmentKey: state.fitment?.key || "",
      customer:{ name: custName?.value||"", phone: custPhone?.value||"", location: custLocation?.value||"" }
    });
  });

  function customerSplitName(full){
    const s = (full || "").trim().split(/\s+/).filter(Boolean);
    return { first: s[0] || "", last: s.slice(1).join(" ") || "" };
  }

  paystackBtn?.addEventListener("click", () => {
    const base = FG_DATA.payments?.paystackPaymentPage;
    if (!base || base.includes("REPLACE_ME")){
      alert("Set your Paystack payment page link in data.js first.");
      return;
    }
    const amountNGN = calcSubtotalNGN();
    const amountKobo = Math.round(amountNGN * 100);
    const nm = customerSplitName(custName?.value);

    const params = new URLSearchParams();
    if (nm.first) params.set("first_name", nm.first);
    if (nm.last) params.set("last_name", nm.last);
    params.set("amount", String(amountKobo));

    window.open(`${base}?${params.toString()}`, "_blank");
  });

  stripeBtn?.addEventListener("click", () => {
    const link = FG_DATA.payments?.stripePaymentLink;
    if (!link || link.includes("REPLACE_ME")){
      alert("Set your Stripe Payment Link in data.js first.");
      return;
    }
    window.open(link, "_blank");
  });

  // ---------- INVOICE (Print to PDF) ----------
  qs("#invoiceBtn")?.addEventListener("click", () => {
    if (!(state.tier === "PRO" || state.tier === "BUSINESS")){
      alert("Invoice is a Pro feature. Activate Pro or Business.");
      return;
    }
    const w = window.open("", "_blank");
    const items = state.cart.map(i => {
      const p = FG_DATA.parts.find(x => x.id === i.id);
      const oems = getOEMNumbersForPart(i.id);
      return `<tr>
        <td>${escapeHtml(p?.name||i.id)}${oems ? `<br/><small>OEM: ${escapeHtml(oems.join(", "))}</small>` : ""}</td>
        <td>${i.qty}</td>
        <td>${escapeHtml(money(p?.price||0))}</td>
        <td>${escapeHtml(money((p?.price||0) * i.qty))}</td>
      </tr>`;
    }).join("");

    w.document.write(`
      <html><head><title>Invoice</title>
      <meta charset="utf-8" />
      <style>
        body{font-family:Arial;padding:18px}
        table{border-collapse:collapse;width:100%}
        th,td{border:1px solid #ccc;padding:8px;text-align:left}
        small{color:#555}
      </style></head>
      <body>
        <h2>F&G Auto Troubleshooter</h2>
        <p><strong>Name:</strong> ${escapeHtml(custName?.value||"")}</p>
        <p><strong>Phone:</strong> ${escapeHtml(custPhone?.value||"")}</p>
        <p><strong>Location:</strong> ${escapeHtml(custLocation?.value||"")}</p>
        <p><strong>Vehicle:</strong> ${escapeHtml(vehicleInfo?.value||"")}</p>
        <p><strong>VIN/Plate:</strong> ${escapeHtml(vinPlate?.value||"")}</p>
        <p><strong>Fitment Key:</strong> ${escapeHtml(state.fitment?.key||"")}</p>
        <table>
          <tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr>
          ${items}
        </table>
        <h3>Total (base NGN): ₦${calcSubtotalNGN().toLocaleString("en-NG")}</h3>
        <h3>Total (selected currency): ${escapeHtml(money(calcSubtotalNGN()))}</h3>
        <script>window.print()</script>
      </body></html>
    `);
  });

  // ---------- MECHANICS ----------
  function renderMechanics(){
    const box = qs("#mechanicList");
    if (!box) return;
    box.innerHTML = (FG_DATA.mechanics||[]).map(m => `
      <div class="card">
        <h4>${escapeHtml(m.name)}</h4>
        <p class="muted small">${escapeHtml(m.specialty||"")}</p>
        <p>${escapeHtml(m.location||"")}</p>
        <a class="btn secondary" href="https://wa.me/${String(m.phone||"").replace(/\D/g,'')}" target="_blank" rel="noreferrer">Contact on WhatsApp</a>
      </div>
    `).join("");
  }

  // ---------- ONBOARDING ----------
  const onbType = qs("#onbType");
  const onbName = qs("#onbName");
  const onbLocation = qs("#onbLocation");
  const onbPhone = qs("#onbPhone");
  const onbSpecialty = qs("#onbSpecialty");
  const onbYears = qs("#onbYears");
  const onbNotes = qs("#onbNotes");
  const onbSubmit = qs("#onbSubmit");
  const onbWhatsApp = qs("#onbWhatsApp");

  function onboardingText(){
    return `F&G Onboarding Application
Type: ${onbType?.value||""}
Business: ${onbName?.value||""}
Location: ${onbLocation?.value||""}
Phone: ${onbPhone?.value||""}
Specialty: ${onbSpecialty?.value||""}
Experience: ${onbYears?.value||""}
Notes: ${onbNotes?.value||""}`;
  }

  onbSubmit?.addEventListener("click", () => {
    const entry = {
      ts: Date.now(),
      type: onbType?.value||"",
      name: onbName?.value||"",
      location: onbLocation?.value||"",
      phone: onbPhone?.value||"",
      specialty: onbSpecialty?.value||"",
      years: onbYears?.value||"",
      notes: onbNotes?.value||""
    };
    const list = JSON.parse(localStorage.getItem("fg_onboarding") || "[]");
    list.unshift(entry);
    localStorage.setItem("fg_onboarding", JSON.stringify(list));
    alert("Submitted! We’ll review and contact you.");
  });

  onbWhatsApp?.addEventListener("click", () => {
    const number = FG_DATA.business.whatsappNumber;
    const text = encodeURIComponent(onboardingText());
    window.open(`https://wa.me/${number}?text=${text}`, "_blank");

    notifyWebhook({
      type:"ONBOARDING",
      createdAt:new Date().toISOString(),
      payload:onboardingText()
    });
  });

  // ---------- PRICING ----------
  function renderPricing(){
    const grid = qs("#pricingGrid");
    if (!grid) return;
    const T = FG_DATA.tiers;
    const cards = ["FREE","PRO","BUSINESS"].map(k => {
      const obj = T[k];
      return `
        <div class="card">
          <h4>${escapeHtml(obj.name)}</h4>
          <ul class="list">${(obj.features||[]).map(f => `<li>${escapeHtml(f)}</li>`).join("")}</ul>
          <div class="row wrap">
            ${k === "PRO" ? `<button class="btn secondary" data-buy="stripe">Buy Pro (Stripe)</button>` : ""}
            ${k === "BUSINESS" ? `<button class="btn secondary" data-buy="paystack">Buy Business (Paystack)</button>` : ""}
            ${k === "FREE" ? `<button class="btn ghost" data-set-tier="FREE">Use Free</button>` : ""}
          </div>
        </div>
      `;
    }).join("");
    grid.innerHTML = cards;

    qsa("[data-buy='stripe']").forEach(b => b.addEventListener("click", () => stripeBtn?.click()));
    qsa("[data-buy='paystack']").forEach(b => b.addEventListener("click", () => paystackBtn?.click()));
    qsa("[data-set-tier]").forEach(b => b.addEventListener("click", () => setTier(b.dataset.setTier)));
  }

  qs("#activateTier")?.addEventListener("click", () => {
    const code = (qs("#tierCode")?.value || "").trim();
    const plan = FG_DATA.tiers?.accessCodes?.[code];
    if (!plan){ alert("Invalid code."); return; }
    setTier(plan);
    alert(`Activated: ${plan}`);
  });

  // ---------- ADMIN (Inventory + Fitment Builder + Export/Import) ----------
  const adminTabs = {
    inventory: { btn:"#adminTabInventory", panel:"#adminInventory" },
    fitment:   { btn:"#adminTabFitment", panel:"#adminFitment" },
    export:    { btn:"#adminTabExport", panel:"#adminExport" },
  };

  function showAdminTab(name){
    for (const k of Object.keys(adminTabs)){
      const is = (k === name);
      qs(adminTabs[k].panel)?.classList.toggle("hidden", !is);
    }
  }
  qs(adminTabs.inventory.btn)?.addEventListener("click", () => showAdminTab("inventory"));
  qs(adminTabs.fitment.btn)?.addEventListener("click", () => showAdminTab("fitment"));
  qs(adminTabs.export.btn)?.addEventListener("click", () => showAdminTab("export"));

  function renderAdmin(){
    showAdminTab("inventory");
    // Inventory editor
    const ed = qs("#inventoryEditor");
    if (ed) ed.value = JSON.stringify(FG_DATA.parts, null, 2);
    refreshFitmentKeySelect();
    renderFitmentPartsList();
  }

  qs("#saveInventory")?.addEventListener("click", () => {
    const ed = qs("#inventoryEditor");
    if (!ed) return;
    try{
      const parsed = JSON.parse(ed.value);
      if (!Array.isArray(parsed)) throw new Error("Parts must be an array");
      FG_DATA.parts = parsed;
      localStorage.setItem("fg_parts", JSON.stringify(parsed));
      alert("Inventory updated (stored locally).");
      renderParts();
      renderCart();
    }catch{
      alert("Invalid JSON. Paste a valid parts array.");
    }
  });

  qs("#resetInventory")?.addEventListener("click", () => {
    localStorage.removeItem("fg_parts");
    location.reload();
  });

  // Fitment builder
  const fitMake = qs("#fitMake");
  const fitModel = qs("#fitModel");
  const fitYear = qs("#fitYear");
  const fitEngine = qs("#fitEngine");
  const fitmentKeySelect = qs("#fitmentKeySelect");
  const fitmentPartsList = qs("#fitmentPartsList");

  function currentFitKeyFromInputs(){
    const make = normalizeUpper(fitMake?.value);
    const model = normalizeUpper(fitModel?.value);
    const year = String(fitYear?.value||"").trim();
    const engine = String(fitEngine?.value||"").trim();
    return `${make}|${model}|${year}|${engine}`;
  }

  function refreshFitmentKeySelect(){
    if (!fitmentKeySelect) return;
    const keys = Object.keys(FG_DATA.fitment||{}).sort();
    fitmentKeySelect.innerHTML = keys.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join("");
  }

  function loadFitmentKeyToInputs(key){
    const [mk,md,yr,en] = String(key||"").split("|");
    if (fitMake) fitMake.value = mk || "";
    if (fitModel) fitModel.value = md || "";
    if (fitYear) fitYear.value = yr || "";
    if (fitEngine) fitEngine.value = en || "";
  }

  function renderFitmentPartsList(){
    if (!fitmentPartsList) return;
    const key = currentFitKeyFromInputs();
    const selectedIds = new Set(FG_DATA.fitment?.[key] || []);
    const oemMap = FG_DATA.oemPartNumbers?.[key] || {};

    fitmentPartsList.innerHTML = (FG_DATA.parts||[]).map(p => {
      const checked = selectedIds.has(p.id);
      const oems = Array.isArray(oemMap[p.id]) ? oemMap[p.id].join(", ") : "";
      return `
        <div class="card">
          <div class="row space-between wrap">
            <div>
              <strong>${escapeHtml(p.name)}</strong>
              <div class="muted small">${escapeHtml(p.category)} • ${escapeHtml(p.sku||"")}</div>
            </div>
            <label class="badge" style="cursor:pointer">
              <input type="checkbox" data-fit-part="${p.id}" ${checked ? "checked":""} />
              Fits
            </label>
          </div>
          <div class="field" style="margin-top:10px">
            <label>OEM part numbers (comma-separated)</label>
            <input data-oem-part="${p.id}" value="${escapeHtml(oems)}" placeholder="OEM-XXXX, OEM-YYYY" />
          </div>
        </div>
      `;
    }).join("");

    qsa("[data-fit-part]").forEach(chk => chk.addEventListener("change", () => {/* no-op; read on save */}));
  }

  qs("#loadFromDecoded")?.addEventListener("click", () => {
    if (!state.fitment?.key){
      alert("Decode a VIN first to use decoded vehicle details.");
      return;
    }
    loadFitmentKeyToInputs(state.fitment.key);
    renderFitmentPartsList();
  });

  qs("#loadFitmentKey")?.addEventListener("click", () => {
    const key = fitmentKeySelect?.value;
    if (!key) return;
    loadFitmentKeyToInputs(key);
    renderFitmentPartsList();
  });

  [fitMake, fitModel, fitYear, fitEngine].forEach(el => el?.addEventListener("input", () => renderFitmentPartsList()));

  function persistCustomFitment(){
    const payload = { fitment: FG_DATA.fitment, oemPartNumbers: FG_DATA.oemPartNumbers };
    localStorage.setItem("fg_fitment_custom", JSON.stringify(payload));
  }

  qs("#saveFitmentKey")?.addEventListener("click", () => {
    const key = currentFitKeyFromInputs();
    if (!key || key.includes("||") || key.endsWith("|")){
      alert("Fill Make, Model, Year and Engine.");
      return;
    }

    const selected = [];
    const oemOut = {};

    qsa("[data-fit-part]").forEach(chk => {
      const id = chk.dataset.fitPart;
      if (chk.checked) selected.push(id);
    });

    qsa("[data-oem-part]").forEach(inp => {
      const id = inp.dataset.oemPart;
      const raw = (inp.value||"").trim();
      if (!raw) return;
      const arr = raw.split(",").map(s => s.trim()).filter(Boolean);
      if (arr.length) oemOut[id] = arr;
    });

    FG_DATA.fitment[key] = selected;
    FG_DATA.oemPartNumbers[key] = oemOut;

    persistCustomFitment();
    refreshFitmentKeySelect();
    alert("Fitment saved (stored locally).");
    // If this matches current fitment, refresh
    updateFitmentUI();
    renderParts();
  });

  qs("#deleteFitmentKey")?.addEventListener("click", () => {
    const key = currentFitKeyFromInputs();
    if (!FG_DATA.fitment?.[key]){
      alert("No fitment found for this key.");
      return;
    }
    if (!confirm("Delete fitment for this key?")) return;
    delete FG_DATA.fitment[key];
    delete FG_DATA.oemPartNumbers[key];
    persistCustomFitment();
    refreshFitmentKeySelect();
    renderFitmentPartsList();
    alert("Deleted.");
    // If current fitment uses this key, clear fitment
    if (state.fitment?.key === key){
      state.fitment = { key:"", make:"", model:"", year:"", engine:"", eligiblePartIds:null };
      localStorage.removeItem("fg_fitment");
      updateFitmentUI();
      renderParts();
    }
  });

  // Export/Import
  qs("#downloadCustomData")?.addEventListener("click", () => {
    const payload = {
      fg_parts: localStorage.getItem("fg_parts") ? JSON.parse(localStorage.getItem("fg_parts")) : null,
      fg_fitment_custom: localStorage.getItem("fg_fitment_custom") ? JSON.parse(localStorage.getItem("fg_fitment_custom")) : null
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "fg-custom-data.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  qs("#importCustomData")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const txt = await file.text();
    try{
      const parsed = JSON.parse(txt);
      if (parsed.fg_parts) localStorage.setItem("fg_parts", JSON.stringify(parsed.fg_parts));
      if (parsed.fg_fitment_custom) localStorage.setItem("fg_fitment_custom", JSON.stringify(parsed.fg_fitment_custom));
      alert("Imported. Reloading…");
      location.reload();
    }catch{
      alert("Invalid JSON file.");
    }
  });

  qs("#resetCustomData")?.addEventListener("click", () => {
    if (!confirm("Reset all custom data (inventory + fitment) stored in this browser?")) return;
    localStorage.removeItem("fg_parts");
    localStorage.removeItem("fg_fitment_custom");
    alert("Reset. Reloading…");
    location.reload();
  });

  // ---------- CHATBOT ----------
  const chatFab = qs("#chatFab");
  const chatWidget = qs("#chatWidget");
  const chatClose = qs("#chatClose");
  const chatLog = qs("#chatLog");
  const chatText = qs("#chatText");
  const chatSend = qs("#chatSend");

  function addChat(role, text){
    if (!chatLog) return;
    const div = document.createElement("div");
    div.className = `chat-msg ${role}`;
    div.innerHTML = escapeHtml(text);
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function botReply(user){
    const t = String(user||"").toLowerCase();

    if (t.includes("order") || t.includes("buy") || t.includes("cart")){
      addChat("bot", "To order parts: open Spare Parts, add items, then go to Cart & Order.");
      setView("parts");
      return;
    }
    if (t.includes("vin")){
      addChat("bot", "Paste your 17-character VIN in the VIN Decoder section. Then enable 'Show only parts that fit my VIN' (Pro feature).");
      setView("troubleshooter");
      return;
    }
    if (t.includes("mechanic")){
      addChat("bot", "Opening the mechanics directory.");
      setView("mechanics");
      return;
    }

    // Symptom match
    let best=null, bestScore=-1;
    for (const s of (FG_DATA.symptoms||[])){
      const sc = scoreSymptom(s, t);
      if (sc > bestScore){ bestScore=sc; best=s; }
    }
    if (best && bestScore >= 5){
      addChat("bot", `This matches: ${best.title}. Opening diagnosis now.`);
      selectSymptom(best.id);
      setView("troubleshooter");
      return;
    }

    // Parts match
    const found = (FG_DATA.parts||[]).filter(p => (p.name + " " + (p.tags||[]).join(" ")).toLowerCase().includes(t)).slice(0,4);
    if (found.length){
      addChat("bot", "I found: " + found.map(p => p.name).join(", ") + ". Opening Spare Parts.");
      setView("parts");
      return;
    }

    addChat("bot", "Tell me what you’re experiencing (sound, smell, warning lights, when it happens). Example: 'overheats in traffic, fan not working'.");
  }

  chatFab?.addEventListener("click", () => chatWidget?.classList.toggle("hidden"));
  chatClose?.addEventListener("click", () => chatWidget?.classList.add("hidden"));
  chatSend?.addEventListener("click", () => {
    const text = (chatText?.value||"").trim();
    if (!text) return;
    addChat("user", text);
    if (chatText) chatText.value = "";
    botReply(text);
  });
  chatText?.addEventListener("keydown", (e) => { if (e.key === "Enter") chatSend?.click(); });

  // ---------- misc jump buttons ----------
  document.addEventListener("click", (e) => {
    if (e.target?.id === "goToPartsBtn") setView("parts");
    if (e.target?.id === "goToCartBtn") setView("orders");
  });

  // ---------- PWA ----------
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(()=>{});
  }

  // ---------- INIT ----------
  qs("#year").textContent = String(new Date().getFullYear());

  applyLocalOverrides();
  buildCurrencySelect();
  applyLanguage();

  // default tier
  setTier(state.tier);
  applyTierGates();

  // Load fitment badge on startup
  updateFitmentUI();

  initTroubleshooter();
  initParts();
  renderCart();
  renderMechanics();

  setView("troubleshooter");
})();
