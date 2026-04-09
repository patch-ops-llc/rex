// Re-export Prisma generated enums for convenience
export type {
  Engagement,
  DiscoveryCall,
  BuildPlan,
  Implementation,
  QAItem,
  EnablementSession,
  Walkthrough,
  WalkthroughStep,
  ClientSlackMapping,
  ClientEmailMapping,
  ClientConversation,
  WorkRequest,
  CorpusEntry,
  HubSpotPortal,
  SOW,
  SOWLineItem,
  ScopeAlert,
  ScopeDocument,
  ChatSession,
  ChatMessage,
  ProjectPhase,
  ProjectTask,
  RequirementItem,
  UATItem,
  DeliveryLogEntry,
  TranscriptSegment,
  CallInsight,
  CallAgendaItem,
  CustomProject,
  CalendarAccount,
  CalendarEvent,
  EngagementContact,
} from "@prisma/client";

export {
  EngagementStatus,
  CallStatus,
  PlanStatus,
  StepStatus,
  QAStatus,
  WorkRequestStatus,
  SOWStatus,
  ScopeAlertType,
  AlertSeverity,
  AlertStatus,
  ScopeDocumentStatus,
  PhaseType,
  PhaseStatus,
  TaskStatus,
  TaskType,
  RequirementStatus,
  UATStatus,
  InsightType,
  AgendaItemStatus,
  ProjectDeployStatus,
  WalkthroughStatus,
  CalendarProvider,
} from "@prisma/client";

// ============================================================
// EVENT SYSTEM TYPES
// ============================================================

export enum EventType {
  DISCOVERY_DATA_SUBMITTED = "discovery_data_submitted",
  BUILD_PLAN_GENERATED = "build_plan_generated",
  BUILD_PLAN_APPROVED = "build_plan_approved",
  BUILD_PLAN_REJECTED = "build_plan_rejected",
  IMPLEMENTATION_STARTED = "implementation_started",
  IMPLEMENTATION_STEP_COMPLETE = "implementation_step_complete",
  IMPLEMENTATION_COMPLETE = "implementation_complete",
  IMPLEMENTATION_FAILED = "implementation_failed",
  QA_CHECKLIST_GENERATED = "qa_checklist_generated",
  QA_COMPLETE = "qa_complete",
  ENABLEMENT_GENERATED = "enablement_generated",
  CLIENT_MESSAGE_RECEIVED = "client_message_received",
  WORK_REQUEST_CREATED = "work_request_created",
  WORK_REQUEST_APPROVED = "work_request_approved",
  WORK_REQUEST_DENIED = "work_request_denied",
  WORK_REQUEST_COMPLETED = "work_request_completed",
  SOW_CREATED = "sow_created",
  SOW_UPDATED = "sow_updated",
  SCOPE_ALERT_CREATED = "scope_alert_created",
  SCOPE_ALERT_RESOLVED = "scope_alert_resolved",
  CALL_BOT_DISPATCHED = "call_bot_dispatched",
  CALL_STARTED = "call_started",
  CALL_TRANSCRIPT_SEGMENT = "call_transcript_segment",
  CALL_INSIGHT_EXTRACTED = "call_insight_extracted",
  CALL_COMPLETED = "call_completed",
  CALL_PROCESSING_COMPLETE = "call_processing_complete",
  SCOPE_DOCUMENT_UPLOADED = "scope_document_uploaded",
  SCOPE_DOCUMENT_PARSED = "scope_document_parsed",
  SCOPE_DOCUMENT_PROCESSED = "scope_document_processed",
  SCOPE_DOCUMENT_FAILED = "scope_document_failed",
  PROJECT_CREATED = "project_created",
  PROJECT_REPO_CREATED = "project_repo_created",
  PROJECT_RAILWAY_LINKED = "project_railway_linked",
  PROJECT_DEPLOY_STARTED = "project_deploy_started",
  PROJECT_DEPLOYED = "project_deployed",
  PROJECT_DEPLOY_FAILED = "project_deploy_failed",
  WALKTHROUGH_REQUESTED = "walkthrough_requested",
  WALKTHROUGH_COMPLETE = "walkthrough_complete",
  WALKTHROUGH_FAILED = "walkthrough_failed",
}

