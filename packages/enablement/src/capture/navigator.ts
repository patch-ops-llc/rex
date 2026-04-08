/**
 * Maps implementation step types and HubSpot responses to navigable URLs
 * in the HubSpot portal.
 */

export interface NavigationTarget {
  url: string;
  label: string;
  stepType: string;
  waitSelector?: string;
  scrollToSelector?: string;
}

const BASE = "https://app.hubspot.com";

export function buildNavigationTargets(
  portalId: string,
  implementations: Array<{
    stepType: string;
    stepName: string;
    config: Record<string, unknown>;
    hubspotResponse: Record<string, unknown> | null;
  }>
): NavigationTarget[] {
  const targets: NavigationTarget[] = [];
  const seen = new Set<string>();

  for (const impl of implementations) {
    const target = resolveTarget(portalId, impl);
    if (target && !seen.has(target.url)) {
      seen.add(target.url);
      targets.push(target);
    }
  }

  return targets;
}

function resolveTarget(
  portalId: string,
  impl: {
    stepType: string;
    stepName: string;
    config: Record<string, unknown>;
    hubspotResponse: Record<string, unknown> | null;
  }
): NavigationTarget | null {
  const response = impl.hubspotResponse ?? {};
  const config = impl.config ?? {};

  switch (impl.stepType) {
    case "property":
    case "property_group": {
      const objectType =
        (config.objectType as string) ??
        (response.objectType as string) ??
        "contacts";
      return {
        url: `${BASE}/property-settings/${portalId}/properties?type=${objectType}`,
        label: `${impl.stepName} — Property Settings`,
        stepType: impl.stepType,
        waitSelector: "[data-test-id='property-list']",
      };
    }

    case "pipeline": {
      const objectType = (config.objectType as string) ?? "deals";
      const pipelineId = (response.pipelineId as string) ?? (response.id as string);
      if (pipelineId) {
        return {
          url: `${BASE}/pipelines-settings/${portalId}/${objectType}/${pipelineId}`,
          label: `${impl.stepName} — Pipeline Settings`,
          stepType: impl.stepType,
        };
      }
      return {
        url: `${BASE}/pipelines-settings/${portalId}/${objectType}`,
        label: `${impl.stepName} — Pipeline Settings`,
        stepType: impl.stepType,
      };
    }

    case "workflow": {
      const workflowId = (response.id as string) ?? (response.workflowId as string);
      if (workflowId) {
        return {
          url: `${BASE}/workflows/${portalId}/platform/flow/${workflowId}/edit`,
          label: `${impl.stepName} — Workflow Editor`,
          stepType: impl.stepType,
          waitSelector: "[data-test-id='flow-editor']",
        };
      }
      return {
        url: `${BASE}/workflows/${portalId}`,
        label: `${impl.stepName} — Workflows`,
        stepType: impl.stepType,
      };
    }

    case "custom_object": {
      const objectTypeId = (response.objectTypeId as string) ?? (response.id as string);
      if (objectTypeId) {
        return {
          url: `${BASE}/contacts/${portalId}/objects/${objectTypeId}`,
          label: `${impl.stepName} — Custom Object`,
          stepType: impl.stepType,
        };
      }
      return null;
    }

    case "association": {
      return {
        url: `${BASE}/object-settings/${portalId}/associations`,
        label: `${impl.stepName} — Associations`,
        stepType: impl.stepType,
      };
    }

    case "list": {
      const listId = (response.listId as string) ?? (response.id as string);
      if (listId) {
        return {
          url: `${BASE}/contacts/${portalId}/lists/${listId}`,
          label: `${impl.stepName} — List`,
          stepType: impl.stepType,
        };
      }
      return {
        url: `${BASE}/contacts/${portalId}/lists`,
        label: `${impl.stepName} — Lists`,
        stepType: impl.stepType,
      };
    }

    case "view": {
      return {
        url: `${BASE}/contacts/${portalId}/objects/0-1/views/all/list`,
        label: `${impl.stepName} — Views`,
        stepType: impl.stepType,
      };
    }

    default:
      return null;
  }
}
