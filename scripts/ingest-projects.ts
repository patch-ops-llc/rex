/**
 * REX Project Ingestion Script
 *
 * Scans PatchOps project directories for HubSpot UIE projects and Railway builds,
 * extracts source code, configs, and READMEs, and loads them as corpus entries.
 *
 * Usage:
 *   npx tsx scripts/ingest-projects.ts                # Dry run
 *   npx tsx scripts/ingest-projects.ts --commit       # Import
 */

import * as fs from "fs";
import * as path from "path";

const USER_DIR = process.env.USERPROFILE || process.env.HOME || "";
const MAX_FILE_SIZE = 200 * 1024; // 200KB per source file
const MAX_PROJECT_SIZE = 2 * 1024 * 1024; // 2MB total per project entry

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".scss", ".md", ".toml",
]);

const SKIP_DIRS = new Set([
  "node_modules", ".next", "dist", ".git", ".turbo", ".cache",
  "coverage", ".husky", ".vscode", "__pycache__", ".vercel",
]);

const SKIP_FILES = new Set([
  "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
  ".DS_Store", "thumbs.db",
]);

interface ProjectDefinition {
  dir: string;
  name: string;
  type: "hubspot-uie" | "railway-integration" | "node-integration";
  client: string | null;
  industry: string | null;
  tags: string[];
  skip?: boolean;
}