export interface BaseEvent {
  id: string;
  type: EventType;
  timestamp: string;
  engagementId: string;
}

export interface DiscoveryDataSubmittedEvent extends BaseEvent {
  type: EventType.DISCOVERY_DATA_SUBMITTED;
  payload: {
    discoveryCallId: string;
    source: "manual" | "call_copilot";
  };
}

export interface BuildPlanGeneratedEvent extends BaseEvent {
  type: EventType.BUILD_PLAN_GENERATED;
  payload: {
    buildPlanId: string;
    version: number;
  };
}

export interface BuildPlanApprovedEvent extends BaseEvent {
  type: EventType.BUILD_PLAN_APPROVED;
  payload: {
    buildPlanId: string;
    approvedBy: string;
  };
}

export interface ImplementationStepCompleteEvent extends BaseEvent {
  type: EventType.IMPLEMENTATION_STEP_COMPLETE;
  payload: {
    implementationId: string;
    stepType: string;
    stepName: string;
    success: boolean;
  };
}

export interface ImplementationCompleteEvent extends BaseEvent {
  type: EventType.IMPLEMENTATION_COMPLETE;
  payload: {
    totalSteps: number;
    successfulSteps: number;
    failedSteps: number;
  };
}

export interface WorkRequestCreatedEvent extends BaseEvent {
  type: EventType.WORK_REQUEST_CREATED;
  payload: {
    workRequestId: string;
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "COMPLEX";
    requestedBy: string;
  };
}

export type RexEvent =
  | DiscoveryDataSubmittedEvent
  | BuildPlanGeneratedEvent
  | BuildPlanApprovedEvent
  | ImplementationStepCompleteEvent
  | ImplementationCompleteEvent
  | WorkRequestCreatedEvent;

// ============================================================
// PIPELINE PHASE DEFINITIONS
// ============================================================

export interface PhaseDefinition {
  type: string; // PhaseType enum value
  label: string;
  description: string;
  order: number;
  predecessors: string[];
  autoTrigger: boolean;
  requiresApproval: boolean;
  clientFacing: boolean;
  defaultTasks: DefaultTaskDefinition[];
}

export interface DefaultTaskDefinition {
  title: string;
  description: string;
  taskType: string; // TaskType enum value
  order: number;
}

