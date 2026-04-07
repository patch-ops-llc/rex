/**
 * REX Corpus Ingestion Script
 *
 * Scans directories for transcript files, auto-categorizes them, and bulk-loads
 * into the REX corpus database via Prisma.
 *
 * Usage:
 *   npx tsx scripts/ingest-corpus.ts                          # Dry run (preview only)
 *   npx tsx scripts/ingest-corpus.ts --commit                 # Actually import
 *   npx tsx scripts/ingest-corpus.ts --dir "C:\Other\Path"    # Scan a different directory
 *   npx tsx scripts/ingest-corpus.ts --dir "C:\Path" --commit # Scan + import
 *
 * Supports: .json (Fathom/transcript arrays), .txt (Otter.ai, raw),
 *           .vtt (WebVTT), .md (Markdown), .docx (Word via mammoth)
 */

import * as fs from "fs";
import * as path from "path";
import mammoth from "mammoth";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB — skip data dumps
const SUPPORTED_EXTENSIONS = new Set([".json", ".txt", ".md", ".vtt", ".docx"]);

const SKIP_PATTERNS = [
  /time[-_]?log/i,
  /^INV-/i,
  /invoice/i,
  /CONSULTING_AGREEMENT/i,
  /client_secret/i,
  /credentials/i,
  /^rc-credentials/i,
  /\.postman_collection/i,
  /^package\.json$/i,
  /pycharm/i,
  /^fields\.json$/i,
  /^openapi\.json$/i,
  /hubspot[-_]?(crm[-_]?export|product[-_]?import|dupe[-_]?analysis|contact_schema|companies_schema|deals_schema)/i,
  /^HubSpot_(CIF|DDA|CD|Debit_Card|Loan|ZipCode)/i,
  /^players\d?\.txt$/i,
  /^jonel[-_]?products/i,
  /^properties\.txt$/i,
  /^orthofi/i,
  /^runlog/i,
  /^js\.txt$/i,
  /woocommerce/i,
  /^help\.json$/i,
  /^SupportedCategories/i,
  /exported[-_]?zap/i,
  /selected[-_]?zaps/i,
  /active[-_]?zaps/i,
  /goco[-_]?zaps/i,
  /pending[-_]?payment[-_]?zap/i,
  /^New Transformation/i,
  /^obo[-_]?data[-_]?cleanup/i,
  /^chatbot-\d/i,
  /^Shipping Addresses/i,
  /^Map .* Fields/i,
  /^Map .* Tasks/i,
  /^Map .* Codes/i,
  /^Map .* Parts/i,
  /^Map .* Order/i,
  /quota_configs/i,
  /lettuce[-_]?oauth/i,
  /^this_works/i,
  /\.bak$/i,
  /^domestique.*logs/i,
  /^All Time Report/i,
  // Personal/admin files
  /^~\$/,  // Word temp files
  /grocery/i,
  /^resume\.txt$/i,
  /Freelancer.*Agreement/i,
  /General.*Agreement/i,
  /Services.*Agreement/i,
  /^NFL_/i,
  /UpWork/i,
  /^notes\.txt$/i,
  /^text000001/i,
  /recovery[-_]?codes/i,
  /app[-_]?passwords/i,
  /^FTPCreds/i,
  /^pamupdates/i,
  /^selfpublishing/i,
  /^OpenHardwareMonitor/i,
  /^IMG_\d+/i,
  /^New Operation_/i,
  /^ig-code-updates/i,
  /upsertEquipment/i,
  /upsertRentalHistory/i,
  /^quote-console/i,
  /^quote-edits/i,
  /^restlet\.txt$/i,
  /^solution\.txt$/i,
  /^main\.txt$/i,
  /gpt-olivia/i,
  /todyl-gong-access/i,
  /rti-ms-teams/i,
  /^Producer Job/i,
  /Initial Roster Selection/i,
  /Data Analyst Exercise/i,
  /BackEngine.*Agreement/i,
  /^Instrumental New Employee/i,
  /PIA Financials Dashboard/i,
  /Technosylva Master Agreement/i,
  /Underground Utility.*Supplemental/i,
  /Jotform Benefits/i,
  /JotForm Paperless/i,
  /Customer Journey Map\.docx$/i,
  /New Employee Information/i,
  /^Zach West.*Consulting/i,
  /^Zach West.*Agreement/i,
  /^Document1/i,
  /^Ethan Stremmel/i,
  /Sell-Side Engagement Letter/i,
  /^county-map/i,
  /^NEG Google Doc Template/i,
  /^Email \d+_/i,
  /^Smart Campaign Follow-Up/i,
  /^mikes-hard-lemonade/i,
  /^Engagement_Tracking_Solution/i,
];

interface CategoryRule {
  pattern: RegExp;
  category: string;
  industry?: string;
}

