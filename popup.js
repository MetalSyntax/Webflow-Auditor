// ============================================================
// WEBFLOW AUDITOR — popup.js
// ============================================================

const CATEGORY_LABELS = {
  seo: "🔎 SEO",
  performance: "⚡ Performance",
  mobile: "📱 Mobile",
  accessibility: "♿ Accesibilidad",
};

const STATUS_CONFIG = {
  pass: { icon: "✅", label: "OK", cls: "status-pass" },
  warn: { icon: "⚠️", label: "Advertencia", cls: "status-warn" },
  fail: { icon: "❌", label: "Error", cls: "status-fail" },
  info: { icon: "ℹ️", label: "Info", cls: "status-info" },
};

let lastResults = null;

// ─── Init ───────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url || "";
    const urlEl = document.getElementById("pageUrl");
    try {
      urlEl.textContent = new URL(url).hostname + new URL(url).pathname;
    } catch {
      urlEl.textContent = url.substring(0, 50);
    }
  });

  document.getElementById("runAudit").addEventListener("click", runAudit);
  document.getElementById("exportBtn").addEventListener("click", exportReport);
});

// ─── Run Audit ───────────────────────────────────────────────
function runAudit() {
  const btn = document.getElementById("runAudit");
  const btnText = document.getElementById("btnText");
  const loader = document.getElementById("btnLoader");

  btn.disabled = true;
  btnText.classList.add("hidden");
  loader.classList.remove("hidden");
  document.getElementById("results").innerHTML = "";
  document.getElementById("results").classList.add("hidden");
  document.getElementById("summary").classList.add("hidden");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "runAudit" }, (response) => {
      btn.disabled = false;
      btnText.classList.remove("hidden");
      loader.classList.add("hidden");

      if (chrome.runtime.lastError || !response) {
        showError(
          "No se pudo conectar con la página. Recarga la pestaña e intenta de nuevo.",
        );
        return;
      }
      if (!response.success) {
        showError("Error: " + response.error);
        return;
      }

      lastResults = response.data;
      renderResults(response.data);
      document.getElementById("exportBtn").classList.remove("hidden");
    });
  });
}

// ─── Render Results ──────────────────────────────────────────
function renderResults(data) {
  const summary = document.getElementById("summary");
  const resultsEl = document.getElementById("results");

  summary.classList.remove("hidden");
  resultsEl.classList.remove("hidden");
  resultsEl.innerHTML = "";

  const categories = data.categories;

  Object.entries(categories).forEach(([key, checks]) => {
    const total = checks.length;
    const passed = checks.filter(
      (c) => c.status === "pass" || c.status === "info",
    ).length;
    const score = total > 0 ? Math.round((passed / total) * 100) : 100;

    // Score card
    const numEl = document.getElementById("num" + capitalize(key));
    const cardEl = document.getElementById("score" + capitalize(key));
    if (numEl) {
      numEl.textContent = score + "%";
      cardEl.classList.remove("score-bad", "score-warn", "score-good");
      cardEl.classList.add(
        score >= 80 ? "score-good" : score >= 50 ? "score-warn" : "score-bad",
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
      <div class="category-body" id="cat-${key}"></div>
    `;

    const body = section.querySelector(`#cat-${key}`);

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
          const errText = Object.entries(err)
            .map(
              ([k, v]) =>
                `<span class="err-key">${k}:</span> <span class="err-val">${escapeHTML(String(v))}</span>`,
            )
            .join(" ");
          errorsHTML += `<div class="check-error-item">${errText}</div>`;
        });
        errorsHTML += "</div>";
      }

      let mapHTML = "";
      if (check.map && check.status !== "pass") {
        mapHTML = `<div class="check-map"><code>${check.map.join("<br>")}</code></div>`;
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
}

// ─── Export ──────────────────────────────────────────────────
function exportReport() {
  if (!lastResults) return;

  const lines = [];
  lines.push(`WEBFLOW SEO & A11Y AUDITOR`);
  lines.push(`Página: ${lastResults.url}`);
  lines.push(
    `Fecha: ${new Date(lastResults.timestamp).toLocaleString("es-VE")}`,
  );
  lines.push("=".repeat(60));

  Object.entries(lastResults.categories).forEach(([key, checks]) => {
    lines.push(`\n${CATEGORY_LABELS[key] || key.toUpperCase()}`);
    lines.push("-".repeat(40));
    checks.forEach((c) => {
      const cfg = STATUS_CONFIG[c.status] || {};
      lines.push(
        `${cfg.icon || "•"} [${(c.status || "").toUpperCase()}] ${c.name}`,
      );
      lines.push(`   ${c.detail || ""}`);
      if (c.errors && c.errors.length > 0 && c.status !== "pass") {
        c.errors.forEach((err) => {
          lines.push(
            `   → ${Object.entries(err)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" | ")}`,
          );
        });
      }
      if (c.fix) {
        lines.push(`   💡 Solución: ${c.fix}`);
      }
      lines.push("");
    });
  });

  const blob = new Blob([lines.join("\n")], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `webflow-audit-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Helpers ─────────────────────────────────────────────────
function showError(msg) {
  const r = document.getElementById("results");
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
