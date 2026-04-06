// Re-export Prisma generated enums for convenience
export type {
  Engagement,
  DiscoveryCall,
  BuildPlan,
  Implementation,
  QAItem,
  EnablementSession,
  ClientSlackMapping,
  ClientEmailMapping,
  ClientConversation,
  WorkRequest,
  CorpusEntry,
} from "@prisma/client";

export {
  EngagementStatus,
  CallStatus,
  PlanStatus,
  StepStatus,
  QAStatus,
  WorkRequestStatus,
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