const CATEGORY_RULES: CategoryRule[] = [
  // Discovery & calls
  { pattern: /discovery/i, category: "discovery-call" },
  { pattern: /demo/i, category: "discovery-call" },
  { pattern: /walkthrough/i, category: "discovery-call" },
  { pattern: /workshop/i, category: "discovery-call" },
  { pattern: /readout/i, category: "discovery-call" },
  { pattern: /discussion/i, category: "discovery-call" },
  { pattern: /reverse.?demo/i, category: "discovery-call" },
  { pattern: /proposal.?review/i, category: "discovery-call" },
  { pattern: /transcript/i, category: "discovery-call" },
  { pattern: /recording/i, category: "discovery-call" },
  { pattern: /otter.?ai/i, category: "discovery-call" },
  { pattern: /Notes by Gemini/i, category: "discovery-call" },
  { pattern: /meeting/i, category: "discovery-call" },
  // Implementation & build plans
  { pattern: /implementation.?plan/i, category: "implementation-review" },
  { pattern: /build.?plan/i, category: "implementation-review" },
  { pattern: /build.?guide/i, category: "implementation-review" },
  { pattern: /technical.?scope/i, category: "implementation-review" },
  { pattern: /integration.?plan/i, category: "implementation-review" },
  { pattern: /formula.?field/i, category: "implementation-review" },
  { pattern: /execution.?plan/i, category: "implementation-review" },
  { pattern: /mvp.?plan/i, category: "implementation-review" },
  { pattern: /onboarding/i, category: "implementation-review" },
  // Scoping & SOWs
  { pattern: /scope/i, category: "process-doc" },
  { pattern: /sow/i, category: "process-doc" },
  { pattern: /rfp/i, category: "process-doc" },
  { pattern: /proposal/i, category: "process-doc" },
  { pattern: /cost.?breakdown/i, category: "process-doc" },
  { pattern: /migration.?plan/i, category: "process-doc" },
  { pattern: /operational.?plan/i, category: "process-doc" },
  { pattern: /marketing.?plan/i, category: "process-doc" },
  { pattern: /playbook/i, category: "process-doc" },
  { pattern: /user.?stories/i, category: "process-doc" },
  { pattern: /requirements/i, category: "process-doc" },
  { pattern: /schema/i, category: "process-doc" },
  { pattern: /functions/i, category: "process-doc" },
  { pattern: /integration.*scope/i, category: "process-doc" },
  { pattern: /attribution/i, category: "process-doc" },
  // QA & audits
  { pattern: /gap.?analysis/i, category: "qa-session" },
  { pattern: /audit/i, category: "qa-session" },
  { pattern: /table.?review/i, category: "qa-session" },
  { pattern: /flag.?report/i, category: "qa-session" },
  { pattern: /scope.?creep/i, category: "qa-session" },
  { pattern: /evidence.?brief/i, category: "qa-session" },
  // Training & strategy
  { pattern: /training/i, category: "training-session" },
  { pattern: /campaign.*strategy/i, category: "process-doc" },
  { pattern: /Sales.*Marketing.*Plan/i, category: "process-doc" },
];

