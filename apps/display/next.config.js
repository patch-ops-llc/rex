/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@rex/shared"],
};

module.exports = nextConfig;
