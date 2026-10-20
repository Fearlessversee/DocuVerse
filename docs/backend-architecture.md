# AI Lead Generation & Website Intelligence Agent
## Improved Backend Architecture — PRD v1.1.0 Alignment

**Status:** Recommended technical blueprint, not yet an approved replacement for the PRD.  
**Scope:** Phase 1 MVP first; Phase 2–3 boundaries shown separately.

### 1. Design principles

1. Infinity Scraper (port 8000) and SpectraBrowser (port 8002) remain independent MCP engines. Neither directly invokes the other.
2. The backend orchestrator dispatches jobs and owns workflow state. The LLM proposes decisions; deterministic services enforce authorization, eligibility, suppression and phase restrictions.
3. PostgreSQL is the source of truth for business records and job state. Queue messages are delivery mechanisms, not the only record of work.
4. Phase 1 is draft-only. No SMTP/API outbound email sending, even after a draft is approved. Inbound reply capture is allowed.
5. Use at-least-once job delivery plus idempotent processing; do not assume distributed exactly-once execution.
6. Store screenshots/HAR/report binaries in object storage; persist metadata, checksums and access-controlled object references in PostgreSQL.
7. Do not automatically bypass CAPTCHA or anti-bot controls. Browser escalation must comply with the target site's access rules and approved authorization.

### 2. Improved master backend architecture

```mermaid
flowchart TB
    UI[Admin Console] --> API[API Gateway / FastAPI]
    API --> AUTH[Authentication, RBAC, Request Validation]
    AUTH --> APP[Application Services]

    subgraph APPPLANE[Application and Policy Plane]
      LEADS[Lead Service]
      AUDITS[Audit Service]
      KB[Knowledge Base Service]
      DRAFTS[Draft and Review Service]
      POLICY[Eligibility, Suppression and Phase Policy]
      CONFIG[Brand and Service Configuration]
    end
    APP --> LEADS
    APP --> AUDITS
    APP --> KB
    APP --> DRAFTS
    LEADS --> POLICY
    AUDITS --> POLICY
    DRAFTS --> POLICY
    CONFIG --> POLICY

    subgraph ORCH[Orchestration Plane]
      BRAIN[AI Agent Brain / Planner]
      TOOLS[Typed Tool Registry and Adapter Layer]
      JOBS[Job Lifecycle Manager]
      OUTBOX[Transactional Outbox Publisher]
    end
    LEADS --> BRAIN
    AUDITS --> BRAIN
    BRAIN --> TOOLS
    BRAIN --> JOBS
    JOBS --> OUTBOX

    OUTBOX --> BROKER[Durable Queue / Broker]
    BROKER --> INGEST[Lead Ingestion Workers]
    BROKER --> AUDITWORK[Website Audit Workers]
    BROKER --> AIWORK[Qualification and Draft Workers]
    BROKER --> REPLIES[Inbound Reply Capture Workers]
    BROKER --> DLQ[Dead Letter Queue]

    INGEST --> SI[Infinity Scraper Adapter]
    SI --> IS[Infinity Scraper MCP :8000]
    AUDITWORK --> SA[SpectraBrowser Adapter]
    SA --> SB[SpectraBrowser MCP :8002]

    INGEST --> NORM[Normalize, Validate, Deduplicate]
    NORM --> SUP[Suppression and Eligibility Gate]
    SUP --> QUAL[Qualification Service]
    QUAL --> EVID[Evidence and Approved KB Retrieval]
    EVID --> GEN[Draft Generator]
    GEN --> GUARD[Claim and Output Validator]
    GUARD --> REVIEW[Human Batch Review Queue]

    subgraph DATA[Persistence]
      PG[(PostgreSQL: business state and job state)]
      OBJ[(Object Storage: screenshots, HAR, reports)]
      OBS[(Logs, Metrics, Traces, Audit Events)]
    end

    LEADS --> PG
    AUDITS --> PG
    KB --> PG
    DRAFTS --> PG
    JOBS --> PG
    NORM --> PG
    SUP --> PG
    QUAL --> PG
    EVID --> PG
    GUARD --> PG
    REVIEW --> PG
    AUDITWORK --> OBJ
    JOBS --> OBS
    POLICY --> OBS
    GUARD --> OBS

    REVIEW -->|Phase 1: approved draft stored only| PG
    REVIEW -.->|Phase 2+: only after rollout approval| SEQ[Sequence Engine]
    SEQ --> SENDPOL[Pre-send Policy Gate]
    SENDPOL --> ADAPTER[Email Provider Adapter]
    ADAPTER --> PROVIDER[Approved Email Provider]
    PROVIDER --> WEBHOOK[Inbound Webhook]
    WEBHOOK --> REPLIES
    REPLIES --> CLASSIFY[Reply Classification]
    CLASSIFY --> HUMAN[Rep Escalation / Approved Actions]
    CLASSIFY --> PG
```

