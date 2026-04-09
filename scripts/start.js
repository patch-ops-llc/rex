const { execSync } = require("child_process");

const service = (process.env.SERVICE_TYPE || "web").toLowerCase();

const servers = {
  web: "apps/web/.next/standalone/apps/web/server.js",
  display: "apps/display/.next/standalone/apps/display/server.js",
};

const serverPath = servers[service];
if (!serverPath) {
  console.error(`Unknown SERVICE_TYPE: ${service}. Use "web" or "display".`);
  process.exit(1);
}

console.log(`Starting ${service} service...`);
execSync(`HOSTNAME=0.0.0.0 node ${serverPath}`, { stdio: "inherit" });
