// ============================================================
// WEBFLOW AUDITOR — sitemap-auditor.js
// Dedicated tab for shadow sitemap.xml audits
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
  pass: { icon: "✓", label: "OK", cls: "status-pass" },
  warn: { icon: "!", label: "Advertencia", cls: "status-warn" },
  fail: { icon: "✕", label: "Error", cls: "status-fail" },
  info: { icon: "i", label: "Info", cls: "status-info" },
};

let sitemapAudits = {}; // Map of URL -> auditData
let isSitemapAuditRunning = false;
let sitemapUrlsToAudit = [];
let currentSitemapIndex = 0;

let activeLocateKey = null;
let activeLocateBtn = null;

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  // Parse sitemapUrl query parameter
  const params = new URLSearchParams(window.location.search);
  const sitemapUrlParam = params.get("url");

  if (sitemapUrlParam) {
    document.getElementById("sitemapUrl").value = sitemapUrlParam;
    startSitemapAudit();
  }

  // Setup event listeners
  document.getElementById("runSitemapAudit").addEventListener("click", startSitemapAudit);
  document.getElementById("cancelSitemapBtn").addEventListener("click", cancelSitemapAudit);
  document.getElementById("exportSitemapBtn").addEventListener("click", exportSitemapReport);
  document.getElementById("exportSitemapCsvBtn").addEventListener("click", exportSitemapCsvReport);
});

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
  document.getElementById("exportSitemapCsvBtn").classList.add("hidden");
  document.getElementById("sitemapProgress").classList.remove("hidden");
  document.getElementById("sitemapStats").classList.add("hidden");
  document.getElementById("tableWrapper").classList.add("hidden");
  document.getElementById("inspectorSection").classList.add("hidden");
  document.getElementById("pagesTableBody").innerHTML = "";
  
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

    // Filter to only include URLs on the same domain and likely HTML
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

