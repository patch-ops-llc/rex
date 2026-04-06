# REX — Master Build Plan

## PatchOps AI Platform for RevOps Discovery, Implementation & Ongoing Support

**Version:** 1.0
**Author:** Zach / PatchOps
**Date:** April 2026

---

## What This Is

REX is a platform that automates the entire RevOps consulting lifecycle:

1. **Discovery** — An AI agent joins client calls, runs (or assists with) structured discovery, and captures requirements in real-time with a dynamic visual display
2. **Build Planning** — Automatically generates a detailed, executable HubSpot implementation plan from discovery output
3. **Implementation** — Executes the approved build plan against the client's HubSpot portal via API
4. **QA** — Generates a human review checklist for anything the agent built
5. **Enablement** — Auto-generates training documentation and can answer client questions about what was built
6. **Ongoing Support** — An always-on AI agent accessible via Slack and email that answers client questions 24/7, executes approved work requests, and proactively monitors portal health

The end state: PatchOps handles 3-5x the client volume with the same team, shifts from project-based revenue to recurring MRR, and builds a platform that is independently valuable.

---

## Architecture Overview

```
                           ┌─────────────────────────────┐
                           │        REX PLATFORM        │
                           └──────────┬──────────────────┘
                                      │
        ┌─────────────────────────────┼──────────────────────────────┐
        │                             │                              │
  ┌─────▼──────┐            ┌────────▼─────────┐          ┌────────▼────────┐
  │ DISCOVERY   │            │ BUILD + IMPLEMENT │          │ ONGOING SUPPORT  │
  │             │            │                   │          │                  │
  │ Call Copilot│            │ Build Plan Gen    │          │ Client Agent     │
  │ (Recall.ai +│──────────►│ (Claude API)      │          │ (Slack Bot +     │
  │  Brain +    │            │                   │          │  Email Handler)  │
  │  Display)   │            │ HubSpot Engine    │◄────────►│                  │
  │             │            │ (@hubspot/client) │          │ Portal-aware AI  │
  └─────────────┘            │                   │          │ with approval    │
                             │ QA Generator      │          │ workflows        │
                             │                   │          │                  │
                             │ Enablement Gen    │          │ Cross-engagement │
                             └───────────────────┘          │ intelligence     │
                                                            └──────────────────┘
        ┌───────────────────────────────────────────────────────────┐
        │                    SHARED INFRASTRUCTURE                   │
        │                                                           │
        │  rex-web (Next.js dashboard)                            │
        │  rex-orchestrator (event-driven workflow engine)        │
        │  PostgreSQL + pgvector (state, assets, embeddings)        │
        │  Redis (pub/sub, queues, cache)                           │
        │  All hosted on Railway                                    │
        └───────────────────────────────────────────────────────────┘
```

---

## Hosting & Infrastructure

**Platform:** Railway
**Primary Runtime:** Node.js 20 / TypeScript
**Secondary Runtime:** Python 3.11 (voice agent worker only)
**Database:** PostgreSQL 15 with pgvector extension (Railway managed)
**Cache/Queue:** Redis 7 (Railway managed)
**Monorepo:** Turborepo

### Railway Services

| Service | Runtime | Purpose |
|---------|---------|---------|
| `rex-web` | Next.js | Internal dashboard + client portal |
| `rex-orchestrator` | Node.js | Event-driven workflow engine |
| `rex-hubspot-engine` | Node.js | HubSpot API execution worker |
| `rex-brain` | Node.js | Real-time call processing engine |
| `rex-display` | Next.js | Rendered by Recall.ai as in-meeting screen share |
| `rex-client-agent` | Node.js | Slack bot + email handler for client support |
| `rex-companion` | Next.js | PatchOps live call monitoring + override |
| `rex-db` | PostgreSQL 15 | Railway managed |
| `rex-redis` | Redis 7 | Railway managed |

### External Services

| Service | Purpose | Estimated Cost |
|---------|---------|---------------|
| Recall.ai | Meeting bot (join calls, capture audio, output media) | $0.20-0.40/min |
| Anthropic (Claude) | LLM for build plans, summaries, intent classification | $100-300/mo |
| OpenAI (GPT-4o) | Alternative LLM for voice agent (lower latency) | $50-100/mo |
| Deepgram | Speech-to-text (real-time transcription) | $50-100/mo |
| ElevenLabs | Text-to-speech (agent voice output) | $50-100/mo |
| SendGrid | Inbound email parsing for client agent | $20/mo |
| Clerk | Authentication | $25/mo |

---

## Monorepo Structure