export const PHASE_DEFINITIONS: PhaseDefinition[] = [
  {
    type: "SOW_SETUP",
    label: "SOW Setup",
    description: "Attach SOW with workstreams, hours, and rate tiers",
    order: 0,
    predecessors: [],
    autoTrigger: false,
    requiresApproval: false,
    clientFacing: false,
    defaultTasks: [
      { title: "Create SOW with workstreams", description: "Define scope, workstreams, hour allocations, and rate tiers", taskType: "HUMAN", order: 0 },
      { title: "Activate SOW", description: "Mark SOW as active to lock scope baseline", taskType: "HUMAN", order: 1 },
    ],
  },
  {
    type: "DISCOVERY_PREP",
    label: "Discovery Prep",
    description: "Generate discovery agendas and question sets from SOW workstreams",
    order: 1,
    predecessors: ["SOW_SETUP"],
    autoTrigger: true,
    requiresApproval: false,
    clientFacing: false,
    defaultTasks: [
      { title: "Generate discovery agenda from SOW", description: "AI generates structured discovery questions for each workstream", taskType: "AUTO", order: 0 },
      { title: "Review and refine agenda", description: "Human review of generated questions before sending to client", taskType: "REVIEW", order: 1 },
      { title: "Schedule discovery sessions", description: "Set up meeting times with client stakeholders", taskType: "HUMAN", order: 2 },
    ],
  },
  {
    type: "DISCOVERY",
    label: "Discovery",
    description: "Conduct discovery meetings and capture structured requirements",
    order: 2,
    predecessors: ["DISCOVERY_PREP"],
    autoTrigger: false,
    requiresApproval: false,
    clientFacing: true,
    defaultTasks: [
      { title: "Conduct discovery sessions", description: "Run discovery meetings using generated agendas", taskType: "HUMAN", order: 0 },
      { title: "Process discovery transcripts", description: "AI processes meeting notes into structured requirements", taskType: "AUTO", order: 1 },
      { title: "Identify requirement gaps", description: "Flag areas needing async follow-up from client", taskType: "AUTO", order: 2 },
    ],
  },
  {
    type: "REQUIREMENTS",
    label: "Requirements",
    description: "Gather remaining requirements async via client portal",
    order: 3,
    predecessors: ["DISCOVERY"],
    autoTrigger: true,
    requiresApproval: false,
    clientFacing: true,
    defaultTasks: [
      { title: "Generate requirement questions", description: "AI generates follow-up questions from discovery gaps", taskType: "AUTO", order: 0 },
      { title: "Send requirements to client", description: "Client portal activated for async answers", taskType: "AUTO", order: 1 },
      { title: "Await client responses", description: "Track client progress on requirement questions", taskType: "CLIENT_ACTION", order: 2 },
      { title: "Review and confirm requirements", description: "Review client answers and mark requirements as confirmed", taskType: "REVIEW", order: 3 },
    ],
  },
  {
    type: "BUILD_PLANNING",
    label: "Build Planning",
    description: "Generate detailed HubSpot build plan from confirmed requirements",
    order: 4,
    predecessors: ["REQUIREMENTS"],
    autoTrigger: true,
    requiresApproval: false,
    clientFacing: false,
    defaultTasks: [
      { title: "Generate build plan", description: "AI generates complete HubSpot implementation plan from requirements", taskType: "AUTO", order: 0 },
      { title: "Review build plan", description: "Human review of generated plan for accuracy and completeness", taskType: "REVIEW", order: 1 },
      { title: "Scope-check against SOW", description: "Verify build plan aligns with SOW workstreams and hours", taskType: "AUTO", order: 2 },
    ],
  },
  {
    type: "BUILD_APPROVAL",
    label: "Build Approval",
    description: "Client reviews and approves the build plan",
    order: 5,
    predecessors: ["BUILD_PLANNING"],
    autoTrigger: true,
    requiresApproval: true,
    clientFacing: true,
    defaultTasks: [
      { title: "Present build plan to client", description: "Share plan via client portal for review", taskType: "AUTO", order: 0 },
      { title: "Await client approval", description: "Client reviews and approves or requests changes", taskType: "APPROVAL", order: 1 },
    ],
  },
  {
    type: "IMPLEMENTATION",
    label: "Implementation",
    description: "Execute build plan against HubSpot portal via API",
    order: 6,
    predecessors: ["BUILD_APPROVAL"],
    autoTrigger: true,
    requiresApproval: false,
    clientFacing: false,
    defaultTasks: [
      { title: "Connect client HubSpot portal", description: "Request Private App access token from client and link portal to this engagement", taskType: "CLIENT_ACTION", order: 0 },
      { title: "Verify portal API access", description: "Confirm token scopes and connectivity before executing build steps", taskType: "AUTO", order: 1 },
      { title: "Execute automated build steps", description: "API-driven creation of properties, objects, pipelines, workflows", taskType: "AUTO", order: 2 },
      { title: "Generate human cleanup list", description: "Identify items that require manual configuration", taskType: "AUTO", order: 3 },
    ],
  },
  {
    type: "HUMAN_CLEANUP",
    label: "Human Cleanup",
    description: "Complete items that couldn't be automated",
    order: 7,
    predecessors: ["IMPLEMENTATION"],
    autoTrigger: true,
    requiresApproval: false,
    clientFacing: false,
    defaultTasks: [],
  },
  {
    type: "UAT",
    label: "UAT",
    description: "Client tests the implementation via guided UAT plan",
    order: 8,
    predecessors: ["HUMAN_CLEANUP"],
    autoTrigger: true,
    requiresApproval: false,
    clientFacing: true,
    defaultTasks: [
      { title: "Generate UAT plan", description: "AI generates test cases from build plan and implementation results", taskType: "AUTO", order: 0 },
      { title: "Send UAT to client", description: "Client portal activated for guided testing", taskType: "AUTO", order: 1 },
      { title: "Await UAT results", description: "Client executes test cases and reports results", taskType: "CLIENT_ACTION", order: 2 },
      { title: "Address UAT failures", description: "Fix issues flagged during UAT", taskType: "HUMAN", order: 3 },
      { title: "UAT sign-off", description: "Client confirms all tests pass", taskType: "APPROVAL", order: 4 },
    ],
  },
  {
    type: "CLOSEOUT",
    label: "Closeout",
    description: "Generate enablement docs and finalize engagement",
    order: 9,
    predecessors: ["UAT"],
    autoTrigger: true,
    requiresApproval: false,
    clientFacing: false,
    defaultTasks: [
      { title: "Generate enablement documentation", description: "AI generates training docs from build plan and implementation", taskType: "AUTO", order: 0 },
      { title: "Final scope reconciliation", description: "Compare actual hours vs SOW allocations", taskType: "AUTO", order: 1 },
      { title: "Close engagement", description: "Mark engagement complete and archive", taskType: "HUMAN", order: 2 },
    ],
  },
];

