// ============================================================
// WEBFLOW AUDITOR — popup.js
// ============================================================

const CATEGORY_LABELS = {
  seo: "🔎 SEO",
  performance: "⚡ Performance",
  mobile: "📱 Mobile",
  accessibility: "♿ Accesibilidad",
};

const CATEGORY_ID_MAP = {
  seo: "SEO",
  performance: "Perf",
  mobile: "Mobile",
  accessibility: "A11y",
};

const STATUS_CONFIG = {
  pass: { icon: "✅", label: "OK", cls: "status-pass" },
  warn: { icon: "⚠️", label: "Advertencia", cls: "status-warn" },
  fail: { icon: "❌", label: "Error", cls: "status-fail" },
  info: { icon: "ℹ️", label: "Info", cls: "status-info" },
};

let lastSingleResults = null;
let sitemapAudits = {}; // Map of URL -> auditData
let isSitemapAuditRunning = false;
let sitemapUrlsToAudit = [];
let currentSitemapIndex = 0;
let activeTabId = null;

// ─── Locate toggle state ─────────────────────────────────────
let activeLocateKey = null; // wfaId or selector of the highlighted element
let activeLocateBtn = null; // DOM button currently in "active" state

// ─── Init ───────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Tabs Navigation
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((c) => c.classList.add("hidden"));
      
      btn.classList.add("active");
      const activeTabId = btn.getAttribute("data-tab");
      document.getElementById(activeTabId).classList.remove("hidden");
    });
  });

  // Get active tab details
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (!activeTab) return;
    
    activeTabId = activeTab.id;
    const url = activeTab.url || "";
    const urlEl = document.getElementById("pageUrl");
    try {
      const parsedUrl = new URL(url);
      urlEl.textContent = parsedUrl.hostname + parsedUrl.pathname;
      
      // Pre-fill sitemap URL with the current origin
      document.getElementById("sitemapUrl").value = parsedUrl.origin + "/sitemap.xml";
    } catch {
      urlEl.textContent = url.substring(0, 50);
      document.getElementById("sitemapUrl").value = "";
    }

    // Try loading persistent single-page audit results
    chrome.storage.local.get([url], (res) => {
      if (res && res[url]) {
        lastSingleResults = res[url];
        renderResults(lastSingleResults, "summary", "results");
        document.getElementById("exportBtn").classList.remove("hidden");
      }
    });
  });

  // Try loading persistent sitemap audit results
  chrome.storage.local.get(["sitemap_audit_data"], (res) => {
    if (res && res.sitemap_audit_data) {
      const data = res.sitemap_audit_data;
      if (data.sitemapUrl) {
        document.getElementById("sitemapUrl").value = data.sitemapUrl;
      }
      sitemapAudits = data.sitemapAudits || {};
      if (Object.keys(sitemapAudits).length > 0) {
        finalizeSitemapReport();
        document.getElementById("exportSitemapBtn").classList.remove("hidden");
      }
    }
  });

  // Single page buttons
  document.getElementById("runAudit").addEventListener("click", runSingleAudit);
  document.getElementById("exportBtn").addEventListener("click", exportSingleReport);

  // Sitemap buttons
  document.getElementById("runSitemapAudit").addEventListener("click", startSitemapAudit);
  document.getElementById("cancelSitemapBtn").addEventListener("click", cancelSitemapAudit);
  document.getElementById("exportSitemapBtn").addEventListener("click", exportSitemapReport);
  document.getElementById("sitemapPageSelector").addEventListener("change", handleSitemapPageSelect);
});

