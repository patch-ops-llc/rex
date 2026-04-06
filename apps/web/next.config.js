/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@rex/shared", "@rex/orchestrator"],
};

module.exports = nextConfig;