### 3. API and service boundaries

Suggested APIs (implementation proposal; not specified verbatim in the PRD):

- `POST /api/v1/ingestion-jobs` — create an ingestion job.
- `GET /api/v1/jobs/{job_id}` — inspect job status and progress.
- `POST /api/v1/audit-jobs` — create an independent website audit.
- `GET /api/v1/leads/{lead_id}` — retrieve a canonical lead and its provenance.
- `GET /api/v1/leads/{lead_id}/audits` — list linked audit jobs and reports.
- `POST /api/v1/drafts/{draft_id}/approve` — approve a draft after server-side validation.
- `POST /api/v1/drafts/{draft_id}/reject` — reject with a reason.
- `POST /api/v1/drafts/{draft_id}/edit` — create a new draft version, not overwrite history.
- `POST /api/v1/webhooks/{provider}` — accept authenticated provider callbacks when a provider is configured.

All mutating APIs should authenticate the caller, authorize the action, validate the payload, persist an audit event, and use idempotency keys where retries could repeat the operation.

### 4. Lead ingestion and eligibility flow

```mermaid
flowchart TD
    A[Admin requests ingestion] --> B[Authorize source and request]
    B --> C[Persist job and outbox event in one DB transaction]
    C --> D[Publish job to durable queue]
    D --> E[Worker calls Infinity Scraper adapter]
    E --> F[Persist raw payload and source provenance]
    F --> G[Normalize fields and identity keys]
    G --> H{Record valid?}
    H -- No --> INVALID[Record validation outcome]
    H -- Yes --> I[Deduplicate using DB constraints and normalized keys]
    I --> J{Duplicate?}
    J -- Yes --> DUP[Link provenance to existing record / record duplicate outcome]
    J -- No --> K[Check global suppression and eligibility]
    K --> L{Suppressed or ineligible?}
    L -- Yes --> SUPP[Do not qualify or draft; record reason]
    L -- No --> M[Upsert canonical company/contact records]
    M --> N{Audit requested?}
    N -- Yes --> O[Create separate audit job]
    N -- No --> P[Qualification job]
    O --> P
    P --> Q{Score >= 70?}
    Q -- No --> DISQ[Mark disqualified with reason]
    Q -- Yes --> R[Queue evidence-grounded draft generation]
```

Requirements:
- Preserve the original raw record and source URL/provenance.
- Normalize domain and email consistently before deduplication.
- Use database uniqueness constraints as a final concurrency safeguard.
- Define whether multiple contacts per company are supported before freezing the schema.
- Suppression checks happen on ingestion and again at review and immediately before any future send.

### 5. Website audit and authorized escalation

```mermaid
flowchart TD
    A[Create audit job] --> B[Validate URL, scope and access policy]
    B --> C[Infinity Scraper fast metadata pass where suitable]
    C --> D{Need browser evidence or authorized escalation?}
    D -- No --> H[Normalize findings]
    D -- Yes --> E[Backend creates SpectraBrowser job]
    E --> F[Browser inspection in permitted context]
    F --> G[Capture DOM, screenshots, console, network and metrics]
    G --> H
    H --> I[Validate finding schema and provenance]
    I --> J[Persist findings and metric rows in PostgreSQL]
    I --> K[Store large artifacts in object storage]
    J --> L{Evidence complete?}
    K --> L
    L -- Yes --> M[COMPLETED]
    L -- No --> N[PARTIAL with missing-evidence reasons]
    M --> O[Generate report and optionally link to lead]
    N --> O
```