// ─── Run Single Audit ─────────────────────────────────────────
function runSingleAudit() {
  const btn = document.getElementById("runAudit");
  const btnText = document.getElementById("btnText");
  const loader = document.getElementById("btnLoader");

  btn.disabled = true;
  btnText.classList.add("hidden");
  loader.classList.remove("hidden");
  
  const resultsEl = document.getElementById("results");
  resultsEl.innerHTML = "";
  resultsEl.classList.add("hidden");
  document.getElementById("summary").classList.add("hidden");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0].id;
    chrome.tabs.sendMessage(tabId, { action: "runAudit" }, (response) => {
      btn.disabled = false;
      btnText.classList.remove("hidden");
      loader.classList.add("hidden");

      if (chrome.runtime.lastError || !response) {
        showError(
          "results",
          "No se pudo conectar con la página. Recarga la pestaña e intenta de nuevo."
        );
        return;
      }
      if (!response.success) {
        showError("results", "Error: " + response.error);
        return;
      }

      lastSingleResults = response.data;
      renderResults(response.data, "summary", "results");
      document.getElementById("exportBtn").classList.remove("hidden");
      
      // Persist results
      chrome.storage.local.set({ [response.data.url]: response.data });
    });
  });
}

// ─── Render Results ──────────────────────────────────────────
function renderResults(data, summaryId, resultsId) {
  const summaryEl = document.getElementById(summaryId);
  const resultsEl = document.getElementById(resultsId);

  // Limpia estado de localización al re-renderizar
  resetActiveLocate();

  summaryEl.classList.remove("hidden");
  resultsEl.classList.remove("hidden");
  resultsEl.innerHTML = "";

  const categories = data.categories;

  Object.entries(categories).forEach(([key, checks]) => {
    const total = checks.length;
    const passed = checks.filter(
      (c) => c.status === "pass" || c.status === "info"
    ).length;
    const score = total > 0 ? Math.round((passed / total) * 100) : 100;

    // Score card updates
    let scorePrefix = summaryId === "sitemapPageSummary" ? "sitemapScore" : "score";
    let numPrefix = summaryId === "sitemapPageSummary" ? "sitemapNum" : "num";
    
    const suffix = CATEGORY_ID_MAP[key] || capitalize(key);
    const numEl = document.getElementById(numPrefix + suffix);
    const cardEl = document.getElementById(scorePrefix + suffix);
    
    if (numEl && cardEl) {
      numEl.textContent = score + "%";
      cardEl.classList.remove("score-bad", "score-warn", "score-good");
      cardEl.classList.add(
        score >= 80 ? "score-good" : score >= 50 ? "score-warn" : "score-bad"
      );
    }

    // Category section
    const section = document.createElement("div");
    section.className = "category";

    const errors = checks.filter((c) => c.status === "fail");
    const warns = checks.filter((c) => c.status === "warn");

    section.innerHTML = `
      <div class="category-header" data-category="${key}">
        <span class="category-label">${CATEGORY_LABELS[key] || key}</span>
        <div class="category-badges">
          ${errors.length > 0 ? `<span class="badge badge-fail">${errors.length} error${errors.length > 1 ? "es" : ""}</span>` : ""}
          ${warns.length > 0 ? `<span class="badge badge-warn">${warns.length} aviso${warns.length > 1 ? "s" : ""}</span>` : ""}
          ${errors.length === 0 && warns.length === 0 ? '<span class="badge badge-pass">Todo OK</span>' : ""}
        </div>
        <span class="category-toggle">▼</span>
      </div>
      <div class="category-body" id="${summaryId}-${key}"></div>
    `;

    const body = section.querySelector(`#${summaryId}-${key}`);

    const sorted = [...checks].sort((a, b) => {
      const order = { fail: 0, warn: 1, pass: 2, info: 3 };
      return (order[a.status] ?? 4) - (order[b.status] ?? 4);
    });

    sorted.forEach((check) => {
      const cfg = STATUS_CONFIG[check.status] || STATUS_CONFIG.info;
      const item = document.createElement("div");
      item.className = `check-item ${cfg.cls}`;

      let errorsHTML = "";
      if (check.errors && check.errors.length > 0 && check.status !== "pass") {
        errorsHTML = '<div class="check-errors">';
        check.errors.forEach((err) => {
          const { wfaId, selector, html, ...otherFields } = err;
          
          let otherText = Object.entries(otherFields)
            .map(([k, v]) => `<span class="err-key">${k}:</span> <span class="err-val">${escapeHTML(String(v))}</span>`)
            .join(" ");

          let highlightBtn = "";
          let codeBlock = "";
          
          if (wfaId || selector) {
            highlightBtn = `<button class="wfa-locate-btn" data-wfa-id="${wfaId || ''}" data-selector="${escapeHTML(selector || '')}" data-url="${escapeHTML(data.url)}">📍 Localizar</button>`;
          }
          if (html) {
            codeBlock = `
              <div class="wfa-code-detail">
                <div class="wfa-code-header">Código HTML:</div>
                <pre class="wfa-code-block"><code>${highlightHTML(escapeHTML(html))}</code></pre>
              </div>
            `;
          }

          errorsHTML += `
            <div class="check-error-item-container">
              <div class="check-error-item">
                <span class="check-error-text">${otherText || 'Detalle del error'}</span>
                ${highlightBtn}
              </div>
              ${codeBlock}
            </div>
          `;
        });
        errorsHTML += "</div>";
      }

      let mapHTML = "";
      if (check.map && check.status !== "pass") {
        mapHTML = `<div class="check-map"><code>${check.map.map(escapeHTML).join("<br>")}</code></div>`;
      }

      let fixHTML = "";
      if (check.fix && check.status !== "pass" && check.status !== "info") {
        fixHTML = `<div class="check-fix"><strong>💡 Solución en Webflow:</strong><pre>${escapeHTML(check.fix)}</pre></div>`;
      }

      item.innerHTML = `
        <div class="check-header" data-id="${check.id}">
          <span class="check-icon">${cfg.icon}</span>
          <span class="check-name">${escapeHTML(check.name)}</span>
          <span class="check-toggle">${check.fix || check.errors?.length > 0 ? "›" : ""}</span>
        </div>
        <div class="check-detail">${escapeHTML(check.detail || "")}</div>
        <div class="check-body hidden">
          ${errorsHTML}
          ${mapHTML}
          ${fixHTML}
        </div>
      `;

      if (check.fix || (check.errors && check.errors.length > 0) || check.map) {
        item.querySelector(".check-header").addEventListener("click", () => {
          const body = item.querySelector(".check-body");
          const toggle = item.querySelector(".check-toggle");
          body.classList.toggle("hidden");
          toggle.textContent = body.classList.contains("hidden") ? "›" : "⌄";
        });
        item.querySelector(".check-header").style.cursor = "pointer";
      }

      body.appendChild(item);
    });

    section.querySelector(".category-header").addEventListener("click", (e) => {
      if (e.target.closest(".check-header")) return;
      const body = section.querySelector(".category-body");
      const toggle = section.querySelector(".category-toggle");
      body.classList.toggle("collapsed");
      toggle.textContent = body.classList.contains("collapsed") ? "▶" : "▼";
    });

    resultsEl.appendChild(section);
  });

  // Attach toggle listeners to locate buttons
  resultsEl.querySelectorAll(".wfa-locate-btn").forEach((btn) => {
    btn.addEventListener("click", handleLocateElement);
  });
}

