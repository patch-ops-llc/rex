const RAILWAY_API = "https://backboard.railway.com/graphql/v2";

function getToken(): string {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) throw new Error("RAILWAY_API_TOKEN is not configured");
  return token;
}

async function gql<T = Record<string, unknown>>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(RAILWAY_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Railway API ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`Railway API error: ${json.errors[0].message}`);
  }
  return json.data as T;
}

// ── Project ──────────────────────────────────────────────────

export interface RailwayProject {
  id: string;
  name: string;
}

export async function createProject(name: string): Promise<RailwayProject> {
  const data = await gql<{ projectCreate: RailwayProject }>(
    `mutation($input: ProjectCreateInput!) {
      projectCreate(input: $input) { id name }
    }`,
    { input: { name } }
  );
  return data.projectCreate;
}

export async function deleteProject(projectId: string): Promise<void> {
  await gql(
    `mutation($id: String!) {
      projectDelete(id: $id)
    }`,
    { id: projectId }
  );
}

// ── Service ──────────────────────────────────────────────────

export interface RailwayService {
  id: string;
  name: string;
}

export async function createService(
  projectId: string,
  name: string
): Promise<RailwayService> {
  const data = await gql<{ serviceCreate: RailwayService }>(
    `mutation($input: ServiceCreateInput!) {
      serviceCreate(input: $input) { id name }
    }`,
    { input: { projectId, name } }
  );
  return data.serviceCreate;
}

// ── GitHub Repo Connect ──────────────────────────────────────

export async function connectGitHubRepo(
  serviceId: string,
  repoFullName: string,
  branch = "main"
): Promise<void> {
  await gql(
    `mutation($id: String!, $input: ServiceConnectInput!) {
      serviceConnect(id: $id, input: $input) { id }
    }`,
    {
      id: serviceId,
      input: {
        source: { repo: repoFullName },
        branch,
      },
    }
  );
}

// ── Environment Variables ────────────────────────────────────

export async function setEnvVariables(
  serviceId: string,
  projectId: string,
  vars: Record<string, string>
): Promise<void> {
  // Railway exposes a bulk-upsert via variableCollectionUpsert
  const data = await gql<{ environments: { edges: { node: { id: string } }[] } }>(
    `query($projectId: String!) {
      environments(projectId: $projectId) {
        edges { node { id } }
      }
    }`,
    { projectId }
  );

  const envId = data.environments.edges[0]?.node.id;
  if (!envId) throw new Error("No environment found for project");

  await gql(
    `mutation($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }`,
    {
      input: {
        projectId,
        environmentId: envId,
        serviceId,
        variables: vars,
      },
    }
  );
}

// ── Deploy ───────────────────────────────────────────────────

export interface RailwayDeployment {
  id: string;
  status: string;
}

export async function getLatestDeployment(
  serviceId: string
): Promise<RailwayDeployment | null> {
  const data = await gql<{
    deployments: { edges: { node: RailwayDeployment }[] };
  }>(
    `query($input: DeploymentListInput!) {
      deployments(input: $input, first: 1) {
        edges { node { id status } }
      }
    }`,
    { input: { serviceId } }
  );

  return data.deployments.edges[0]?.node ?? null;
}

export async function redeployService(serviceId: string): Promise<string> {
  const data = await gql<{
    serviceInstanceRedeploy: boolean;
  }>(
    `mutation($serviceId: String!) {
      serviceInstanceRedeploy(serviceId: $serviceId)
    }`,
    { serviceId }
  );
  return String(data.serviceInstanceRedeploy);
}

// ── Service domain (public URL) ──────────────────────────────

export interface RailwayDomain {
  id: string;
  domain: string;
}

export async function generateServiceDomain(
  serviceId: string,
  projectId: string
): Promise<RailwayDomain> {
  const data = await gql<{
    environments: { edges: { node: { id: string } }[] };
  }>(
    `query($projectId: String!) {
      environments(projectId: $projectId) {
        edges { node { id } }
      }
    }`,
    { projectId }
  );

  const envId = data.environments.edges[0]?.node.id;
  if (!envId) throw new Error("No environment found for project");

  const domainData = await gql<{
    serviceDomainCreate: RailwayDomain;
  }>(
    `mutation($input: ServiceDomainCreateInput!) {
      serviceDomainCreate(input: $input) { id domain }
    }`,
    { input: { serviceId, environmentId: envId } }
  );

  return domainData.serviceDomainCreate;
}

// ── Project info ─────────────────────────────────────────────

export async function getProject(projectId: string) {
  const data = await gql<{
    project: {
      id: string;
      name: string;
      services: { edges: { node: { id: string; name: string } }[] };
      environments: { edges: { node: { id: string; name: string } }[] };
    };
  }>(
    `query($id: String!) {
      project(id: $id) {
        id
        name
        services { edges { node { id name } } }
        environments { edges { node { id name } } }
      }
    }`,
    { id: projectId }
  );
  return data.project;
}
