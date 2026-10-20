(() => {
  const DEFAULT_DOC_CONTENT = "<div align=\"center\">\n\n[![⚡ Open Interactive Architecture View in DocuVerse](https://img.shields.io/badge/⚡_Open_Interactive_View-DocuVerse-7c3aed?style=for-the-badge&logo=markdown&logoColor=white)](https://docuversee.vercel.app/?github=virajverse/DocuVerse/main/docs/backend-architecture.md)\n\n| 📱 **Mobile Users** | 💻 **Laptop / Desktop Users** |\n| :---: | :---: |\n| GitHub mobile shrinks diagrams and cuts off labels. <br> 👉 [**Tap to Open in Mobile Reader / PWA**](https://docuversee.vercel.app/?github=virajverse/DocuVerse/main/docs/backend-architecture.md) | Inspect complex diagrams at up to 300% zoom without clipping. <br> 👉 [**Open Fullscreen Lightbox & Pan/Zoom**](https://docuversee.vercel.app/?github=virajverse/DocuVerse/main/docs/backend-architecture.md) |\n\n---\n\n</div>\n\n# AI Lead Generation & Website Intelligence Agent\n## Improved Backend Architecture — PRD v1.1.0 Alignment\n\n**Status:** Recommended technical blueprint, not yet an approved replacement for the PRD.  \n**Scope:** Phase 1 MVP first; Phase 2–3 boundaries shown separately.\n\n### 1. Design principles\n\n1. Infinity Scraper (port 8000) and SpectraBrowser (port 8002) remain independent MCP engines. Neither directly invokes the other.\n2. The backend orchestrator dispatches jobs and owns workflow state. The LLM proposes decisions; deterministic services enforce authorization, eligibility, suppression and phase restrictions.\n3. PostgreSQL is the source of truth for business records and job state. Queue messages are delivery mechanisms, not the only record of work.\n4. Phase 1 is draft-only. No SMTP/API outbound email sending, even after a draft is approved. Inbound reply capture is allowed.\n5. Use at-least-once job delivery plus idempotent processing; do not assume distributed exactly-once execution.\n6. Store screenshots/HAR/report binaries in object storage; persist metadata, checksums and access-controlled object references in PostgreSQL.\n7. Do not automatically bypass CAPTCHA or anti-bot controls. Browser escalation must comply with the target site's access rules and approved authorization.\n\n### 2. Improved master backend architecture\n\n```mermaid\nflowchart TB\n    UI[Admin Console] --> API[API Gateway / FastAPI]\n    API --> AUTH[Authentication, RBAC, Request Validation]\n    AUTH --> APP[Application Services]\n\n    subgraph APPPLANE[Application and Policy Plane]\n      LEADS[Lead Service]\n      AUDITS[Audit Service]\n      KB[Knowledge Base Service]\n      DRAFTS[Draft and Review Service]\n      POLICY[Eligibility, Suppression and Phase Policy]\n      CONFIG[Brand and Service Configuration]\n    end\n    APP --> LEADS\n    APP --> AUDITS\n    APP --> KB\n    APP --> DRAFTS\n    LEADS --> POLICY\n    AUDITS --> POLICY\n    DRAFTS --> POLICY\n    CONFIG --> POLICY\n\n    subgraph ORCH[Orchestration Plane]\n      BRAIN[AI Agent Brain / Planner]\n      TOOLS[Typed Tool Registry and Adapter Layer]\n      JOBS[Job Lifecycle Manager]\n      OUTBOX[Transactional Outbox Publisher]\n    end\n    LEADS --> BRAIN\n    AUDITS --> BRAIN\n    BRAIN --> TOOLS\n    BRAIN --> JOBS\n    JOBS --> OUTBOX\n\n    OUTBOX --> BROKER[Durable Queue / Broker]\n    BROKER --> INGEST[Lead Ingestion Workers]\n    BROKER --> AUDITWORK[Website Audit Workers]\n    BROKER --> AIWORK[Qualification and Draft Workers]\n    BROKER --> REPLIES[Inbound Reply Capture Workers]\n    BROKER --> DLQ[Dead Letter Queue]\n\n    INGEST --> SI[Infinity Scraper Adapter]\n    SI --> IS[Infinity Scraper MCP :8000]\n    AUDITWORK --> SA[SpectraBrowser Adapter]\n    SA --> SB[SpectraBrowser MCP :8002]\n\n    INGEST --> NORM[Normalize, Validate, Deduplicate]\n    NORM --> SUP[Suppression and Eligibility Gate]\n    SUP --> QUAL[Qualification Service]\n    QUAL --> EVID[Evidence and Approved KB Retrieval]\n    EVID --> GEN[Draft Generator]\n    GEN --> GUARD[Claim and Output Validator]\n    GUARD --> REVIEW[Human Batch Review Queue]\n\n    subgraph DATA[Persistence]\n      PG[(PostgreSQL: business state and job state)]\n      OBJ[(Object Storage: screenshots, HAR, reports)]\n      OBS[(Logs, Metrics, Traces, Audit Events)]\n    end\n\n    LEADS --> PG\n    AUDITS --> PG\n    KB --> PG\n    DRAFTS --> PG\n    JOBS --> PG\n    NORM --> PG\n    SUP --> PG\n    QUAL --> PG\n    EVID --> PG\n    GUARD --> PG\n    REVIEW --> PG\n    AUDITWORK --> OBJ\n    JOBS --> OBS\n    POLICY --> OBS\n    GUARD --> OBS\n\n    REVIEW -->|Phase 1: approved draft stored only| PG\n    REVIEW -.->|Phase 2+: only after rollout approval| SEQ[Sequence Engine]\n    SEQ --> SENDPOL[Pre-send Policy Gate]\n    SENDPOL --> ADAPTER[Email Provider Adapter]\n    ADAPTER --> PROVIDER[Approved Email Provider]\n    PROVIDER --> WEBHOOK[Inbound Webhook]\n    WEBHOOK --> REPLIES\n    REPLIES --> CLASSIFY[Reply Classification]\n    CLASSIFY --> HUMAN[Rep Escalation / Approved Actions]\n    CLASSIFY --> PG\n```\n\n### 3. API and service boundaries\n\nSuggested APIs (implementation proposal; not specified verbatim in the PRD):\n\n- `POST /api/v1/ingestion-jobs` — create an ingestion job.\n- `GET /api/v1/jobs/{job_id}` — inspect job status and progress.\n- `POST /api/v1/audit-jobs` — create an independent website audit.\n- `GET /api/v1/leads/{lead_id}` — retrieve a canonical lead and its provenance.\n- `GET /api/v1/leads/{lead_id}/audits` — list linked audit jobs and reports.\n- `POST /api/v1/drafts/{draft_id}/approve` — approve a draft after server-side validation.\n- `POST /api/v1/drafts/{draft_id}/reject` — reject with a reason.\n- `POST /api/v1/drafts/{draft_id}/edit` — create a new draft version, not overwrite history.\n- `POST /api/v1/webhooks/{provider}` — accept authenticated provider callbacks when a provider is configured.\n\nAll mutating APIs should authenticate the caller, authorize the action, validate the payload, persist an audit event, and use idempotency keys where retries could repeat the operation.\n\n### 4. Lead ingestion and eligibility flow\n\n```mermaid\nflowchart TD\n    A[Admin requests ingestion] --> B[Authorize source and request]\n    B --> C[Persist job and outbox event in one DB transaction]\n    C --> D[Publish job to durable queue]\n    D --> E[Worker calls Infinity Scraper adapter]\n    E --> F[Persist raw payload and source provenance]\n    F --> G[Normalize fields and identity keys]\n    G --> H{Record valid?}\n    H -- No --> INVALID[Record validation outcome]\n    H -- Yes --> I[Deduplicate using DB constraints and normalized keys]\n    I --> J{Duplicate?}\n    J -- Yes --> DUP[Link provenance to existing record / record duplicate outcome]\n    J -- No --> K[Check global suppression and eligibility]\n    K --> L{Suppressed or ineligible?}\n    L -- Yes --> SUPP[Do not qualify or draft; record reason]\n    L -- No --> M[Upsert canonical company/contact records]\n    M --> N{Audit requested?}\n    N -- Yes --> O[Create separate audit job]\n    N -- No --> P[Qualification job]\n    O --> P\n    P --> Q{Score >= 70?}\n    Q -- No --> DISQ[Mark disqualified with reason]\n    Q -- Yes --> R[Queue evidence-grounded draft generation]\n```\n\nRequirements:\n- Preserve the original raw record and source URL/provenance.\n- Normalize domain and email consistently before deduplication.\n- Use database uniqueness constraints as a final concurrency safeguard.\n- Define whether multiple contacts per company are supported before freezing the schema.\n- Suppression checks happen on ingestion and again at review and immediately before any future send.\n\n### 5. Website audit and authorized escalation\n\n```mermaid\nflowchart TD\n    A[Create audit job] --> B[Validate URL, scope and access policy]\n    B --> C[Infinity Scraper fast metadata pass where suitable]\n    C --> D{Need browser evidence or authorized escalation?}\n    D -- No --> H[Normalize findings]\n    D -- Yes --> E[Backend creates SpectraBrowser job]\n    E --> F[Browser inspection in permitted context]\n    F --> G[Capture DOM, screenshots, console, network and metrics]\n    G --> H\n    H --> I[Validate finding schema and provenance]\n    I --> J[Persist findings and metric rows in PostgreSQL]\n    I --> K[Store large artifacts in object storage]\n    J --> L{Evidence complete?}\n    K --> L\n    L -- Yes --> M[COMPLETED]\n    L -- No --> N[PARTIAL with missing-evidence reasons]\n    M --> O[Generate report and optionally link to lead]\n    N --> O\n```\n\nEach finding should ideally include: `audit_job_id`, category, severity, observed timestamp, URL, measurement value and unit (where applicable), evidence summary, artifact reference, and tool/version metadata. Use explicit `COMPLETED`, `PARTIAL`, and `FAILED` job states.\n\n### 6. AI Agent Brain and evidence-grounded drafting\n\n```mermaid\nflowchart TD\n    A[Job event] --> B[Load canonical lead and current state]\n    B --> C[Load approved Knowledge Base items]\n    B --> D[Load relevant audit findings]\n    C --> E[Qualification and reason codes]\n    D --> E\n    E --> F{Eligible and score >= 70?}\n    F -- No --> X[Persist disqualified / blocked outcome]\n    F -- Yes --> G[Planner proposes typed tool calls]\n    G --> H{Tool registered, authorized and phase-allowed?}\n    H -- No --> X\n    H -- Yes --> I[Execute through backend adapter]\n    I --> J[Validate tool result schema]\n    J --> K[Build evidence bundle with stable references]\n    K --> L[Generate structured draft]\n    L --> M[Validate claims against approved KB and evidence]\n    M --> N{All required checks pass?}\n    N -- No --> R[Repair by removing or regenerating unsupported claims]\n    R --> M\n    N -- Yes --> O[Store model/prompt versions and confidence]\n    O --> P[Save PENDING_REVIEW draft]\n    P --> Q[Human review and audit trail]\n```\n\nControls:\n- The LLM cannot directly access credentials, arbitrary SQL, or unrestricted network tools.\n- Every tool has a typed input/output schema, timeout, permission scope and audit record.\n- Evidence IDs and approved Knowledge Base references should be stored with draft claims.\n- A validation failure must not silently pass; after a bounded number of repair attempts, route to human review or mark the draft blocked.\n- The PRD says the AI must not invent capabilities, case studies, prices, discounts, or complaint resolutions.\n\n### 7. Job lifecycle, retry, idempotency and recovery\n\n```mermaid\nstateDiagram-v2\n    [*] --> QUEUED\n    QUEUED --> RUNNING: worker claims job\n    RUNNING --> SUCCEEDED: result committed\n    RUNNING --> RETRY_WAIT: transient retryable failure\n    RETRY_WAIT --> QUEUED: backoff elapsed\n    RUNNING --> FAILED: permanent failure or retry budget exhausted\n    RUNNING --> CANCELLED: authorized cancellation\n    QUEUED --> CANCELLED: authorized cancellation\n    FAILED --> QUEUED: reviewed safe replay\n    SUCCEEDED --> [*]\n    CANCELLED --> [*]\n```\n\nImplementation details:\n- Persist job state, attempt count, timestamps, error category, lease/heartbeat and correlation ID.\n- Use a transactional outbox so a database commit and intent to publish cannot silently diverge.\n- Assume a queue message may be delivered more than once; use idempotency keys and unique constraints.\n- Use bounded exponential backoff with jitter for transient errors; do not retry permanent validation/policy errors.\n- Dead-letter exhausted jobs and alert an operator.\n- Reconcile expired worker leases after crashes.\n- For future external sending, reconcile provider message IDs/status before retrying uncertain sends to avoid duplicate emails.\n\n### 8. Database design improvements\n\nRecommended logical groups:\n\n**Acquisition**\n- `sources`\n- `scraper_jobs`\n- `raw_records`\n- `companies`\n- `contacts`\n- `lead_source_records`\n- `leads` or a clearly defined lead/opportunity entity\n\n**Website intelligence**\n- `website_audit_jobs`\n- `website_audit_findings`\n- `website_audit_metrics`\n- `website_audit_artifacts`\n- `website_audit_reports`\n\n**AI and review**\n- `knowledge_documents`\n- `lead_qualifications`\n- `email_drafts`\n- `draft_evidence_refs` (recommended)\n- `review_tasks`\n- `audit_events`\n\n**Future outreach**\n- `sequences`\n- `sequence_steps`\n- `lead_sequence_state`\n- `messages`\n- `consents`\n- `reply_classifications`\n- `suppression_list`\n\nImportant schema decisions:\n1. The PRD defines `leads.domain` and `leads.contact_email` as unique. A single contact email on the lead row can prevent multiple contacts per company. Prefer separating `companies` and `contacts`, then define the lead/opportunity relationship explicitly.\n2. Suppression should target stable normalized contact identity and define channel scope. Global opt-out must block relevant future outreach across all configured channels.\n3. Store consent evidence with source, timestamp, channel, purpose, and the relevant identity; do not infer consent from merely possessing a phone number or email.\n4. Keep `email_drafts` (reviewable content) separate from `messages` (actual inbound/outbound communication), as the PRD notes.\n5. Define all foreign keys, unique constraints, indexes, retention rules and deletion/rectification behavior before implementation.\n\n### 9. Phase boundaries\n\n**Phase 1**\n- Lead ingestion and deduplication.\n- Optional website audits with evidence.\n- Admin-owned Knowledge Base.\n- Qualification and personalized draft generation.\n- Human batch review.\n- Inbound reply capture only.\n- Hard application-level prohibition on outbound email/WhatsApp sending.\n\n**Phase 2**\n- Enable email delivery only after provider, domain, authentication, consent/suppression checks, rate caps, business-hour limits, kill switch, bounce/complaint auto-pause and unsubscribe tests are approved.\n- Reply classification and sequence transitions with human escalation for pricing, negotiation and complaints.\n\n**Phase 3**\n- FAQ replies grounded only in approved Knowledge Base.\n- WhatsApp automation only with recorded opt-in and official platform integration.\n- Calendar scheduling and expanded role/tenant controls if approved.\n\nThe phase gate must be enforced in backend policy code and tests, not only hidden in the UI or left to the LLM prompt.\n\n### 10. Security and operational requirements\n\n- Admin authentication and role-based authorization for every privileged route.\n- Store API keys in environment-backed secrets management; never log secrets or full authorization headers.\n- Prevent SSRF in URL ingestion and browser navigation: block loopback, link-local, private/internal address ranges, unsafe schemes and redirects to prohibited destinations; revalidate after DNS resolution and redirects.\n- Enforce timeouts, resource limits and per-source rate limits on scraper/browser workers.\n- Sanitize untrusted webpage content before using it as model context; treat website text as data, never as system instructions.\n- Record structured logs with correlation IDs, job IDs, engine versions and safe error details.\n- Monitor throughput, latency, retry rate, dead-letter count, audit completeness, draft rejection rate, and suppression blocks.\n- Test backup/restore and job recovery, not only happy-path throughput.\n- Keep the PRD target of 1,000 validated leads per 24 hours as a load-test requirement; measure separately the number of audits and drafts because they have different resource costs.\n\n### 11. Decisions to freeze before implementation\n\nThe PRD explicitly leaves these open or underdefined:\n1. Outreach brand mapping: Jupsoft vs DigifyNext by service.\n2. Email delivery provider/approach.\n3. Official WhatsApp provider.\n4. Knowledge Base owner and approval process.\n5. Escalation owners.\n6. Bounce, complaint and WhatsApp quality pause thresholds.\n7. Runtime/queue choice: Python/Celery/Redis vs Node.js worker.\n8. Field-level schema for several core and outreach tables.\n9. Whether multiple contacts per company are required.\n\nRecommended default: use one primary worker runtime for the MVP; choose Celery/Redis only after confirming the engines and team fit it. Do not implement automated sending until the related decisions and safety tests are complete.\n\n### 12. Acceptance tests to add\n\n- Duplicate ingestion in concurrent workers produces one canonical identity.\n- A suppression record blocks eligibility and future sending across applicable channels.\n- Phase 1 cannot send even when a draft is approved.\n- Worker crash and redelivery do not create duplicate business records.\n- Outbox recovery republishes events that were committed but not yet published.\n- Retry budget exhaustion creates a dead-letter entry and alert.\n- Every generated factual claim can be traced to approved KB or audit evidence.\n- Invalid/partial audit evidence is labeled correctly and is not presented as a verified finding.\n- SSRF tests cover localhost, private IPs, redirects and DNS rebinding defenses.\n- A provider timeout during future send is reconciled before retry to avoid duplicate dispatch.\n- Load test demonstrates at least 1,000 validated leads per 24 hours under a documented test profile.\n\n---\n**Conclusion:** This is a stronger implementation blueprint aligned to the PRD. It still requires explicit approval of the open decisions and a field-level schema review before it should be treated as the final production specification.\n";

  const DOCS = [
    {
      id: "backend-architecture",
      title: "Improved Backend Architecture",
      file: "docs/backend-architecture.md",
      subtitle: "PRD v1.1.0 · Technical blueprint",
      content: DEFAULT_DOC_CONTENT
    },
    {
      id: "readme",
      title: "DocuVerse Specification",
      file: "docs/readme.md",
      subtitle: "Universal Showcase & Architecture Viewer",
      content: ""
    }
  ];

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const article = $("markdown-document");

  let activeDoc = DOCS[0];
  let currentMarkdown = "";
  let currentFilename = "backend-architecture.md";
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

    DOCS.forEach(doc => {
      const a = document.createElement("a");
      a.className = `doc-link${doc.id === activeDoc.id ? " active" : ""}`;
      a.href = `?doc=${encodeURIComponent(doc.id)}`;

      const icon = document.createElement("span");
      icon.className = "doc-icon";
      icon.textContent = "▤";

      const body = document.createElement("span");
      body.textContent = doc.title;

      a.append(icon, body);
      a.addEventListener("click", async (event) => {
        event.preventDefault();
        await loadDocument(doc, false);
        history.pushState({}, "", a.href);
        const sidebar = $("sidebar");
        const scrim = $("mobile-scrim");
        if (sidebar) sidebar.classList.remove("open");
        if (scrim) scrim.classList.remove("visible");
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

      link.addEventListener("click", () => {
        nav.querySelectorAll(".toc-link").forEach(a => a.classList.remove("active"));
        link.classList.add("active");
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
  async function renderCustomMarkdown(content, title, filename) {
    currentMarkdown = content;
    currentFilename = filename || "document.md";
    activeDoc = { id: "custom", title: title || "Custom Document", file: currentFilename, content };

    const crumbEl = $("crumb-title");
    if (crumbEl) crumbEl.textContent = title || "Custom Document";

    // Mark active in sidebar
    const container = $("document-list");
    if (container) {
      container.querySelectorAll(".doc-link").forEach(l => l.classList.remove("active"));
    }

    await renderMarkdown(currentMarkdown);
    document.title = `${title || "Custom Document"} — DocuVerse by virajverse`;
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
      const gistUrl = gistParam.startsWith("http") ? gistParam : `https://gist.github.com/${gistParam}`;
      await loadFromRemoteUrl(gistUrl, "GitHub Gist");
      return;
    }

    // 5. Query param ?doc=
    const docId = params.get("doc") || DOCS[0].id;
    const matched = DOCS.find(d => d.id === docId) || DOCS[0];
    await loadDocument(matched);
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

    // Sample Chips
    document.querySelectorAll(".sample-chip").forEach(chip => {
      chip.addEventListener("click", async () => {
        const sampleKey = chip.dataset.sample;
        hideModal();
        const doc = DOCS.find(d => d.id === (sampleKey === "readme" ? "readme" : "backend-architecture")) || DOCS[0];
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
        history.pushState({}, "", window.location.pathname);
        await renderCustomMarkdown(text, "Pasted Markdown Document", "document.md");
        toast("Rendered Markdown document!");
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

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      if (topInstallBtn) topInstallBtn.hidden = false;
      if (sideInstallBtn) sideInstallBtn.hidden = false;
    });

    const triggerInstall = () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then((choice) => {
        if (choice.outcome === "accepted") {
          toast("Installing DocuVerse on your device…");
        }
        deferredInstallPrompt = null;
        if (topInstallBtn) topInstallBtn.hidden = true;
        if (sideInstallBtn) sideInstallBtn.hidden = true;
      });
    };

    if (topInstallBtn) topInstallBtn.addEventListener("click", triggerInstall);
    if (sideInstallBtn) sideInstallBtn.addEventListener("click", triggerInstall);

    window.addEventListener("appinstalled", () => {
      toast("DocuVerse installed on your home screen!");
      if (topInstallBtn) topInstallBtn.hidden = true;
      if (sideInstallBtn) sideInstallBtn.hidden = true;
    });
  }

  /* ----------------------------------------------------
     GitHub README Badge Generator Modal
  ---------------------------------------------------- */
  function setupBadgeModal() {
    const badgeModal = $("badge-modal");
    const badgeBtn = $("badge-button");
    const closeBtn = $("badge-modal-close");
    const backdrop = $("badge-modal-backdrop");
    const codeArea = $("badge-markdown-code");
    const copyBtn = $("copy-badge-btn");

    if (!badgeModal) return;

    function generateSnippet() {
      const params = new URLSearchParams(window.location.search);
      const gh = params.get("github");
      const urlParam = params.get("url");

      let targetUrl = "https://docuversee.vercel.app/?github=OWNER/REPO/BRANCH/PATH.md";
      if (gh) {
        targetUrl = `https://docuversee.vercel.app/?github=${encodeURIComponent(gh)}`;
      } else if (urlParam) {
        targetUrl = `https://docuversee.vercel.app/?url=${encodeURIComponent(urlParam)}`;
      } else if (activeDoc && activeDoc.file) {
        targetUrl = `https://docuversee.vercel.app/?github=virajverse/DocuVerse/main/${activeDoc.file}`;
      }

      return `<div align="center">

[![⚡ Open Interactive View in DocuVerse](https://img.shields.io/badge/⚡_Open_Interactive_View-DocuVerse-7c3aed?style=for-the-badge&logo=markdown&logoColor=white)](${targetUrl})

| 📱 **Mobile Users** | 💻 **Laptop / Desktop Users** |
| :---: | :---: |
| GitHub mobile shrinks diagrams & labels. <br> 👉 [**Tap to Open in Mobile Reader / PWA**](${targetUrl}) | Inspect complex diagrams at up to 300% zoom without clipping. <br> 👉 [**Open Fullscreen Lightbox & Pan/Zoom**](${targetUrl}) |

---

</div>`;
    }

    function showModal() {
      if (codeArea) codeArea.value = generateSnippet();
      badgeModal.hidden = false;
      document.body.style.overflow = "hidden";
    }

    function hideModal() {
      badgeModal.hidden = true;
      document.body.style.overflow = "";
    }

    if (badgeBtn) badgeBtn.addEventListener("click", showModal);
    if (closeBtn) closeBtn.addEventListener("click", hideModal);
    if (backdrop) backdrop.addEventListener("click", hideModal);

    if (copyBtn && codeArea) {
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(codeArea.value);
          toast("Badge snippet copied to clipboard! Paste it at line 1 of your README.");
        } catch (_) {
          codeArea.select();
          document.execCommand("copy");
          toast("Badge snippet copied to clipboard!");
        }
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !badgeModal.hidden) hideModal();
    });
  }

  function checkDeviceRecommendation() {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isMobile && !isStandalone) {
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
  window.addEventListener("hashchange", () => routeAndLoad());

  window.addEventListener("DOMContentLoaded", async () => {
    enforceLightTheme();
    setupPwa();
    setupOpenModal();
    setupBadgeModal();
    await routeAndLoad();
    checkDeviceRecommendation();
  });
})();