```
rex/
├── apps/
│   ├── web/                        # Internal dashboard (Next.js)
│   │   ├── src/app/                # App Router pages
│   │   ├── src/components/         # UI components (shadcn/ui)
│   │   ├── src/lib/                # Utils, API clients
│   │   └── src/hooks/              # React hooks
│   │
│   ├── display/                    # Call copilot visual (Next.js)
│   │   ├── src/app/session/[id]/   # Dynamic session display
│   │   ├── src/components/         # Discovery phase views
│   │   └── src/lib/ws.ts           # WebSocket client to Brain
│   │
│   └── companion/                  # PatchOps live monitoring (Next.js)
│       ├── src/app/live/[id]/      # Live session view
│       └── src/components/         # Override controls, raw transcript
│
├── packages/
│   ├── orchestrator/               # Event-driven workflow engine
│   │   ├── src/events.ts
│   │   └── src/handlers/           # Per-event-type handlers
│   │
│   ├── hubspot-engine/             # HubSpot implementation executor
│   │   ├── src/executor.ts         # Main execution loop
│   │   ├── src/executors/          # Per-step-type executors
│   │   ├── src/rollback.ts
│   │   └── src/validators.ts
│   │
│   ├── brain/                      # Real-time call processing
│   │   ├── src/session.ts          # Session state management
│   │   ├── src/processor.ts        # Transcript → LLM → actions
│   │   ├── src/speakers.ts         # Speaker diarization + profiles
│   │   ├── src/flow.ts             # Discovery phase engine
│   │   ├── src/tts.ts              # ElevenLabs TTS integration
│   │   └── src/recall.ts           # Recall.ai bot management
│   │
│   ├── client-agent/               # Always-on client support agent
│   │   ├── src/slack.ts            # Slack Bolt.js bot
│   │   ├── src/email.ts            # SendGrid inbound handler
│   │   ├── src/router.ts           # Intent classification + routing
│   │   ├── src/context.ts          # Per-client context assembly
│   │   ├── src/handlers/           # Per-intent handlers
│   │   │   ├── question.ts
│   │   │   ├── work-request.ts
│   │   │   ├── complex-request.ts
│   │   │   └── bug-report.ts
│   │   ├── src/risk.ts             # Risk assessment engine
│   │   └── src/intelligence.ts     # Cross-engagement RAG
│   │
│   ├── build-plan-generator/       # Claude-powered plan generation
│   │   ├── src/generator.ts
│   │   ├── src/prompts/
│   │   ├── src/schemas.ts          # TypeScript types for build plans
│   │   └── src/validators.ts
│   │
│   ├── enablement/                 # Training content generation
│   │   ├── src/generator.ts
│   │   └── src/templates/
│   │
│   └── shared/                     # Shared across all packages
│       ├── src/db.ts               # Prisma client
│       ├── src/redis.ts            # Redis client
│       ├── src/types.ts            # Shared TypeScript types
│       └── src/crypto.ts           # Token encryption/decryption
│
├── prisma/
│   └── schema.prisma               # Complete database schema
│
├── scripts/
│   ├── seed-corpus.ts              # Seed training corpus
│   └── setup-hubspot-app.ts        # One-time HubSpot app setup
│
├── package.json
├── turbo.json
├── railway.toml
└── .env.example
```

---

## Complete Database Schema

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector")]
}

// ============================================================
// CORE ENGAGEMENT MODEL
// ============================================================

model Engagement {
  id              String             @id @default(cuid())
  name            String
  clientName      String
  industry        String?
  hubspotTier     String?            // starter, professional, enterprise
  hubspotPortalId String?
  hubspotToken    String?            // encrypted OAuth token
  status          EngagementStatus   @default(CREATED)
  embedding       Unsupported("vector(1536)")?  // For cross-engagement RAG
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  discoveryCalls     DiscoveryCall[]
  buildPlan          BuildPlan?
  implementations    Implementation[]
  qaItems            QAItem[]
  enablementSessions EnablementSession[]
  conversations      ClientConversation[]
  workRequests       WorkRequest[]
  slackMapping       ClientSlackMapping?
  emailMapping       ClientEmailMapping?
}

enum EngagementStatus {
  CREATED
  SCHEDULED
  DISCOVERY
  PLAN_GENERATION
  PLAN_REVIEW
  IMPLEMENTING
  QA
  ENABLEMENT
  ACTIVE_SUPPORT    // Ongoing managed client
  COMPLETE
}

// ============================================================
// DISCOVERY
// ============================================================

model DiscoveryCall {
  id              String     @id @default(cuid())
  engagementId    String
  engagement      Engagement @relation(fields: [engagementId], references: [id])
  meetingUrl      String?
  recallBotId     String?
  sessionId       String?    @unique  // Brain session ID
  status          CallStatus @default(SCHEDULED)
  autonomyLevel   Int        @default(1)  // 1-5, how much the agent leads
  rawTranscript   Json?
  structuredData  Json?      // Extracted requirements, decision points
  decisionTree    Json?
  summary         String?
  speakerProfiles Json?      // Who said what, roles, concerns
  duration        Int?       // seconds
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
}

enum CallStatus {
  SCHEDULED
  WAITING        // Bot joined, waiting for participants
  IN_PROGRESS
  COMPLETED
  FAILED
}

// ============================================================
// BUILD PLANNING & IMPLEMENTATION
// ============================================================

model BuildPlan {
  id              String     @id @default(cuid())
  engagementId    String     @unique
  engagement      Engagement @relation(fields: [engagementId], references: [id])
  version         Int        @default(1)
  status          PlanStatus @default(DRAFT)
  planData        Json       // Full structured build plan (BuildPlan schema)
  humanEdits      Json?      // Tracked changes from human review
  approvedBy      String?
  approvedAt      DateTime?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
}

enum PlanStatus {
  DRAFT
  PENDING_REVIEW
  APPROVED
  REJECTED
  IMPLEMENTING
  COMPLETED
}

