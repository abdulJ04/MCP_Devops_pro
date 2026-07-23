module.exports = {
  apps: [
    {
      name: "mcp-backend",
      cwd: "./aws-mcp-server",
      script: "uvicorn",
      args: "server:app --host 0.0.0.0 --port 8085",
      interpreter: "python3",
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "../logs/backend-error.log",
      out_file: "../logs/backend-out.log",
      merge_logs: true,
      pid_file: "../logs/backend.pid",
      env_development: {
        NODE_ENV: "development",
        PYTHONUNBUFFERED: "1",
      },
      env_production: {
        NODE_ENV: "production",
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      name: "mcp-frontend",
      cwd: ".",
      script: "npm",
      args: "run dev -- --port 3000",
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "./logs/frontend-error.log",
      out_file: "./logs/frontend-out.log",
      merge_logs: true,
      pid_file: "./logs/frontend.pid",
      env_development: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