const CLIENT_PATTERNS: { pattern: RegExp; client: string; industry?: string }[] = [
  { pattern: /APC/i, client: "APC", industry: "Equipment Management" },
  { pattern: /SalesRabbit/i, client: "SalesRabbit", industry: "SaaS" },
  { pattern: /FinQuery/i, client: "FinQuery", industry: "Financial Services" },
  { pattern: /LoanCare/i, client: "LoanCare", industry: "Financial Services" },
  { pattern: /Civista/i, client: "Civista Bank", industry: "Financial Services" },
  { pattern: /Allegiant/i, client: "Allegiant", industry: "Energy" },
  { pattern: /Pathfinder/i, client: "Pathfinder", industry: "Insurance" },
  { pattern: /Pipaya/i, client: "Pipaya", industry: "SaaS" },
  { pattern: /Talroo/i, client: "Talroo", industry: "SaaS" },
  { pattern: /Roofle/i, client: "Roofle", industry: "Construction" },
  { pattern: /QuotaPath/i, client: "QuotaPath", industry: "SaaS" },
  { pattern: /Sayer/i, client: "Sayer", industry: "SaaS" },
  { pattern: /Top.?Smile/i, client: "Top Smile Orthodontics", industry: "Healthcare" },
  { pattern: /Epicor/i, client: "Epicor Integration", industry: "Manufacturing" },
  { pattern: /SCOUT/i, client: "SCOUT", industry: "SaaS" },
  { pattern: /DealHub|dealhub/i, client: "DealHub", industry: "SaaS" },
  { pattern: /briargrove/i, client: "Briargrove Animal Clinic", industry: "Healthcare" },
  { pattern: /Nelson|NBR/i, client: "Nelson Bros", industry: "Construction" },
  { pattern: /todyl/i, client: "Todyl", industry: "Cybersecurity" },
  { pattern: /Actabl/i, client: "Actabl", industry: "SaaS" },
  { pattern: /Cohesion/i, client: "Cohesion", industry: "SaaS" },
  { pattern: /CommunityWorks/i, client: "CommunityWorks", industry: "Financial Services" },
  { pattern: /Hamilton/i, client: "Hamilton", industry: "Energy" },
  { pattern: /Huntin.?Fool/i, client: "Huntin' Fool", industry: "Outdoor Recreation" },
  { pattern: /Junkluggers/i, client: "Junkluggers", industry: "Field Service" },
  { pattern: /Improve.?Retirement/i, client: "Improve Retirement", industry: "Financial Services" },
  { pattern: /Independence.?Title|Settlor/i, client: "Independence Title", industry: "Real Estate" },
  { pattern: /Intuitive.?Health/i, client: "Intuitive Health", industry: "Healthcare" },
  { pattern: /Waites/i, client: "Waites", industry: "Field Service" },
  { pattern: /Rather.?Outdoors/i, client: "Rather Outdoors", industry: "Outdoor Recreation" },
  { pattern: /CannGen/i, client: "CannGen", industry: "Agriculture" },
  { pattern: /Veritas/i, client: "Veritas", industry: "SaaS" },
  { pattern: /Valesco/i, client: "Valesco", industry: "Manufacturing" },
  { pattern: /Valid8/i, client: "Valid8", industry: "Financial Services" },
  { pattern: /CCSC/i, client: "CCSC", industry: "Sports/Entertainment" },
  { pattern: /MirrorWeb/i, client: "MirrorWeb", industry: "SaaS" },
  { pattern: /Eve.?Legal/i, client: "Eve Legal", industry: "Legal" },
  { pattern: /Southeastern.?Equipment/i, client: "Southeastern Equipment", industry: "Equipment Management" },
  { pattern: /Westlake|ServiceTitan.*scope/i, client: "Westlake Service", industry: "Field Service" },
  { pattern: /Idea.?Public/i, client: "Idea Public Schools", industry: "Education" },
  { pattern: /Technosylva/i, client: "Technosylva", industry: "SaaS" },
  { pattern: /UMHS/i, client: "UMHS", industry: "Healthcare" },
  { pattern: /Vista.?Defense/i, client: "Vista Defense", industry: "Defense" },
  { pattern: /Checkpoint/i, client: "Checkpoint", industry: "SaaS" },
  { pattern: /EHS/i, client: "EHS", industry: "Energy" },
  { pattern: /TheMatchGuy/i, client: "TheMatchGuy", industry: "SaaS" },
  { pattern: /VirostkoHunts/i, client: "Virostko Hunts", industry: "Outdoor Recreation" },
  { pattern: /TechnicalSafety/i, client: "Technical Safety BC", industry: "Government" },
  { pattern: /DirectMailers/i, client: "DirectMailers", industry: "Marketing" },
];

interface IngestCandidate {
  filePath: string;
  fileName: string;
  extension: string;
  sizeKB: number;
  category: string;
  industry: string | null;
  client: string | null;
  tags: string[];
  source: string;
}

function shouldSkip(fileName: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(fileName));
}

function categorize(fileName: string): {
  category: string;
  industry: string | null;
  client: string | null;
  tags: string[];
} {
  let category = "other";
  let industry: string | null = null;
  let client: string | null = null;
  const tags: string[] = [];

  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(fileName)) {
      category = rule.category;
      if (rule.industry) industry = rule.industry;
      break;
    }
  }

  for (const cp of CLIENT_PATTERNS) {
    if (cp.pattern.test(fileName)) {
      client = cp.client;
      if (cp.industry) industry = cp.industry;
      tags.push(client.toLowerCase().replace(/\s+/g, "-"));
      break;
    }
  }

  if (/hubspot/i.test(fileName)) tags.push("hubspot");
  if (/integration/i.test(fileName)) tags.push("integration");
  if (/workflow/i.test(fileName)) tags.push("workflows");
  if (/crm/i.test(fileName)) tags.push("crm");

  return { category, industry, client, tags };
}

