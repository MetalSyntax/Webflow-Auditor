# Webflow SEO & A11y Auditor

Extensión de Chrome para auditoría de SEO, Performance, Mobile y Accesibilidad con soluciones específicas para Webflow.

> **Uso interno de equipo** — No publicada en Chrome Web Store.

---

## Instalación

### Opción 1 — Load Unpacked (recomendado, todos los SO)

```bash
git clone https://github.com/TU-USUARIO/webflow-auditor.git
```

1. Abre Chrome → `chrome://extensions/`
2. Activa **Modo desarrollador** (toggle arriba a la derecha)
3. Clic en **"Cargar descomprimida"** → selecciona la carpeta `webflow-auditor/`
4. Fija el ícono con el botón 🧩 de la barra

**Para actualizar:** `git pull` + reload ↺ en `chrome://extensions/`

---

### Opción 2 — CRX Self-hosted via GitHub Pages

Disponible en: `https://TU-USUARIO.github.io/webflow-auditor/`

| Plataforma        | CRX drag & drop | Load Unpacked |
|-------------------|-----------------|---------------|
| macOS + Chrome    | ✗ Bloqueado     | ✓ Funciona    |
| Windows + Chrome  | ⚠ Según versión | ✓ Funciona    |
| Linux + Chromium  | ✓ Funciona      | ✓ Funciona    |

> **macOS:** Chrome 73+ bloquea la instalación de CRX externos por política. Usa la Opción 1.

**Instalar el CRX (Linux/Windows):**

1. Abre Chrome → `chrome://extensions/`
2. Activa **Modo desarrollador**
3. Descarga `webflow-auditor-latest.crx` desde la página del proyecto
4. Arrástralo sobre `chrome://extensions/`

**Para actualizaciones automáticas vía CRX:**

Agrega `update_url` a `manifest.json` apuntando al `update.xml` publicado en GitHub Pages.
Chrome consultará ese archivo periódicamente y actualizará la extensión en silencio.
Ver sección [Configurar update_url](#configurar-update_url).

---

## Publicar un nuevo release

```bash
./build.sh
```

El script:
1. Muestra la versión actual y pide elegir el tipo (patch / minor / major / custom)
2. Actualiza `manifest.json`
3. Crea el `.zip` en `docs/downloads/`
4. Crea el `.crx` con Chrome si está disponible
5. Actualiza `docs/update.xml` y `docs/index.html`
6. Muestra los comandos de git para subir el release

Luego:

```bash
git add -A
git commit -m "release: v1.x.x"
git tag v1.x.x
git push && git push --tags
```

GitHub Pages publica automáticamente los archivos actualizados.

---

## Configurar GitHub Pages

1. Sube el repo a GitHub
2. Ve a **Settings → Pages**
3. Source: **Deploy from a branch** → branch: `main` → folder: `/docs`
4. Guarda — la URL será `https://TU-USUARIO.github.io/webflow-auditor/`

Reemplaza `TU-USUARIO` en `docs/index.html`, `docs/update.xml` y este README.

---

## Configurar update_url

> Solo necesario si distribuyes por CRX. Con Load Unpacked no aplica.

1. Ejecuta `./build.sh` una vez para generar `.keys/extension.pem` y el primer `.crx`
2. Abre `chrome://extensions/` → busca el ID de la extensión (cadena larga bajo el nombre)
3. Copia ese ID en `docs/update.xml` donde dice `EXTENSION_ID_AQUI`
4. En `manifest.json` agrega:

```json
"update_url": "https://TU-USUARIO.github.io/webflow-auditor/update.xml"
```

5. Vuelve a ejecutar `./build.sh` y sube el release

---

## Clave privada (.pem)

La clave privada se genera en `.keys/extension.pem` la primera vez que empaquetas.
Está en `.gitignore` — **no se sube al repo**.

> Guárdala en un lugar seguro (1Password, Bitwarden, etc.).
> Sin ella no puedes re-empaquetar la misma extensión con el mismo ID.

---

## Estructura del proyecto

```
webflow-auditor/
├── manifest.json         # Configuración de la extensión
├── content.js            # Lógica de auditoría y barra flotante (corre en la página)
├── popup.html            # UI del popup
├── popup.js              # Lógica del popup
├── sitemap-auditor.html  # Dashboard a pantalla completa para sitemaps
├── sitemap-auditor.js    # Lógica de auditoría silenciosa (Shadow Mode)
├── styles.css            # Estilos
├── icons/                # Iconos 16, 48, 128px
├── docs/
│   ├── index.html        # Landing page (GitHub Pages)
│   ├── update.xml        # Manifiesto de actualizaciones para Chrome
│   └── downloads/        # CRX y ZIP generados por build.sh
├── build.sh              # Script de empaquetado
├── .gitignore
├── CHANGELOG.md          # Historial de cambios del proyecto
└── README.md
```

---

## Historial de Cambios (Changelog)

Todos los cambios y versiones de este proyecto están detallados en el archivo [CHANGELOG.md](file:///Users/metalsyntax/Downloads/Webflow-Auditor/CHANGELOG.md).

### Resumen de la Versión Reciente: v1.2.0 (2026-06-19)
- **Auditoría de Sitemap XML en segundo plano (Shadow Mode)**: Reemplazado el viejo sistema de abrir/cerrar pestañas físicas por auditorías silenciosas en memoria (`fetch` + `DOMParser`).
- **Dashboard dedicado**: Nueva página de dashboard a pantalla completa (`sitemap-auditor.html`) con tabla de progresos en tiempo real.
- **Barra flotante interactiva**: Panel flotante inyectado en el sitio web para guiarte en la corrección de errores directamente sin volver a la extensión.
- **Exportación a CSV**: Agregado soporte de reportes estructurados en formato CSV (con UTF-8 BOM para Excel).
- **Correcciones Técnicas**: Solucionado bug en SSL/HTTPS en shadow-mode y soporte para reutilizar pestañas en localizaciones secuenciales.

---

## Auditorías incluidas

| Categoría       | Nº checks | Highlights                                              |
|-----------------|-----------|--------------------------------------------------------|
| SEO             | 10        | Title, Meta desc, H1, Heading order, Alt, SSL, Lang   |
| Performance     | 8         | DOM size, CLS, Render-blocking, document.write, GIFs  |
| Mobile          | 5         | Tap targets ≥44px, Font size, Scroll horizontal        |
| Accesibilidad   | 16        | ARIA roles, Form labels, Duplicate IDs, Skip links    |
