// ============================================================
// WEBFLOW SEO & A11Y AUDITOR — content.js
// Corre en el contexto de la página activa
// ============================================================
if (!window.WFAuditorLoaded) {
  window.WFAuditorLoaded = true;
  let doc = typeof window !== 'undefined' && window.document ? window.document : null;

  const WFAuditor = {

  run(customDoc, customUrl) {
    doc = customDoc || (typeof document !== 'undefined' ? document : null);
    
    const rawUrl = customUrl || (typeof location !== 'undefined' ? location.href : '');
    try {
      this.currentUrl = new URL(rawUrl);
    } catch(e) {
      this.currentUrl = {
        href: rawUrl,
        protocol: rawUrl.startsWith('https') ? 'https:' : 'http:',
        pathname: rawUrl.split('?')[0].split('#')[0].replace(/^https?:\/\/[^\/]+/, '') || '/'
      };
    }

    return {
      url: rawUrl,
      title: doc ? doc.title : '',
      timestamp: new Date().toISOString(),
      categories: {
        seo: this.auditSEO(),
        performance: this.auditPerformance(),
        mobile: this.auditMobile(),
        accessibility: this.auditAccessibility()
      }
    };
  },

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────
  registerElementError(el, additionalProps = {}) {
    if (!el) return null;
    let wfaId = el.getAttribute('data-wfa-id');
    if (!wfaId) {
      const selector = this.getUniqueSelector(el);
      wfaId = 'wfa-' + this.hashCode(selector);
      el.setAttribute('data-wfa-id', wfaId);
    }
    let html = el.outerHTML;
    if (html.length > 1200) {
      html = html.substring(0, 600) + ' ... [TRUNCADO] ... ' + html.substring(html.length - 400);
    }
    return {
      wfaId,
      selector: this.getUniqueSelector(el),
      html,
      ...additionalProps
    };
  },

  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  },

  getUniqueSelector(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === Node.ELEMENT_NODE) {
      let name = cur.nodeName.toLowerCase();
      if (cur.id) {
        parts.unshift('#' + CSS.escape(cur.id));
        break;
      }
      let sibling = cur;
      let nth = 1;
      while (sibling = sibling.previousElementSibling) {
        if (sibling.nodeName.toLowerCase() === name) nth++;
      }
      parts.unshift(`${name}:nth-of-type(${nth})`);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  },

  getMetaContent(name) {
    const el = doc.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
    return el ? el.getAttribute('content') || '' : null;
  },

  hasAccessibleName(el) {
    if (!el) return false;
    const text = (el.innerText || el.textContent || '').trim();
    const ariaLabel = el.getAttribute('aria-label') || '';
    const ariaLabelledBy = el.getAttribute('aria-labelledby') || '';
    const title = el.getAttribute('title') || '';
    let imgAlt = '';
    el.querySelectorAll('img').forEach(img => { imgAlt += img.getAttribute('alt') || ''; });
    let svgName = '';
    el.querySelectorAll('svg').forEach(svg => {
      svgName += svg.getAttribute('aria-label') || '';
      const t = svg.querySelector('title');
      if (t) svgName += t.textContent;
    });
    return !!(text || ariaLabel || ariaLabelledBy || title || imgAlt || svgName);
  },

  isHiddenFromAT(el) {
    let node = el;
    while (node) {
      if (node.getAttribute && node.getAttribute('aria-hidden') === 'true') return true;
      node = node.parentElement;
    }
    return false;
  },

  // ─────────────────────────────────────────────
  // SEO AUDIT
  // ─────────────────────────────────────────────
  auditSEO() {
    const checks = [];

    // Title Tag
    const title = doc.title;
    checks.push({
      id: 'title-tag',
      name: 'Title Tag',
      status: title && title.length > 0 && title.length <= 70 ? 'pass' : title.length > 70 ? 'warn' : 'fail',
      detail: title ? `"${title.substring(0,80)}" (${title.length} chars)` : 'No title encontrado',
      fix: title.length > 70
        ? 'En Webflow: Pages → Settings de la página → SEO Title. Reduce a menos de 70 caracteres.'
        : !title ? 'En Webflow: Pages → Settings de la página → SEO Title. Agrega un título descriptivo.' : null
    });

    // Meta Description
    const desc = this.getMetaContent('description');
    checks.push({
      id: 'meta-description',
      name: 'Meta Description',
      status: desc && desc.length >= 50 && desc.length <= 160 ? 'pass' : desc ? 'warn' : 'fail',
      detail: desc ? `"${desc.substring(0,100)}..." (${desc.length} chars)` : 'No meta description encontrada',
      fix: !desc
        ? 'En Webflow: Pages → Settings de la página → Meta Description.'
        : desc.length > 160
          ? 'Meta description muy larga. En Webflow: Pages → Settings → Meta Description. Reduce a 160 caracteres máximo.'
          : desc.length < 50
            ? 'Meta description muy corta. Debería tener al menos 50 caracteres.'
            : null
    });

    // Headings - H1 presente y único
    const h1s = Array.from(doc.querySelectorAll('h1'));
    const h1Errors = h1s.length > 1 ? h1s.map(h => this.registerElementError(h, { text: h.innerText.trim().substring(0, 40) })) : [];
    checks.push({
      id: 'h1-tag',
      name: 'H1 Tag',
      status: h1s.length === 1 ? 'pass' : h1s.length === 0 ? 'fail' : 'warn',
      detail: h1s.length === 0 ? 'No hay H1 en la página' : h1s.length > 1 ? `${h1s.length} H1 encontrados (debe ser solo 1)` : `H1: "${h1s[0].innerText.trim().substring(0,60)}"`,
      errors: h1Errors,
      fix: h1s.length === 0
        ? 'En Webflow: Selecciona el título principal → Settings (⚙️) → Tag → H1.'
        : h1s.length > 1
          ? `En Webflow: Solo un elemento debe tener Tag=H1. Los siguientes deben ser H2 o menor:\n${h1s.slice(1).map(h => '"' + h.innerText.trim().substring(0,40) + '"').join(', ')}`
          : null
    });

    // Heading Order
    const headings = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    let prevLevel = 0;
    const headingErrors = [];
    const headingMap = headings.map((h, i) => {
      const level = parseInt(h.tagName.replace('H',''));
      const text = (h.innerText || '').trim().replace(/\n/g,' ').substring(0,60);
      if (i > 0 && level > prevLevel + 1) {
        headingErrors.push(this.registerElementError(h, { tag: h.tagName, text, prev: prevLevel }));
      }
      prevLevel = level;
      return `${h.tagName}: "${text}"`;
    });
    checks.push({
      id: 'heading-order',
      name: 'Heading Order',
      status: headingErrors.length === 0 ? 'pass' : 'fail',
      detail: headingErrors.length === 0
        ? `${headings.length} headings en orden correcto`
        : headingErrors.map(e => `${e.tag} "${e.text}" viene después de H${e.prev}`).join(' | '),
      map: headingMap,
      errors: headingErrors,
      fix: headingErrors.length > 0
        ? headingErrors.map(e => `• "${e.text}" es ${e.tag} pero viene después de H${e.prev}. En Webflow: selecciona el elemento → Settings (⚙️) → Tag → cambia a H${e.prev + 1}. Si está en Rich Text: doble clic → selecciona el texto → cambia a Heading ${e.prev + 1}.`).join('\n')
        : null
    });

    // Image Alt Attributes
    const imgs = Array.from(doc.querySelectorAll('img'));
    const imgsNoAlt = imgs.filter(img => {
      if (this.isHiddenFromAT(img)) return false;
      const alt = img.getAttribute('alt');
      return alt === null;
    });
    checks.push({
      id: 'image-alt',
      name: 'Alt Attribute (Imágenes)',
      status: imgsNoAlt.length === 0 ? 'pass' : 'fail',
      detail: imgsNoAlt.length === 0
        ? `${imgs.length} imágenes, todas con atributo alt`
        : `${imgsNoAlt.length} imagen(es) sin atributo alt`,
      errors: imgsNoAlt.slice(0,15).map(img => this.registerElementError(img, { src: (img.getAttribute('src')||'').substring(0,80) })),
      fix: imgsNoAlt.length > 0
        ? 'En Webflow: selecciona la imagen → Settings (⚙️) → Alt Text. Para imágenes decorativas escribe un espacio o usa aria-hidden="true" en Custom Attributes.'
        : null
    });

    // Keywords
    const keywords = this.getMetaContent('keywords');
    checks.push({
      id: 'keywords',
      name: 'Meta Keywords',
      status: 'info',
      detail: keywords ? `Presentes: "${keywords.substring(0,80)}"` : 'No se encontraron meta keywords (no crítico para SEO moderno)',
      fix: null
    });

    // SSL
    const isHttps = this.currentUrl && this.currentUrl.protocol === 'https:';
    checks.push({
      id: 'ssl',
      name: 'SSL / HTTPS',
      status: isHttps ? 'pass' : 'fail',
      detail: isHttps ? 'Sitio usa HTTPS correctamente' : 'Sitio NO usa HTTPS',
      fix: !isHttps
        ? 'En Webflow: Publishing → Custom Domain → habilita SSL (Webflow lo gestiona automáticamente con Let\'s Encrypt).'
        : null
    });

    // Underscores en URLs
    const hasUnderscores = this.currentUrl && this.currentUrl.pathname.includes('_');
    checks.push({
      id: 'url-underscores',
      name: 'Underscores en URL',
      status: hasUnderscores ? 'warn' : 'pass',
      detail: hasUnderscores ? `URL actual usa guiones bajos: ${this.currentUrl.pathname}` : 'URL usa guiones medios correctamente',
      fix: hasUnderscores
        ? 'En Webflow: Pages → Settings de la página → Slug. Cambia los guiones bajos (_) por guiones medios (-).'
        : null
    });

    // doc.write check
    checks.push({
      id: 'doc-write',
      name: 'doc.write()',
      status: 'info',
      detail: 'Requiere análisis de scripts externos para detectar uso de doc.write()',
      fix: null
    });

    // Lang attribute
    const htmlEl = doc.documentElement;
    const lang = htmlEl.getAttribute('lang');
    checks.push({
      id: 'html-lang',
      name: 'HTML Lang Attribute',
      status: lang ? 'pass' : 'fail',
      detail: lang ? `lang="${lang}"` : 'El elemento <html> no tiene atributo lang',
      fix: !lang
        ? 'En Webflow: Project Settings → General → Default Language. Selecciona el idioma del sitio.'
        : null
    });

    // iframes sin title
    const iframes = Array.from(doc.querySelectorAll('iframe'));
    const iframesNoTitle = iframes.filter(f => !f.getAttribute('title'));
    checks.push({
      id: 'frame-title',
      name: 'iFrame Titles',
      status: iframesNoTitle.length === 0 ? 'pass' : 'fail',
      detail: iframesNoTitle.length === 0
        ? `${iframes.length} iframes con título`
        : `${iframesNoTitle.length} iframe(s) sin atributo title`,
      errors: iframesNoTitle.slice(0,10).map(f => this.registerElementError(f, { src: (f.getAttribute('src')||'sin src').substring(0,80) })),
      fix: iframesNoTitle.length > 0
        ? 'En Webflow: selecciona el embed/iframe → Custom Attributes → agrega title con una descripción del contenido del iframe (ej: "Video de YouTube", "Mapa de Google").'
        : null
    });

    return checks;
  },

  // ─────────────────────────────────────────────
  // PERFORMANCE AUDIT
  // ─────────────────────────────────────────────
  auditPerformance() {
    const checks = [];

    // DOM Size
    const domCount = doc.querySelectorAll('*').length;
    checks.push({
      id: 'dom-size',
      name: 'DOM Size',
      status: domCount < 1500 ? 'pass' : domCount < 3000 ? 'warn' : 'fail',
      detail: `${domCount} elementos en el DOM (recomendado: < 1,500)`,
      fix: domCount >= 1500
        ? 'En Webflow: Reduce el uso de Symbols anidados complejos, sliders con muchos slides visibles al mismo tiempo, y secciones ocultas en desktop que cargan su DOM igualmente. Considera lazy-load y mostrar/ocultar con display:none en vez de visibility:hidden.'
        : null
    });

    // Meta Viewport
    const viewport = this.getMetaContent('viewport');
    const hasUserScalableNo = viewport && viewport.includes('user-scalable=no');
    const hasMaxScale = viewport && /maximum-scale=([0-9.]+)/.test(viewport) && parseFloat(viewport.match(/maximum-scale=([0-9.]+)/)[1]) < 5;
    checks.push({
      id: 'meta-viewport',
      name: 'Meta Viewport',
      status: !viewport ? 'fail' : (hasUserScalableNo || hasMaxScale) ? 'warn' : 'pass',
      detail: viewport ? `content="${viewport}"` : 'No se encontró meta viewport',
      fix: !viewport
        ? 'En Webflow: esto se agrega automáticamente. Verifica en Project Settings → Custom Code que no se haya eliminado.'
        : (hasUserScalableNo || hasMaxScale)
          ? 'El viewport tiene user-scalable=no o maximum-scale<5 lo que impide el zoom a usuarios con baja visión. En Webflow: Pages → Custom Code → elimina esa restricción del meta viewport.'
          : null
    });

    // Render-blocking
    const blockingScripts = Array.from(doc.querySelectorAll('script[src]')).filter(s => {
      return !s.hasAttribute('async') && !s.hasAttribute('defer') && !s.hasAttribute('type');
    });
    checks.push({
      id: 'render-blocking',
      name: 'Render-blocking Resources',
      status: blockingScripts.length === 0 ? 'pass' : blockingScripts.length <= 2 ? 'warn' : 'fail',
      detail: blockingScripts.length === 0
        ? 'No se detectaron scripts bloqueantes obvios'
        : `${blockingScripts.length} script(s) sin async/defer`,
      errors: blockingScripts.slice(0,10).map(s => {
        let html = s.outerHTML;
        if (html.length > 1200) {
          html = html.substring(0, 600) + ' ... [TRUNCADO] ... ' + html.substring(html.length - 400);
        }
        return {
          src: (s.getAttribute('src')||'').substring(0,80),
          html: html
        };
      }),
      fix: blockingScripts.length > 0
        ? 'En Webflow: Project Settings → Custom Code → Body (en vez de Head) para scripts de terceros. O agrega los atributos async/defer en el tag del script.'
        : null
    });

    // Inline scripts con doc.write
    const scripts = Array.from(doc.querySelectorAll('script:not([src])'));
    const hasDocWrite = scripts.some(s => s.textContent.includes('doc.write'));
    checks.push({
      id: 'doc-write-detected',
      name: 'doc.write() detectado',
      status: hasDocWrite ? 'fail' : 'pass',
      detail: hasDocWrite ? 'Se detectó uso de doc.write() en scripts inline' : 'No se encontró doc.write() en scripts inline',
      fix: hasDocWrite
        ? 'Reemplaza doc.write() con métodos DOM modernos como innerHTML, createElement o insertAdjacentHTML. Revisa el Custom Code en Webflow.'
        : null
    });

    // Cache
    let cacheStatus = 'info';
    let cacheDetail = 'Requiere análisis de headers HTTP (Network tab)';
    try {
      const navEntry = performance.getEntriesByType('navigation')[0];
      if (navEntry) {
        cacheDetail = `Tipo de navegación: ${navEntry.type} | Transfer: ${Math.round(navEntry.transferSize/1024)}KB | Encode: ${Math.round(navEntry.encodedBodySize/1024)}KB`;
        cacheStatus = 'info';
      }
    } catch(e) {}
    checks.push({
      id: 'cache-policy',
      name: 'Cache Policy',
      status: cacheStatus,
      detail: cacheDetail,
      fix: 'Webflow gestiona automáticamente los headers de caché para assets estáticos. Para contenido CMS, revisa en Webflow: Project Settings → Hosting → Cache.'
    });

    // CLS
    let clsValue = null;
    try {
      const clsEntries = [];
      const observer = new PerformanceObserver((list) => {
        clsEntries.push(...list.getEntries());
      });
      observer.observe({ type: 'layout-shift', buffered: true });
      observer.disconnect();
      clsValue = clsEntries.reduce((sum, e) => sum + (e.hadRecentInput ? 0 : e.value), 0);
    } catch(e) {}
    checks.push({
      id: 'cls',
      name: 'CLS — Cumulative Layout Shift',
      status: clsValue === null ? 'info' : clsValue < 0.1 ? 'pass' : clsValue < 0.25 ? 'warn' : 'fail',
      detail: clsValue !== null ? `CLS: ${clsValue.toFixed(4)} (bueno: <0.1, necesita mejora: <0.25)` : 'No se pudo medir CLS en tiempo real',
      fix: clsValue !== null && clsValue >= 0.1
        ? 'En Webflow: agrega width y height explícitos a imágenes y embeds. Evita insertar contenido dinámico sobre contenido existente. Usa aspect-ratio en contenedores de imagen.'
        : null
    });

    // Animated GIFs
    const gifs = Array.from(doc.querySelectorAll('img[src$=".gif"], img[src*=".gif?"]'));
    checks.push({
      id: 'animated-gifs',
      name: 'Animated GIFs',
      status: gifs.length === 0 ? 'pass' : 'warn',
      detail: gifs.length === 0 ? 'No se encontraron GIFs animados' : `${gifs.length} GIF(s) encontrado(s)`,
      errors: gifs.slice(0,10).map(g => this.registerElementError(g, { src: (g.getAttribute('src')||'').substring(0,80) })),
      fix: gifs.length > 0
        ? 'Convierte los GIFs a video WebM/MP4 con un servicio como Cloudinary o FFmpeg. En Webflow usa un elemento Video en lugar de Image para estos casos.'
        : null
    });

    // HTTP/2
    checks.push({
      id: 'http2',
      name: 'HTTP/2',
      status: 'info',
      detail: 'Webflow utiliza HTTP/2 de forma automática en sus dominios de hosting.',
      fix: null
    });

    // Font Display
    const fontLinks = Array.from(doc.querySelectorAll('link[rel="stylesheet"][href*="fonts"]'));
    checks.push({
      id: 'font-display',
      name: 'Font Display',
      status: 'info',
      detail: `${fontLinks.length} stylesheet(s) de fuentes detectados. La propiedad font-display requiere inspección de CSS.`,
      fix: 'En Webflow: si usas Google Fonts, están optimizadas automáticamente. Para fuentes custom en Project Settings → Fonts, asegúrate de subir los formatos WOFF2.'
    });

    return checks;
  },

  // ─────────────────────────────────────────────
  // MOBILE AUDIT
  // ─────────────────────────────────────────────
  auditMobile() {
    const checks = [];

    // Meta Viewport
    const viewport = this.getMetaContent('viewport');
    checks.push({
      id: 'meta-viewport-mobile',
      name: 'Meta Viewport',
      status: viewport ? 'pass' : 'fail',
      detail: viewport ? `✓ Viewport configurado: "${viewport}"` : 'Falta meta viewport',
      fix: !viewport ? 'En Webflow: se añade automáticamente. Verifica que no se haya removido en Custom Code.' : null
    });

    // Flash
    const flashObjects = doc.querySelectorAll('object[type*="flash"], embed[type*="flash"]');
    checks.push({
      id: 'flash',
      name: 'Flash Use',
      status: flashObjects.length === 0 ? 'pass' : 'fail',
      detail: flashObjects.length === 0 ? 'No se encontró Flash' : `${flashObjects.length} elemento(s) Flash detectado(s)`,
      fix: flashObjects.length > 0 ? 'Elimina todos los elementos Flash. Webflow no soporta Flash y los navegadores modernos tampoco.' : null
    });

    // Touch targets
    const interactive = Array.from(doc.querySelectorAll('a, button, [role="button"]'));
    const smallTargets = interactive.filter(el => {
      try {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
      } catch(e) { return false; }
    });
    checks.push({
      id: 'clickable-taps',
      name: 'Clickable Tap Targets',
      status: smallTargets.length === 0 ? 'pass' : smallTargets.length <= 3 ? 'warn' : 'fail',
      detail: smallTargets.length === 0
        ? 'Todos los elementos interactivos tienen tamaño adecuado (≥44×44px)'
        : `${smallTargets.length} elemento(s) con área de toque menor a 44×44px`,
      errors: smallTargets.slice(0,15).map(el => {
        const r = el.getBoundingClientRect();
        return this.registerElementError(el, { tag: el.tagName, text: (el.innerText||'').trim().substring(0,30), size: `${Math.round(r.width)}×${Math.round(r.height)}px` });
      }),
      fix: smallTargets.length > 0
        ? 'En Webflow: selecciona el elemento → Style panel → agrega padding mínimo o un min-width/min-height de 44px para mejorar la usabilidad táctil.'
        : null
    });

    // Font size
    const textEls = Array.from(doc.querySelectorAll('p, span, li, td, div'));
    const smallFonts = textEls.filter(el => {
      try {
        const style = window.getComputedStyle(el);
        const size = parseFloat(style.fontSize);
        const text = (el.innerText || '').trim();
        return size < 12 && text.length > 0 && el.children.length === 0;
      } catch(e) { return false; }
    });
    checks.push({
      id: 'font-size',
      name: 'Font Size',
      status: smallFonts.length === 0 ? 'pass' : 'warn',
      detail: smallFonts.length === 0
        ? 'Todos los textos tienen tamaño legible (≥12px)'
        : `${smallFonts.length} texto(s) con font-size menor a 12px`,
      errors: smallFonts.slice(0,15).map(el => {
        const s = window.getComputedStyle(el);
        return this.registerElementError(el, { text: (el.innerText||'').substring(0,30), size: s.fontSize });
      }),
      fix: smallFonts.length > 0
        ? 'En Webflow: selecciona el elemento → Style panel → Typography → Font Size. El mínimo recomendado para móvil es 16px para texto de cuerpo.'
        : null
    });

    // Content size
    const hasHScroll = doc.documentElement.scrollWidth > window.innerWidth;
    checks.push({
      id: 'content-size',
      name: 'Content Size (sin scroll horizontal)',
      status: hasHScroll ? 'warn' : 'pass',
      detail: hasHScroll
        ? `Scroll horizontal detectado: contenido mide ${doc.documentElement.scrollWidth}px, viewport ${window.innerWidth}px`
        : 'No hay scroll horizontal — contenido cabe en el viewport',
      fix: hasHScroll
        ? 'En Webflow: activa el Breakpoint Móvil (375px) y busca elementos con width fijo que excedan el ancho. Usa width: 100% o max-width en vez de valores fijos en píxeles.'
        : null
    });

    return checks;
  },

  // ─────────────────────────────────────────────
  // ACCESSIBILITY AUDIT
  // ─────────────────────────────────────────────
  auditAccessibility() {
    const checks = [];

    // button-name
    const buttons = Array.from(doc.querySelectorAll('button, [role="button"]'));
    const badBtns = buttons.filter(btn => {
      if (this.isHiddenFromAT(btn)) return false;
      return !this.hasAccessibleName(btn);
    });
    checks.push({
      id: 'button-name',
      name: 'Button Name',
      status: badBtns.length === 0 ? 'pass' : 'fail',
      detail: badBtns.length === 0
        ? `${buttons.length} botones con nombre accesible`
        : `${badBtns.length} botón/es sin nombre accesible`,
      errors: badBtns.slice(0,15).map(btn => {
        const p2 = btn.parentElement && btn.parentElement.parentElement;
        const ctx = p2 ? (p2.innerText||'').trim().replace(/\n/g,' ').substring(0,60) : '';
        return this.registerElementError(btn, { ctx });
      }),
      fix: badBtns.length > 0
        ? 'En Webflow: selecciona el botón → Settings (⚙️) → Custom Attributes → "+" → Name: aria-label → Value: descripción de la acción. Para botones overlay con clase clickable_btn, agrega el aria-label directamente al botón.'
        : null
    });

    // link-name
    const links = Array.from(doc.querySelectorAll('a'));
    const badLinks = links.filter(link => {
      if (this.isHiddenFromAT(link)) return false;
      return !this.hasAccessibleName(link);
    });
    checks.push({
      id: 'link-name',
      name: 'Link Name',
      status: badLinks.length === 0 ? 'pass' : 'fail',
      detail: badLinks.length === 0
        ? `${links.length} links con nombre discernible`
        : `${badLinks.length} link(s) sin nombre discernible`,
      errors: badLinks.slice(0,15).map(link => {
        const p2 = link.parentElement && link.parentElement.parentElement;
        const ctx = p2 ? (p2.innerText||'').trim().replace(/\n/g,' ').substring(0,60) : '';
        return { href: (link.getAttribute('href')||'').substring(0,70), cls: link.className.substring(0,60), ctx };
      }),
      fix: badLinks.length > 0
        ? 'En Webflow: selecciona el Link Block → Settings (⚙️) → Custom Attributes → Name: aria-label → Value: descripción del destino. Si el link tiene un <span class="u-sr-only"> vacío, agrega el texto directamente a ese span (doble clic sobre él).'
        : null
    });

    // heading-order
    const hEls = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    let prevLvl = 0;
    const hErrors = [];
    hEls.forEach((h, i) => {
      const level = parseInt(h.tagName.replace('H',''));
      const text = (h.innerText||'').trim().replace(/\n/g,' ').substring(0,60);
      if (i > 0 && level > prevLvl + 1) {
        hErrors.push(this.registerElementError(h, { tag: h.tagName, text, prev: prevLvl }));
      }
      prevLvl = level;
    });
    checks.push({
      id: 'heading-order',
      name: 'Heading Order',
      status: hErrors.length === 0 ? 'pass' : 'fail',
      detail: hErrors.length === 0
        ? `${hEls.length} headings en orden secuencial correcto`
        : hErrors.map(e => `${e.tag} "${e.text}" (salta desde H${e.prev})`).join(' | '),
      errors: hErrors,
      fix: hErrors.length > 0
        ? hErrors.map(e => `• "${e.text}" es ${e.tag} pero debería ser H${e.prev+1} o menor.\n  Webflow: Selecciona el elemento → Settings (⚙️) → Tag → H${e.prev+1}.\n  Si está en Rich Text: doble clic → selecciona texto → cambia a Heading ${e.prev+1}.`).join('\n\n')
        : null
    });

    // image-alt
    const allImgs = Array.from(doc.querySelectorAll('img'));
    const imgsNoAlt = allImgs.filter(img => {
      if (this.isHiddenFromAT(img)) return false;
      return img.getAttribute('alt') === null;
    });
    checks.push({
      id: 'image-alt-a11y',
      name: 'Image Alt Text',
      status: imgsNoAlt.length === 0 ? 'pass' : 'fail',
      detail: imgsNoAlt.length === 0
        ? `${allImgs.length} imágenes con atributo alt`
        : `${imgsNoAlt.length} imagen(es) sin alt`,
      errors: imgsNoAlt.slice(0,15).map(img => this.registerElementError(img, { src: (img.getAttribute('src')||'').substring(0,80) })),
      fix: imgsNoAlt.length > 0
        ? 'En Webflow: selecciona la imagen → Settings (⚙️) → Alt Text. Para imágenes puramente decorativas pon alt="" y/o agrega aria-hidden="true" en Custom Attributes.'
        : null
    });

    // html-lang
    const htmlLang = doc.documentElement.getAttribute('lang');
    checks.push({
      id: 'html-has-lang',
      name: 'HTML Lang Attribute',
      status: htmlLang ? 'pass' : 'fail',
      detail: htmlLang ? `lang="${htmlLang}"` : 'Falta el atributo lang en <html>',
      fix: !htmlLang
        ? 'En Webflow: Project Settings → General → Localization → Default Language. Webflow agrega el atributo lang automáticamente según tu configuración.'
        : null
    });

    // html-lang-valid
    const validLangPattern = /^[a-zA-Z]{2,3}(-[a-zA-Z]{2,})?$/;
    const langValid = htmlLang ? validLangPattern.test(htmlLang) : false;
    checks.push({
      id: 'html-lang-valid',
      name: 'HTML Lang Válido',
      status: !htmlLang ? 'fail' : langValid ? 'pass' : 'warn',
      detail: htmlLang ? (langValid ? `"${htmlLang}" es un valor de idioma válido` : `"${htmlLang}" puede no ser un BCP47 válido`) : 'No hay lang para validar',
      fix: htmlLang && !langValid
        ? `El valor lang="${htmlLang}" puede ser inválido. Usa códigos BCP47 como "es", "es-VE", "en", "en-US". En Webflow: Project Settings → General → Default Language.`
        : null
    });

    // duplicate-id-aria
    const allIds = Array.from(doc.querySelectorAll('[id]')).map(el => el.id).filter(Boolean);
    const duplicateIds = allIds.filter((id, idx) => allIds.indexOf(id) !== idx);
    const uniqueDupes = [...new Set(duplicateIds)];
    const dupeIdErrors = [];
    if (uniqueDupes.length > 0) {
      doc.querySelectorAll('[id]').forEach(el => {
        if (uniqueDupes.includes(el.id)) {
          dupeIdErrors.push(this.registerElementError(el, { id: el.id }));
        }
      });
    }
    checks.push({
      id: 'duplicate-id-aria',
      name: 'Duplicate ARIA IDs',
      status: uniqueDupes.length === 0 ? 'pass' : 'fail',
      detail: uniqueDupes.length === 0 ? 'No hay IDs duplicados' : `${uniqueDupes.length} ID(s) duplicado(s): ${uniqueDupes.slice(0,5).join(', ')}`,
      errors: dupeIdErrors.slice(0, 15),
      fix: uniqueDupes.length > 0
        ? `IDs duplicados encontrados: ${uniqueDupes.join(', ')}. En Webflow: selecciona cada elemento con ID duplicado → Settings (⚙️) → Element ID → asigna un ID único.`
        : null
    });

    // form labels
    const inputs = Array.from(doc.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'));
    const inputsNoLabel = inputs.filter(inp => {
      if (this.isHiddenFromAT(inp)) return false;
      const id = inp.getAttribute('id');
      const ariaLabel = inp.getAttribute('aria-label');
      const ariaLabelledBy = inp.getAttribute('aria-labelledby');
      const title = inp.getAttribute('title');
      const hasLabel = id && doc.querySelector(`label[for="${id}"]`);
      const isWrapped = inp.closest('label');
      return !hasLabel && !isWrapped && !ariaLabel && !ariaLabelledBy && !title;
    });
    checks.push({
      id: 'form-labels',
      name: 'Form Labels',
      status: inputsNoLabel.length === 0 ? 'pass' : 'fail',
      detail: inputsNoLabel.length === 0
        ? `${inputs.length} campos de formulario con label`
        : `${inputsNoLabel.length} campo(s) sin label accesible`,
      errors: inputsNoLabel.slice(0,15).map(inp => this.registerElementError(inp, { type: inp.getAttribute('type')||inp.tagName, placeholder: inp.getAttribute('placeholder')||'' })),
      fix: inputsNoLabel.length > 0
        ? 'En Webflow: cada Form Input debe tener un Label asociado. Selecciona el Label → Settings → "For" → escoge el input correspondiente. Alternativamente, agrega aria-label en Custom Attributes del input.'
        : null
    });

    // tabindex > 0
    const highTabindex = Array.from(doc.querySelectorAll('[tabindex]')).filter(el => {
      const val = parseInt(el.getAttribute('tabindex'));
      return val > 0;
    });
    checks.push({
      id: 'tabindex',
      name: 'Tabindex Values',
      status: highTabindex.length === 0 ? 'pass' : 'warn',
      detail: highTabindex.length === 0 ? 'No hay tabindex mayor a 0' : `${highTabindex.length} elemento(s) con tabindex > 0`,
      errors: highTabindex.slice(0,15).map(el => this.registerElementError(el, { tag: el.tagName, tabindex: el.getAttribute('tabindex') })),
      fix: highTabindex.length > 0
        ? 'En Webflow: selecciona el elemento → Custom Attributes → cambia tabindex a 0 o -1. Valores positivos alteran el orden natural de foco y causan confusión en lectores de pantalla.'
        : null
    });

    // aria-hidden-focus
    const ariaHiddenEls = Array.from(doc.querySelectorAll('[aria-hidden="true"]'));
    const hiddenWithFocusable = ariaHiddenEls.filter(el => {
      return el.querySelector('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    });
    checks.push({
      id: 'aria-hidden-focus',
      name: 'aria-hidden con elementos focusables',
      status: hiddenWithFocusable.length === 0 ? 'pass' : 'fail',
      detail: hiddenWithFocusable.length === 0
        ? 'Ningún elemento aria-hidden contiene hijos focusables'
        : `${hiddenWithFocusable.length} elemento(s) aria-hidden contienen hijos que reciben foco`,
      errors: hiddenWithFocusable.slice(0,10).map(el => this.registerElementError(el, {})),
      fix: hiddenWithFocusable.length > 0
        ? 'En Webflow: agrega tabindex="-1" a todos los elementos interactivos dentro del contenedor aria-hidden. O elimina aria-hidden del contenedor si el contenido es funcional. Custom Attributes → tabindex → -1.'
        : null
    });

    // bypass (landmarks / skip link)
    const hasMain = !!doc.querySelector('main, [role="main"]');
    const hasSkipLink = Array.from(doc.querySelectorAll('a')).some(a => {
      const href = a.getAttribute('href') || '';
      return href.startsWith('#') && (a.innerText||'').toLowerCase().includes('skip');
    });
    const hasLandmark = !!doc.querySelector('header, nav, main, footer, aside, [role="banner"], [role="navigation"], [role="main"]');
    checks.push({
      id: 'bypass',
      name: 'Skip Link / Landmark Regions',
      status: (hasMain || hasSkipLink || hasLandmark) ? 'pass' : 'warn',
      detail: [
        hasMain ? '✓ <main> presente' : '✗ Falta <main>',
        hasSkipLink ? '✓ Skip link detectado' : '✗ Sin skip link',
        hasLandmark ? '✓ Landmarks HTML5 presentes' : '✗ Sin landmarks'
      ].join(' | '),
      fix: !hasMain
        ? 'En Webflow: el contenido principal de la página debería estar dentro de un elemento con tag <main>. Selecciona el div contenedor principal → Settings (⚙️) → Tag → main.'
        : null
    });

    // meta-refresh
    const metaRefresh = doc.querySelector('meta[http-equiv="refresh"]');
    checks.push({
      id: 'meta-refresh',
      name: 'Meta Refresh',
      status: metaRefresh ? 'fail' : 'pass',
      detail: metaRefresh ? `Meta refresh detectado: content="${metaRefresh.getAttribute('content')}"` : 'No se usa meta refresh',
      fix: metaRefresh
        ? 'Elimina el meta refresh. En Webflow: verifica el Custom Code en Pages y Project Settings. Usa redirecciones 301 en su lugar (Webflow: Pages → Settings → URL Redirects).'
        : null
    });

    // video-caption
    const videos = Array.from(doc.querySelectorAll('video'));
    const videosNoCaptions = videos.filter(v => !v.querySelector('track[kind="captions"], track[kind="subtitles"]'));
    checks.push({
      id: 'video-caption',
      name: 'Video Captions',
      status: videosNoCaptions.length === 0 ? 'pass' : videos.length === 0 ? 'pass' : 'warn',
      detail: videos.length === 0 ? 'No hay elementos <video>' : videosNoCaptions.length === 0 ? `${videos.length} video(s) con captions` : `${videosNoCaptions.length} video(s) sin track de captions`,
      errors: videosNoCaptions.slice(0, 10).map(v => this.registerElementError(v, { src: (v.getAttribute('src')||'sin src').substring(0,80) })),
      fix: videosNoCaptions.length > 0
        ? 'En Webflow: los elementos Video nativos no soportan <track> directamente. Usa un Embed con código HTML personalizado que incluya el tag <track kind="captions" src="subtitulos.vtt" srclang="es" label="Español">.'
        : null
    });

    // object-alt
    const objects = Array.from(doc.querySelectorAll('object'));
    const objectsNoAlt = objects.filter(o => !o.getAttribute('aria-label') && !o.getAttribute('title') && !(o.innerText||'').trim());
    checks.push({
      id: 'object-alt',
      name: 'Object Alt Text',
      status: objectsNoAlt.length === 0 ? 'pass' : 'fail',
      detail: objects.length === 0 ? 'No hay elementos <object>' : objectsNoAlt.length === 0 ? 'Todos los <object> tienen texto alternativo' : `${objectsNoAlt.length} <object> sin texto alternativo`,
      errors: objectsNoAlt.slice(0, 10).map(o => this.registerElementError(o, {})),
      fix: objectsNoAlt.length > 0
        ? 'En Webflow: si usas embeds con <object>, agrega aria-label en el Custom Attributes del embed, o incluye texto descriptivo como contenido fallback dentro del tag <object>.'
        : null
    });

    // aria-required-children
    const rolesWithChildren = { 'list': 'listitem', 'listbox': 'option', 'menu': 'menuitem', 'radiogroup': 'radio', 'tablist': 'tab' };
    const ariaChildErrors = [];
    Object.entries(rolesWithChildren).forEach(([role, childRole]) => {
      const parents = Array.from(doc.querySelectorAll(`[role="${role}"]`));
      parents.forEach(parent => {
        const hasChild = parent.querySelector(`[role="${childRole}"]`);
        if (!hasChild) {
          const err = this.registerElementError(parent, { role, childRole });
          if (err) ariaChildErrors.push(err);
        }
      });
    });
    checks.push({
      id: 'aria-required-children',
      name: 'ARIA Required Children',
      status: ariaChildErrors.length === 0 ? 'pass' : 'fail',
      detail: ariaChildErrors.length === 0 ? 'Todos los roles ARIA tienen sus hijos requeridos' : `${ariaChildErrors.length} elemento(s) sin los roles hijos requeridos`,
      errors: ariaChildErrors.slice(0,10),
      fix: ariaChildErrors.length > 0
        ? ariaChildErrors.map(e => `• role="${e.role}" requiere hijos con role="${e.childRole}". En Webflow: Custom Attributes del elemento hijo → role → ${e.childRole}.`).join('\n')
        : null
    });

    // aria-roles válidos
    const validRoles = ['alert','alertdialog','application','article','banner','button','cell','checkbox','columnheader','combobox','complementary','contentinfo','definition','dialog','directory','doc','feed','figure','form','grid','gridcell','group','heading','img','link','list','listbox','listitem','log','main','marquee','math','menu','menubar','menuitem','menuitemcheckbox','menuitemradio','navigation','none','note','option','presentation','progressbar','radio','radiogroup','region','row','rowgroup','rowheader','scrollbar','search','searchbox','separator','slider','spinbutton','status','switch','tab','table','tablist','tabpanel','term','textbox','timer','toolbar','tooltip','tree','treegrid','treeitem'];
    const invalidRoles = Array.from(doc.querySelectorAll('[role]')).filter(el => {
      const role = el.getAttribute('role');
      return role && !validRoles.includes(role);
    });
    checks.push({
      id: 'aria-roles',
      name: 'ARIA Roles Válidos',
      status: invalidRoles.length === 0 ? 'pass' : 'fail',
      detail: invalidRoles.length === 0 ? 'Todos los roles ARIA son válidos' : `${invalidRoles.length} rol(es) ARIA inválido(s)`,
      errors: invalidRoles.slice(0,10).map(el => this.registerElementError(el, { role: el.getAttribute('role'), tag: el.tagName })),
      fix: invalidRoles.length > 0
        ? invalidRoles.map(el => `• role="${el.getAttribute('role')}" no es válido en <${el.tagName.toLowerCase()}>. En Webflow: Custom Attributes → role → usa un valor ARIA válido.`).join('\n')
        : null
    });

    // list integrity
    const lisItems = Array.from(doc.querySelectorAll('li'));
    const orphanLi = lisItems.filter(li => {
      const parent = li.parentElement;
      return parent && !['UL','OL','MENU'].includes(parent.tagName);
    });
    checks.push({
      id: 'listitem',
      name: 'List Items en contenedor válido',
      status: orphanLi.length === 0 ? 'pass' : 'fail',
      detail: orphanLi.length === 0 ? 'Todos los <li> están dentro de <ul> o <ol>' : `${orphanLi.length} <li> fuera de lista`,
      errors: orphanLi.slice(0, 10).map(li => this.registerElementError(li, {})),
      fix: orphanLi.length > 0
        ? 'En Webflow: los elementos List Item deben estar siempre dentro de un List. Si los moviste manualmente, re-estructúralos dentro de un componente List.'
        : null
    });

    // accesskeys únicos
    const accesskeyEls = Array.from(doc.querySelectorAll('[accesskey]'));
    const accesskeys = accesskeyEls.map(el => el.getAttribute('accesskey'));
    const dupAccesskeys = accesskeys.filter((k, i) => accesskeys.indexOf(k) !== i);
    const uniqueDupAccesskeys = [...new Set(dupAccesskeys)];
    const accesskeyErrors = [];
    accesskeyEls.forEach(el => {
      const val = el.getAttribute('accesskey');
      if (uniqueDupAccesskeys.includes(val)) {
        const err = this.registerElementError(el, { key: val });
        if (err) accesskeyErrors.push(err);
      }
    });
    checks.push({
      id: 'accesskeys',
      name: 'AccessKeys Únicos',
      status: dupAccesskeys.length === 0 ? 'pass' : 'fail',
      detail: dupAccesskeys.length === 0 ? 'No hay accesskeys duplicados' : `Accesskeys duplicados: ${uniqueDupAccesskeys.join(', ')}`,
      errors: accesskeyErrors.slice(0, 10),
      fix: dupAccesskeys.length > 0 ? 'Asegúrate de que cada accesskey sea único. En Webflow: Custom Attributes → accesskey → valor único.' : null
    });

    return checks;
  }
};

window.WFAuditor = WFAuditor;


function wfaHighlightElement(el, wfaId, selector) {
  wfaRemoveHighlight();
  
  if (!el && selector) {
    try {
      el = doc.querySelector(selector);
    } catch(e) {}
  }

  if (el) {
    if (!doc.getElementById('wfa-styles')) {
      const style = doc.createElement('style');
      style.id = 'wfa-styles';
      style.textContent = `
        @keyframes wfa-pulse-glow {
          0% { border-color: #FF4353; box-shadow: 0 0 10px rgba(255, 67, 83, 0.8), 0 0 0 9999px rgba(0, 0, 0, 0.4); }
          50% { border-color: #4353FF; box-shadow: 0 0 25px rgba(67, 83, 255, 0.9), 0 0 0 9999px rgba(0, 0, 0, 0.45); }
          100% { border-color: #FF4353; box-shadow: 0 0 10px rgba(255, 67, 83, 0.8), 0 0 0 9999px rgba(0, 0, 0, 0.4); }
        }
        .wfa-box-active {
          animation: wfa-pulse-glow 1.5s ease-in-out infinite !important;
        }
      `;
      doc.head.appendChild(style);
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
      const rect = el.getBoundingClientRect();
      const scrollLeft = window.pageXOffset || doc.documentElement.scrollLeft;
      const scrollTop = window.pageYOffset || doc.documentElement.scrollTop;

      const highlightBox = doc.createElement('div');
      highlightBox.id = 'wfa-highlight-box';
      highlightBox.className = 'wfa-box-active';
      highlightBox.style.cssText = `
        position: absolute !important;
        top: ${(rect.top + scrollTop - 4)}px !important;
        left: ${(rect.left + scrollLeft - 4)}px !important;
        width: ${(rect.width + 8)}px !important;
        height: ${(rect.height + 8)}px !important;
        border: 4px solid #FF4353 !important;
        border-radius: 6px !important;
        z-index: 9999997 !important;
        pointer-events: none !important;
        box-sizing: border-box !important;
      `;
      doc.body.appendChild(highlightBox);

      const toast = doc.createElement('div');
      toast.id = 'wfa-highlight-toast';
      toast.style.cssText = `
        position: fixed !important;
        top: 20px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        background: #1a1a24 !important;
        color: #ffffff !important;
        padding: 8px 16px !important;
        border-radius: 8px !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        box-shadow: 0 4px 15px rgba(0,0,0,0.6) !important;
        border: 1px solid #3e3e56 !important;
        z-index: 9999999 !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        cursor: pointer !important;
        user-select: none !important;
        white-space: nowrap !important;
      `;
      toast.innerHTML = `
        <span>📍 Elemento localizado — haz clic en cualquier lugar para cerrar.</span>
      `;
      doc.body.appendChild(toast);

      setTimeout(() => {
        doc.addEventListener('click', wfaRemoveHighlight);
        window.addEventListener('resize', wfaRemoveHighlight);
        window.addEventListener('scroll', wfaRemoveHighlight);
      }, 100);
    }, 400);
    return true;
  }
  return false;
}

function wfaCreateFloatingToolbar(auditData) {
  const existing = doc.getElementById('wfa-floating-toolbar');
  if (existing) existing.remove();

  const toolbar = doc.createElement('div');
  toolbar.id = 'wfa-floating-toolbar';
  toolbar.style.cssText = `
    position: fixed !important;
    top: 80px !important;
    right: 20px !important;
    width: 320px !important;
    max-height: 500px !important;
    overflow-y: auto !important;
    background: #111827 !important;
    color: #f3f4f6 !important;
    border: 1px solid #374151 !important;
    border-radius: 12px !important;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5) !important;
    z-index: 9999998 !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    padding: 16px !important;
    user-select: none !important;
  `;

  const header = doc.createElement('div');
  header.style.cssText = `
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    margin-bottom: 12px !important;
    border-bottom: 1px solid #374151 !important;
    padding-bottom: 8px !important;
  `;
  header.innerHTML = `
    <span style="font-weight: 700; font-size: 13px;">🔎 Errores en esta Página</span>
    <span id="wfa-toolbar-close" style="cursor: pointer; font-weight: bold; color: #9ca3af; font-size: 14px;">✕</span>
  `;
  toolbar.appendChild(header);

  const listContainer = doc.createElement('div');
  listContainer.style.cssText = `
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
  `;

  let hasErrors = false;

  const CATEGORY_ICONS = {
    seo: "🔎",
    performance: "⚡",
    mobile: "📱",
    accessibility: "♿"
  };

  Object.entries(auditData.categories).forEach(([catKey, checks]) => {
    const failedChecks = checks.filter(c => c.status === 'fail' || c.status === 'warn');
    if (failedChecks.length === 0) return;

    hasErrors = true;

    const catTitle = doc.createElement('div');
    catTitle.style.cssText = `
      font-weight: bold !important;
      font-size: 11px !important;
      text-transform: uppercase !important;
      color: #9ca3af !important;
      margin-top: 6px !important;
      margin-bottom: 4px !important;
      display: flex !important;
      align-items: center !important;
      gap: 4px !important;
    `;
    catTitle.textContent = `${CATEGORY_ICONS[catKey] || ""} ${catKey.toUpperCase()}`;
    listContainer.appendChild(catTitle);

    failedChecks.forEach(check => {
      const checkItem = doc.createElement('div');
      checkItem.style.cssText = `
        background: #1f2937 !important;
        border-radius: 6px !important;
        padding: 8px !important;
        border-left: 3px solid ${check.status === 'fail' ? '#ef4444' : '#eab308'} !important;
      `;
      checkItem.innerHTML = `
        <div style="font-weight: 600; font-size: 11.5px; margin-bottom: 4px;">${check.name}</div>
      `;

      if (check.errors && check.errors.length > 0) {
        const errList = doc.createElement('div');
        errList.style.cssText = `
          display: flex !important;
          flex-direction: column !important;
          gap: 4px !important;
          margin-top: 4px !important;
        `;
        check.errors.forEach((err, idx) => {
          const btn = doc.createElement('button');
          btn.style.cssText = `
            background: #374151 !important;
            color: #f9fafb !important;
            border: none !important;
            border-radius: 4px !important;
            padding: 4px 8px !important;
            font-size: 10px !important;
            cursor: pointer !important;
            text-align: left !important;
            width: 100% !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            transition: background 0.15s !important;
          `;
          btn.innerHTML = `<span>Elemento ${idx + 1}</span> <span style="opacity: 0.6;">📍 Ir</span>`;
          btn.addEventListener('mouseenter', () => btn.style.background = '#4b5563');
          btn.addEventListener('mouseleave', () => btn.style.background = '#374151');
          
          btn.addEventListener('click', () => {
            if (!doc.querySelector('[data-wfa-id]')) {
              try { WFAuditor.run(); } catch(e) {}
            }
            let el = err.wfaId ? doc.querySelector(`[data-wfa-id="${err.wfaId}"]`) : null;
            if (!el && err.selector) {
              try { el = doc.querySelector(err.selector); } catch(e) {}
            }
            wfaHighlightElement(el, err.wfaId, err.selector);
          });

          errList.appendChild(btn);
        });
        checkItem.appendChild(errList);
      } else {
        const details = doc.createElement('div');
        details.style.cssText = `
          font-size: 10px !important;
          color: #d1d5db !important;
          line-height: 1.3 !important;
        `;
        details.textContent = check.detail || "Ver detalles del error.";
        checkItem.appendChild(details);
      }

      listContainer.appendChild(checkItem);
    });
  });

  if (!hasErrors) {
    const noErrors = doc.createElement('div');
    noErrors.style.cssText = `
      text-align: center !important;
      color: #10b981 !important;
      font-weight: 600 !important;
      padding: 12px !important;
    `;
    noErrors.textContent = "✓ ¡Sin errores en esta página!";
    listContainer.appendChild(noErrors);
  }

  toolbar.appendChild(listContainer);
  doc.body.appendChild(toolbar);

  doc.getElementById('wfa-toolbar-close').addEventListener('click', () => {
    toolbar.remove();
  });
}

function wfaRemoveHighlight() {
  const box = doc.getElementById('wfa-highlight-box');
  if (box) box.remove();
  const toast = doc.getElementById('wfa-highlight-toast');
  if (toast) toast.remove();
  doc.removeEventListener('click', wfaRemoveHighlight);
  window.removeEventListener('resize', wfaRemoveHighlight);
  window.removeEventListener('scroll', wfaRemoveHighlight);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'runAudit') {
    try {
      const results = WFAuditor.run();
      sendResponse({ success: true, data: results });
    } catch(e) {
      sendResponse({ success: false, error: e.message });
    }
  } else if (request.action === 'locateElement') {
    if (!doc.querySelector('[data-wfa-id]')) {
      try {
        WFAuditor.run();
      } catch (e) {
        console.error("Error auto-auditing for location mapping:", e);
      }
    }
    
    let el = request.id ? doc.querySelector(`[data-wfa-id="${request.id}"]`) : null;
    const success = wfaHighlightElement(el, request.id, request.selector);
    
    if (request.pageAuditData) {
      wfaCreateFloatingToolbar(request.pageAuditData);
    }
    
    sendResponse({ success: success });
  } else if (request.action === 'removeHighlight') {
    wfaRemoveHighlight();
    sendResponse({ success: true });
  }
  return true;
});
}