function scanDirectory(dirPath: string): IngestCandidate[] {
  const candidates: IngestCandidate[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    console.error(`  Cannot read directory: ${dirPath}`);
    return candidates;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) continue;

    const fileName = entry.name;
    const ext = path.extname(fileName).toLowerCase();

    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
    if (shouldSkip(fileName)) continue;

    const filePath = path.join(dirPath, fileName);
    const stat = fs.statSync(filePath);

    if (stat.size > MAX_FILE_SIZE) {
      continue;
    }

    if (stat.size < 500) continue;

    const { category, industry, client, tags } = categorize(fileName);
    const source = ext === ".docx" ? "docx-import" :
                   ext === ".json" ? "json-import" :
                   ext === ".vtt"  ? "vtt-import"  :
                   ext === ".md"   ? "md-import"   : "txt-import";

    candidates.push({
      filePath,
      fileName,
      extension: ext,
      sizeKB: Math.round(stat.size / 1024),
      category,
      industry,
      client,
      tags,
      source,
    });
  }

  return candidates;
}

function isFathomTranscript(data: any): boolean {
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    return (
      typeof first === "object" &&
      ("sentence" in first || "text" in first) &&
      ("speaker_name" in first || "speaker" in first)
    );
  }
  return false;
}

async function parseFile(
  candidate: IngestCandidate
): Promise<{ name: string; transcript: any } | null> {
  const baseName = candidate.fileName.replace(/\.[^/.]+$/, "");

  try {
    if (candidate.extension === ".docx") {
      const buffer = fs.readFileSync(candidate.filePath);
      const result = await mammoth.extractRawText({ buffer });
      return {
        name: baseName,
        transcript: { raw: result.value },
      };
    }

    if (candidate.extension === ".json") {
      const raw = fs.readFileSync(candidate.filePath, "utf-8");
      const parsed = JSON.parse(raw);

      if (isFathomTranscript(parsed)) {
        const arr = Array.isArray(parsed) ? parsed : Object.values(parsed);
        return {
          name: baseName,
          transcript: { segments: arr },
        };
      }

      return {
        name: baseName,
        transcript: parsed,
      };
    }

    if (candidate.extension === ".vtt") {
      const content = fs.readFileSync(candidate.filePath, "utf-8");
      return {
        name: baseName,
        transcript: { vtt: content },
      };
    }

    // .txt, .md
    const content = fs.readFileSync(candidate.filePath, "utf-8");
    return {
      name: baseName,
      transcript: { raw: content },
    };
  } catch (err: any) {
    console.error(`  Error parsing ${candidate.fileName}: ${err.message}`);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const dirIndex = args.indexOf("--dir");
  const scanDir =
    dirIndex !== -1 && args[dirIndex + 1]
      ? args[dirIndex + 1]
      : path.join(process.env.USERPROFILE || process.env.HOME || "", "Downloads");

  console.log(`\n  REX Corpus Ingestion`);
  console.log(`  ====================`);
  console.log(`  Scanning: ${scanDir}`);
  console.log(`  Mode:     ${commit ? "COMMIT (will import)" : "DRY RUN (preview only)"}\n`);

  const candidates = scanDirectory(scanDir);

  if (candidates.length === 0) {
    console.log("  No eligible files found.\n");
    return;
  }

  // Group by category
  const byCategory: Record<string, IngestCandidate[]> = {};
  for (const c of candidates) {
    if (!byCategory[c.category]) byCategory[c.category] = [];
    byCategory[c.category].push(c);
  }

  console.log(`  Found ${candidates.length} files:\n`);
  for (const [cat, items] of Object.entries(byCategory).sort()) {
    console.log(`  ${cat} (${items.length}):`);
    for (const item of items) {
      const clientTag = item.client ? ` [${item.client}]` : "";
      console.log(
        `    ${item.extension.padEnd(6)} ${item.sizeKB.toString().padStart(5)}KB  ${item.fileName}${clientTag}`
      );
    }
    console.log();
  }

  if (!commit) {
    console.log(`  ---`);
    console.log(`  This was a dry run. To import, run again with --commit`);
    console.log(`  npx tsx scripts/ingest-corpus.ts --commit\n`);
    return;
  }

  // Dynamic import of Prisma to keep dry-run dependency-free
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  console.log(`  Importing ${candidates.length} files...\n`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const candidate of candidates) {
    const parsed = await parseFile(candidate);
    if (!parsed) {
      errors++;
      continue;
    }

    try {
      // Check for duplicate by name
      const existing = await prisma.corpusEntry.findFirst({
        where: { name: parsed.name },
        select: { id: true },
      });

      if (existing) {
        console.log(`  SKIP (exists): ${parsed.name}`);
        skipped++;
        continue;
      }

      await prisma.corpusEntry.create({
        data: {
          name: parsed.name,
          transcript: parsed.transcript,
          tags: candidate.tags,
          industry: candidate.industry,
          category: candidate.category,
          source: candidate.source,
          complexity: null,
          outcome: null,
        },
      });

      console.log(`  OK:   ${parsed.name}`);
      imported++;
    } catch (err: any) {
      console.error(`  FAIL: ${parsed.name} — ${err.message}`);
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
