import type { ScaffoldConfig, ScaffoldFile, ProjectTemplateType } from "@rex/shared";

export function scaffoldProject(
  name: string,
  templateType: ProjectTemplateType,
  config: ScaffoldConfig = {}
): ScaffoldFile[] {
  const port = config.port || 3000;

  switch (templateType) {
    case "express-integration":
      return expressIntegration(name, port, config);
    case "webhook-processor":
      return webhookProcessor(name, port, config);
    case "bidirectional-sync":
      return bidirectionalSync(name, port, config);
    default:
      return expressIntegration(name, port, config);
  }
}

function baseFiles(name: string, port: number, config: ScaffoldConfig): ScaffoldFile[] {
  const deps: Record<string, string> = {
    express: "^4.21.0",
    cors: "^2.8.5",
    dotenv: "^16.4.5",
  };
  const devDeps: Record<string, string> = {
    "@types/express": "^5.0.0",
    "@types/cors": "^2.8.17",
    "@types/node": "^22.0.0",
    typescript: "^5.7.0",
    tsx: "^4.19.0",
  };

  if (config.usePostgres) {
    deps["@prisma/client"] = "^6.0.0";
    devDeps["prisma"] = "^6.0.0";
  }
  if (config.useRedis || config.useBullMQ) {
    deps["ioredis"] = "^5.4.0";
  }
  if (config.useBullMQ) {
    deps["bullmq"] = "^5.30.0";
  }
  if (config.hubspotIntegration) {
    deps["@hubspot/api-client"] = "^12.0.0";
  }

  const pkgJson = {
    name,
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "tsx watch src/index.ts",
      build: "tsc",
      start: "node dist/index.js",
      ...(config.usePostgres
        ? {
            "db:generate": "prisma generate",
            "db:push": "prisma db push",
            "db:migrate": "prisma migrate dev",
          }
        : {}),
    },
    dependencies: deps,
    devDependencies: devDeps,
    engines: { node: ">=20" },
  };

  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "commonjs",
      lib: ["ES2022"],
      outDir: "./dist",
      rootDir: "./src",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      declaration: true,
      declarationMap: true,
      sourceMap: true,
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist"],
  };

  const envLines = [
    `PORT=${port}`,
    "",
    config.usePostgres ? "DATABASE_URL=postgresql://user:password@localhost:5432/" + name : null,
    config.useRedis || config.useBullMQ ? "REDIS_URL=redis://localhost:6379" : null,
    config.hubspotIntegration ? "HUBSPOT_ACCESS_TOKEN=" : null,
    config.serviceTitanIntegration ? "SERVICETITAN_APP_KEY=\nSERVICETITAN_TENANT_ID=\nSERVICETITAN_CLIENT_ID=\nSERVICETITAN_CLIENT_SECRET=" : null,
  ].filter(Boolean);

  const railwayToml = `[build]
buildCommand = "npm install && npm run build${config.usePostgres ? " && npx prisma generate" : ""}"

[deploy]
startCommand = "node dist/index.js"
healthcheckPath = "/health"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
`;

  const gitignore = `node_modules/
dist/
.env
*.log
`;

  const readme = `# ${name}

${config.description || "PatchOps custom integration service."}

## Quick Start

\`\`\`bash
npm install
cp .env.example .env   # fill in values
npm run dev
\`\`\`

## Deployment

Deployed via Railway. Pushes to \`main\` trigger automatic deploys.

## Health Check

\`GET /health\` — returns \`{ status: "ok" }\`
`;

  return [
    { path: "package.json", content: JSON.stringify(pkgJson, null, 2) },
    { path: "tsconfig.json", content: JSON.stringify(tsconfig, null, 2) },
    { path: ".env.example", content: envLines.join("\n") + "\n" },
    { path: ".gitignore", content: gitignore },
    { path: "railway.toml", content: railwayToml },
    { path: "README.md", content: readme },
  ];
}

// ── Template: Express Integration ────────────────────────────

function expressIntegration(name: string, port: number, config: ScaffoldConfig): ScaffoldFile[] {
  const files = baseFiles(name, port, config);

  const indexTs = `import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "${port}", 10);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "${name}", timestamp: new Date().toISOString() });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(\`${name} listening on port \${PORT}\`);
});
`;

  files.push({ path: "src/index.ts", content: indexTs });

  if (config.usePostgres) {
    files.push(...prismaFiles(name));
  }

  return files;
}