async function auditNextSitemapUrl() {
  if (!isSitemapAuditRunning) return;

  if (currentSitemapIndex >= sitemapUrlsToAudit.length) {
    // Finished!
    isSitemapAuditRunning = false;
    document.getElementById("runSitemapAudit").disabled = false;
    document.getElementById("cancelSitemapBtn").classList.add("hidden");
    document.getElementById("exportSitemapBtn").classList.remove("hidden");
    document.getElementById("exportSitemapCsvBtn").classList.remove("hidden");
    updateSitemapProgress(100, "Auditoría completada exitosamente.");
    finalizeSitemapReport();
    return;
  }

  const url = sitemapUrlsToAudit[currentSitemapIndex];
  const percent = Math.round((currentSitemapIndex / sitemapUrlsToAudit.length) * 100);
  updateSitemapProgress(percent, `[${currentSitemapIndex + 1}/${sitemapUrlsToAudit.length}] Auditando: ${new URL(url).pathname}`);

  try {
    // Shadow Audit via fetch + DOMParser
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}`);
    }
    const htmlText = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, "text/html");

    // Run the auditor logic loaded from content.js
    const auditData = WFAuditor.run(doc, url);
    sitemapAudits[url] = auditData;

    // Add page row to table immediately for real-time visual progress
    addPageRowToTable(url, auditData);

  } catch (err) {
    console.error("Failed auditing URL shadow-mode: " + url, err);
    // Add failed audit entry so report can compile
    sitemapAudits[url] = {
      url: url,
      title: "No disponible",
      timestamp: new Date().toISOString(),
      categories: {
        seo: [{ id: "fetch-fail", name: "Carga de página", status: "fail", detail: `No se pudo obtener la página: ${err.message}` }],
        performance: [],
        mobile: [],
        accessibility: []
      }
    };
    addPageRowToTable(url, sitemapAudits[url]);
  }

  currentSitemapIndex++;
  // Visual delay for nice flow & prevent rate limits
  setTimeout(auditNextSitemapUrl, 100);
}

function addPageRowToTable(url, audit) {
  const tableWrapper = document.getElementById("tableWrapper");
  tableWrapper.classList.remove("hidden");

  const tbody = document.getElementById("pagesTableBody");
  const row = document.createElement("tr");
  row.setAttribute("data-url", url);

  let totalErrors = 0;
  const scores = {};

  Object.entries(audit.categories).forEach(([catKey, checks]) => {
    const total = checks.length;
    const passed = checks.filter((c) => c.status === "pass" || c.status === "info").length;
    const score = total > 0 ? Math.round((passed / total) * 100) : 100;
    scores[catKey] = score;

    const catErrors = checks.filter((c) => c.status === "fail").length;
    totalErrors += catErrors;
  });

  const avgScore = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length);

  const getScoreBadgeClass = (score) => {
    return score >= 80 ? "score-good" : score >= 50 ? "score-warn" : "score-bad";
  };

  const pathname = new URL(url).pathname || "/";

  row.innerHTML = `
    <td style="font-weight: 600; color: #334155;">${pathname}</td>
    <td><span class="score-badge ${getScoreBadgeClass(scores.seo)}">${scores.seo}%</span></td>
    <td><span class="score-badge ${getScoreBadgeClass(scores.performance)}">${scores.performance}%</span></td>
    <td><span class="score-badge ${getScoreBadgeClass(scores.mobile)}">${scores.mobile}%</span></td>
    <td><span class="score-badge ${getScoreBadgeClass(scores.accessibility)}">${scores.accessibility}%</span></td>
    <td style="font-weight: 700; color: ${totalErrors > 0 ? '#ef4444' : '#10b981'}">${totalErrors}</td>
  `;

  row.addEventListener("click", () => {
    // Deselect other rows
    tbody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
    row.classList.add("selected");
    inspectPageDetails(url);
  });

  tbody.appendChild(row);
}

function inspectPageDetails(url) {
  const inspectorSection = document.getElementById("inspectorSection");
  inspectorSection.classList.remove("hidden");
  
  const parsed = new URL(url);
  document.getElementById("inspectorTitle").textContent = `Inspección Detallada: ${parsed.pathname || "/"}`;
  
  const auditData = sitemapAudits[url];
  renderResults(auditData, "sitemapPageSummary", "sitemapPageDetails");

  // Scroll to inspector smoothly
  inspectorSection.scrollIntoView({ behavior: "smooth" });
}

function finalizeSitemapReport() {
  document.getElementById("sitemapStats").classList.remove("hidden");
  
  const pages = Object.keys(sitemapAudits);
  const total = pages.length;
  document.getElementById("statTotalChecked").textContent = total;

  let totalScoreSum = 0;
  let totalErrors = 0;
  
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
  });

  const finalAvg = total > 0 ? Math.round(totalScoreSum / total) : 0;
  document.getElementById("statAvgScore").textContent = finalAvg + "%";
  document.getElementById("statTotalErrors").textContent = totalErrors;

  // Color average score
  const avgEl = document.getElementById("statAvgScore");
  avgEl.className = "stat-num " + (finalAvg >= 80 ? "color-pass" : finalAvg >= 50 ? "color-warn" : "color-fail");
}

// ─── Render Inspector Results ────────────────────────────────
function renderResults(data, summaryId, resultsId) {
  const summaryEl = document.getElementById(summaryId);
  const resultsEl = document.getElementById(resultsId);

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
    let scorePrefix = "sitemapScore";
    let numPrefix = "sitemapNum";
    
    const suffix = CATEGORY_ID_MAP[key] || capitalize(key);
    const numEl = document.getElementById(numPrefix + suffix);
    const cardEl = document.getElementById(scorePrefix + suffix);
    
    if (numEl && cardEl) {
      numEl.textContent = score + "%";
      cardEl.style.setProperty('--percentage', score);
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
      <div class="category-header" data-category="${key}" style="cursor: pointer;">
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

// ─── Locate Element inside new tab ────────────────────────────
let locateTabId = null;

function resetActiveLocate() {
  if (activeLocateBtn) {
    activeLocateBtn.textContent = "📍 Localizar";
    activeLocateBtn.classList.remove("active");
    activeLocateBtn.disabled = false;
  }
  activeLocateBtn = null;
  activeLocateKey = null;
}

function handleLocateElement(e) {
  const btn = e.currentTarget;
  const wfaId = btn.getAttribute("data-wfa-id");
  const selector = btn.getAttribute("data-selector");
  const targetUrl = btn.getAttribute("data-url");

  btn.textContent = "⏳ Abriendo...";
  btn.disabled = true;

  const performHighlight = (tabId) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(() => {
          chrome.scripting.executeScript({ target: { tabId: tabId }, files: ["content.js"] }, () => {
            chrome.tabs.sendMessage(tabId, { action: "locateElement", id: wfaId, selector, pageAuditData: sitemapAudits[targetUrl] }, (res) => {
              btn.textContent = "📍 Localizado";
              btn.disabled = false;
              if (chrome.runtime.lastError || !res || !res.success) {
                console.warn("Could not highlight element on tab");
              }
            });
          });
        }, 1000);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  };

  if (locateTabId !== null) {
    // Check if the tab still exists
    chrome.tabs.get(locateTabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        // Tab was closed, open a new one
        chrome.tabs.create({ url: targetUrl, active: true }, (newTab) => {
          locateTabId = newTab.id;
          performHighlight(newTab.id);
        });
      } else {
        // Reuse the existing tab, navigate it and focus it
        chrome.tabs.update(locateTabId, { url: targetUrl, active: true }, (updatedTab) => {
          // Check if already loaded on the correct URL
          const currentUrlClean = (updatedTab.url || "").split('#')[0].split('?')[0];
          const targetUrlClean = targetUrl.split('#')[0].split('?')[0];
          
          if (updatedTab.status === "complete" && currentUrlClean === targetUrlClean) {
            chrome.scripting.executeScript({ target: { tabId: locateTabId }, files: ["content.js"] }, () => {
              chrome.tabs.sendMessage(locateTabId, { action: "locateElement", id: wfaId, selector, pageAuditData: sitemapAudits[targetUrl] }, (res) => {
                btn.textContent = "📍 Localizado";
                btn.disabled = false;
              });
            });
          } else {
            performHighlight(locateTabId);
          }
        });
      }
    });
  } else {
    // First time locating, open a new tab
    chrome.tabs.create({ url: targetUrl, active: true }, (newTab) => {
      locateTabId = newTab.id;
      performHighlight(newTab.id);
    });
  }
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

function exportSitemapCsvReport() {
  if (Object.keys(sitemapAudits).length === 0) return;
  
  const headers = ["Pagina URL", "SEO Score %", "Performance Score %", "Mobile Score %", "Accessibility Score %", "Total Errores", "Errores Detalle"];
  const rows = [];
  
  Object.entries(sitemapAudits).forEach(([url, audit]) => {
    let totalErrors = 0;
    const scores = {};
    const errorDetailsList = [];

    Object.entries(audit.categories).forEach(([catKey, checks]) => {
      const total = checks.length;
      const passed = checks.filter((c) => c.status === "pass" || c.status === "info").length;
      const score = total > 0 ? Math.round((passed / total) * 100) : 100;
      scores[catKey] = score;

      const failedChecks = checks.filter((c) => c.status === "fail");
      totalErrors += failedChecks.length;
      failedChecks.forEach(c => {
        errorDetailsList.push(`[${catKey.toUpperCase()}] ${c.name}: ${c.detail || ""}`);
      });
    });

    const errorDetailsString = errorDetailsList.join(" | ");
    
    const csvEscape = (val) => {
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    rows.push([
      csvEscape(url),
      scores.seo,
      scores.performance,
      scores.mobile,
      scores.accessibility,
      totalErrors,
      csvEscape(errorDetailsString)
    ].join(","));
  });

  const csvContent = [headers.join(",")].concat(rows).join("\n");
  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { // UTF-8 BOM
    type: "text/csv;charset=utf-8",
  });
  const fileUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = fileUrl;
  const sitemapUrl = document.getElementById("sitemapUrl").value;
  let sitemapDomain = "domain";
  try {
    sitemapDomain = new URL(sitemapUrl).hostname.replace(/\./g, "-");
  } catch (e) {}
  a.download = `webflow-audit-report-${sitemapDomain}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(fileUrl);
}

// ─── Helpers ─────────────────────────────────────────────────
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