// ─── Locate Element (toggle) ─────────────────────────────────
function resetActiveLocate() {
  if (activeLocateBtn) {
    activeLocateBtn.textContent = "📍 Localizar";
    activeLocateBtn.classList.remove("active");
    activeLocateBtn.disabled = false;
  }
  activeLocateBtn = null;
  activeLocateKey = null;
}

function sendRemoveHighlight() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: "removeHighlight" }, () => {});
  });
}

function activateLocateBtn(btn) {
  btn.textContent = "✖ Ocultar";
  btn.classList.add("active");
  btn.disabled = false;
}

function handleLocateElement(e) {
  const btn = e.currentTarget;
  const wfaId = btn.getAttribute("data-wfa-id");
  const selector = btn.getAttribute("data-selector");
  const targetUrl = btn.getAttribute("data-url");
  const key = wfaId || selector;

  // TOGGLE OFF: same button clicked — remove highlight and reset
  if (activeLocateKey === key && activeLocateBtn === btn) {
    sendRemoveHighlight();
    resetActiveLocate();
    return;
  }

  // SWITCH: another button was active — deactivate it before proceeding
  if (activeLocateBtn && activeLocateBtn !== btn) {
    resetActiveLocate();
    sendRemoveHighlight();
  }

  btn.textContent = "⌛";
  btn.disabled = true;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (!activeTab) {
      btn.textContent = "📍 Localizar";
      btn.disabled = false;
      return;
    }

    const cleanTarget = targetUrl.split('#')[0].split('?')[0];
    const cleanActive = (activeTab.url || '').split('#')[0].split('?')[0];

    function onLocateResponse(res) {
      if (chrome.runtime.lastError || !res || !res.success) {
        btn.textContent = "📍 Localizar";
        btn.disabled = false;
        alert(res?.error || "No se pudo resaltar el elemento. La página pudo haber cambiado.");
        return;
      }
      activeLocateKey = key;
      activeLocateBtn = btn;
      activateLocateBtn(btn);
    }

    if (cleanTarget === cleanActive) {
      chrome.tabs.sendMessage(activeTab.id, { action: "locateElement", id: wfaId, selector }, onLocateResponse);
    } else {
      btn.textContent = "⏳ Navegando...";
      chrome.tabs.update(activeTab.id, { url: targetUrl }, () => {
        const listener = (tabId, changeInfo) => {
          if (tabId === activeTab.id && changeInfo.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener);
            setTimeout(() => {
              chrome.tabs.sendMessage(activeTab.id, { action: "locateElement", id: wfaId, selector }, onLocateResponse);
            }, 800);
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    }
  });
}

// ─── Sitemap Audit Flow ──────────────────────────────────────
async function startSitemapAudit() {
  const urlInput = document.getElementById("sitemapUrl");
  const sitemapUrl = urlInput.value.trim();
  
  if (!sitemapUrl) {
    alert("Por favor ingresa una URL de sitemap válida.");
    return;
  }

  isSitemapAuditRunning = true;
  sitemapAudits = {};
  
  // UI States
  document.getElementById("runSitemapAudit").disabled = true;
  document.getElementById("cancelSitemapBtn").classList.remove("hidden");
  document.getElementById("exportSitemapBtn").classList.add("hidden");
  document.getElementById("sitemapProgress").classList.remove("hidden");
  document.getElementById("sitemapResults").classList.add("hidden");
  updateSitemapProgress(0, "Descargando sitemap...");

  try {
    const response = await fetch(sitemapUrl);
    if (!response.ok) throw new Error("No se pudo descargar el sitemap. Status: " + response.status);
    const xmlText = await response.text();

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    
    // Find all <loc> elements
    const locs = Array.from(xmlDoc.getElementsByTagName("loc")).map((l) => l.textContent.trim());
    if (locs.length === 0) {
      throw new Error("No se encontraron URLs de páginas (<loc>) en el sitemap XML.");
    }

    // Filter to only include URLs on the same domain and likely HTML (no pdf, jpg, etc.)
    const cleanUrl = new URL(sitemapUrl);
    sitemapUrlsToAudit = locs.filter((url) => {
      try {
        const u = new URL(url);
        if (u.hostname !== cleanUrl.hostname) return false;
        
        const pathname = u.pathname.toLowerCase();
        if (pathname.endsWith(".png") || pathname.endsWith(".jpg") || pathname.endsWith(".pdf") || pathname.endsWith(".gif") || pathname.endsWith(".css") || pathname.endsWith(".js") || pathname.endsWith(".xml")) {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    });

    if (sitemapUrlsToAudit.length === 0) {
      throw new Error("No se encontraron páginas HTML válidas pertenecientes al mismo dominio.");
    }

    currentSitemapIndex = 0;
    updateSitemapProgress(0, `Encontradas ${sitemapUrlsToAudit.length} páginas. Auditando...`);
    auditNextSitemapUrl();

  } catch (err) {
    isSitemapAuditRunning = false;
    document.getElementById("runSitemapAudit").disabled = false;
    document.getElementById("cancelSitemapBtn").classList.add("hidden");
    document.getElementById("sitemapProgress").classList.add("hidden");
    alert("Error al procesar sitemap: " + err.message);
  }
}

function updateSitemapProgress(percent, text) {
  document.getElementById("progressBar").style.width = percent + "%";
  document.getElementById("progressStatus").textContent = text;
}

function cancelSitemapAudit() {
  isSitemapAuditRunning = false;
  document.getElementById("runSitemapAudit").disabled = false;
  document.getElementById("cancelSitemapBtn").classList.add("hidden");
  updateSitemapProgress(0, "Auditoría cancelada.");
  
  if (Object.keys(sitemapAudits).length > 0) {
    finalizeSitemapReport();
  } else {
    document.getElementById("sitemapProgress").classList.add("hidden");
  }
}

function auditNextSitemapUrl() {
  if (!isSitemapAuditRunning) return;

  if (currentSitemapIndex >= sitemapUrlsToAudit.length) {
    // Finished!
    isSitemapAuditRunning = false;
    document.getElementById("runSitemapAudit").disabled = false;
    document.getElementById("cancelSitemapBtn").classList.add("hidden");
    document.getElementById("exportSitemapBtn").classList.remove("hidden");
    updateSitemapProgress(100, "Auditoría completada exitosamente.");
    finalizeSitemapReport();
    return;
  }

  const url = sitemapUrlsToAudit[currentSitemapIndex];
  const percent = Math.round((currentSitemapIndex / sitemapUrlsToAudit.length) * 100);
  updateSitemapProgress(percent, `[${currentSitemapIndex + 1}/${sitemapUrlsToAudit.length}] Auditando: ${new URL(url).pathname}`);

  // Create background tab to run audit
  chrome.tabs.create({ url: url, active: false }, (tab) => {
    const tabId = tab.id;
    
    // Safety timeout to close tab if it hangs (15s)
    let timeoutId = setTimeout(() => {
      chrome.tabs.remove(tabId);
      console.warn("Audit timeout on URL: " + url);
      currentSitemapIndex++;
      auditNextSitemapUrl();
    }, 15000);

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        
        // Inject script just in case content.js didn't auto-execute
        chrome.scripting.executeScript({ target: { tabId: tabId }, files: ["content.js"] }, () => {
          if (chrome.runtime.lastError) {
             // Script injection failed or tab closed
             clearTimeout(timeoutId);
             chrome.tabs.remove(tabId);
             currentSitemapIndex++;
             auditNextSitemapUrl();
             return;
          }

          // Trigger runAudit on tab
          chrome.tabs.sendMessage(tabId, { action: "runAudit" }, (response) => {
            clearTimeout(timeoutId);
            chrome.tabs.remove(tabId);

            if (response && response.success) {
              sitemapAudits[url] = response.data;
            } else {
              console.warn("Failed response from tab for URL: " + url, response?.error);
            }

            currentSitemapIndex++;
            auditNextSitemapUrl();
          });
        });
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

function finalizeSitemapReport() {
  document.getElementById("sitemapResults").classList.remove("hidden");
  
  const pages = Object.keys(sitemapAudits);
  const total = pages.length;
  document.getElementById("statTotalChecked").textContent = total;

  let totalScoreSum = 0;
  let totalErrors = 0;
  
  // Clear and populate selector dropdown
  const selector = document.getElementById("sitemapPageSelector");
  selector.innerHTML = '<option value="">-- Selecciona una página --</option>';

  pages.forEach((url) => {
    const audit = sitemapAudits[url];
    let pageErrors = 0;
    let categoryScores = [];

    Object.values(audit.categories).forEach((checks) => {
      const catTotal = checks.length;
      const catPassed = checks.filter((c) => c.status === "pass" || c.status === "info").length;
      const catScore = catTotal > 0 ? (catPassed / catTotal) * 100 : 100;
      categoryScores.push(catScore);

      const catErrors = checks.filter((c) => c.status === "fail").length;
      pageErrors += catErrors;
    });

    const avgPageScore = categoryScores.reduce((a, b) => a + b, 0) / categoryScores.length;
    totalScoreSum += avgPageScore;
    totalErrors += pageErrors;

    const opt = document.createElement("option");
    opt.value = url;
    opt.textContent = `(${Math.round(avgPageScore)}%) ${new URL(url).pathname || "/"}`;
    selector.appendChild(opt);
  });

  const finalAvg = total > 0 ? Math.round(totalScoreSum / total) : 0;
  document.getElementById("statAvgScore").textContent = finalAvg + "%";
  document.getElementById("statTotalErrors").textContent = totalErrors;

  // Add coloring classes
  const avgEl = document.getElementById("statAvgScore");
  avgEl.className = "stat-num " + (finalAvg >= 80 ? "color-pass" : finalAvg >= 50 ? "color-warn" : "color-fail");

  // Persist sitemap audits
  chrome.storage.local.set({
    sitemap_audit_data: {
      sitemapUrl: document.getElementById("sitemapUrl").value,
      sitemapAudits: sitemapAudits
    }
  });
}

function handleSitemapPageSelect() {
  const url = document.getElementById("sitemapPageSelector").value;
  const summaryEl = document.getElementById("sitemapPageSummary");
  const detailsEl = document.getElementById("sitemapPageDetails");

  if (!url || !sitemapAudits[url]) {
    summaryEl.classList.add("hidden");
    detailsEl.classList.add("hidden");
    return;
  }

  const auditData = sitemapAudits[url];
  renderResults(auditData, "sitemapPageSummary", "sitemapPageDetails");
}

// ─── Single Page Export Report ─────────────────────────────────
function exportSingleReport() {
  if (!lastSingleResults) return;
  downloadReportText(lastSingleResults.url, { [lastSingleResults.url]: lastSingleResults });
}

// ─── Sitemap Export Report ────────────────────────────────────
function exportSitemapReport() {
  if (Object.keys(sitemapAudits).length === 0) return;
  const sitemapUrl = document.getElementById("sitemapUrl").value;
  downloadReportText(`Sitemap: ${sitemapUrl}`, sitemapAudits);
}

function downloadReportText(title, auditsMap) {
  const lines = [];
  lines.push(`REPORTE DE AUDITORÍA DE WEBFLOW`);
  lines.push(`Origen: ${title}`);
  lines.push(`Fecha: ${new Date().toLocaleString("es-VE")}`);
  lines.push("=".repeat(60));

  Object.entries(auditsMap).forEach(([url, audit]) => {
    lines.push(`\nPÁGINA: ${url}`);
    lines.push("=".repeat(60));

    Object.entries(audit.categories).forEach(([key, checks]) => {
      lines.push(`\n   ${CATEGORY_LABELS[key] || key.toUpperCase()}`);
      lines.push("   " + "-".repeat(40));
      
      checks.forEach((c) => {
        const cfg = STATUS_CONFIG[c.status] || {};
        lines.push(
          `   ${cfg.icon || "•"} [${(c.status || "").toUpperCase()}] ${c.name}`
        );
        lines.push(`      ${c.detail || ""}`);
        if (c.errors && c.errors.length > 0 && c.status !== "pass") {
          c.errors.forEach((err) => {
            const { wfaId, selector, html, ...otherFields } = err;
            lines.push(
              `      → ${Object.entries(otherFields)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" | ")}`
            );
          });
        }
        if (c.fix) {
          lines.push(`      💡 Solución: ${c.fix}`);
        }
        lines.push("");
      });
    });
    lines.push("\n");
  });

  const blob = new Blob([lines.join("\n")], {
    type: "text/plain;charset=utf-8",
  });
  const fileUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = fileUrl;
  a.download = `webflow-audit-report-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(fileUrl);
}

// ─── Helpers ─────────────────────────────────────────────────
function showError(targetId, msg) {
  const r = document.getElementById(targetId);
  r.classList.remove("hidden");
  r.innerHTML = `<div class="error-msg">⚠️ ${escapeHTML(msg)}</div>`;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function highlightHTML(escapedHtml) {
  return escapedHtml
    .replace(/(&lt;\/?[a-zA-Z0-9:-]+)/g, '<span class="code-tag">$1</span>')
    .replace(/(\s)([a-zA-Z0-9:-]+)(=&quot;)/g, '$1<span class="code-attr">$2</span>$3')
    .replace(/(=&quot;)(.*?)(&quot;)/g, '$1<span class="code-string">$2</span>$3')
    .replace(/(&gt;)/g, '<span class="code-tag">&gt;</span>');
}
