#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const envName = process.argv[2];
if (!['dev', 'staging', 'prod'].includes(envName)) {
  console.error('Usage: node mcp-env-server.js <dev|staging|prod>');
  process.exit(1);
}

const config = {
  dev:  { port: 8082, workspace: '/home/bsetec/workspaces/dev', label: 'Development' },
  staging: { port: 8081, workspace: '/home/bsetec/workspaces/staging', label: 'Staging' },
  prod: { port: 8083, workspace: '/home/bsetec/workspaces/prod', label: 'Production' },
};

const { port, workspace, label } = config[envName];

if (!fs.existsSync(workspace)) {
  fs.mkdirSync(workspace, { recursive: true });
}

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${port}`);
  const action = url.pathname;

  if (req.method === 'GET' && action === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'running', env: envName, workspace, port }));
    return;
  }

  if (req.method === 'GET' && action === '/files') {
    const dir = url.searchParams.get('dir') || '';
    const fullPath = path.join(workspace, dir);
    if (!fullPath.startsWith(workspace)) {
      res.writeHead(403);
      res.end(JSON.stringify({ error: 'Access denied' }));
      return;
    }
    try {
      const items = fs.readdirSync(fullPath, { withFileTypes: true }).map(d => ({
        name: d.name,
        type: d.isDirectory() ? 'dir' : 'file',
        size: d.isFile() ? fs.statSync(path.join(fullPath, d.name)).size : 0,
      }));
      res.writeHead(200);
      res.end(JSON.stringify({ path: fullPath, items }));
    } catch (err) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'GET' && action === '/file') {
    const filePath = url.searchParams.get('path') || '';
    const fullPath = path.join(workspace, filePath);
    if (!fullPath.startsWith(workspace)) {
      res.writeHead(403);
      res.end(JSON.stringify({ error: 'Access denied' }));
      return;
    }
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      res.writeHead(200);
      res.end(JSON.stringify({ path: fullPath, content }));
    } catch (err) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && action === '/write') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { filePath: relPath, content } = JSON.parse(body);
        const fullPath = path.join(workspace, relPath);
        if (!fullPath.startsWith(workspace)) {
          res.writeHead(403);
          res.end(JSON.stringify({ error: 'Access denied' }));
          return;
        }
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, path: fullPath }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && action === '/exec') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { command } = JSON.parse(body);
        const result = execSync(command, { cwd: workspace, encoding: 'utf-8', timeout: 30000 });
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, output: result }));
      } catch (err) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: false, error: err.message, output: err.stdout }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Unknown endpoint' }));
});

server.listen(port, () => {
  console.log(`[${label} MCP] Running on port ${port} | Workspace: ${workspace}`);
});