const PROJECTS: ProjectDefinition[] = [
  // HubSpot UIE — CPQ
  { dir: "CPQ", name: "CPQ Base Template", type: "hubspot-uie", client: null, industry: null, tags: ["cpq", "hubspot", "uie", "template"] },
  { dir: "Eve Legal CPQ", name: "Eve Legal CPQ Card", type: "hubspot-uie", client: "Eve Legal", industry: "Legal", tags: ["cpq", "hubspot", "uie"] },
  { dir: "HFA CPQ", name: "HFA CPQ Card", type: "hubspot-uie", client: "HFA", industry: "Sports/Entertainment", tags: ["cpq", "hubspot", "uie"] },
  { dir: "MirrorWeb CPQ", name: "MirrorWeb CPQ Card", type: "hubspot-uie", client: "MirrorWeb", industry: "SaaS", tags: ["cpq", "hubspot", "uie"] },
  { dir: "NBR CPQ", name: "Nelson Bros CPQ Card", type: "hubspot-uie", client: "Nelson Bros", industry: "Construction", tags: ["cpq", "hubspot", "uie", "concrete"] },
  { dir: "Southeastern CPQ", name: "Southeastern Equipment CPQ Card", type: "hubspot-uie", client: "Southeastern Equipment", industry: "Equipment Management", tags: ["cpq", "hubspot", "uie"] },
  { dir: "Test CPQ", name: "Test CPQ Card", type: "hubspot-uie", client: null, industry: null, tags: ["cpq", "hubspot", "uie", "test"], skip: true },

  // HubSpot UIE — Custom Cards
  { dir: "BB Example Company Card", name: "BB Example Company Card", type: "hubspot-uie", client: null, industry: null, tags: ["hubspot", "uie", "example"] },
  { dir: "Everly Engagement Tracker", name: "Everly Engagement Tracker Card", type: "hubspot-uie", client: "Everly Health", industry: "Healthcare", tags: ["hubspot", "uie", "engagement-tracking"] },
  { dir: "FinQuery Contracts Card", name: "FinQuery Contracts Card", type: "hubspot-uie", client: "FinQuery", industry: "Financial Services", tags: ["hubspot", "uie", "contracts"] },
  { dir: "FlyGuys Mission Control", name: "FlyGuys Mission Control Card", type: "hubspot-uie", client: "FlyGuys", industry: "Field Service", tags: ["hubspot", "uie", "mission-control", "dashboard"] },
  { dir: "Swagelok Company Lead Card", name: "Swagelok Company Lead Card", type: "hubspot-uie", client: "Swagelok", industry: "Manufacturing", tags: ["hubspot", "uie", "lead-routing"] },
  { dir: "Talroo ATS Lookup", name: "Talroo ATS Lookup Card", type: "hubspot-uie", client: "Talroo", industry: "SaaS", tags: ["hubspot", "uie", "ats", "lookup"] },
  { dir: "Project Capacity Manager", name: "Project Capacity Manager Card", type: "hubspot-uie", client: "PatchOps", industry: "SaaS", tags: ["hubspot", "uie", "internal", "capacity"] },
  { dir: "timeline-visualizer", name: "Timeline Visualizer Card", type: "hubspot-uie", client: null, industry: null, tags: ["hubspot", "uie", "timeline", "visualization"] },
  { dir: "Lettuce Ticket Integration", name: "Lettuce Ticket Integration Card", type: "hubspot-uie", client: "Lettuce", industry: "SaaS", tags: ["hubspot", "uie", "ticketing"] },
  { dir: "Lettuce Worknet Bot Card", name: "Lettuce Worknet Bot Card", type: "hubspot-uie", client: "Lettuce", industry: "SaaS", tags: ["hubspot", "uie", "bot", "worknet"] },

  // HubSpot UIE — Fee Calculators
  { dir: "Hunt Fee Calculator", name: "Huntin' Fool Fee Calculator", type: "hubspot-uie", client: "Huntin' Fool", industry: "Outdoor Recreation", tags: ["hubspot", "uie", "fee-calculator", "hubdb"] },
  { dir: "huntflow-fee-calculator", name: "Huntin' Fool Fee Calculator v2", type: "hubspot-uie", client: "Huntin' Fool", industry: "Outdoor Recreation", tags: ["hubspot", "uie", "fee-calculator", "hubdb"] },
  { dir: "new-fee-calculator", name: "Fee Calculator (New Template)", type: "hubspot-uie", client: "Huntin' Fool", industry: "Outdoor Recreation", tags: ["hubspot", "uie", "fee-calculator"] },

  // HubSpot UIE — Tools
  { dir: "HubSpot Migrator", name: "HubSpot Migrator Tool", type: "hubspot-uie", client: "PatchOps", industry: "SaaS", tags: ["hubspot", "uie", "migration", "internal-tool"] },
  { dir: "PatchBot HubSpot App", name: "PatchBot HubSpot App", type: "hubspot-uie", client: "PatchOps", industry: "SaaS", tags: ["hubspot", "uie", "chatbot", "patchbot"] },

  // Railway Integrations
  { dir: "Independence Settlor Integration", name: "Independence Title Settlor Integration", type: "railway-integration", client: "Independence Title", industry: "Real Estate", tags: ["railway", "integration", "settlor", "bidirectional-sync"] },
  { dir: "NBR Jonel Integration", name: "Nelson Bros Jonel ERP Integration", type: "railway-integration", client: "Nelson Bros", industry: "Construction", tags: ["railway", "integration", "jonel", "erp", "concrete"] },
  { dir: "Pig Tracker", name: "Pig Tracker Integration", type: "railway-integration", client: null, industry: "Energy", tags: ["railway", "integration", "tracking"] },
  { dir: "Velasco Fireflies Dealhub Integration", name: "Velasco Fireflies DealHub Integration", type: "railway-integration", client: "Velasco", industry: "Manufacturing", tags: ["railway", "integration", "fireflies", "dealhub"] },
  { dir: "Waites Customer Integration", name: "Waites Customer Sync Integration", type: "railway-integration", client: "Waites", industry: "Field Service", tags: ["railway", "integration", "customer-sync", "servicetitan"] },
  { dir: "Waites Deals Integration", name: "Waites Deals Sync Integration", type: "railway-integration", client: "Waites", industry: "Field Service", tags: ["railway", "integration", "deal-sync", "servicetitan"] },
  { dir: "PAM", name: "PAM — PatchOps API Middleware", type: "railway-integration", client: "PatchOps", industry: "SaaS", tags: ["railway", "integration", "middleware", "internal"] },

  // Node Integrations (no HubSpot project / no Railway)
  { dir: "Actabl Integration", name: "Actabl HubSpot Integration", type: "node-integration", client: "Actabl", industry: "SaaS", tags: ["integration", "hubspot"] },
  { dir: "BackEngine Integrator", name: "BackEngine Referral Integrator", type: "node-integration", client: "BackEngine", industry: "SaaS", tags: ["integration", "referral"] },
  { dir: "Cobalt Service Titan Integration", name: "Cobalt ServiceTitan Integration", type: "node-integration", client: "Cobalt", industry: "Field Service", tags: ["integration", "servicetitan"] },
  { dir: "Cohesion Portal Handoff", name: "Cohesion Portal Handoff", type: "node-integration", client: "Cohesion", industry: "SaaS", tags: ["integration", "portal", "handoff"] },
  { dir: "PatchBot", name: "PatchBot Core", type: "node-integration", client: "PatchOps", industry: "SaaS", tags: ["chatbot", "patchbot", "ai"] },
  { dir: "Todyl Gong Integration", name: "Todyl Gong Integration", type: "node-integration", client: "Todyl", industry: "Cybersecurity", tags: ["integration", "gong", "call-analytics"] },
  { dir: "Improve Retirement QR Integration", name: "Improve Retirement QR Integration", type: "node-integration", client: "Improve Retirement", industry: "Financial Services", tags: ["integration", "qr-code"] },
  { dir: "LinkedIn Sales Robot", name: "LinkedIn Sales Robot", type: "node-integration", client: "PatchOps", industry: "SaaS", tags: ["automation", "linkedin", "sales", "internal"] },

  // Deprecated but still valuable reference
  { dir: "[ Deprecated ] Waites Customer ID Integration", name: "[Deprecated] Waites Customer ID Integration", type: "node-integration", client: "Waites", industry: "Field Service", tags: ["integration", "deprecated", "servicetitan"] },
  { dir: "[ Deprecated ] Waites Deals to Quotes Integration", name: "[Deprecated] Waites Deals to Quotes Integration", type: "node-integration", client: "Waites", industry: "Field Service", tags: ["integration", "deprecated", "servicetitan"] },

  // Skip test/example projects
  { dir: "Test Project", name: "Test Project", type: "hubspot-uie", client: null, industry: null, tags: [], skip: true },
  { dir: "test-extension", name: "Test Extension", type: "hubspot-uie", client: null, industry: null, tags: [], skip: true },
  { dir: "test-project", name: "Test Project 2", type: "hubspot-uie", client: null, industry: null, tags: [], skip: true },
];

