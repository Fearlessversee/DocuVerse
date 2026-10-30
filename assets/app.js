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

  /* ----------------------------------------------------
     Appwrite Cloud Configuration (Dedicated Sharing Layer)
  ---------------------------------------------------- */
  const APPWRITE_CONFIG = {
    endpoint: "https://sgp.cloud.appwrite.io/v1",
    projectId: "6ae0606a00131d3f9e1e",
    databaseId: "docuverse_db",
    collectionId: "documents"
  };

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
      isUploaded: true,
      cloudId: null
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

  function updateFileMetrics(markdown) {
    const bytes = new Blob([markdown]).size;
    const kb = Math.max(1, Math.round(bytes / 1024));
    const sizeBadge = $("file-size-badge");
    if (sizeBadge) sizeBadge.textContent = kb + " KB";
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
        a.title = doc.title;

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
        metaSpan.textContent = (doc.isPermanent || (doc.cloudId && doc.expiresAt === 0)) ? "Uploaded · Permanent Cloud" : (doc.cloudId ? "Uploaded · Cloud Synced" : "Uploaded · Local");

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
      a.title = doc.title;

      const icon = document.createElement("span");
      icon.className = "doc-icon";
      icon.textContent = "▤";

      const body = document.createElement("span");
      body.className = "doc-title-text";
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
        scrollToAnchor(id, true);
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
     Footnotes & Smooth Anchor Jump System
  ---------------------------------------------------- */
  function findAnchorTarget(targetId) {
    if (!targetId || !article) return null;

    // 1. Direct ID match
    let target = document.getElementById(targetId);
    if (target) return target;

    // 2. Decoded URI
    const decoded = decodeURIComponent(targetId);
    target = document.getElementById(decoded);
    if (target) return target;

    // 3. Name attribute anchor: <a name="...">
    try {
      target = article.querySelector(`[name="${CSS.escape(targetId)}"], [name="${CSS.escape(decoded)}"]`);
      if (target) return target;
    } catch (_) {}

    // 4. Numbered footnote resolution:
    // Handles #1, #footnote-1, #fn-1, #fn1, #note-1, #cite_note-1, #footnote-ref-1, etc.
    const numMatch = targetId.match(/\d+/);
    if (numMatch) {
      const num = numMatch[0];
      const isRefBack = targetId.includes("ref") || targetId.includes("back");

      if (isRefBack) {
        // Back-link citation reference in content
        const refCandidates = [
          `footnote-ref-${num}`,
          `fnref-${num}`,
          `fnref${num}`,
          `ref-${num}`,
          `fn-ref-${num}`
        ];
        for (const c of refCandidates) {
          target = document.getElementById(c) || article.querySelector(`[name="${c}"]`);
          if (target) return target;
        }
      } else {
        // Footnote item in footnote/references section
        const noteCandidates = [
          `footnote-${num}`,
          `fn-${num}`,
          `fn${num}`,
          `note-${num}`,
          `cite_note-${num}`,
          num
        ];
        for (const c of noteCandidates) {
          target = document.getElementById(c) || article.querySelector(`[name="${c}"]`);
          if (target) return target;
        }

        // Search list item with matching data-footnote-number
        target = article.querySelector(`li[data-footnote-number="${num}"]`);
        if (target) return target;

        // Check inside .footnotes / [data-footnotes] container
        const footnoteSection = article.querySelector(".footnotes, [data-footnotes]");
        if (footnoteSection) {
          const items = footnoteSection.querySelectorAll("li");
          const idx = parseInt(num, 10) - 1;
          if (items[idx]) return items[idx];
        }

        // Check under any Footnotes / References / Notes heading
        const headings = article.querySelectorAll("h1, h2, h3, h4, h5, h6");
        for (const h of headings) {
          const text = h.textContent.toLowerCase();
          if (text.includes("footnote") || text.includes("reference") || text.includes("citation") || text.includes("note")) {
            let next = h.nextElementSibling;
            while (next && !/^H[1-6]$/i.test(next.tagName)) {
              if (next.tagName === "OL" || next.tagName === "UL") {
                const items = next.querySelectorAll("li");
                const idx = parseInt(num, 10) - 1;
                if (items[idx]) return items[idx];
              }
              next = next.nextElementSibling;
            }
          }
        }
      }
    }

    // 5. Heading search by text slug
    const targetSlug = slug(decoded.toLowerCase());
    const allHeadings = article.querySelectorAll("h1, h2, h3, h4, h5, h6");
    for (const h of allHeadings) {
      if (h.id && (h.id === targetId || h.id === decoded || h.id.toLowerCase() === targetSlug)) {
        return h;
      }
      if (slug(h.textContent.toLowerCase()) === targetSlug) {
        if (!h.id) h.id = targetSlug;
        return h;
      }
    }

    return null;
  }

  function scrollToAnchor(targetId, updateHistory = true) {
    if (!targetId) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const target = findAnchorTarget(targetId);
    if (target) {
      const headerOffset = 76;
      const targetTop = target.getBoundingClientRect().top + window.pageYOffset - headerOffset;
      window.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "smooth"
      });

      if (updateHistory) {
        history.pushState(null, "", `#${encodeURIComponent(targetId)}`);
      }

      // Visual glow highlight
      target.classList.remove("anchor-highlight");
      void target.offsetWidth;
      target.classList.add("anchor-highlight");
      setTimeout(() => {
        target.classList.remove("anchor-highlight");
      }, 2400);
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
     Vector-Crisp SVG Pan & Zoom Engine (ViewBox Manipulation)
  ---------------------------------------------------- */
  function makeSvgPanZoom(viewport, svg, onUpdate) {
    let baseVx = 0, baseVy = 0, baseVw = 1000, baseVh = 700;
    const rawVb = svg.getAttribute("viewBox");
    if (rawVb) {
      const parts = rawVb.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts.every(n => !isNaN(n))) {
        baseVx = parts[0];
        baseVy = parts[1];
        baseVw = parts[2];
        baseVh = parts[3];
      }
    } else {
      const w = parseFloat(svg.getAttribute("width")) || svg.clientWidth || 1000;
      const h = parseFloat(svg.getAttribute("height")) || svg.clientHeight || 700;
      baseVw = Math.max(w, 400);
      baseVh = Math.max(h, 300);
    }

    svg.setAttribute("viewBox", `${baseVx} ${baseVy} ${baseVw} ${baseVh}`);
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.maxWidth = "100%";
    svg.style.maxHeight = "100%";
    svg.style.display = "block";
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    let scale = 1;
    let currentVx = baseVx;
    let currentVy = baseVy;
    let currentVw = baseVw;
    let currentVh = baseVh;

    function applyViewBox() {
      svg.setAttribute("viewBox", `${currentVx} ${currentVy} ${currentVw} ${currentVh}`);
      if (onUpdate) onUpdate(scale);
    }

    function setScale(newScale, clientX, clientY) {
      const clamped = Math.min(6.0, Math.max(0.3, newScale));
      if (clamped === 1) {
        reset();
        return;
      }

      const rect = viewport.getBoundingClientRect();
      let rx = 0.5, ry = 0.5;
      if (clientX !== undefined && clientY !== undefined && rect.width > 0 && rect.height > 0) {
        rx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        ry = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      }

      const focalX = currentVx + rx * currentVw;
      const focalY = currentVy + ry * currentVh;

      const newVw = baseVw / clamped;
      const newVh = baseVh / clamped;

      currentVx = focalX - rx * newVw;
      currentVy = focalY - ry * newVh;
      currentVw = newVw;
      currentVh = newVh;
      scale = clamped;
      applyViewBox();
    }

    function reset() {
      scale = 1;
      currentVx = baseVx;
      currentVy = baseVy;
      currentVw = baseVw;
      currentVh = baseVh;
      applyViewBox();
    }

    let isDragging = false;
    let lastX = 0;
    let lastY = 0;
    const activePointers = new Map();
    let initialPinchDistance = 0;
    let initialPinchScale = 1;

    viewport.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.size === 1) {
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        viewport.classList.add("is-dragging");
        try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
      } else if (activePointers.size === 2) {
        isDragging = false;
        viewport.classList.remove("is-dragging");
        const pts = [...activePointers.values()];
        initialPinchDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        initialPinchScale = scale;
      }
    });

    viewport.addEventListener("pointermove", (e) => {
      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (isDragging && activePointers.size === 1) {
        const rect = viewport.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const dx = e.clientX - lastX;
          const dy = e.clientY - lastY;
          lastX = e.clientX;
          lastY = e.clientY;
          currentVx -= dx * (currentVw / rect.width);
          currentVy -= dy * (currentVh / rect.height);
          applyViewBox();
        }
      } else if (activePointers.size === 2 && initialPinchDistance > 0) {
        const pts = [...activePointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const newScale = initialPinchScale * (dist / initialPinchDistance);
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
        initialPinchDistance = 0;
      }
      try { viewport.releasePointerCapture(e.pointerId); } catch (_) {}
    };

    viewport.addEventListener("pointerup", endPointer);
    viewport.addEventListener("pointercancel", endPointer);

    viewport.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 0.88;
      setScale(scale * factor, e.clientX, e.clientY);
    }, { passive: false });

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
    modalCanvas.style.transform = "";

    // Clone the SVG for crisp vector rendering in modal
    const clonedSvg = svgElement.cloneNode(true);
    clonedSvg.removeAttribute("style");
    clonedSvg.style.width = "100%";
    clonedSvg.style.height = "100%";
    clonedSvg.style.display = "block";
    clonedSvg.style.margin = "0";
    modalCanvas.append(clonedSvg);

    modal.hidden = false;
    document.body.style.overflow = "hidden";

    activeModalController = makeSvgPanZoom(modalViewport, clonedSvg, (currentScale) => {
      if (modalPercent) modalPercent.textContent = `${Math.round(currentScale * 100)}%`;
    });

    if (modalPercent) modalPercent.textContent = "100%";

    const zoomInBtn = $("modal-zoom-in");
    const zoomOutBtn = $("modal-zoom-out");
    const zoomResetBtn = $("modal-zoom-reset");
    const closeBtn = $("modal-close");
    const backdrop = $("modal-backdrop");

    if (zoomInBtn) zoomInBtn.onclick = () => activeModalController.zoomIn();
    if (zoomOutBtn) zoomOutBtn.onclick = () => activeModalController.zoomOut();
    if (zoomResetBtn) zoomResetBtn.onclick = () => activeModalController.reset();

    const handleKeydown = (e) => {
      if (modal.hidden) return;
      if (e.key === "Escape") {
        closeModal();
      } else if (e.key === "+" || e.key === "=") {
        if (activeModalController) activeModalController.zoomIn();
      } else if (e.key === "-") {
        if (activeModalController) activeModalController.zoomOut();
      } else if (e.key === "0") {
        if (activeModalController) activeModalController.reset();
      }
    };

    function closeModal() {
      modal.hidden = true;
      document.body.style.overflow = "";
      modalCanvas.replaceChildren();
      modalCanvas.style.transform = "";
      activeModalController = null;
      document.removeEventListener("keydown", handleKeydown);
    }

    if (closeBtn) closeBtn.onclick = closeModal;
    if (backdrop) backdrop.onclick = closeModal;
    document.addEventListener("keydown", handleKeydown);
  }

  /* ----------------------------------------------------
     Enhance Content (Mermaid & Code Blocks & Tables)
  ---------------------------------------------------- */
  function detectDiagramTag(rawCode) {
    const trimmed = (rawCode || "").trim();
    if (/^\s*sequenceDiagram\b/m.test(trimmed)) return "SEQUENCE DIAGRAM";
    if (/^\s*stateDiagram(?:-v2)?\b/m.test(trimmed)) return "STATE DIAGRAM";
    if (/^\s*erDiagram\b/m.test(trimmed)) return "ENTITY RELATIONSHIP DIAGRAM";
    if (/^\s*classDiagram\b/m.test(trimmed)) return "CLASS DIAGRAM";
    if (/^\s*gantt\b/m.test(trimmed)) return "GANTT CHART";
    if (/^\s*pie\b/m.test(trimmed)) return "PIE CHART";
    if (/^\s*mindmap\b/m.test(trimmed)) return "MINDMAP";
    if (/^\s*gitGraph\b/m.test(trimmed)) return "GIT GRAPH";
    return "ARCHITECTURE DIAGRAM";
  }

  function sanitizeMermaidSource(rawText) {
    if (!rawText) return "";
    let text = rawText.trim();

    // 1. Sequence diagrams syntax healing
    if (/^\s*sequenceDiagram\b/m.test(text)) {
      // Loop is a reserved keyword in Mermaid sequenceDiagram (for loop block)
      text = text.replace(/(\b(?:participant|actor)\s+)Loop(\s+as\b)/gi, '$1AgentLoop$2');
      text = text.replace(/(->>|-->>|->|-->)Loop\b/gi, '$1AgentLoop');
      text = text.replace(/\bLoop(->>|-->>|->|-->)/gi, 'AgentLoop$1');
      text = text.replace(/(\bactivate\s+)Loop\b/gi, '$1AgentLoop');
      text = text.replace(/(\bdeactivate\s+)Loop\b/gi, '$1AgentLoop');

      // Sanitize message lines after arrow/colon
      const lines = text.split('\n');
      text = lines.map(line => {
        const colonIdx = line.indexOf(':');
        const arrowMatch = line.match(/(-->>|->>|-->|->)/);
        if (colonIdx !== -1 && arrowMatch && colonIdx > arrowMatch.index) {
          const prefix = line.substring(0, colonIdx + 1);
          let msg = line.substring(colonIdx + 1);
          // Semicolon in message breaks sequence statements
          msg = msg.replace(/;/g, ',');
          // Arrow inside message text
          msg = msg.replace(/\s*->\s*/g, ' to ');
          // Unquoted plus inside words
          msg = msg.replace(/([a-zA-Z0-9_])\s*\+\s*([a-zA-Z0-9_])/g, '$1 and $2');
          // Greater than / less than
          msg = msg.replace(/>\s*(\d)/g, 'over $1');
          msg = msg.replace(/<\s*(\d)/g, 'under $1');
          return prefix + msg;
        }
        return line;
      }).join('\n');
    }

    return text;
  }

  async function enhanceContent() {
    // 1. Transform Mermaid code blocks into interactive cards
    article.querySelectorAll("pre > code.language-mermaid").forEach((code, idx) => {
      const rawSource = code.textContent.trim();
      const sanitized = sanitizeMermaidSource(rawSource);
      const diagramTag = detectDiagramTag(rawSource);

      const wrapper = document.createElement("div");
      wrapper.className = "mermaid-wrap";
      wrapper.dataset.diagramId = `diagram-${idx}`;
      wrapper.dataset.rawSource = rawSource;
      wrapper.dataset.diagramTag = diagramTag;

      wrapper.innerHTML = `
        <div class="diagram-toolbar">
          <div class="diagram-info">
            <span class="diagram-dot"></span>
            <span class="diagram-tag">${diagramTag}</span>
          </div>
          <div class="diagram-actions">
            <button type="button" class="diagram-btn zoom-out-btn" title="Zoom out (–)" aria-label="Zoom out">－</button>
            <span class="diagram-zoom-badge" data-zoom-label>100%</span>
            <button type="button" class="diagram-btn zoom-in-btn" title="Zoom in (+)" aria-label="Zoom in">＋</button>
            <button type="button" class="diagram-btn zoom-reset-btn" title="Reset view (100%)" aria-label="Reset zoom">⟲</button>
            <button type="button" class="diagram-btn fullscreen-btn" title="Expand Fullscreen" aria-label="Fullscreen view">⤢ Fullscreen</button>
          </div>
        </div>
        <div class="mermaid-viewport" role="region" aria-label="${diagramTag}: Click to expand, use controls to zoom">
          <div class="mermaid-canvas">
            <div class="mermaid"></div>
          </div>
        </div>
      `;

      // Set textContent directly into .mermaid (never via innerHTML)
      const mermaidDiv = wrapper.querySelector(".mermaid");
      if (mermaidDiv) {
        mermaidDiv.textContent = sanitized;
      }

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
      if (document.fonts && document.fonts.ready) {
        try {
          await document.fonts.ready;
        } catch (_) {}
      }
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
        flowchart: { htmlLabels: true, curve: "basis", padding: 20 },
        sequence: { useMaxWidth: true }
      });

      try {
        await window.mermaid.run({ nodes: [...article.querySelectorAll(".mermaid")] });
      } catch (error) {
        console.warn("Mermaid rendering issue:", error);
      }

      // Attach pan & zoom or display clean syntax error card
      article.querySelectorAll(".mermaid-wrap").forEach(wrap => {
        const canvas = wrap.querySelector(".mermaid-canvas");
        const svg = canvas ? canvas.querySelector("svg") : null;
        const rawSource = wrap.dataset.rawSource || "";

        // Check if Mermaid rendered an error SVG or failed
        const isError = !svg ||
          svg.classList.contains("error-icon") ||
          svg.querySelector(".error-icon") ||
          (svg.textContent && svg.textContent.includes("Syntax error in text"));

        if (isError) {
          const actions = wrap.querySelector(".diagram-actions");
          if (actions) actions.style.display = "none";
          const tag = wrap.querySelector(".diagram-tag");
          if (tag) {
            tag.textContent = "SYNTAX NOTICE";
            tag.style.color = "#dc2626";
          }
          const dot = wrap.querySelector(".diagram-dot");
          if (dot) dot.style.background = "#ef4444";

          if (canvas) {
            canvas.innerHTML = `
              <div class="diagram-error-card">
                <div class="diagram-error-icon">⚠️</div>
                <div class="diagram-error-content">
                  <h4>Diagram Syntax Error</h4>
                  <p>This diagram has a syntax error in the source Markdown and could not be rendered by Mermaid.</p>
                  <details class="diagram-source-details">
                    <summary>View Raw Mermaid Source</summary>
                    <pre><code class="language-mermaid"></code></pre>
                  </details>
                </div>
              </div>
            `;
            const codeEl = canvas.querySelector("code");
            if (codeEl) codeEl.textContent = rawSource;
          }
          return;
        }

        const viewport = wrap.querySelector(".mermaid-viewport");
        const zoomLabel = wrap.querySelector("[data-zoom-label]");
        const zoomInBtn = wrap.querySelector(".zoom-in-btn");
        const zoomOutBtn = wrap.querySelector(".zoom-out-btn");
        const zoomResetBtn = wrap.querySelector(".zoom-reset-btn");
        const fullscreenBtn = wrap.querySelector(".fullscreen-btn");
        const diagramTag = wrap.dataset.diagramTag || "Architecture Diagram";

        const controller = makePanZoom(viewport, canvas, (scale) => {
          if (zoomLabel) zoomLabel.textContent = `${Math.round(scale * 100)}%`;
        }, false);

        if (zoomInBtn) zoomInBtn.onclick = () => controller.zoomIn();
        if (zoomOutBtn) zoomOutBtn.onclick = () => controller.zoomOut();
        if (zoomResetBtn) zoomResetBtn.onclick = () => controller.reset();

        const openFullscreen = () => openDiagramModal(svg, diagramTag);
        if (fullscreenBtn) fullscreenBtn.onclick = openFullscreen;

        // Clicking the diagram when unzoomed opens Fullscreen viewer
        svg.addEventListener("click", () => {
          if (controller.getScale() === 1) {
            openFullscreen();
          }
        });
      });
    }

    // 5. Ensure all headings have IDs for anchor links
    const usedHeadingIds = new Set();
    article.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach(h => {
      let id = h.id || slug(h.textContent);
      let unique = id, n = 2;
      while (usedHeadingIds.has(unique) || (unique !== h.id && document.getElementById(unique))) {
        unique = `${id}-${n++}`;
      }
      h.id = unique;
      usedHeadingIds.add(unique);
    });

    // 6. Ensure footnote / reference list items have accessible IDs
    article.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach(h => {
      const title = h.textContent.toLowerCase();
      if (title.includes("footnote") || title.includes("reference") || title.includes("citation") || title.includes("note")) {
        let el = h.nextElementSibling;
        while (el && !/^H[1-6]$/i.test(el.tagName)) {
          if (el.tagName === "OL" || el.tagName === "UL") {
            el.querySelectorAll("li").forEach((li, idx) => {
              const num = idx + 1;
              if (!li.id) li.id = `footnote-${num}`;
              li.setAttribute("data-footnote-number", String(num));
            });
          }
          el = el.nextElementSibling;
        }
      }
    });

    // Also support any element inside .footnotes or [data-footnotes]
    article.querySelectorAll(".footnotes li, [data-footnotes] li").forEach((li, idx) => {
      if (!li.id) li.id = `footnote-${idx + 1}`;
      li.setAttribute("data-footnote-number", String(idx + 1));
    });
  }

  async function renderMarkdown(markdown) {
    if (!window.marked || !window.DOMPurify) {
      article.innerHTML = '<div class="loading-state"><p>Document libraries did not load. Check your internet connection and reload.</p></div>';
      return;
    }

    if (window.markedFootnote && !window._hasConfiguredMarkedFootnote) {
      try {
        window.marked.use(window.markedFootnote());
        window._hasConfiguredMarkedFootnote = true;
      } catch (_) {}
    }

    const renderer = new window.marked.Renderer();
    const originalCode = renderer.code.bind(renderer);
    renderer.code = (token) => {
      if (typeof token === "object" && token !== null) return originalCode(token);
      return originalCode({ text: String(token), lang: "" });
    };

    const html = window.marked.parse(markdown, { gfm: true, breaks: false, renderer });
    article.innerHTML = window.DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ["data-footnote-ref", "data-footnote-backref", "data-footnotes", "target"]
    });

    await enhanceContent();
    buildToc();
    updateFileMetrics(markdown);
    if ($("table-of-contents") && $("table-of-contents").parentElement) {
      $("table-of-contents").parentElement.scrollTop = 0;
    }

    // Scroll to anchor if URL hash is present, otherwise scroll to top
    if (window.location.hash && !window.location.hash.startsWith("#data=") && !window.location.hash.startsWith("#md=")) {
      setTimeout(() => {
        scrollToAnchor(decodeURIComponent(window.location.hash.slice(1)), false);
      }, 70);
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
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
    activeDoc = { id: doc.id, title: doc.title, file: doc.filename, content: doc.content, isUploaded: true, cloudId: doc.cloudId || null, expiresAt: doc.expiresAt || 0, isPermanent: doc.isPermanent || false, userId: doc.userId || null };
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

      /* ----------------------------------------------------
     Appwrite Auth Layer & User Session Management
  ---------------------------------------------------- */
  let appwriteClient = null;
  let appwriteAccount = null;
  let currentUser = null;

  function initAppwriteAuth() {
    if (typeof window.Appwrite !== "undefined" && window.Appwrite.Client) {
      try {
        appwriteClient = new window.Appwrite.Client()
          .setEndpoint(APPWRITE_CONFIG.endpoint)
          .setProject(APPWRITE_CONFIG.projectId);
        appwriteAccount = new window.Appwrite.Account(appwriteClient);
      } catch (err) {
        console.warn("DocuVerse Appwrite SDK init error:", err);
      }
    }
  }

  function isUserLoggedIn() {
    return !!(currentUser && currentUser.email && currentUser.email.trim().length > 0);
  }

  async function checkUserSession() {
    if (!appwriteAccount) initAppwriteAuth();
    if (!appwriteAccount) return;

    try {
      const u = await appwriteAccount.get();
      // Anonymous or guest Appwrite sessions lack an email. Only accounts with valid email are treated as logged-in.
      if (u && u.email && u.email.trim().length > 0) {
        currentUser = u;
      } else {
        currentUser = null;
      }
    } catch (_) {
      currentUser = null;
    }
    updateUserAuthUI();
  }

  function updateUserAuthUI() {
    const signinBtn = $("auth-signin-btn");
    const userBtn = $("user-profile-btn");
    const userDisplayName = $("user-display-name");
    const permDescText = $("perm-desc-text");

    const sideSigninBtn = $("sidebar-signin-btn");
    const sideUserCard = $("sidebar-user-card");
    const sideUserName = $("sidebar-user-name");
    const sideUserAvatar = $("sidebar-user-avatar");

    const loggedIn = isUserLoggedIn();

    if (loggedIn) {
      if (signinBtn) signinBtn.hidden = true;
      if (userBtn) userBtn.hidden = false;
      if (sideSigninBtn) sideSigninBtn.hidden = true;
      if (sideUserCard) sideUserCard.hidden = false;

      const name = currentUser.name || currentUser.email.split("@")[0] || "Account";
      if (userDisplayName) userDisplayName.textContent = name;
      if (sideUserName) sideUserName.textContent = name;
      if (permDescText) permDescText.textContent = "Never expires · Saved to account";

      const initial = (currentUser.name || currentUser.email || "U").charAt(0).toUpperCase();
      if (sideUserAvatar) sideUserAvatar.textContent = initial;

      const profileName = $("profile-user-name");
      const profileEmail = $("profile-user-email");
      const profileInitials = $("profile-avatar-initials");
      const profileBadge = $("profile-perm-badge");
      if (profileName) profileName.textContent = currentUser.name || name;
      if (profileEmail) profileEmail.textContent = currentUser.email;
      if (profileInitials) profileInitials.textContent = initial;
      if (profileBadge) profileBadge.hidden = false;
    } else {
      if (signinBtn) signinBtn.hidden = false;
      if (userBtn) userBtn.hidden = true;
      if (sideSigninBtn) sideSigninBtn.hidden = false;
      if (sideUserCard) sideUserCard.hidden = true;
      if (permDescText) permDescText.textContent = "Never expires · (Sign In Required)";

      const profileName = $("profile-user-name");
      const profileEmail = $("profile-user-email");
      const profileInitials = $("profile-avatar-initials");
      const profileBadge = $("profile-perm-badge");
      if (profileName) profileName.textContent = "Guest";
      if (profileEmail) profileEmail.textContent = "";
      if (profileInitials) profileInitials.textContent = "G";
      if (profileBadge) profileBadge.hidden = true;
    }
  }

  /* Modals Helpers */
  function showModalEl(modal) {
    if (modal) {
      modal.hidden = false;
      document.body.style.overflow = "hidden";
    }
  }

  function hideModalEl(modal) {
    if (modal) {
      modal.hidden = true;
      document.body.style.overflow = "";
    }
  }

  function showShareModal() {
    showModalEl($("share-modal"));
  }

  function hideShareModal() {
    hideModalEl($("share-modal"));
  }

  function showAuthModal(initialTab = "signin") {
    hideForgotModal();
    hideProfileModal();
    const modal = $("auth-modal");
    if (!modal) return;

    const signinForm = $("signin-form");
    const signupForm = $("signup-form");
    const tabSignin = $("tab-btn-signin");
    const tabSignup = $("tab-btn-signup");
    const headerText = $("auth-modal-header-text");
    const signinErr = $("signin-error");
    const signupErr = $("signup-error");

    if (signinErr) signinErr.hidden = true;
    if (signupErr) signupErr.hidden = true;

    if (initialTab === "signup") {
      if (signinForm) signinForm.hidden = true;
      if (signupForm) signupForm.hidden = false;
      if (tabSignin) tabSignin.classList.remove("active");
      if (tabSignup) tabSignup.classList.add("active");
      if (headerText) headerText.textContent = "Create Free Account";
    } else {
      if (signinForm) signinForm.hidden = false;
      if (signupForm) signupForm.hidden = true;
      if (tabSignin) tabSignin.classList.add("active");
      if (tabSignup) tabSignup.classList.remove("active");
      if (headerText) headerText.textContent = "Sign In to DocuVerse";
    }
    showModalEl(modal);
  }

  function hideAuthModal() {
    hideModalEl($("auth-modal"));
  }

  function showProfileModal() {
    // If not logged in, guests cannot open profile modal — redirect to Sign In
    if (!isUserLoggedIn()) {
      showAuthModal("signin");
      return;
    }

    hideAuthModal();
    hideForgotModal();

    const passErr = $("password-error");
    const passSucc = $("password-success");
    if (passErr) passErr.hidden = true;
    if (passSucc) passSucc.hidden = true;

    // Check if user authenticated via OAuth (Google) vs Email/Password
    const isOAuth = (currentUser && (!currentUser.passwordUpdate || currentUser.passwordUpdate === ""));
    const oauthNotice = $("profile-oauth-notice");
    const passSection = $("profile-password-section");
    if (isOAuth) {
      if (oauthNotice) oauthNotice.hidden = false;
      if (passSection) passSection.hidden = true;
    } else {
      if (oauthNotice) oauthNotice.hidden = true;
      if (passSection) passSection.hidden = false;
    }

    showModalEl($("profile-modal"));
  }

  function hideProfileModal() {
    hideModalEl($("profile-modal"));
  }

  function showForgotModal() {
    hideAuthModal();
    hideProfileModal();
    showModalEl($("forgot-modal"));
  }

  function hideForgotModal() {
    hideModalEl($("forgot-modal"));
  }

  async function loadFromAppwriteCloud(shareId) {
    article.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Fetching shared document from Appwrite Cloud…</p></div>';
    try {
      const url = `${APPWRITE_CONFIG.endpoint}/databases/${APPWRITE_CONFIG.databaseId}/collections/${APPWRITE_CONFIG.collectionId}/documents/${encodeURIComponent(shareId)}`;
      const res = await fetch(url, {
        headers: {
          "X-Appwrite-Project": APPWRITE_CONFIG.projectId
        }
      });
      if (!res.ok) {
        throw new Error(`Cloud document not found or expired (HTTP ${res.status})`);
      }
      const data = await res.json();
      const now = Date.now();

      // Check auto-delete / expiration timer (Only for temporary documents)
      if (!data.isPermanent && data.expiresAt && data.expiresAt > 0 && now > data.expiresAt) {
        try {
          await fetch(url, {
            method: "DELETE",
            headers: { "X-Appwrite-Project": APPWRITE_CONFIG.projectId }
          });
        } catch (_) {}

        article.innerHTML = `
          <div class="expired-document-card">
            <div class="expired-icon">⏳</div>
            <h2 style="margin:0 0 8px;font-size:22px;">Document Link Expired</h2>
            <p style="color:var(--muted);max-width:440px;margin:8px auto 24px;font-size:14px;line-height:1.6;">
              This shared document had an auto-delete timer (24h/48h) and has been automatically removed from the database.
            </p>
            <a href="${location.pathname}" class="primary-button" style="display:inline-flex;text-decoration:none;">
              Open DocuVerse
            </a>
          </div>
        `;
        toast("This document link has expired and was auto-deleted.");
        return;
      }

      const docContent = data.content || "";
      const docTitle = data.title || data.filename || "Shared Document";
      const docFilename = data.filename || "shared.md";

      // Cache locally in sidebar
      const savedDoc = saveUploadedDoc(docTitle, docFilename, docContent);
      if (savedDoc) {
        savedDoc.cloudId = shareId;
        savedDoc.expiresAt = data.expiresAt || 0;
        savedDoc.isPermanent = !!data.isPermanent;
        savedDoc.userId = data.userId || null;
        const docs = getUploadedDocs();
        const found = docs.find(d => d.id === savedDoc.id);
        if (found) {
          found.cloudId = shareId;
          found.expiresAt = data.expiresAt || 0;
          found.isPermanent = !!data.isPermanent;
          found.userId = data.userId || null;
          persistUploadedDocs(docs);
        }
        await loadCustomUploadedDoc(savedDoc, false);
      } else {
        await renderCustomMarkdown(docContent, docTitle, docFilename);
      }

      // Add appropriate banner
      if (data.isPermanent || data.expiresAt === 0) {
        const banner = document.createElement("div");
        banner.className = "cloud-expiry-banner";
        banner.style.background = "rgba(16, 185, 129, 0.08)";
        banner.style.borderColor = "rgba(16, 185, 129, 0.25)";
        banner.innerHTML = `
          <span class="cloud-expiry-badge" style="color: #065f46;">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Permanent Cloud Document
          </span>
          <span class="cloud-expiry-timer" style="color: #047857;">♾️ Saved permanently to DocuVerse Cloud</span>
        `;
        article.prepend(banner);
      } else if (data.expiresAt && data.expiresAt > now) {
        const remainingHours = Math.max(1, Math.round((data.expiresAt - now) / 3600000));
        const banner = document.createElement("div");
        banner.className = "cloud-expiry-banner";
        banner.innerHTML = `
          <span class="cloud-expiry-badge">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Temporary Cloud Document
          </span>
          <span class="cloud-expiry-timer">⏳ Auto-deletes in ~${remainingHours} hours</span>
        `;
        article.prepend(banner);
      }

      toast("Shared document loaded from Appwrite Cloud!");
    } catch (err) {
      article.innerHTML = `<div class="loading-state"><p>Could not load shared document from cloud.</p><p style="color:var(--muted);font-size:12px;">${err.message}</p></div>`;
      toast("Could not load document from cloud.");
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

    // 2. Appwrite Cloud Shared Doc (?share=)
    const shareParam = params.get("share");
    if (shareParam) {
      await loadFromAppwriteCloud(shareParam);
      return;
    }

    // 3. Query param ?github=
    const githubParam = params.get("github");
    if (githubParam) {
      await loadFromRemoteUrl(githubParam);
      return;
    }

    // 4. Query param ?url=
    const urlParam = params.get("url");
    if (urlParam) {
      await loadFromRemoteUrl(urlParam);
      return;
    }

    // 5. Query param ?gist=
    const gistParam = params.get("gist");
    if (gistParam) {
      const gistUrl = gistParam.startsWith("http") ? gistParam : ("https://gist.github.com/" + gistParam);
      await loadFromRemoteUrl(gistUrl, "GitHub Gist");
      return;
    }

    // 6. Query param ?doc= or Local Database check
    const docId = params.get("doc");
    const uploadedDocs = getUploadedDocs();

    if (docId) {
      const customMatch = uploadedDocs.find(d => d.id === docId || d.cloudId === docId);
      if (customMatch) {
        await loadCustomUploadedDoc(customMatch, false);
        return;
      }
      const sampleMatch = DOCS.find(d => d.id === docId);
      if (sampleMatch) {
        await loadDocument(sampleMatch, false);
        return;
      }
      if (docId.length >= 10) {
        await loadFromAppwriteCloud(docId);
        return;
      }
    }

    const lastActiveId = localStorage.getItem(STORAGE_KEY_ACTIVE);
    if (lastActiveId) {
      const customMatch = uploadedDocs.find(d => d.id === lastActiveId);
      if (customMatch) {
        await loadCustomUploadedDoc(customMatch, false);
        return;
      }
    }

    if (uploadedDocs.length > 0) {
      await loadCustomUploadedDoc(uploadedDocs[0], false);
      return;
    }

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

  async function copyToClipboard(text, successMsg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(successMsg || "Link copied to clipboard!");
    } catch (_) {
      window.prompt("Copy link:", text);
    }
  }

  async function executeCloudShare(durationHours = 24) {
    const isPermanent = (durationHours === 0);

    // If permanent upload selected, ensure user is logged in
    if (isPermanent && !isUserLoggedIn()) {
      showAuthModal("signin");
      toast("Please sign in or create an account to unlock permanent storage.");
      return;
    }

    const toastMsg = isPermanent
      ? "Saving permanent document to Appwrite Cloud..."
      : `Saving to Appwrite Cloud (Auto-deletes in ${durationHours}h)...`;
    toast(toastMsg);

    const shareBtn = $("copy-link-button");
    if (shareBtn) shareBtn.disabled = true;

    try {
      const expiresAt = isPermanent ? 0 : (Date.now() + (durationHours * 60 * 60 * 1000));
      const uploadUrl = `${APPWRITE_CONFIG.endpoint}/databases/${APPWRITE_CONFIG.databaseId}/collections/${APPWRITE_CONFIG.collectionId}/documents`;

      const payloadData = {
        title: activeDoc.title || "Shared Document",
        filename: activeDoc.file || activeDoc.filename || "document.md",
        content: currentMarkdown,
        size: (activeDoc.size || currentMarkdown.length),
        fileId: activeDoc.id || "",
        expiresAt: expiresAt,
        isPermanent: isPermanent,
        userId: currentUser ? currentUser.$id : null
      };

      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "X-Appwrite-Project": APPWRITE_CONFIG.projectId,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          documentId: "unique()",
          data: payloadData
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Appwrite Error ${res.status}`);
      }

      const cloudDoc = await res.json();
      const cloudId = cloudDoc.$id;

      // Update local doc properties
      activeDoc.cloudId = cloudId;
      activeDoc.expiresAt = expiresAt;
      activeDoc.isPermanent = isPermanent;
      activeDoc.userId = payloadData.userId;

      const docs = getUploadedDocs();
      const existing = docs.find(d => d.id === activeDoc.id);
      if (existing) {
        existing.cloudId = cloudId;
        existing.expiresAt = expiresAt;
        existing.isPermanent = isPermanent;
        existing.userId = payloadData.userId;
        persistUploadedDocs(docs);
      }

      drawDocumentList();
      const url = `${location.origin}${location.pathname}?share=${encodeURIComponent(cloudId)}`;
      history.replaceState({}, "", `?share=${encodeURIComponent(cloudId)}`);

      const successToast = isPermanent
        ? "Saved permanently to Appwrite Cloud & link copied!"
        : `Saved to Appwrite Cloud (Auto-deletes in ${durationHours}h) & link copied!`;
      await copyToClipboard(url, successToast);
    } catch (err) {
      console.warn("Appwrite upload failed, fallback to hash:", err);
      if (currentMarkdown.length < 8000) {
        const encoded = encodeHashData(currentMarkdown);
        const url = `${location.origin}${location.pathname}#data=${encoded}`;
        await copyToClipboard(url, "Share link copied (fallback offline mode)");
      } else {
        toast("Cloud save failed: " + err.message);
      }
    } finally {
      if (shareBtn) shareBtn.disabled = false;
    }
  }

  async function shareLink() {
    let url = window.location.href;

    // A. Built-in Guide Document: share standard doc URL
    if (activeDoc && !activeDoc.isUploaded && activeDoc.id !== "custom") {
      url = `${location.origin}${location.pathname}?doc=${encodeURIComponent(activeDoc.id)}`;
      await copyToClipboard(url, "Document link copied to clipboard!");
      return;
    }

    // B. Uploaded / Custom Document: Show 24h / 48h / Permanent modal!
    if (activeDoc && (activeDoc.isUploaded || activeDoc.id === "custom")) {
      if (activeDoc.cloudId) {
        const isStillValid = activeDoc.isPermanent || (activeDoc.expiresAt && activeDoc.expiresAt > Date.now());
        if (isStillValid) {
          url = `${location.origin}${location.pathname}?share=${encodeURIComponent(activeDoc.cloudId)}`;
          const expiryInfo = activeDoc.isPermanent ? "(Permanent)" : `(Expires in ~${Math.max(1, Math.round((activeDoc.expiresAt - Date.now()) / 3600000))}h)`;
          await copyToClipboard(url, `Cloud share link copied! ${expiryInfo}`);
          return;
        }
      }

      showShareModal();
      return;
    }

    await copyToClipboard(url, "Link copied to clipboard!");
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
  // Setup Share Modal (24h / 48h / Permanent)
  const shareModal = $("share-modal");
  if (shareModal) {
    const closeBtn = $("share-modal-close");
    const cancelBtn = $("share-modal-cancel");
    const backdrop = $("share-modal-backdrop");
    const confirmBtn = $("confirm-share-cloud-btn");
    const card24 = $("expiry-card-24");
    const card48 = $("expiry-card-48");
    const cardPerm = $("expiry-card-perm");

    if (closeBtn) closeBtn.addEventListener("click", hideShareModal);
    if (cancelBtn) cancelBtn.addEventListener("click", hideShareModal);
    if (backdrop) backdrop.addEventListener("click", hideShareModal);

    function setExpiryCardActive(targetCard) {
      [card24, card48, cardPerm].forEach(c => {
        if (c) c.classList.remove("active");
      });
      if (targetCard) {
        targetCard.classList.add("active");
        const r = targetCard.querySelector('input[type="radio"]');
        if (r) r.checked = true;
      }
    }

    if (card24) card24.addEventListener("click", () => setExpiryCardActive(card24));
    if (card48) card48.addEventListener("click", () => setExpiryCardActive(card48));
    if (cardPerm) {
      cardPerm.addEventListener("click", (e) => {
        if (!isUserLoggedIn()) {
          e.preventDefault();
          hideShareModal();
          showAuthModal("signin");
          toast("Please sign in or create an account to unlock permanent cloud storage.");
          return;
        }
        setExpiryCardActive(cardPerm);
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener("click", async () => {
        const checked = document.querySelector('input[name="share-expiry"]:checked');
        let hours = 24;
        if (checked) {
          if (checked.value === "48") hours = 48;
          else if (checked.value === "0") hours = 0; // Permanent
        }
        hideShareModal();
        await executeCloudShare(hours);
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !shareModal.hidden) {
        hideShareModal();
      }
    });
  }

  // Setup Auth Modal & Profile Listeners
  const authSigninBtn = $("auth-signin-btn");
  const userProfileBtn = $("user-profile-btn");
  if (authSigninBtn) authSigninBtn.addEventListener("click", () => showAuthModal("signin"));
  if (userProfileBtn) userProfileBtn.addEventListener("click", showProfileModal);

  const sideSigninBtn = $("sidebar-signin-btn");
  const sideUserCard = $("sidebar-user-card");
  if (sideSigninBtn) sideSigninBtn.addEventListener("click", () => showAuthModal("signin"));
  if (sideUserCard) sideUserCard.addEventListener("click", showProfileModal);

  // Auth Modal Controls
  const authModal = $("auth-modal");
  if (authModal) {
    const authClose = $("auth-modal-close");
    const authBackdrop = $("auth-modal-backdrop");
    const tabSignin = $("tab-btn-signin");
    const tabSignup = $("tab-btn-signup");
    const openForgotLink = $("open-forgot-link");

    if (authClose) authClose.addEventListener("click", hideAuthModal);
    if (authBackdrop) authBackdrop.addEventListener("click", hideAuthModal);

    if (tabSignin) tabSignin.addEventListener("click", () => showAuthModal("signin"));
    if (tabSignup) tabSignup.addEventListener("click", () => showAuthModal("signup"));
    if (openForgotLink) openForgotLink.addEventListener("click", showForgotModal);

    // Sign In Form Submission
    const signinForm = $("signin-form");
    if (signinForm) {
      signinForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = $("signin-email").value.trim();
        const password = $("signin-password").value;
        const errEl = $("signin-error");
        const submitBtn = $("signin-submit-btn");

        if (errEl) errEl.hidden = true;
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Signing In..."; }

        try {
          if (!appwriteAccount) initAppwriteAuth();
          await appwriteAccount.createEmailPasswordSession(email, password);
          await checkUserSession();
          hideAuthModal();
          toast("Signed in successfully! Permanent storage is now unlocked.");
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message || "Failed to sign in. Please verify your email and password.";
            errEl.hidden = false;
          }
        } finally {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Sign In to DocuVerse"; }
        }
      });
    }

    // Sign Up Form Submission
    const signupForm = $("signup-form");
    if (signupForm) {
      signupForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = $("signup-name").value.trim();
        const email = $("signup-email").value.trim();
        const password = $("signup-password").value;
        const errEl = $("signup-error");
        const submitBtn = $("signup-submit-btn");

        if (errEl) errEl.hidden = true;
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Creating Account..."; }

        try {
          if (!appwriteAccount) initAppwriteAuth();
          const userId = (window.Appwrite && window.Appwrite.ID) ? window.Appwrite.ID.unique() : ("usr_" + Date.now());
          await appwriteAccount.create(userId, email, password, name);
          // Automatically log in newly created user
          await appwriteAccount.createEmailPasswordSession(email, password);
          await checkUserSession();
          hideAuthModal();
          toast("Welcome to DocuVerse! Permanent storage is now active.");
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message || "Could not create account. Please try a different email or password.";
            errEl.hidden = false;
          }
        } finally {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Create Free Account"; }
        }
      });
    }

    // OAuth Handlers
    const oauthGithub = $("oauth-github-btn");
    const oauthGoogle = $("oauth-google-btn");

    if (oauthGithub) {
      oauthGithub.addEventListener("click", () => {
        if (!appwriteAccount) initAppwriteAuth();
        try {
          const provider = (window.Appwrite && window.Appwrite.OAuthProvider) ? window.Appwrite.OAuthProvider.Github : "github";
          appwriteAccount.createOAuth2Session(provider, window.location.href, window.location.href);
        } catch (err) {
          toast("OAuth error: " + err.message);
        }
      });
    }

    if (oauthGoogle) {
      oauthGoogle.addEventListener("click", () => {
        if (!appwriteAccount) initAppwriteAuth();
        try {
          const provider = (window.Appwrite && window.Appwrite.OAuthProvider) ? window.Appwrite.OAuthProvider.Google : "google";
          appwriteAccount.createOAuth2Session(provider, window.location.href, window.location.href);
        } catch (err) {
          toast("OAuth error: " + err.message);
        }
      });
    }
  }

  // Profile Modal & Password Change Listeners
  const profileModal = $("profile-modal");
  if (profileModal) {
    const profClose = $("profile-modal-close");
    const profBackdrop = $("profile-modal-backdrop");
    const logoutBtn = $("logout-btn");
    const changePassForm = $("change-password-form");

    if (profClose) profClose.addEventListener("click", hideProfileModal);
    if (profBackdrop) profBackdrop.addEventListener("click", hideProfileModal);

    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        if (!appwriteAccount) initAppwriteAuth();
        try {
          await appwriteAccount.deleteSession("current");
        } catch (_) {}
        currentUser = null;
        updateUserAuthUI();
        hideProfileModal();
        toast("Logged out successfully.");
      });
    }

    if (changePassForm) {
      changePassForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const oldPass = $("change-old-password").value;
        const newPass = $("change-new-password").value;
        const errEl = $("password-error");
        const succEl = $("password-success");
        const submitBtn = $("update-password-submit-btn");

        if (errEl) errEl.hidden = true;
        if (succEl) succEl.hidden = true;
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Updating..."; }

        try {
          if (!appwriteAccount) initAppwriteAuth();
          await appwriteAccount.updatePassword(newPass, oldPass);
          if (succEl) {
            succEl.textContent = "Password updated successfully!";
            succEl.hidden = false;
          }
          $("change-old-password").value = "";
          $("change-new-password").value = "";
          toast("Password changed successfully!");
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message || "Failed to update password. Verify current password.";
            errEl.hidden = false;
          }
        } finally {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<svg class="btn-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Update Password'; }
        }
      });
    }
  }

  // Forgot Password Modal Listeners
  const forgotModal = $("forgot-modal");
  if (forgotModal) {
    const forgotClose = $("forgot-modal-close");
    const forgotBackdrop = $("forgot-modal-backdrop");
    const forgotBackBtn = $("forgot-back-btn");

    if (forgotClose) forgotClose.addEventListener("click", hideForgotModal);
    if (forgotBackdrop) forgotBackdrop.addEventListener("click", hideForgotModal);
    if (forgotBackBtn) forgotBackBtn.addEventListener("click", () => {
      hideForgotModal();
      showAuthModal("signin");
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

  

  

  // Delegated smooth anchor click handler for all in-document links (footnotes, references, sections)
  if (article) {
    article.addEventListener("click", (event) => {
      const link = event.target.closest("a");
      if (!link) return;

      const rawHref = link.getAttribute("href");
      if (!rawHref) return;

      // 1. Direct fragment hash link (#footnote-1, #1, #section, etc.)
      if (rawHref.startsWith("#")) {
        const rawTarget = rawHref.slice(1);
        if (!rawTarget) {
          event.preventDefault();
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }

        // If it's a base64 encoded document payload, let router handle it
        if (rawTarget.startsWith("data=") || rawTarget.startsWith("md=")) {
          return;
        }

        event.preventDefault();
        scrollToAnchor(rawTarget, true);
        return;
      }

      // 2. Same-document URL with hash
      try {
        const currentUrl = new URL(window.location.href);
        const linkUrl = new URL(link.href, window.location.href);

        if (
          linkUrl.origin === currentUrl.origin &&
          linkUrl.pathname === currentUrl.pathname &&
          linkUrl.search === currentUrl.search &&
          linkUrl.hash
        ) {
          const hashTarget = linkUrl.hash.slice(1);
          if (!hashTarget.startsWith("data=") && !hashTarget.startsWith("md=")) {
            event.preventDefault();
            scrollToAnchor(hashTarget, true);
            return;
          }
        }
      } catch (_) {}
    });
  }

  window.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress);
  window.addEventListener("popstate", () => {
    const params = new URLSearchParams(window.location.search);
    const docParam = params.get("doc") || params.get("url") || params.get("github") || params.get("gist") || "";
    const activeDocId = activeDoc ? (activeDoc.id || "") : "";
    const isSameDoc = (docParam && docParam === activeDocId) || (!docParam && !activeDocId && activeDoc);

    const hash = window.location.hash;
    if (hash && (hash.startsWith("#data=") || hash.startsWith("#md="))) {
      routeAndLoad();
      return;
    }

    if (isSameDoc) {
      if (hash) {
        scrollToAnchor(decodeURIComponent(hash.slice(1)), false);
      }
      return;
    }

    routeAndLoad();
  });
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
  });
})();
