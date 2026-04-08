import { Octokit } from "@octokit/rest";
import type { ScaffoldFile } from "@rex/shared";

function getClient(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not configured");
  return new Octokit({ auth: token });
}

function getOrg(): string {
  return process.env.GITHUB_ORG || "PatchOps";
}

export async function createRepo(
  name: string,
  opts: { description?: string; isPrivate?: boolean } = {}
) {
  const octokit = getClient();
  const org = getOrg();

  const { data } = await octokit.repos.createInOrg({
    org,
    name,
    description: opts.description || `PatchOps integration — ${name}`,
    private: opts.isPrivate ?? true,
    auto_init: false,
  });

  return {
    fullName: data.full_name,
    url: data.html_url,
    cloneUrl: data.clone_url,
    defaultBranch: data.default_branch,
  };
}

/**
 * Push an array of scaffold files as the initial commit to a repo.
 * Uses the Git Data API to create blobs → tree → commit → update ref
 * in a single pass (no local clone required).
 */
export async function pushScaffoldFiles(
  repoFullName: string,
  files: ScaffoldFile[],
  commitMessage = "Initial scaffold from REX"
) {
  const octokit = getClient();
  const [owner, repo] = repoFullName.split("/");

  // 1. Create blobs for each file
  const blobResults = await Promise.all(
    files.map(async (f) => {
      const { data } = await octokit.git.createBlob({
        owner,
        repo,
        content: Buffer.from(f.content).toString("base64"),
        encoding: "base64",
      });
      return { path: f.path, sha: data.sha, mode: "100644" as const, type: "blob" as const };
    })
  );

  // 2. Create tree (no base_tree since repo is empty)
  const { data: tree } = await octokit.git.createTree({
    owner,
    repo,
    tree: blobResults,
  });

  // 3. Create commit (parentless — first commit)
  const { data: commit } = await octokit.git.createCommit({
    owner,
    repo,
    message: commitMessage,
    tree: tree.sha,
  });

  // 4. Create the main ref
  await octokit.git.createRef({
    owner,
    repo,
    ref: "refs/heads/main",
    sha: commit.sha,
  });

  return { commitSha: commit.sha };
}

export async function getRepo(repoFullName: string) {
  const octokit = getClient();
  const [owner, repo] = repoFullName.split("/");
  const { data } = await octokit.repos.get({ owner, repo });
  return data;
}

export async function deleteRepo(repoFullName: string) {
  const octokit = getClient();
  const [owner, repo] = repoFullName.split("/");
  await octokit.repos.delete({ owner, repo });
}