function collectFiles(
  dirPath: string,
  basePath: string,
  files: { relativePath: string; content: string }[],
  totalSize: { bytes: number }
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (totalSize.bytes >= MAX_PROJECT_SIZE) return;

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectFiles(
        path.join(dirPath, entry.name),
        basePath,
        files,
        totalSize
      );
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!SOURCE_EXTENSIONS.has(ext)) continue;
    if (SKIP_FILES.has(entry.name)) continue;

    const filePath = path.join(dirPath, entry.name);
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) continue;
    if (stat.size < 10) continue;

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const relativePath = path.relative(basePath, filePath).replace(/\\/g, "/");
      const fileSize = Buffer.byteLength(content, "utf-8");

      if (totalSize.bytes + fileSize > MAX_PROJECT_SIZE) return;

      totalSize.bytes += fileSize;
      files.push({ relativePath, content });
    } catch {
      // skip unreadable files
    }
  }
}

function buildProjectTranscript(
  project: ProjectDefinition,
  projectPath: string
): { raw: string; fileCount: number; structure: string[] } | null {
  const files: { relativePath: string; content: string }[] = [];
  const totalSize = { bytes: 0 };

  collectFiles(projectPath, projectPath, files, totalSize);

  if (files.length === 0) return null;

  const structure = files.map((f) => f.relativePath);

  const sections: string[] = [];

  sections.push(`# Project: ${project.name}`);
  sections.push(`Type: ${project.type}`);
  if (project.client) sections.push(`Client: ${project.client}`);
  if (project.industry) sections.push(`Industry: ${project.industry}`);
  sections.push(`Tags: ${project.tags.join(", ")}`);
  sections.push(`Files: ${files.length}`);
  sections.push(`\n## File Structure\n`);
  sections.push(structure.join("\n"));

  // README first
  const readme = files.find(
    (f) => f.relativePath.toLowerCase() === "readme.md"
  );
  if (readme) {
    sections.push(`\n## README.md\n`);
    sections.push(readme.content);
  }

  // Config files
  const configs = files.filter((f) =>
    /^(hsproject\.json|railway\.toml|package\.json|tsconfig\.json|\.env\.example|app\.json)$/i.test(
      path.basename(f.relativePath)
    )
  );
  if (configs.length > 0) {
    sections.push(`\n## Configuration Files\n`);
    for (const cfg of configs) {
      sections.push(`### ${cfg.relativePath}\n\`\`\`\n${cfg.content}\n\`\`\`\n`);
    }
  }

  // HubSpot meta files
  const hsMeta = files.filter((f) => f.relativePath.endsWith("-hsmeta.json"));
  if (hsMeta.length > 0) {
    sections.push(`\n## HubSpot Component Configs\n`);
    for (const m of hsMeta) {
      sections.push(`### ${m.relativePath}\n\`\`\`json\n${m.content}\n\`\`\`\n`);
    }
  }

  // Source code
  const sourceFiles = files.filter(
    (f) =>
      !configs.includes(f) &&
      !hsMeta.includes(f) &&
      f !== readme &&
      /\.(ts|tsx|js|jsx)$/i.test(f.relativePath)
  );

  if (sourceFiles.length > 0) {
    sections.push(`\n## Source Code\n`);
    for (const src of sourceFiles) {
      const ext = path.extname(src.relativePath).replace(".", "");
      sections.push(
        `### ${src.relativePath}\n\`\`\`${ext}\n${src.content}\n\`\`\`\n`
      );
    }
  }

  // CSS / other files
  const otherFiles = files.filter(
    (f) =>
      !configs.includes(f) &&
      !hsMeta.includes(f) &&
      f !== readme &&
      !sourceFiles.includes(f) &&
      !/\.(md)$/i.test(f.relativePath)
  );

  if (otherFiles.length > 0) {
    sections.push(`\n## Other Files\n`);
    for (const other of otherFiles) {
      const ext = path.extname(other.relativePath).replace(".", "") || "text";
      sections.push(
        `### ${other.relativePath}\n\`\`\`${ext}\n${other.content}\n\`\`\`\n`
      );
    }
  }

  return {
    raw: sections.join("\n"),
    fileCount: files.length,
    structure,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");

  console.log(`\n  REX Project Ingestion`);
  console.log(`  =====================`);
  console.log(`  Base: ${USER_DIR}`);
  console.log(`  Mode: ${commit ? "COMMIT (will import)" : "DRY RUN (preview only)"}\n`);

  const activeProjects = PROJECTS.filter((p) => !p.skip);
  const results: {
    project: ProjectDefinition;
    fileCount: number;
    sizeKB: number;
    exists: boolean;
  }[] = [];

  for (const project of activeProjects) {
    const projectPath = path.join(USER_DIR, project.dir);
    if (!fs.existsSync(projectPath)) {
      continue;
    }

    const transcript = buildProjectTranscript(project, projectPath);
    if (!transcript) {
      console.log(`  EMPTY: ${project.name} (no source files found)`);
      continue;
    }

    const sizeKB = Math.round(Buffer.byteLength(transcript.raw, "utf-8") / 1024);
    results.push({
      project,
      fileCount: transcript.fileCount,
      sizeKB,
      exists: true,
    });
  }

  // Group by type
  const byType: Record<string, typeof results> = {};
  for (const r of results) {
    const t = r.project.type;
    if (!byType[t]) byType[t] = [];
    byType[t].push(r);
  }

  console.log(`  Found ${results.length} projects:\n`);
  for (const [type, items] of Object.entries(byType).sort()) {
    console.log(`  ${type} (${items.length}):`);
    for (const item of items) {
      const client = item.project.client ? ` [${item.project.client}]` : "";
      console.log(
        `    ${item.fileCount.toString().padStart(4)} files  ${item.sizeKB.toString().padStart(5)}KB  ${item.project.name}${client}`
      );
    }
    console.log();
  }

  if (!commit) {
    console.log(`  ---`);
    console.log(`  This was a dry run. To import, run again with --commit`);
    console.log(`  npx tsx scripts/ingest-projects.ts --commit\n`);
    return;
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  console.log(`  Importing ${results.length} projects...\n`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const result of results) {
    const { project } = result;
    const projectPath = path.join(USER_DIR, project.dir);

    try {
      const existing = await prisma.corpusEntry.findFirst({
        where: { name: `[PROJECT] ${project.name}` },
        select: { id: true },
      });

      if (existing) {
        console.log(`  SKIP (exists): ${project.name}`);
        skipped++;
        continue;
      }

      const transcript = buildProjectTranscript(project, projectPath);
      if (!transcript) {
        errors++;
        continue;
      }

      await prisma.corpusEntry.create({
        data: {
          name: `[PROJECT] ${project.name}`,
          transcript: { raw: transcript.raw },
          tags: project.tags,
          industry: project.industry,
          category: project.type === "hubspot-uie"
            ? "implementation-review"
            : "process-doc",
          source: `project-import:${project.type}`,
          complexity: transcript.fileCount > 20 ? "complex" : transcript.fileCount > 8 ? "moderate" : "simple",
          outcome: "reference",
        },
      });

      console.log(`  OK:   ${project.name} (${result.fileCount} files, ${result.sizeKB}KB)`);
      imported++;
    } catch (err: any) {
      console.error(`  FAIL: ${project.name} — ${err.message}`);
      errors++;
    }
  }

  await prisma.$disconnect();

  console.log(`\n  Done!`);
  console.log(`  Imported: ${imported}`);
  console.log(`  Skipped:  ${skipped} (already existed)`);
  console.log(`  Errors:   ${errors}\n`);
}

main().catch(console.error);