model Implementation {
  id              String     @id @default(cuid())
  engagementId    String
  engagement      Engagement @relation(fields: [engagementId], references: [id])
  stepType        String     // PROPERTY_GROUP_CREATE, PROPERTY_CREATE, CUSTOM_OBJECT_CREATE, etc.
  stepName        String
  stepOrder       Int        // Execution order (dependencies resolved)
  config          Json       // Exact API parameters for this step
  status          StepStatus @default(PENDING)
  hubspotResponse Json?
  rollbackData    Json?      // Data needed to undo this step
  errorMessage    String?
  executedAt      DateTime?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
}

enum StepStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  FAILED
  ROLLED_BACK
  NEEDS_REVIEW
}

// ============================================================
// QA & ENABLEMENT
// ============================================================

model QAItem {
  id              String     @id @default(cuid())
  engagementId    String
  engagement      Engagement @relation(fields: [engagementId], references: [id])
  category        String
  description     String
  status          QAStatus   @default(PENDING)
  assignedTo      String?
  notes           String?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
}

enum QAStatus {
  PENDING
  PASSED
  FAILED
  SKIPPED
}

model EnablementSession {
  id              String     @id @default(cuid())
  engagementId    String
  engagement      Engagement @relation(fields: [engagementId], references: [id])
  type            String     // TRAINING_DOC, WALKTHROUGH_SCRIPT, FAQ, CHAT_SUPPORT
  status          String     @default("DRAFT")
  content         Json?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
}

// ============================================================
// CLIENT AGENT (Ongoing Support)
// ============================================================

model ClientSlackMapping {
  id              String     @id @default(cuid())
  slackTeamId     String     @unique
  slackChannelId  String?
  engagementId    String     @unique
  engagement      Engagement @relation(fields: [engagementId], references: [id])
  botToken        String     // encrypted
  createdAt       DateTime   @default(now())
}

model ClientEmailMapping {
  id              String     @id @default(cuid())
  emailDomain     String
  engagementId    String     @unique
  engagement      Engagement @relation(fields: [engagementId], references: [id])
  authorizedEmails String[]
  createdAt       DateTime   @default(now())
}

model ClientConversation {
  id              String     @id @default(cuid())
  engagementId    String
  engagement      Engagement @relation(fields: [engagementId], references: [id])
  platform        String     // slack, email
  userId          String
  userMessage     String
  agentResponse   String
  intent          String
  actionTaken     String?
  executionPlanId String?
  embedding       Unsupported("vector(1536)")?
  createdAt       DateTime   @default(now())
}

model WorkRequest {
  id              String            @id @default(cuid())
  engagementId    String
  engagement      Engagement        @relation(fields: [engagementId], references: [id])
  requestedBy     String
  requestText     String
  executionPlan   Json
  riskAssessment  Json
  status          WorkRequestStatus @default(PENDING_APPROVAL)
  approvedBy      String?
  approvedAt      DateTime?
  deniedReason    String?
  executionLog    Json?
  verificationLog Json?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
}

enum WorkRequestStatus {
  PENDING_APPROVAL
  APPROVED
  DENIED
  EXECUTING
  VERIFYING
  COMPLETED
  FAILED
}

// ============================================================
// TRAINING CORPUS
// ============================================================