// ── Template: Webhook Processor ──────────────────────────────

function webhookProcessor(name: string, port: number, config: ScaffoldConfig): ScaffoldFile[] {
  const cfg: ScaffoldConfig = { ...config, useRedis: true, useBullMQ: true };
  const files = baseFiles(name, port, cfg);

  const indexTs = `import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Queue } from "bullmq";
import IORedis from "ioredis";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "${port}", 10);

const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});
const webhookQueue = new Queue("webhooks", { connection: redis });

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "${name}", timestamp: new Date().toISOString() });
});

app.post("/webhook", async (req, res) => {
  const payload = req.body;
  console.log("Webhook received:", JSON.stringify(payload).slice(0, 200));

  await webhookQueue.add("process", payload, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  });

  res.status(202).json({ accepted: true });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(\`${name} webhook processor listening on port \${PORT}\`);
});
`;

  const workerTs = `import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  "webhooks",
  async (job: Job) => {
    console.log(\`Processing webhook job \${job.id}\`, job.data);

    // TODO: implement your webhook processing logic here

    return { processed: true };
  },
  {
    connection: redis,
    concurrency: 5,
  }
);

worker.on("completed", (job) => {
  console.log(\`Job \${job.id} completed\`);
});

worker.on("failed", (job, err) => {
  console.error(\`Job \${job?.id} failed:\`, err.message);
});

console.log("Webhook worker started");
`;

  files.push({ path: "src/index.ts", content: indexTs });
  files.push({ path: "src/worker.ts", content: workerTs });

  if (config.usePostgres) {
    files.push(...prismaFiles(name));
  }

  return files;
}

// ── Template: Bidirectional Sync ─────────────────────────────

function bidirectionalSync(name: string, port: number, config: ScaffoldConfig): ScaffoldFile[] {
  const cfg: ScaffoldConfig = {
    ...config,
    useRedis: true,
    useBullMQ: true,
    usePostgres: true,
  };
  const files = baseFiles(name, port, cfg);

  const indexTs = `import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Queue } from "bullmq";
import IORedis from "ioredis";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "${port}", 10);

const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const syncQueue = new Queue("sync", { connection: redis });

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "${name}", timestamp: new Date().toISOString() });
});

// Inbound webhook from System A
app.post("/webhook/inbound", async (req, res) => {
  await syncQueue.add("sync-a-to-b", req.body, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  });
  res.status(202).json({ accepted: true });
});

// Inbound webhook from System B
app.post("/webhook/outbound", async (req, res) => {
  await syncQueue.add("sync-b-to-a", req.body, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  });
  res.status(202).json({ accepted: true });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(\`${name} sync service listening on port \${PORT}\`);
});
`;

  const workerTs = `import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  "sync",
  async (job: Job) => {
    const direction = job.name;
    console.log(\`Processing sync job \${job.id} (\${direction})\`);

    switch (direction) {
      case "sync-a-to-b":
        // TODO: map fields from System A → System B and push
        break;
      case "sync-b-to-a":
        // TODO: map fields from System B → System A and push
        break;
      default:
        throw new Error(\`Unknown sync direction: \${direction}\`);
    }

    return { synced: true, direction };
  },
  {
    connection: redis,
    concurrency: 5,
    limiter: { max: 10, duration: 1000 },
  }
);

worker.on("completed", (job) => {
  console.log(\`Sync job \${job.id} completed\`);
});

worker.on("failed", (job, err) => {
  console.error(\`Sync job \${job?.id} failed:\`, err.message);
});

console.log("Sync worker started");
`;

  files.push({ path: "src/index.ts", content: indexTs });
  files.push({ path: "src/worker.ts", content: workerTs });
  files.push(...prismaFiles(name));

  return files;
}

// ── Shared Prisma scaffold ───────────────────────────────────

function prismaFiles(name: string): ScaffoldFile[] {
  const schema = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model SyncLog {
  id          String   @id @default(cuid())
  direction   String
  sourceId    String
  targetId    String?
  status      String   @default("pending")
  payload     Json?
  response    Json?
  errorMessage String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([sourceId])
  @@index([direction, status])
}
`;

  const dbTs = `import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
`;

  return [
    { path: "prisma/schema.prisma", content: schema },
    { path: "src/db.ts", content: dbTs },
  ];
}