Each finding should ideally include: `audit_job_id`, category, severity, observed timestamp, URL, measurement value and unit (where applicable), evidence summary, artifact reference, and tool/version metadata. Use explicit `COMPLETED`, `PARTIAL`, and `FAILED` job states.

### 6. AI Agent Brain and evidence-grounded drafting

```mermaid
flowchart TD
    A[Job event] --> B[Load canonical lead and current state]
    B --> C[Load approved Knowledge Base items]
    B --> D[Load relevant audit findings]
    C --> E[Qualification and reason codes]
    D --> E
    E --> F{Eligible and score >= 70?}
    F -- No --> X[Persist disqualified / blocked outcome]
    F -- Yes --> G[Planner proposes typed tool calls]
    G --> H{Tool registered, authorized and phase-allowed?}
    H -- No --> X
    H -- Yes --> I[Execute through backend adapter]
    I --> J[Validate tool result schema]
    J --> K[Build evidence bundle with stable references]
    K --> L[Generate structured draft]
    L --> M[Validate claims against approved KB and evidence]
    M --> N{All required checks pass?}
    N -- No --> R[Repair by removing or regenerating unsupported claims]
    R --> M
    N -- Yes --> O[Store model/prompt versions and confidence]
    O --> P[Save PENDING_REVIEW draft]
    P --> Q[Human review and audit trail]
```

Controls:
- The LLM cannot directly access credentials, arbitrary SQL, or unrestricted network tools.
- Every tool has a typed input/output schema, timeout, permission scope and audit record.
- Evidence IDs and approved Knowledge Base references should be stored with draft claims.
- A validation failure must not silently pass; after a bounded number of repair attempts, route to human review or mark the draft blocked.
- The PRD says the AI must not invent capabilities, case studies, prices, discounts, or complaint resolutions.

### 7. Job lifecycle, retry, idempotency and recovery

```mermaid
stateDiagram-v2
    [*] --> QUEUED
    QUEUED --> RUNNING: worker claims job
    RUNNING --> SUCCEEDED: result committed
    RUNNING --> RETRY_WAIT: transient retryable failure
    RETRY_WAIT --> QUEUED: backoff elapsed
    RUNNING --> FAILED: permanent failure or retry budget exhausted
    RUNNING --> CANCELLED: authorized cancellation
    QUEUED --> CANCELLED: authorized cancellation
    FAILED --> QUEUED: reviewed safe replay
    SUCCEEDED --> [*]
    CANCELLED --> [*]
```

Implementation details:
- Persist job state, attempt count, timestamps, error category, lease/heartbeat and correlation ID.
- Use a transactional outbox so a database commit and intent to publish cannot silently diverge.
- Assume a queue message may be delivered more than once; use idempotency keys and unique constraints.
- Use bounded exponential backoff with jitter for transient errors; do not retry permanent validation/policy errors.
- Dead-letter exhausted jobs and alert an operator.
- Reconcile expired worker leases after crashes.
- For future external sending, reconcile provider message IDs/status before retrying uncertain sends to avoid duplicate emails.

### 8. Database design improvements

Recommended logical groups:

**Acquisition**
- `sources`
- `scraper_jobs`
- `raw_records`
- `companies`
- `contacts`
- `lead_source_records`
- `leads` or a clearly defined lead/opportunity entity

**Website intelligence**
- `website_audit_jobs`
- `website_audit_findings`
- `website_audit_metrics`
- `website_audit_artifacts`
- `website_audit_reports`

**AI and review**
- `knowledge_documents`
- `lead_qualifications`
- `email_drafts`
- `draft_evidence_refs` (recommended)
- `review_tasks`
- `audit_events`

**Future outreach**
- `sequences`
- `sequence_steps`
- `lead_sequence_state`
- `messages`
- `consents`
- `reply_classifications`
- `suppression_list`