model CorpusEntry {
  id              String   @id @default(cuid())
  name            String
  transcript      Json
  annotations     Json?    // Decision tree annotations
  tags            String[]
  industry        String?
  complexity      String?
  outcome         String?  // What was actually built
  embedding       Unsupported("vector(1536)")?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

---

## Environment Variables

```env
# ---- Database ----
DATABASE_URL=postgresql://...

# ---- Redis ----
REDIS_URL=redis://...

# ---- Auth ----
CLERK_SECRET_KEY=...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...

# ---- Recall.ai ----
RECALL_API_KEY=...
RECALL_API_URL=https://us-east-1.recall.ai
RECALL_GOOGLE_LOGIN_GROUP_ID=...

# ---- AI Models ----
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...

# ---- Voice ----
DEEPGRAM_API_KEY=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...

# ---- HubSpot (OAuth App) ----
HUBSPOT_APP_ID=...
HUBSPOT_CLIENT_ID=...
HUBSPOT_CLIENT_SECRET=...

# ---- Slack (Client Agent Bot) ----
SLACK_BOT_TOKEN=...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=...

# ---- Slack (PatchOps Internal Notifications) ----
PATCHOPS_SLACK_WEBHOOK_URL=...
PATCHOPS_SLACK_CHANNEL_ID=...

# ---- Email ----
SENDGRID_API_KEY=...
SENDGRID_INBOUND_WEBHOOK_SECRET=...

# ---- Service URLs (Railway internal) ----
BRAIN_URL=https://rex-brain.up.railway.app
BRAIN_WS_URL=wss://rex-brain.up.railway.app
DISPLAY_URL=https://rex-display.up.railway.app
COMPANION_URL=https://rex-companion.up.railway.app
WEB_URL=https://rex-web.up.railway.app

# ---- Encryption ----
ENCRYPTION_KEY=...  # For HubSpot tokens, Slack tokens at rest
```

---

## Build Order

Everything below is ordered by dependency chain and value delivery. Each phase produces a working, testable product increment. Do not skip ahead — each phase depends on the one before it.

---

### PHASE 1: Foundation
**Weeks 1-2 · Goal: Monorepo, database, auth, basic dashboard shell**

This is pure infrastructure. Nothing user-facing yet, but everything else depends on it.

```
TASKS:

1.1  Initialize Turborepo monorepo with the directory structure above
     - apps/web, packages/shared, packages/orchestrator, packages/hubspot-engine,
       packages/brain, packages/client-agent, packages/build-plan-generator,
       packages/enablement
     - Configure TypeScript path aliases across packages
     - Set up turbo.json with build/dev/lint pipelines

1.2  Set up Railway project
     - Create PostgreSQL 15 instance (enable pgvector extension)
     - Create Redis 7 instance
     - Create placeholder services for rex-web, rex-orchestrator
     - Configure environment variables

1.3  Implement Prisma schema
     - Copy the complete schema above into prisma/schema.prisma
     - Run initial migration
     - Generate Prisma client
     - Create shared/src/db.ts with singleton client

1.4  Set up shared package
     - shared/src/db.ts — Prisma client
     - shared/src/redis.ts — Redis client (ioredis)
     - shared/src/crypto.ts — encrypt/decrypt for tokens (use aes-256-gcm)
     - shared/src/types.ts — All shared TypeScript interfaces

1.5  Build web app shell (apps/web)
     - Next.js 14+ with App Router
     - Install and configure Tailwind + shadcn/ui
     - Set up Clerk auth (internal team only)
     - Build layout: sidebar nav, top bar
     - Build pages (empty shells with placeholder content):
       /dashboard
       /engagements
       /engagements/[id]
       /engagements/[id]/discovery
       /engagements/[id]/build-plan
       /engagements/[id]/implementation
       /engagements/[id]/qa
       /corpus
       /settings

1.6  Build engagement CRUD
     - API routes: POST/GET/PATCH /api/engagements
     - Dashboard page: list engagements, create new engagement form
     - Engagement detail page: tabs for discovery/plan/implementation/qa
     - Status badge component that reflects EngagementStatus enum

1.7  Set up event system (packages/orchestrator)
     - Redis pub/sub listener with handler registry
     - Dead letter queue for failed events
     - Event types enum with TypeScript interfaces for each payload
     - Basic logging (console + structured JSON for Railway)
     - Test: publish an event, verify handler fires

DELIVERABLE: Running web app with auth, empty engagement management,
event system ready to wire up. Deploy to Railway.
```

---

### PHASE 2: HubSpot Connection + Build Plan Generator
**Weeks 2-4 · Goal: Connect to HubSpot portals, generate build plans from manual input**

Before we can automate discovery, we need the engine that does something with discovery output. Build the back half first.

```
TASKS:

2.1  HubSpot OAuth flow
     - Create a HubSpot public app in developer portal
     - Required scopes: crm.objects.contacts.read/write,
       crm.objects.companies.read/write, crm.objects.deals.read/write,
       crm.schemas.read/write, crm.objects.custom.read/write,
       automation (for workflows), etc.
     - Build /settings/hubspot page with "Connect HubSpot" button
     - OAuth callback handler: exchange code for token, encrypt, store
     - Token refresh logic (HubSpot tokens expire every 6 hours)
     - Per-engagement HubSpot connection (one portal per engagement)

2.2  Build Plan JSON schema (packages/build-plan-generator)
     - Define complete TypeScript interfaces for BuildPlan:
       PropertyDefinition, PropertyGroupDefinition, CustomObjectDefinition,
       PipelineDefinition, WorkflowDefinition, AssociationDefinition,
       ListDefinition, ViewDefinition, CCADefinition, FieldMapping,
       QAChecklistItem, HumanRequiredItem
     - JSON Schema validator for build plans
     - Build plan diff utility (compare two versions)

2.3  Build Plan Generator (packages/build-plan-generator)
     - generator.ts: takes structured discovery output → calls Claude →
       returns validated BuildPlan JSON
     - System prompt that encodes HubSpot implementation expertise:
       property naming conventions, object relationships, workflow patterns,
       dependency ordering (groups before properties, objects before
       workflows that reference them)
     - Prompt includes: discovery summary, requirements list, decision points
     - Output validation: parse JSON, validate against schema, check for
       common errors (duplicate property names, missing dependencies,
       invalid field types)
     - Retry logic: if Claude returns invalid JSON, retry with error context

2.4  Manual discovery input UI
     - /engagements/[id]/discovery page:
       Textarea for pasting a transcript or writing notes
       Structured form for manually entering requirements
       (category, description, priority, complexity)
       Form for decision points (question, answer, implication)
     - "Generate Build Plan" button that calls the generator
     - This is the interim input method until call copilot is built

2.5  Build Plan review UI
     - /engagements/[id]/build-plan page:
       Renders the BuildPlan JSON as a readable, navigable document
       Sections: Portal Config, Automation, Integrations, Data Migration,
       Views/Lists/Reports, QA Checklist, Human-Required Items
       Each section expandable with full detail
       Property table with columns: object, name, label, type, group
       Workflow cards with enrollment triggers and action summaries
     - Approve / Reject / Request Changes buttons
     - Approve triggers event: build_plan_approved

2.6  Wire orchestrator events for plan generation flow
     - Event: discovery_data_submitted → generate_build_plan
     - Event: build_plan_generated → notify_team (Slack webhook)
     - Event: build_plan_approved → queue_implementation

DELIVERABLE: Can paste a transcript or enter requirements manually,
generate a build plan via Claude, review and approve it in the UI.
No HubSpot execution yet.
```

---

### PHASE 3: HubSpot Implementation Engine
**Weeks 4-7 · Goal: Approved build plans auto-configure HubSpot portals**

This is where it starts getting real. The engine executes build plans against live HubSpot portals.

```
TASKS:

3.1  Step executor framework (packages/hubspot-engine)
     - executor.ts: main loop that processes Implementation steps in order
     - ExecutionContext: holds HubSpot client, engagement ID, dry-run flag,
       created assets map (for rollback)
     - Step executor registry: map of stepType → executor function
     - Rate limiting: 150ms between API calls (HubSpot allows 100/10s)
     - Error handling: on failure, log error, mark step FAILED, continue
       to next step (don't stop entire execution)
     - Idempotency: before creating, check if asset already exists

3.2  Implement step executors (one file per type in src/executors/)
     - PROPERTY_GROUP_CREATE: crm.properties.groupsApi.create
     - PROPERTY_CREATE: crm.properties.coreApi.create
       (check existence first for idempotency)
     - PROPERTY_UPDATE: crm.properties.coreApi.update
     - PROPERTY_OPTION_ADD: get property, append option, update
     - CUSTOM_OBJECT_CREATE: crm.schemas.coreApi.create
     - ASSOCIATION_CREATE: /crm/v4/associations/{from}/{to}/labels
     - PIPELINE_CREATE: crm.pipelines.pipelinesApi.create
     - PIPELINE_STAGE_CREATE: within pipeline creation
     - LIST_CREATE: /crm/v3/lists (POST)
     - WORKFLOW_CREATE: /automation/v4/flows (POST)
       Note: v4 Workflows API for programmatic creation
     - VIEW_CREATE: may need to use internal APIs or flag as human-required
     - HUMAN_REQUIRED: create QAItem record, skip execution

3.3  Dry-run mode
     - When dryRun=true, each executor returns what it WOULD do
       without making API calls
     - Dry-run results displayed in UI before real execution
     - "Preview Changes" button on build plan page runs dry-run

3.4  Rollback capability
     - Each executor stores rollback data (e.g., property name to delete)
     - rollback.ts: reverse-order execution of rollback operations
     - Rollback button in UI (behind confirmation dialog)

3.5  Implementation progress UI
     - /engagements/[id]/implementation page:
       Real-time progress display (poll or WebSocket)
       Step list with status badges (pending/running/done/failed)
       Expandable detail for each step showing API response or error
       Overall progress bar
       "Start Implementation" button (triggers build_plan_approved event)
       "Rollback" button (danger zone)

3.6  QA checklist generator
     - After implementation completes, auto-generate QA items:
       For each property created: "Verify [property] on [object] has correct type and options"
       For each workflow: "Verify [workflow] enrollment trigger and test with sample record"
       For each pipeline: "Verify [pipeline] stages in correct order"
       For human-required items from build plan: create QA items
     - /engagements/[id]/qa page: checklist UI with pass/fail/skip per item

3.7  Wire orchestrator events
     - Event: build_plan_approved → start_implementation
     - Event: implementation_step_complete → check if all done
     - Event: implementation_complete → generate_qa_checklist
     - Event: qa_complete → transition to ENABLEMENT or ACTIVE_SUPPORT

DELIVERABLE: Approve a build plan → watch HubSpot portal get configured
in real-time → review QA checklist. Full loop from plan to portal.
```

---

### PHASE 4: Client Agent (Slack + Email Support)
**Weeks 7-10 · Goal: Always-on AI support agent per client**

This is the revenue model shift. Start generating recurring MRR immediately.

```
TASKS:

4.1  Slack app setup
     - Create Slack app at api.slack.com (from manifest)
     - Scopes: chat:write, app_mentions:read, im:history, im:read,
       im:write, channels:history, channels:read
     - Enable Socket Mode for development, HTTP for production
     - Enable Event Subscriptions: message.im, app_mention, message.channels
     - Enable Interactivity (for approval buttons)

4.2  Slack bot core (packages/client-agent/src/slack.ts)
     - Bolt.js app initialization with Socket Mode
     - Message listener: capture all messages in channels bot is in + DMs
     - Filter out bot messages, subtypes
     - Thread-based responses (reply in thread, not channel)
     - Error handling: graceful failures with user-friendly messages

4.3  Client context assembly (packages/client-agent/src/context.ts)
     - getClientContext(slackTeamId): look up engagement from ClientSlackMapping
     - Load static context: discovery notes, build plan, implementation log
     - Load dynamic context: live HubSpot portal queries
       (object counts, pipelines, recent properties, custom objects)
     - Load conversation history: last 20 interactions with this client
     - Parallel queries for speed (Promise.all for HubSpot calls)
     - Cache static context in Redis (invalidate on engagement update)

4.4  Intent classifier (packages/client-agent/src/router.ts)
     - Claude-powered classification: QUESTION, WORK_REQUEST,
       COMPLEX_REQUEST, BUG_REPORT, FEEDBACK, GREETING, GENERAL
     - Extract: hubspot_objects, properties_referenced, urgency,
       estimated_complexity
     - Return structured IntentClassification JSON

4.5  Question handler
     - Takes client question + full context
     - Calls Claude with portal state, build plan, implementation log,
       and conversation history as context
     - Returns natural language answer
     - Log conversation to ClientConversation table

4.6  Work request handler
     - Generate execution plan (Claude: what HubSpot API calls are needed?)
     - Assess risk using rule-based scoring:
       Additive operations (create) = low risk
       Modifications (update) = medium risk
       Deletions = high risk
       Workflow/pipeline changes = elevated risk
       Schema changes = complex (escalate)
     - Route based on risk tier:
       LOW: auto-execute, notify PatchOps after
       MEDIUM: send approval request to PatchOps Slack, execute on approval
       HIGH: send approval + require human review
       COMPLEX: escalate to human, scope as project work
     - Create WorkRequest record for tracking

4.7  Approval flow (Slack interactive messages)
     - Block Kit message to PatchOps internal channel:
       Client name, request text, execution plan summary,
       risk level, number of changes, rollback capability
       Approve / Deny / Review in Dashboard buttons
     - Approve handler: execute plan, verify, notify client
     - Deny handler: open modal for reason, notify client with context
     - Wire to hubspot-engine for execution (reuse same executors)

4.8  Post-execution verification
     - After executing a work request, verify each step:
       Property exists? Option was added? List filter updated?
     - Report results back to client with ✅/❌ per step
     - Log to WorkRequest.verificationLog

4.9  Email inbound handler
     - SendGrid Inbound Parse webhook endpoint
     - Look up client by sender email domain (ClientEmailMapping)
     - Strip signatures and quoted replies from message body
     - Route through same router as Slack messages
     - Reply via SendGrid with CC to PatchOps if escalation needed

4.10 Client onboarding flow
     - /settings/clients page: add new managed client
     - Generate Slack app install link for client's workspace
     - Store ClientSlackMapping + ClientEmailMapping on connection
     - Send welcome message to client's Slack channel introducing Rex

DELIVERABLE: Client messages Rex in Slack → gets instant answers about
their HubSpot portal, or requests work → PatchOps approves → Rex
executes → client gets confirmation. Revenue-generating from day one.
```

---

### PHASE 5: Call Copilot (Level 1-2: Observer + Prompter)
**Weeks 10-13 · Goal: AI joins discovery calls, takes visual notes, suggests questions**

Start with the bot as a smart observer. No voice output yet — just listening and displaying.

```
TASKS:

5.1  Recall.ai integration (packages/brain/src/recall.ts)
     - Sign up for Recall.ai self-serve account
     - Create Google Workspace for authenticated bot
       (separate account, e.g., rex@patchops-ai.com)
     - Create Login Group via Recall API
     - createDiscoveryBot function:
       POST /api/v1/bot/ with meeting_url, bot_name,
       transcription_options (Deepgram), real_time_transcription
       (webhook URL), output_media (Display webpage URL)
     - Webhook endpoint: POST /webhook/transcript/:sessionId
       receives real-time transcript segments
     - Bot lifecycle management: create, monitor status, destroy

5.2  Display app (apps/display)
     - Next.js app, publicly accessible (Recall needs to reach it)
     - /session/[sessionId] page:
       1280x720 fixed canvas (meeting video resolution)
       Dark theme, high contrast, large readable text
       WebSocket connection to rex-brain for state updates
     - Phase views:
       IntroView: "PatchOps Discovery Agent — Listening" branded card
       DiscoveryView: two-column layout
         Left: Current State facts, Desired State facts (animate in)
         Right: Active question, queued topics, complexity flags
       DeepDiveView: focused single-topic exploration
       PlaybackView: structured summary for confirmation
       SummaryView: final recap with next steps
     - Animation: new items slide in with green border, then fade to normal
     - All text minimum 18px (readable on screen share at any size)

5.3  Brain — session management (packages/brain/src/session.ts)
     - Session state machine: intro → discovery → deep_dive → playback → summary
     - WebSocket server for Display connections
     - Transcript buffer with silence detection (2-second window)
     - Speaker profile tracking (name, role, topics, speaking time)
     - State push to Display on every update

5.4  Brain — conversation processor (packages/brain/src/processor.ts)
     - On silence detection, batch process recent transcript segments
     - Claude call with system prompt + conversation history + current state
     - Extract: new facts, decision points, complexity flags, requirements
     - Determine: suggested next question, topic pivots
     - Update session state and push to Display
     - NO VOICE OUTPUT in this phase — display only

5.5  Companion app (apps/companion)
     - /live/[sessionId] page for PatchOps team member:
       Full raw transcript (scrolling, speaker-labeled)
       Current session state (same as Display but with more detail)
       Suggested questions from the Brain (the human can choose to ask them)
       Override controls: add note, flag topic, inject context
       "Phase complete" buttons to advance the discovery flow
     - This is how a human consultant uses Rex as their copilot

5.6  Engagement → Discovery Call flow
     - /engagements/[id]/discovery page: "Schedule Discovery Call" form
       Input: Google Meet URL, date/time, attendee names
       Creates DiscoveryCall record, schedules Recall bot
     - "Start Now" button for ad-hoc calls
     - After call: auto-transition to build plan generation
       (reuse Phase 2 pipeline)

5.7  Corpus management
     - /corpus page: upload past transcripts (JSON, VTT, TXT)
     - /corpus/[id] view: read transcript, add tags
     - For now, manual uploads only. Completed discovery calls
       auto-save to corpus.

DELIVERABLE: Invite Rex to a Google Meet → it joins, captures transcript
in real-time, displays organized notes on screen as the call progresses.
PatchOps team member uses Companion app to see suggested questions.
After the call, build plan generates automatically.
```

---

### PHASE 6: Call Copilot (Level 3: Voice Co-Pilot)
**Weeks 13-16 · Goal: Rex speaks during calls — asks follow-ups, confirms understanding**

Now the bot gets a voice. Human still leads, but Rex fills gaps.

```
TASKS:

6.1  TTS integration (packages/brain/src/tts.ts)
     - ElevenLabs client setup
     - Select and test voice (professional, consultative tone)
     - generateTTS function: text → audio URL (or streaming chunks)
     - Audio caching for common phrases ("Got it", "Let me dig into that")
     - Latency optimization: use eleven_turbo_v2_5 model

6.2  Audio output via Display
     - Add hidden <audio> element to Display page
     - Brain sends "speak" WebSocket message with audio URL
     - Display page plays audio → Recall captures → meeting hears it
     - Volume normalization (match meeting audio levels)

6.3  Speaking logic in Brain processor
     - canSpeak() checks:
       Minimum 5 seconds since last speech
       Minimum 2 seconds of silence from all participants
       Not during a multi-person conversation between clients
     - Speech triggers:
       Direct question asked to Rex
       2+ seconds of silence after a client finishes a complex answer
         (ask follow-up)
       Complexity flag detected (probe deeper)
       Topic transition opportunity
       Phase transition (summarize before moving on)
     - NEVER: interrupt, talk over, speak more than every 30-45 seconds
       unless asked a direct question

6.4  Conversation flow engine (packages/brain/src/flow.ts)
     - Structured discovery phases with goals, required topics,
       transition triggers, and max duration
     - Phase 1: Intro (identify attendees, set agenda) — 3 min
     - Phase 2: Current State (CRM, team, process, pain points) — 15 min
     - Phase 3: Desired State (why HubSpot, success criteria) — 15 min
     - Phase 4: Deep Dive (dynamic based on complexity flags) — varies
     - Phase 5: Playback + Confirm — 10 min
     - Agent tracks which required topics have been covered
     - Suggests questions for uncovered topics during natural pauses

6.5  Multi-speaker awareness
     - Track who's talking about what
     - Address speakers by name
     - When speakers contradict each other, diplomatically surface it
     - When one speaker dominates, gently redirect:
       "Mike, we've covered a lot from your perspective — Sarah, how does
       this look from the sales side?"

6.6  Companion app override controls
     - Mute Agent button (stops speaking, keeps processing)
     - Unmute Agent button
     - "Ask This" text input (human types a question, agent asks it)
     - "Take Over" button (agent fully stops, human runs the rest)
     - "Skip to Playback" button

6.7  Post-call pipeline enhancement
     - After call ends: full transcript + structured data + speaker profiles
       auto-fed into build plan generator
     - Summary auto-generated and attached to engagement
     - Corpus entry auto-created from call data

DELIVERABLE: Rex actively participates in discovery calls — asks
follow-up questions, probes complexity, addresses speakers by name.
PatchOps team member can mute/override at any time.
```

---

### PHASE 7: Enablement Engine
**Weeks 16-18 · Goal: Auto-generated training from implementation results**

```
TASKS:

7.1  Training document generator (packages/enablement)
     - Input: build plan + implementation log + discovery notes
     - Claude generates client-facing training guide:
       What was built and why (tied to discovery requirements)
       Feature-by-feature usage instructions
       Common pitfalls and how to avoid them
       FAQ section
     - Output: Markdown → convert to PDF or hosted page

7.2  Walkthrough script generator
     - Generates a step-by-step narrated walkthrough script
     - Could be used by a human for Loom-style recordings
     - Or by the agent for future AI-narrated walkthroughs

7.3  FAQ generator
     - Extract likely questions from the build plan
     - Pre-generate answers using portal context
     - These feed directly into the Client Agent's knowledge base

7.4  Enablement UI
     - /engagements/[id]/enablement page:
       View/edit generated training doc
       Download as PDF
       View walkthrough script
       View FAQ items
       "Share with Client" button (email or Slack)

DELIVERABLE: Implementation completes → training materials auto-generate →
ready to share with client.
```

---

### PHASE 8: Cross-Engagement Intelligence
**Weeks 18-20 · Goal: The platform gets smarter with every engagement**

```
TASKS:

8.1  Embedding pipeline
     - On engagement completion: embed discovery summary, build plan,
       and conversation logs using OpenAI text-embedding-3-small
     - Store in PostgreSQL pgvector columns
     - On new client conversation: embed the message for similarity search

8.2  Similar pattern search
     - getSimilarPatterns(engagement): find completed engagements
       with similar characteristics (industry, complexity, objects)
     - Surface in Client Agent context: "We built something similar
       for a SaaS company in your revenue range..."
     - Surface in Build Plan Generator: reference past build patterns

8.3  Precedent search for client agent
     - When a client asks a question, search past conversations across
       all engagements for similar questions + answers
     - Anonymize client names in cross-engagement references

8.4  Corpus auto-annotation
     - After calls complete and build plans are executed, auto-tag
       corpus entries with: what was discovered → what was built →
       what worked
     - This creates the feedback loop for improving discovery quality

8.5  Analytics dashboard
     - /dashboard enhancements:
       Total engagements, status breakdown
       Average time from discovery → implementation
       Build plan accuracy (% steps needing no human edit)
       Implementation success rate
       Client agent response time + resolution rate
       Most common client questions
       Most requested HubSpot changes

DELIVERABLE: Platform learns from every engagement. Client agent gives
better answers over time. Build plans get more accurate.
```

---

### PHASE 9: Call Copilot (Level 4-5: Lead + Full Autopilot)
**Weeks 20-28 · Goal: Agent runs discovery calls with minimal or no human oversight**

Only attempt this after 30+ calls through Levels 1-3 have built the corpus.

```
TASKS:

9.1  Corpus annotation UI
     - /corpus/[id]/annotate page:
       Visual transcript with speaker labels
       Click to tag: "decision point", "pivot moment",
       "complexity flag detected", "client said X but meant Y"
       Tag question-answer pairs as training examples
       Rate discovery quality: did we catch everything?

9.2  Discovery prompt training
     - Extract patterns from annotated corpus:
       Common question sequences by engagement type
       Effective pivot triggers (when clients say X, ask Y)
       Anti-patterns (questions that confuse clients)
       Industry-specific probes
     - Build dynamic prompt constructor that adapts to engagement type

9.3  Autonomy escalation
     - Level 4: Agent runs 80% of call, human monitors + intervenes
       for complex topics or relationship moments
     - Level 5: Agent runs 100%, human reviews after
     - Configurable per-engagement autonomy level
     - Auto-detect moments that need human intervention:
       Client expresses frustration
       Contradictory requirements that need judgment
       Topics outside HubSpot scope
       Pricing or contractual discussions

9.4  Quality scoring
     - Post-call quality assessment:
       Were all required topics covered?
       Were complexity flags caught?
       Did the build plan match what was discovered?
       Client satisfaction signal (if captured)
     - Score feeds back into prompt improvement

DELIVERABLE: Rex can run a full discovery call autonomously.
Human reviews after and provides feedback that improves future calls.
```

---

### PHASE 10: Proactive Monitoring + Full Service Tier
**Weeks 28-32 · Goal: Agent proactively finds and fixes issues in client portals**

```
TASKS:

10.1 Portal health scanner
     - Weekly automated scan of each managed client's HubSpot portal:
       Unused properties (no records have values)
       Workflows with zero enrollments in 30 days
       Broken workflows (error state)
       Lists with stale criteria
       Duplicate properties
       Properties with no group
       Pipeline stages with zero deals for 60+ days
     - Results stored and surfaced in dashboard

10.2 Optimization recommender
     - Based on portal scan + engagement history:
       "You have 45 unused properties. Want me to archive them?"
       "Your 'MQL to SQL' workflow hasn't enrolled anyone in 3 weeks.
        The enrollment criteria may need updating."
       "Based on your deal velocity data, your 'Proposal' stage is
        a bottleneck — average 12 days vs. 3 days for similar clients."
     - Recommendations sent to client via Slack (weekly digest)

10.3 Monthly report generator
     - Auto-generated monthly report per managed client:
       Portal health score
       Changes made (by agent + by humans)
       Recommendations
       Usage metrics
     - PDF or Slack canvas

10.4 Pricing tier enforcement
     - Support tier ($500/mo): Q&A only, no work requests
     - Managed tier ($1,500/mo): Q&A + work requests
     - Full Service ($3,000/mo): Everything + proactive monitoring
     - Tier check in client agent router before executing work requests

DELIVERABLE: Full-service managed RevOps offering powered by AI.
Recurring revenue at scale.
```

---

## Cost Model (Steady State, 20 Managed Clients)

| Item | Monthly Cost |
|------|-------------|
| Railway (9 services) | $150-250 |
| Recall.ai (~20 discovery calls) | $200-400 |
| Anthropic API | $200-500 |
| OpenAI API (embeddings + backup LLM) | $50-100 |
| Deepgram | $50-100 |
| ElevenLabs | $50-100 |
| SendGrid | $20 |
| Clerk | $25 |
| **Total infrastructure** | **$745-1,495/mo** |

| Revenue | Monthly |
|---------|---------|
| 5 clients × Support ($500) | $2,500 |
| 10 clients × Managed ($1,500) | $15,000 |
| 5 clients × Full Service ($3,000) | $15,000 |
| **Total MRR** | **$32,500** |
| **Annual run rate** | **$390,000** |
| **Gross margin** | **~96%** |

Plus project-based revenue for complex implementations, integrations,
and custom engineering that Rex flags but can't handle.

---

## What Rex Cannot Do (Human Moat)

These require human judgment, creativity, or access that APIs don't provide:

- Custom middleware / Cloudflare Worker builds
- Complex custom coded actions (formula recreation, multi-API orchestration)
- UI Extension development (React-based HubSpot cards)
- Data migration execution at scale (plan is generated, execution needs oversight)
- Quote template visual design
- Custom report building (HubSpot reporting API is limited)
- Portal audits of existing broken implementations
- Integration architecture decisions
- Contract negotiation and pricing
- Client relationship management and trust building
- "The client says X but actually needs Y" judgment calls

These are PatchOps' moat. Rex handles the 80% that's predictable and repeatable.
The team handles the 20% that's creative, complex, and high-judgment.
That's the model that scales.