export function getPhaseDefinition(phaseType: string): PhaseDefinition | undefined {
  return PHASE_DEFINITIONS.find((p) => p.type === phaseType);
}

export function getNextPhases(currentPhaseType: string): PhaseDefinition[] {
  return PHASE_DEFINITIONS.filter((p) =>
    p.predecessors.includes(currentPhaseType)
  );
}

// ============================================================
// BUILD PLAN SCHEMA TYPES
// ============================================================

export interface PropertyGroupDefinition {
  name: string;
  label: string;
  objectType: string;
  displayOrder?: number;
}

export interface PropertyDefinition {
  name: string;
  label: string;
  objectType: string;
  type: "string" | "number" | "date" | "datetime" | "enumeration" | "bool";
  fieldType: string;
  groupName: string;
  description?: string;
  options?: Array<{ label: string; value: string; displayOrder?: number }>;
  hasUniqueValue?: boolean;
  formField?: boolean;
}

export interface CustomObjectDefinition {
  name: string;
  labels: { singular: string; plural: string };
  primaryDisplayProperty: string;
  properties: PropertyDefinition[];
  associations: AssociationDefinition[];
}

export interface AssociationDefinition {
  fromObject: string;
  toObject: string;
  name: string;
  label?: string;
  associationCategory: "USER_DEFINED" | "HUBSPOT_DEFINED";
}

export interface PipelineDefinition {
  objectType: string;
  label: string;
  stages: Array<{
    label: string;
    displayOrder: number;
    metadata?: Record<string, string>;
  }>;
}

export interface WorkflowDefinition {
  name: string;
  type: string;
  objectType: string;
  enrollmentTrigger: string;
  actions: Array<{
    type: string;
    description: string;
    config: Record<string, unknown>;
  }>;
}

export interface ListDefinition {
  name: string;
  objectType: string;
  filterGroups: Array<Record<string, unknown>>;
  dynamic: boolean;
}

export interface ViewDefinition {
  name: string;
  objectType: string;
  columns: string[];
  filters?: Array<Record<string, unknown>>;
}

export interface BuildPlanData {
  version: string;
  engagement: {
    name: string;
    clientName: string;
    industry?: string;
    hubspotTier?: string;
  };
  propertyGroups: PropertyGroupDefinition[];
  properties: PropertyDefinition[];
  customObjects: CustomObjectDefinition[];
  associations: AssociationDefinition[];
  pipelines: PipelineDefinition[];
  workflows: WorkflowDefinition[];
  lists: ListDefinition[];
  views: ViewDefinition[];
  humanRequiredItems: Array<{
    category: string;
    description: string;
    reason: string;
    priority: "LOW" | "MEDIUM" | "HIGH";
  }>;
  qaChecklist: Array<{
    category: string;
    description: string;
    linkedStepType?: string;
  }>;
}

// ============================================================
// STRUCTURED JSON LOGGING
// ============================================================

export interface LogEntry {
  level: "info" | "warn" | "error" | "debug";
  message: string;
  service: string;
  timestamp: string;
  engagementId?: string;
  eventType?: string;
  meta?: Record<string, unknown>;
}

export function log(entry: Omit<LogEntry, "timestamp">): void {
  const full: LogEntry = { ...entry, timestamp: new Date().toISOString() };
  if (entry.level === "error") {
    console.error(JSON.stringify(full));
  } else {
    console.log(JSON.stringify(full));
  }
}

// ============================================================
// CALL INTELLIGENCE — SSE EVENT TYPES
// ============================================================

