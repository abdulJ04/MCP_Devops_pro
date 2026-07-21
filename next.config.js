/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  devIndicators: false,
  env: {
    OPENCLAW_HOST: process.env.OPENCLAW_HOST || 'localhost',
    OPENCLAW_PORT: process.env.OPENCLAW_PORT || '18789',
    OPENCLAW_AGENT: process.env.OPENCLAW_AGENT || 'main',
    MCP_DEV_URL: process.env.MCP_DEV_URL || 'http://localhost:8082',
    MCP_STAGING_URL: process.env.MCP_STAGING_URL || 'http://localhost:8081',
    MCP_PROD_URL: process.env.MCP_PROD_URL || 'http://localhost:8083',
    MCP_DEV_WORKSPACE: process.env.MCP_DEV_WORKSPACE || '/home/bsetec/workspaces/dev',
    MCP_STAGING_WORKSPACE: process.env.MCP_STAGING_WORKSPACE || '/home/bsetec/workspaces/staging',
    MCP_PROD_WORKSPACE: process.env.MCP_PROD_WORKSPACE || '/home/bsetec/workspaces/prod',
  },
};

module.exports = nextConfig;
