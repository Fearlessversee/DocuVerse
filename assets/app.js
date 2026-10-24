(() => {
  const DEFAULT_DOC_CONTENT = "";

  const DOCS = [
    {
      id: "readme",
      title: "DocuVerse Specification",
      file: "docs/readme.md",
      subtitle: "Universal Showcase & Architecture Viewer",
      content: ""
    }
  ];

  /* ----------------------------------------------------
     Local Database Layer (Persistent Document Storage)
  ---------------------------------------------------- */
  const STORAGE_KEY_DOCS = "docuverse_uploaded_docs_v1";
  const STORAGE_KEY_ACTIVE = "docuverse_active_doc_id";

  function getUploadedDocs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DOCS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn("DocuVerse getUploadedDocs error:", e);
      return [];
    }
  }

  function persistUploadedDocs(docs) {
    try {
      localStorage.setItem(STORAGE_KEY_DOCS, JSON.stringify(docs));
      return true;
    } catch (e) {
      console.warn("DocuVerse persistUploadedDocs error:", e);
      toast("Storage warning: Local storage limit reached.");
      return false;
    }
  }

  function saveUploadedDoc(title, filename, content) {
    const docs = getUploadedDocs();
    const cleanName = filename || "document.md";
    const cleanTitle = title || cleanName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    const id = "doc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);

    const newDoc = {
      id,
      title: cleanTitle,
      filename: cleanName,
      content,
      createdAt: Date.now(),
      size: content.length,
      isUploaded: true
    };

    const existingIndex = docs.findIndex(d => d.filename === cleanName && d.title === cleanTitle);
    if (existingIndex >= 0) {
      docs[existingIndex].content = content;
      docs[existingIndex].createdAt = Date.now();
      docs[existingIndex].size = content.length;
      persistUploadedDocs(docs);
      return docs[existingIndex];
    } else {
      docs.unshift(newDoc);
      persistUploadedDocs(docs);
      return newDoc;
    }
  }

  function deleteUploadedDoc(docId) {
    let docs = getUploadedDocs();
    docs = docs.filter(d => d.id !== docId);
    persistUploadedDocs(docs);
    toast("Document removed from library.");

    if (activeDoc && activeDoc.id === docId) {
      if (docs.length > 0) {
        loadCustomUploadedDoc(docs[0], true);
      } else {
        localStorage.removeItem(STORAGE_KEY_ACTIVE);
        loadDocument(DOCS[0], true);
      }
    } else {
      drawDocumentList();
    }
  }

  function closeSidebarIfMobile() {
    const sidebar = $("sidebar");
    const scrim = $("mobile-scrim");
    if (sidebar) sidebar.classList.remove("open");
    if (scrim) scrim.classList.remove("visible");
  }

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const article = $("markdown-document");

  let activeDoc = DOCS[0];
  let currentMarkdown = "";
  let currentFilename = "readme.md";
  let toastTimer;
  let scrollObserver;

  function toast(message) {
    const el = $("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
  }

  function slug(text) {
    return text.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-") || "section";
  }

  function readingStats(markdown) {
    const words = (markdown.match(/\b[\w'-]+\b/g) || []).length;
    const wordCountEl = $("word-count");
    const readTimeEl = $("read-time");
    if (wordCountEl) wordCountEl.textContent = `${words.toLocaleString()} words`;
    if (readTimeEl) readTimeEl.textContent = `Reading time ${Math.max(1, Math.ceil(words / 220))} min`;
  }

  function drawDocumentList() {
    const container = $("document-list");
    if (!container) return;
    container.replaceChildren();

    const uploadedDocs = getUploadedDocs();

    // Section 1: Uploaded Documents in Mobile/Desktop Left Sidebar
    if (uploadedDocs.length > 0) {
      const header = document.createElement("div");
      header.className = "side-subgroup-label";
      header.innerHTML = '<span>UPLOADED DOCS</span> <span class="side-badge">' + uploadedDocs.length + '</span>';
      container.append(header);

      uploadedDocs.forEach(doc => {
        const itemRow = document.createElement("div");
        itemRow.className = "doc-item-row" + (doc.id === activeDoc.id ? " active" : "");

        const a = document.createElement("a");
        a.className = "doc-link" + (doc.id === activeDoc.id ? " active" : "");
        a.href = "?doc=" + encodeURIComponent(doc.id);

        const icon = document.createElement("span");
        icon.className = "doc-icon";
        icon.textContent = "📄";

        const info = document.createElement("span");
        info.className = "doc-info-wrap";

        const titleSpan = document.createElement("span");
        titleSpan.className = "doc-item-title";
        titleSpan.textContent = doc.title;

        const metaSpan = document.createElement("span");
        metaSpan.className = "doc-item-meta";
        metaSpan.textContent = "Uploaded · Local";

        info.append(titleSpan, metaSpan);
        a.append(icon, info);

        a.addEventListener("click", async (event) => {
          event.preventDefault();
          await loadCustomUploadedDoc(doc, true);
          closeSidebarIfMobile();
        });

        // Delete button
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "doc-delete-btn";
        delBtn.title = "Delete this document from local library";
        delBtn.setAttribute("aria-label", "Delete document");
        delBtn.textContent = "✕";
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (confirm('Remove "' + doc.title + '" from your saved documents?')) {
            deleteUploadedDoc(doc.id);
          }
        });

        itemRow.append(a, delBtn);
        container.append(itemRow);
      });

      // Shortcut to upload another document from sidebar
      const quickUpload = document.createElement("button");
      quickUpload.type = "button";
      quickUpload.className = "sidebar-upload-shortcut";
      quickUpload.innerHTML = '<span>＋</span> Upload Another .md';
      quickUpload.addEventListener("click", () => {
        const picker = $("local-file-picker");
        if (picker) picker.click();
      });
      container.append(quickUpload);

      const divider = document.createElement("div");
      divider.className = "side-divider";
      container.append(divider);
    } else {
      // Empty uploaded docs state
      const emptyBox = document.createElement("div");
      emptyBox.className = "sidebar-empty-box";
      emptyBox.innerHTML = '<div class="empty-icon">📁</div><p>No uploaded docs yet.</p><button type="button" class="sidebar-upload-btn-empty" id="sidebar-choose-btn"><span>＋</span> Upload .md File</button>';
      container.append(emptyBox);

      const emptyBtn = emptyBox.querySelector("#sidebar-choose-btn");
      if (emptyBtn) {
        emptyBtn.addEventListener("click", () => {
          const picker = $("local-file-picker");
          if (picker) picker.click();
        });
      }

      const divider = document.createElement("div");
      divider.className = "side-divider";
      container.append(divider);
    }

    // Section 2: Standard DocuVerse Guide
    const guideHeader = document.createElement("div");
    guideHeader.className = "side-subgroup-label";
    guideHeader.textContent = "DOCUVERSE GUIDE";
    container.append(guideHeader);

    DOCS.forEach(doc => {
      const a = document.createElement("a");
      a.className = "doc-link" + (doc.id === activeDoc.id ? " active" : "");
      a.href = "?doc=" + encodeURIComponent(doc.id);

      const icon = document.createElement("span");
      icon.className = "doc-icon";
      icon.textContent = "✦";

      const body = document.createElement("span");
      body.textContent = doc.title;

      a.append(icon, body);
      a.addEventListener("click", async (event) => {
        event.preventDefault();
        await loadDocument(doc, true);
        closeSidebarIfMobile();
      });
      container.append(a);
    });
  }

  function buildToc() {
    const nav = $("table-of-contents");
    if (!nav) return;
    nav.replaceChildren();

    const headings = [...article.querySelectorAll("h2, h3")];
    const used = new Set();

    headings.forEach(h => {
      let id = slug(h.textContent);
      let unique = id, n = 2;
      while (used.has(unique)) unique = `${id}-${n++}`;
      id = unique;
      used.add(id);
      h.id = id;

      const link = document.createElement("a");
      link.className = `toc-link ${h.tagName === "H3" ? "level-3" : "level-2"}`;
      link.href = `#${id}`;
      link.textContent = h.textContent;

      link.addEventListener("click", (event) => {
        event.preventDefault();
        nav.querySelectorAll(".toc-link").forEach(a => a.classList.remove("active"));
        link.classList.add("active");
        const target = document.getElementById(id);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          history.pushState(null, "", `#${id}`);
        }
      });
      nav.append(link);
    });

    if (scrollObserver) scrollObserver.disconnect();
    if ("IntersectionObserver" in window) {
      scrollObserver = new IntersectionObserver(entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) {
          nav.querySelectorAll(".toc-link").forEach(a => {
            a.classList.toggle("active", a.getAttribute("href") === `#${visible.target.id}`);
          });
        }
      }, { rootMargin: "-90px 0px -72% 0px", threshold: 0 });
      headings.forEach(h => scrollObserver.observe(h));
    }
  }

  /* ----------------------------------------------------
     Pan & Zoom Controller for Mermaid Diagrams
  ---------------------------------------------------- */
  function makePanZoom(viewport, canvas, onUpdate, isModal = false) {
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialDistance = 0;
    let initialScale = 1;

    function applyTransform() {
      if (scale === 1 && translateX === 0 && translateY === 0) {
        canvas.style.transform = "";
        viewport.classList.remove("is-zoomed");
      } else {
        canvas.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        viewport.classList.add("is-zoomed");
      }
      if (onUpdate) onUpdate(scale, translateX, translateY);
    }

    function setScale(newScale, clientX, clientY) {
      const clamped = Math.min(4.5, Math.max(0.4, newScale));
      if (clamped === 1) {
        reset();
        return;
      }
      if (clientX !== undefined && clientY !== undefined) {
        const rect = viewport.getBoundingClientRect();
        const cx = clientX - rect.left;
        const cy = clientY - rect.top;
        translateX = cx - (cx - translateX) * (clamped / scale);
        translateY = cy - (cy - translateY) * (clamped / scale);
      }
      scale = clamped;
      applyTransform();
    }

    function reset() {
      scale = 1;
      translateX = 0;
      translateY = 0;
      applyTransform();
    }

    const activePointers = new Map();

    viewport.addEventListener("pointerdown", (e) => {
      if (!isModal && scale === 1) return;
      if (e.button !== 0 && e.pointerType === "mouse") return;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.size === 1) {
        isDragging = true;
        startX = e.clientX - translateX;
        startY = e.clientY - translateY;
        viewport.classList.add("is-dragging");
        try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
      } else if (activePointers.size === 2) {
        isDragging = false;
        viewport.classList.remove("is-dragging");
        const pts = [...activePointers.values()];
        initialDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        initialScale = scale;
      }
    });

    viewport.addEventListener("pointermove", (e) => {
      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (isDragging && activePointers.size === 1) {
        translateX = e.clientX - startX;
        translateY = e.clientY - startY;
        applyTransform();
      } else if (activePointers.size === 2 && initialDistance > 0) {
        const pts = [...activePointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const newScale = initialScale * (dist / initialDistance);
        setScale(newScale, midX, midY);
      }
    });

    const endPointer = (e) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size === 0) {
        isDragging = false;
        viewport.classList.remove("is-dragging");
      }
      if (activePointers.size < 2) {
        initialDistance = 0;
      }
      try { viewport.releasePointerCapture(e.pointerId); } catch (_) {}
    };

    viewport.addEventListener("pointerup", endPointer);
    viewport.addEventListener("pointercancel", endPointer);

    // Mouse wheel zoom: Ctrl + wheel on page, or regular wheel in modal
    viewport.addEventListener("wheel", (e) => {
      if (isModal || e.ctrlKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.88;
        setScale(scale * factor, e.clientX, e.clientY);
      }
    }, { passive: false });

    // Double click to reset
    viewport.addEventListener("dblclick", () => reset());

    return {
      zoomIn: () => setScale(scale * 1.25),
      zoomOut: () => setScale(scale / 1.25),
      reset: () => reset(),
      getScale: () => scale
    };
  }

  /* ----------------------------------------------------
     Fullscreen Modal Diagram Viewer
  ---------------------------------------------------- */
  let activeModalController = null;

  function openDiagramModal(svgElement, title) {
    const modal = $("diagram-modal");
    const modalCanvas = $("modal-canvas");
    const modalViewport = $("modal-viewport");
    const modalPercent = $("modal-zoom-percent");
    if (!modal || !modalCanvas || !modalViewport) return;

    modalCanvas.replaceChildren();

    // Clone the SVG for crisp rendering in modal
    const clonedSvg = svgElement.cloneNode(true);
    clonedSvg.removeAttribute("style");
    clonedSvg.style.maxWidth = "none";
    clonedSvg.style.display = "block";
    clonedSvg.style.margin = "auto";
    modalCanvas.append(clonedSvg);

    modal.hidden = false;
    document.body.style.overflow = "hidden";

    activeModalController = makePanZoom(modalViewport, modalCanvas, (currentScale) => {
      if (modalPercent) modalPercent.textContent = `${Math.round(currentScale * 100)}%`;
    }, true);

    if (modalPercent) modalPercent.textContent = "100%";

    const zoomInBtn = $("modal-zoom-in");
    const zoomOutBtn = $("modal-zoom-out");
    const zoomResetBtn = $("modal-zoom-reset");
    const closeBtn = $("modal-close");
    const backdrop = $("modal-backdrop");

    if (zoomInBtn) zoomInBtn.onclick = () => activeModalController.zoomIn();
    if (zoomOutBtn) zoomOutBtn.onclick = () => activeModalController.zoomOut();
    if (zoomResetBtn) zoomResetBtn.onclick = () => activeModalController.reset();

    function closeModal() {
      modal.hidden = true;
      document.body.style.overflow = "";
      modalCanvas.replaceChildren();
      activeModalController = null;
    }

    if (closeBtn) closeBtn.onclick = closeModal;
    if (backdrop) backdrop.onclick = closeModal;

    const handleKeydown = (e) => {
      if (modal.hidden) return;
      if (e.key === "Escape") {
        closeModal();
        document.removeEventListener("keydown", handleKeydown);
      } else if (e.key === "+" || e.key === "=") {
        if (activeModalController) activeModalController.zoomIn();
      } else if (e.key === "-") {
        if (activeModalController) activeModalController.zoomOut();
      } else if (e.key === "0") {
        if (activeModalController) activeModalController.reset();
      }
    };
    document.addEventListener("keydown", handleKeydown);
  }

  /* ----------------------------------------------------
     Enhance Content (Mermaid & Code Blocks & Tables)
  ---------------------------------------------------- */
  async function enhanceContent() {
    // 1. Transform Mermaid code blocks into interactive cards
    article.querySelectorAll("pre > code.language-mermaid").forEach((code, idx) => {
      const wrapper = document.createElement("div");
      wrapper.className = "mermaid-wrap";
      wrapper.dataset.diagramId = `diagram-${idx}`;

      wrapper.innerHTML = `
        <div class="diagram-toolbar">
          <div class="diagram-info">
            <span class="diagram-dot"></span>
            <span class="diagram-tag">ARCHITECTURE DIAGRAM</span>
          </div>
          <div class="diagram-actions">
            <button type="button" class="diagram-btn zoom-out-btn" title="Zoom out (–)" aria-label="Zoom out">－</button>
            <span class="diagram-zoom-badge" data-zoom-label>100%</span>
            <button type="button" class="diagram-btn zoom-in-btn" title="Zoom in (+)" aria-label="Zoom in">＋</button>
            <button type="button" class="diagram-btn zoom-reset-btn" title="Reset view (100%)" aria-label="Reset zoom">⟲</button>
            <button type="button" class="diagram-btn fullscreen-btn" title="Expand Fullscreen" aria-label="Fullscreen view">⤢ Fullscreen</button>
          </div>
        </div>
        <div class="mermaid-viewport" role="region" aria-label="Architecture Diagram: Click to expand, use controls to zoom">
          <div class="mermaid-canvas">
            <div class="mermaid">${code.textContent}</div>
          </div>
        </div>
      `;

      code.parentElement.replaceWith(wrapper);
    });

    // 2. Syntax highlighting for code blocks
    article.querySelectorAll("pre > code:not(.language-mermaid)").forEach(code => {
      if (window.hljs) {
        try { window.hljs.highlightElement(code); } catch (_) {}
      }
      const pre = code.parentElement;
      if (!pre.querySelector(".copy-code")) {
        const copy = document.createElement("button");
        copy.className = "copy-code";
        copy.type = "button";
        copy.textContent = "Copy code";
        copy.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(code.textContent);
            copy.textContent = "Copied";
            setTimeout(() => copy.textContent = "Copy code", 1400);
          } catch (_) {
            toast("Clipboard access is unavailable in this context.");
          }
        });
        pre.append(copy);
      }
    });

    // 3. Make all tables mobile responsive with horizontal scroll container
    article.querySelectorAll("table").forEach(table => {
      if (!table.parentElement.classList.contains("table-responsive")) {
        const wrap = document.createElement("div");
        wrap.className = "table-responsive";
        table.parentElement.insertBefore(wrap, table);
        wrap.append(table);
      }
    });

    // 4. Render Mermaid SVGs and attach interactive pan & zoom
    if (window.mermaid) {
      window.mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "default",
        themeVariables: {
          fontFamily: "'Plus Jakarta Sans', Inter, system-ui, -apple-system, sans-serif",
          fontSize: "13px",
          primaryColor: "#eef2ff",
          primaryTextColor: "#1e1b4b",
          primaryBorderColor: "#818cf8",
          lineColor: "#64748b",
          secondaryColor: "#f8fafc",
          tertiaryColor: "#ffffff",
          clusterBkg: "#f8fafc",
          clusterBorder: "#cbd5e1",
          edgeLabelBackground: "#ffffff",
          nodeBorder: "#818cf8",
          mainBkg: "#f0f4ff"
        },
        flowchart: { htmlLabels: true, curve: "basis" },
        sequence: { useMaxWidth: true }
      });

      try {
        await window.mermaid.run({ nodes: [...article.querySelectorAll(".mermaid")] });
      } catch (error) {
        article.querySelectorAll(".mermaid").forEach(node => {
          if (!node.querySelector("svg")) {
            const msg = document.createElement("div");
            msg.className = "diagram-error";
            msg.textContent = "This Mermaid diagram could not be rendered. The original source is preserved in the Markdown file.";
            node.replaceWith(msg);
          }
        });
        console.warn("Mermaid rendering issue", error);
      }

      // Attach pan & zoom and fullscreen trigger to each diagram card
      article.querySelectorAll(".mermaid-wrap").forEach(wrap => {
        const viewport = wrap.querySelector(".mermaid-viewport");
        const canvas = wrap.querySelector(".mermaid-canvas");
        const zoomLabel = wrap.querySelector("[data-zoom-label]");
        const zoomInBtn = wrap.querySelector(".zoom-in-btn");
        const zoomOutBtn = wrap.querySelector(".zoom-out-btn");
        const zoomResetBtn = wrap.querySelector(".zoom-reset-btn");
        const fullscreenBtn = wrap.querySelector(".fullscreen-btn");
        const svg = canvas ? canvas.querySelector("svg") : null;

        if (!viewport || !canvas || !svg) return;

        const controller = makePanZoom(viewport, canvas, (scale) => {
          if (zoomLabel) zoomLabel.textContent = `${Math.round(scale * 100)}%`;
        }, false);

        if (zoomInBtn) zoomInBtn.onclick = () => controller.zoomIn();
        if (zoomOutBtn) zoomOutBtn.onclick = () => controller.zoomOut();
        if (zoomResetBtn) zoomResetBtn.onclick = () => controller.reset();

        const openFullscreen = () => openDiagramModal(svg, "Architecture Diagram");
        if (fullscreenBtn) fullscreenBtn.onclick = openFullscreen;

        // Clicking the diagram when unzoomed opens Fullscreen viewer
        svg.addEventListener("click", () => {
          if (controller.getScale() === 1) {
            openFullscreen();
          }
        });
      });
    }
  }

  async function renderMarkdown(markdown) {
    if (!window.marked || !window.DOMPurify) {
      article.innerHTML = '<div class="loading-state"><p>Document libraries did not load. Check your internet connection and reload.</p></div>';
      return;
    }
    const renderer = new window.marked.Renderer();
    const originalCode = renderer.code.bind(renderer);
    renderer.code = (token) => {
      if (typeof token === "object" && token !== null) return originalCode(token);
      return originalCode({ text: String(token), lang: "" });
    };

    const html = window.marked.parse(markdown, { gfm: true, breaks: false, renderer });
    article.innerHTML = window.DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });

    await enhanceContent();
    buildToc();
    readingStats(markdown);
    if ($("table-of-contents") && $("table-of-contents").parentElement) {
      $("table-of-contents").parentElement.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: "instant" });
    updateProgress();
  }

  /* ----------------------------------------------------
     Universal URL Resolver & Fallback Fetcher
  ---------------------------------------------------- */
  function resolveMarkdownUrl(raw) {
    if (!raw) return "";
    let trimmed = raw.trim();

    // 1. Full GitHub blob URL: https://github.com/:user/:repo/blob/:branch/:path
    const ghBlobRegex = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i;
    const ghBlobMatch = trimmed.match(ghBlobRegex);
    if (ghBlobMatch) {
      return `https://raw.githubusercontent.com/${ghBlobMatch[1]}/${ghBlobMatch[2]}/${ghBlobMatch[3]}/${ghBlobMatch[4]}`;
    }

    // 2. Full GitHub raw URL: https://github.com/:user/:repo/raw/:branch/:path
    const ghRawRegex = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/([^/]+)\/(.+)$/i;
    const ghRawMatch = trimmed.match(ghRawRegex);
    if (ghRawMatch) {
      return `https://raw.githubusercontent.com/${ghRawMatch[1]}/${ghRawMatch[2]}/${ghRawMatch[3]}/${ghRawMatch[4]}`;
    }

    // 3. GitHub Gist URL: https://gist.github.com/:user/:id
    const gistRegex = /^https?:\/\/gist\.github\.com\/([^/]+)\/([a-f0-9]+)/i;
    const gistMatch = trimmed.match(gistRegex);
    if (gistMatch) {
      return `https://gist.githubusercontent.com/${gistMatch[1]}/${gistMatch[2]}/raw`;
    }

    // 4. Shorthand GitHub path: user/repo/branch/path/to/file.md
    if (/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/.+\.md$/i.test(trimmed)) {
      return `https://raw.githubusercontent.com/${trimmed}`;
    }

    return trimmed;
  }

  async function fetchMarkdownWithFallback(url) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (res.ok) return await res.text();
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      // CORS fallback proxy for non-CORS enabled remote hosts
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const proxyRes = await fetch(proxyUrl);
      if (proxyRes.ok) return await proxyRes.text();
      throw err;
    }
  }

  function decodeHashData() {
    const hash = window.location.hash || "";
    const match = hash.match(/(?:#|&)(?:data|md)=([^&]+)/);
    if (!match) return null;
    const rawVal = decodeURIComponent(match[1]);
    try {
      // Try base64 decode with UTF-8 support
      const binStr = atob(rawVal);
      const bytes = Uint8Array.from(binStr, c => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch (_) {
      return rawVal;
    }
  }

  function encodeHashData(markdown) {
    try {
      const bytes = new TextEncoder().encode(markdown);
      const binStr = Array.from(bytes, byte => String.fromCharCode(byte)).join("");
      return btoa(binStr);
    } catch (_) {
      return encodeURIComponent(markdown);
    }
  }

  /* ----------------------------------------------------
     Document Loading & Rendering Engine
  ---------------------------------------------------- */
  async function loadCustomUploadedDoc(doc, changeHistory = true) {
    activeDoc = { id: doc.id, title: doc.title, file: doc.filename, content: doc.content, isUploaded: true };
    currentMarkdown = doc.content;
    currentFilename = doc.filename;

    const crumbEl = $("crumb-title");
    if (crumbEl) crumbEl.textContent = doc.title;

    drawDocumentList();
    await renderMarkdown(currentMarkdown);
    document.title = doc.title + " — DocuVerse by virajverse";

    try {
      localStorage.setItem(STORAGE_KEY_ACTIVE, doc.id);
    } catch (_) {}

    if (changeHistory) {
      history.pushState({}, "", "?doc=" + encodeURIComponent(doc.id));
    }
  }

  async function renderCustomMarkdown(content, title, filename, autoSave = false) {
    currentMarkdown = content;
    currentFilename = filename || "document.md";
    const docTitle = title || "Custom Document";

    if (autoSave) {
      const saved = saveUploadedDoc(docTitle, currentFilename, content);
      await loadCustomUploadedDoc(saved, true);
      return;
    }

    activeDoc = { id: "custom", title: docTitle, file: currentFilename, content };

    const crumbEl = $("crumb-title");
    if (crumbEl) crumbEl.textContent = docTitle;

    drawDocumentList();
    await renderMarkdown(currentMarkdown);
    document.title = docTitle + " — DocuVerse by virajverse";
  }

  async function loadDocument(doc, changeList = false) {
    activeDoc = doc;
    currentFilename = doc.file.split("/").pop();
    const crumbEl = $("crumb-title");
    if (crumbEl) crumbEl.textContent = doc.title;
    drawDocumentList();

    const cacheKey = `docuverse_doc_${doc.id}`;
    let loadedMarkdown = "";

    try {
      const res = await fetch(doc.file, { cache: "no-cache" });
      if (res.ok) {
        loadedMarkdown = await res.text();
        try { localStorage.setItem(cacheKey, loadedMarkdown); } catch (_) {}
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (error) {
      // 1. Try fetching from GitHub raw as automated fallback
      try {
        const ghFallback = `https://raw.githubusercontent.com/virajverse/DocuVerse/main/${doc.file}`;
        const ghRes = await fetch(ghFallback);
        if (ghRes.ok) {
          loadedMarkdown = await ghRes.text();
          try { localStorage.setItem(cacheKey, loadedMarkdown); } catch (_) {}
        }
      } catch (_) {}

      // 2. Offline / LocalStorage / embedded content fallback
      if (!loadedMarkdown) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          loadedMarkdown = cached;
        } else if (doc.content) {
          loadedMarkdown = doc.content;
          try { localStorage.setItem(cacheKey, loadedMarkdown); } catch (_) {}
        } else {
          article.innerHTML = `<div class="loading-state"><p>Could not load Markdown (${String(error.message)}).</p><p>Check server connection or reload page.</p></div>`;
          return;
        }
      }
    }

    currentMarkdown = loadedMarkdown;
    await renderMarkdown(currentMarkdown);
    document.title = `${doc.title} — DocuVerse by virajverse`;
    if (changeList) history.pushState({}, "", `?doc=${encodeURIComponent(doc.id)}`);
  }

  async function loadFromRemoteUrl(targetUrl, displayTitle) {
    article.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Fetching and rendering document from URL…</p></div>';
    try {
      const resolved = resolveMarkdownUrl(targetUrl);
      const text = await fetchMarkdownWithFallback(resolved);
      const filename = resolved.split("/").pop().split("?")[0] || "document.md";
      const title = displayTitle || filename.replace(/[-_]/g, " ").replace(/\.md$/i, "");
      await renderCustomMarkdown(text, title, filename);
      toast(`Loaded ${filename} successfully!`);
    } catch (err) {
      article.innerHTML = `<div class="loading-state"><p>Failed to load document from URL: <code>${targetUrl}</code></p><p style="color:var(--muted);font-size:12px;">Error: ${err.message}. Make sure the link is publicly accessible.</p></div>`;
      toast("Could not load from URL. Verify link is public.");
    }
  }

  async function routeAndLoad() {
    // 1. Direct Base64 Hash Data (#data= or #md=)
    const hashData = decodeHashData();
    if (hashData) {
      await renderCustomMarkdown(hashData, "Shared Document", "shared-document.md");
      return;
    }

    const params = new URLSearchParams(window.location.search);

    // 2. Query param ?github=
    const githubParam = params.get("github");
    if (githubParam) {
      await loadFromRemoteUrl(githubParam);
      return;
    }

    // 3. Query param ?url=
    const urlParam = params.get("url");
    if (urlParam) {
      await loadFromRemoteUrl(urlParam);
      return;
    }

    // 4. Query param ?gist=
    const gistParam = params.get("gist");
    if (gistParam) {
      const gistUrl = gistParam.startsWith("http") ? gistParam : ("https://gist.github.com/" + gistParam);
      await loadFromRemoteUrl(gistUrl, "GitHub Gist");
      return;
    }

    // 5. Query param ?doc= or Local Database check
    const docId = params.get("doc");
    const uploadedDocs = getUploadedDocs();

    if (docId) {
      const customMatch = uploadedDocs.find(d => d.id === docId);
      if (customMatch) {
        await loadCustomUploadedDoc(customMatch, false);
        return;
      }
      const sampleMatch = DOCS.find(d => d.id === docId);
      if (sampleMatch) {
        await loadDocument(sampleMatch, false);
        return;
      }
    }

    // Check last active doc from local database
    const lastActiveId = localStorage.getItem(STORAGE_KEY_ACTIVE);
    if (lastActiveId) {
      const customMatch = uploadedDocs.find(d => d.id === lastActiveId);
      if (customMatch) {
        await loadCustomUploadedDoc(customMatch, false);
        return;
      }
    }

    // If user has any uploaded docs, load the latest uploaded one!
    if (uploadedDocs.length > 0) {
      await loadCustomUploadedDoc(uploadedDocs[0], false);
      return;
    }

    // Default: Clean DocuVerse Specification
    await loadDocument(DOCS[0], false);
  }

  function updateProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const percent = max > 0 ? Math.min(100, Math.max(0, window.scrollY / max * 100)) : 100;
    const bar = $("progress-bar");
    const label = $("progress-label");
    if (bar) bar.style.width = `${percent}%`;
    if (label) label.textContent = `${Math.round(percent)}%`;
  }

  function enforceLightTheme() {
    root.dataset.theme = "light";
    try { localStorage.removeItem("docuverse-theme"); } catch (_) {}
    const lightLink = $("code-theme-light");
    if (lightLink) lightLink.disabled = false;
  }

  async function shareLink() {
    let url = window.location.href;
    // If active document is custom and not in URL, create a sharable hash link if reasonable size (<8kb)
    if (activeDoc && activeDoc.id === "custom" && !location.search && !location.hash) {
      if (currentMarkdown.length < 8000) {
        const encoded = encodeHashData(currentMarkdown);
        url = `${location.origin}${location.pathname}#data=${encoded}`;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Sharable document link copied to clipboard!");
    } catch (_) {
      window.prompt("Copy this document link:", url);
    }
  }

  function findInDocument(query) {
    const box = $("search-results");
    if (!box) return;
    const q = query.trim().toLowerCase();
    if (!q) {
      box.hidden = true;
      box.replaceChildren();
      return;
    }
    const matches = [...article.querySelectorAll("h1,h2,h3,h4,p,li,td,blockquote")]
      .filter(el => el.textContent.toLowerCase().includes(q))
      .slice(0, 10);

    box.replaceChildren();
    box.hidden = false;

    const heading = document.createElement("div");
    heading.textContent = matches.length
      ? `${matches.length}${matches.length === 10 ? "+" : ""} matching sections — select a result to jump there`
      : "No matching text found.";
    box.append(heading);

    matches.forEach(el => {
      const btn = document.createElement("button");
      btn.textContent = el.textContent.trim().replace(/\s+/g, " ").slice(0, 145);
      btn.addEventListener("click", () => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("search-hit");
        setTimeout(() => el.classList.remove("search-hit"), 1800);
        box.hidden = true;
      });
      box.append(btn);
    });
  }

  /* ----------------------------------------------------
     Open Document Modal Controller (By URL / Link)
  ---------------------------------------------------- */
  function setupOpenModal() {
    const openModal = $("open-modal");
    const openBtnTopbar = $("open-doc-topbar");
    const closeBtn = $("open-modal-close");
    const backdrop = $("open-modal-backdrop");

    if (!openModal) return;

    function showModal() {
      openModal.hidden = false;
      document.body.style.overflow = "hidden";
      const input = $("custom-url-input");
      if (input) setTimeout(() => input.focus(), 60);
    }

    function hideModal() {
      openModal.hidden = true;
      document.body.style.overflow = "";
    }

    if (openBtnTopbar) openBtnTopbar.addEventListener("click", showModal);
    if (closeBtn) closeBtn.addEventListener("click", hideModal);
    if (backdrop) backdrop.addEventListener("click", hideModal);

    // Load from URL
    const loadUrlBtn = $("load-url-btn");
    const customUrlInput = $("custom-url-input");
    if (loadUrlBtn && customUrlInput) {
      const handleLoadUrl = async () => {
        const val = customUrlInput.value.trim();
        if (!val) return;
        hideModal();
        history.pushState({}, "", `?url=${encodeURIComponent(val)}`);
        await loadFromRemoteUrl(val);
      };
      loadUrlBtn.addEventListener("click", handleLoadUrl);
      customUrlInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleLoadUrl();
      });
    }

    // Local File Selection (100% Offline via FileReader)
    const localFilePicker = $("local-file-picker");
    const chooseLocalBtn = $("choose-local-file-btn");
    const openLocalBtnToolbar = $("open-local-button");

    const triggerFilePicker = () => {
      if (localFilePicker) localFilePicker.click();
    };

    if (chooseLocalBtn) chooseLocalBtn.addEventListener("click", triggerFilePicker);
    if (openLocalBtnToolbar) openLocalBtnToolbar.addEventListener("click", triggerFilePicker);

    if (localFilePicker) {
      localFilePicker.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
          const text = event.target.result;
          hideModal();
          const cleanTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
          const savedDoc = saveUploadedDoc(cleanTitle, file.name, text);
          await loadCustomUploadedDoc(savedDoc, true);
          toast("Uploaded & saved to Library: " + savedDoc.title);
        };
        reader.onerror = () => {
          toast("Failed to read local file.");
        };
        reader.readAsText(file);
        localFilePicker.value = "";
      });
    }

    // Sample Chips
    document.querySelectorAll(".sample-chip").forEach(chip => {
      chip.addEventListener("click", async () => {
        const sampleKey = chip.dataset.sample;
        hideModal();
        const doc = DOCS.find(d => d.id === "readme") || DOCS[0];
        history.pushState({}, "", `?doc=${doc.id}`);
        await loadDocument(doc);
      });
    });

    // Paste Markdown Directly
    const renderPastedBtn = $("render-pasted-btn");
    const pasteInput = $("paste-markdown-input");
    if (renderPastedBtn && pasteInput) {
      renderPastedBtn.addEventListener("click", async () => {
        const text = pasteInput.value.trim();
        if (!text) return;
        hideModal();
        const savedDoc = saveUploadedDoc("Pasted Document", "pasted-document.md", text);
        await loadCustomUploadedDoc(savedDoc, true);
        toast("Pasted document saved to Library!");
      });
    }

    // Modal Escape Key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !openModal.hidden) {
        hideModal();
      }
    });
  }

  // Event Listeners
  if ($("copy-link-button")) $("copy-link-button").addEventListener("click", shareLink);

  if ($("download-button")) {
    $("download-button").addEventListener("click", () => {
      const blob = new Blob([currentMarkdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = currentFilename;
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  const searchInput = $("doc-search");
  if (searchInput) {
    searchInput.addEventListener("input", event => findInDocument(event.target.value));
    searchInput.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.target.value = "";
        findInDocument("");
        event.target.blur();
      }
    });
  }

  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (searchInput) searchInput.focus();
    }
  });

  const menuToggle = $("menu-toggle");
  const sidebar = $("sidebar");
  const scrim = $("mobile-scrim");

  if (menuToggle && sidebar && scrim) {
    menuToggle.addEventListener("click", () => {
      sidebar.classList.toggle("open");
      scrim.classList.toggle("visible");
    });
    scrim.addEventListener("click", () => {
      sidebar.classList.remove("open");
      scrim.classList.remove("visible");
    });
  }

  /* ----------------------------------------------------
     Progressive Web App (PWA) & Offline Service Worker
  ---------------------------------------------------- */
  let deferredInstallPrompt = null;

  function isAppInstalled() {
    return window.matchMedia("(display-mode: standalone)").matches || 
           window.matchMedia("(display-mode: fullscreen)").matches ||
           window.matchMedia("(display-mode: minimal-ui)").matches ||
           window.navigator.standalone === true ||
           document.referrer.includes("android-app://") ||
           localStorage.getItem("docuverse-installed") === "true";
  }

  function setupPwa() {
    // 1. Register Service Worker for offline resilience
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(err => {
          console.warn("DocuVerse SW registration:", err);
        });
      });
    }

    // 2. Mobile & Desktop Install Prompt
    const topInstallBtn = $("pwa-install-btn");
    const sideInstallBtn = $("sidebar-install-btn");

    function hideInstallButtons() {
      if (topInstallBtn) { topInstallBtn.hidden = true; topInstallBtn.style.display = "none"; }
      if (sideInstallBtn) { sideInstallBtn.hidden = true; sideInstallBtn.style.display = "none"; }
    }

    // If already installed, hide buttons immediately
    if (isAppInstalled()) {
      hideInstallButtons();
    }

    // Modern browser API to check if already installed
    if ("getInstalledRelatedApps" in navigator) {
      navigator.getInstalledRelatedApps().then(apps => {
        if (apps && apps.length > 0) {
          localStorage.setItem("docuverse-installed", "true");
          hideInstallButtons();
        }
      }).catch(() => {});
    }

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      if (isAppInstalled()) {
        hideInstallButtons();
        return;
      }
      if (topInstallBtn) { topInstallBtn.hidden = false; topInstallBtn.style.display = ""; }
      if (sideInstallBtn) { sideInstallBtn.hidden = false; sideInstallBtn.style.display = ""; }
    });

    const triggerInstall = () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then((choice) => {
        if (choice.outcome === "accepted") {
          localStorage.setItem("docuverse-installed", "true");
          toast("Installing DocuVerse on your device…");
          hideInstallButtons();
        }
        deferredInstallPrompt = null;
      });
    };

    if (topInstallBtn) topInstallBtn.addEventListener("click", triggerInstall);
    if (sideInstallBtn) sideInstallBtn.addEventListener("click", triggerInstall);

    window.addEventListener("appinstalled", () => {
      localStorage.setItem("docuverse-installed", "true");
      toast("DocuVerse installed on your home screen!");
      hideInstallButtons();
      deferredInstallPrompt = null;
    });

    // OS File Handler (Opens .md files directly from Android / Windows / Mac File Manager)
    if ("launchQueue" in window && "files" in window.LaunchParams.prototype) {
      window.launchQueue.setConsumer(async (launchParams) => {
        if (!launchParams.files || !launchParams.files.length) return;
        try {
          const fileHandle = launchParams.files[0];
          const file = await fileHandle.getFile();
          const text = await file.text();
          const cleanTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
          const savedDoc = saveUploadedDoc(cleanTitle, file.name, text);
          await loadCustomUploadedDoc(savedDoc, true);
          toast("Opened & saved: " + file.name);
        } catch (err) {
          console.warn("DocuVerse file handler error:", err);
        }
      });
    }
  }

  

  function checkDeviceRecommendation() {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile && !isAppInstalled()) {
      try {
        const dismissed = sessionStorage.getItem("docuverse-mobile-tip");
        if (!dismissed) {
          sessionStorage.setItem("docuverse-mobile-tip", "1");
          setTimeout(() => {
            toast("📱 Tip: Install DocuVerse as a Web App for distraction-free reading!");
          }, 3500);
        }
      } catch (_) {}
    }
  }

  window.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress);
  window.addEventListener("popstate", () => routeAndLoad());
  window.addEventListener("hashchange", () => {
    const hash = window.location.hash;
    if (hash && (hash.startsWith("#data=") || hash.startsWith("#md="))) {
      routeAndLoad();
    }
  });

  window.addEventListener("DOMContentLoaded", async () => {
    enforceLightTheme();
    setupPwa();
    setupOpenModal();
    await routeAndLoad();
    checkDeviceRecommendation();
  });
})();