export interface CallSSETranscriptEvent {
  type: "transcript";
  segment: {
    id: string;
    speaker: string;
    text: string;
    startTime: number;
    endTime: number;
    isFinal: boolean;
  };
}

export interface CallSSEInsightEvent {
  type: "insight";
  insight: {
    id: string;
    type: string;
    content: string;
    speaker: string | null;
    timestamp: number | null;
    confidence: number | null;
    metadata: Record<string, unknown> | null;
  };
}

export interface CallSSEStatusEvent {
  type: "status";
  status: string;
  message?: string;
}

export interface CallSSEProcessingEvent {
  type: "processing";
  stage: "started" | "analyzing" | "extracting" | "complete";
  insightsCount?: number;
}

export interface CallSSEAgendaEvent {
  type: "agenda";
  item: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    displayOrder: number;
    notes: string | null;
    resolvedAt: string | null;
    relatedInsights: string[] | null;
  };
}

export interface CallSSESuggestionEvent {
  type: "suggestion";
  suggestion: CallSuggestion;
}

export interface CallSSEVoiceEvent {
  type: "voice";
  text: string;
  triggeredBy: string;
  question: string;
  timestamp: number;
}

export interface CallSSECallEndedEvent {
  type: "call_ended";
  summary: string | null;
  insightCounts: {
    total: number;
    requirements: number;
    actionItems: number;
    decisions: number;
    scopeConcerns: number;
    openQuestions: number;
  };
  duration: number | null;
  segmentCount: number;
}

export type CallSSEEvent =
  | CallSSETranscriptEvent
  | CallSSEInsightEvent
  | CallSSEStatusEvent
  | CallSSEProcessingEvent
  | CallSSEAgendaEvent
  | CallSSESuggestionEvent
  | CallSSEVoiceEvent
  | CallSSECallEndedEvent;

// ============================================================
// CALL INTELLIGENCE — AI PROCESSING TYPES
// ============================================================

export interface ExtractedInsight {
  type: "REQUIREMENT" | "ACTION_ITEM" | "DECISION" | "SCOPE_CONCERN" | "SYSTEM_MENTION" | "TIMELINE" | "OPEN_QUESTION" | "STAKEHOLDER_NOTE";
  content: string;
  speaker?: string;
  timestamp?: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface CallSuggestion {
  id?: string;
  suggestionType: "question" | "coaching_tip" | "topic_prompt";
  content: string;
  reasoning: string;
  priority: "high" | "medium" | "low";
  relatedAgendaItemId?: string;
  expiresAfterSeconds?: number;
}

export interface AgendaResolution {
  agendaItemId: string;
  status: "ACTIVE" | "RESOLVED" | "PARTIALLY_RESOLVED";
  notes: string;
  relatedInsightIndices: number[];
}

export interface CallProcessingResult {
  insights: ExtractedInsight[];
  agendaUpdates?: AgendaResolution[];
  suggestions?: CallSuggestion[];
  summary?: string;
}

// ============================================================
// CUSTOM PROJECT SCAFFOLD TYPES
// ============================================================

export interface ScaffoldConfig {
  port?: number;
  usePostgres?: boolean;
  useRedis?: boolean;
  useBullMQ?: boolean;
  useWebhooks?: boolean;
  hubspotIntegration?: boolean;
  serviceTitanIntegration?: boolean;
  description?: string;
}

export type ProjectTemplateType =
  | "express-integration"
  | "webhook-processor"
  | "bidirectional-sync";

export interface ScaffoldFile {
  path: string;
  content: string;
}

// ============================================================
// SCOPE DOCUMENT INGESTION TYPES
// ============================================================

export interface ParsedScopeData {
  title?: string;
  clientName?: string;
  workstreams: ParsedWorkstream[];
  totalHours?: number;
  totalBudget?: number;
  startDate?: string;
  endDate?: string;
  paymentTerms?: string;
  outOfScope?: string[];
  assumptions?: string[];
  rawSections: Record<string, string>;
}

export interface ParsedWorkstream {
  name: string;
  description?: string;
  allocatedHours?: number;
  rateTier?: string;
  hourlyRate?: number;
  deliverables?: string[];
}

export const SUPPORTED_SCOPE_FILE_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export type SupportedScopeFileType = (typeof SUPPORTED_SCOPE_FILE_TYPES)[number];