Important schema decisions:
1. The PRD defines `leads.domain` and `leads.contact_email` as unique. A single contact email on the lead row can prevent multiple contacts per company. Prefer separating `companies` and `contacts`, then define the lead/opportunity relationship explicitly.
2. Suppression should target stable normalized contact identity and define channel scope. Global opt-out must block relevant future outreach across all configured channels.
3. Store consent evidence with source, timestamp, channel, purpose, and the relevant identity; do not infer consent from merely possessing a phone number or email.
4. Keep `email_drafts` (reviewable content) separate from `messages` (actual inbound/outbound communication), as the PRD notes.
5. Define all foreign keys, unique constraints, indexes, retention rules and deletion/rectification behavior before implementation.

### 9. Phase boundaries

**Phase 1**
- Lead ingestion and deduplication.
- Optional website audits with evidence.
- Admin-owned Knowledge Base.
- Qualification and personalized draft generation.
- Human batch review.
- Inbound reply capture only.
- Hard application-level prohibition on outbound email/WhatsApp sending.

**Phase 2**
- Enable email delivery only after provider, domain, authentication, consent/suppression checks, rate caps, business-hour limits, kill switch, bounce/complaint auto-pause and unsubscribe tests are approved.
- Reply classification and sequence transitions with human escalation for pricing, negotiation and complaints.

**Phase 3**
- FAQ replies grounded only in approved Knowledge Base.
- WhatsApp automation only with recorded opt-in and official platform integration.
- Calendar scheduling and expanded role/tenant controls if approved.

The phase gate must be enforced in backend policy code and tests, not only hidden in the UI or left to the LLM prompt.

### 10. Security and operational requirements

- Admin authentication and role-based authorization for every privileged route.
- Store API keys in environment-backed secrets management; never log secrets or full authorization headers.
- Prevent SSRF in URL ingestion and browser navigation: block loopback, link-local, private/internal address ranges, unsafe schemes and redirects to prohibited destinations; revalidate after DNS resolution and redirects.
- Enforce timeouts, resource limits and per-source rate limits on scraper/browser workers.
- Sanitize untrusted webpage content before using it as model context; treat website text as data, never as system instructions.
- Record structured logs with correlation IDs, job IDs, engine versions and safe error details.
- Monitor throughput, latency, retry rate, dead-letter count, audit completeness, draft rejection rate, and suppression blocks.
- Test backup/restore and job recovery, not only happy-path throughput.
- Keep the PRD target of 1,000 validated leads per 24 hours as a load-test requirement; measure separately the number of audits and drafts because they have different resource costs.

### 11. Decisions to freeze before implementation

The PRD explicitly leaves these open or underdefined:
1. Outreach brand mapping: Jupsoft vs DigifyNext by service.
2. Email delivery provider/approach.
3. Official WhatsApp provider.
4. Knowledge Base owner and approval process.
5. Escalation owners.
6. Bounce, complaint and WhatsApp quality pause thresholds.
7. Runtime/queue choice: Python/Celery/Redis vs Node.js worker.
8. Field-level schema for several core and outreach tables.
9. Whether multiple contacts per company are required.

Recommended default: use one primary worker runtime for the MVP; choose Celery/Redis only after confirming the engines and team fit it. Do not implement automated sending until the related decisions and safety tests are complete.

### 12. Acceptance tests to add

- Duplicate ingestion in concurrent workers produces one canonical identity.
- A suppression record blocks eligibility and future sending across applicable channels.
- Phase 1 cannot send even when a draft is approved.
- Worker crash and redelivery do not create duplicate business records.
- Outbox recovery republishes events that were committed but not yet published.
- Retry budget exhaustion creates a dead-letter entry and alert.
- Every generated factual claim can be traced to approved KB or audit evidence.
- Invalid/partial audit evidence is labeled correctly and is not presented as a verified finding.
- SSRF tests cover localhost, private IPs, redirects and DNS rebinding defenses.
- A provider timeout during future send is reconciled before retry to avoid duplicate dispatch.
- Load test demonstrates at least 1,000 validated leads per 24 hours under a documented test profile.

---
**Conclusion:** This is a stronger implementation blueprint aligned to the PRD. It still requires explicit approval of the open decisions and a field-level schema review before it should be treated as the final production specification.
