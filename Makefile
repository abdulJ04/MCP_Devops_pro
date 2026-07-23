.PHONY: start stop restart status logs backend-logs frontend-logs setup build clean help

APP_ENV ?= development

start: ## Start all services (APP_ENV=development|production)
	@bash -c '\
		ENV="${APP_ENV}"; \
		for port in 3000 8085; do \
			pid=$$(lsof -ti:$$port 2>/dev/null) || true; \
			[ -n "$$pid" ] && echo "Cleaning port $$port (PID: $$pid)..." && kill -9 $$pid 2>/dev/null && sleep 1; \
		done; \
		echo "========================"; \
		echo "  devops-ai-agents"; \
		echo "  Environment: $$ENV"; \
		echo "========================"; \
		echo ""; \
		if ! command -v pm2 &>/dev/null; then echo "Installing PM2..."; npm install -g pm2; fi; \
		mkdir -p logs; \
		[ ! -d "node_modules" ] && echo "[1/3] Installing npm..." && npm install --silent || echo "[1/3] npm OK"; \
		echo "[2/3] Python deps..."; \
		pip3 install -r aws-mcp-server/requirements.txt -q --break-system-packages 2>/dev/null; \
		echo "[3/3] Starting PM2..."; \
		pm2 start ecosystem.config.js --env "$$ENV" --only mcp-backend; \
		echo ""; \
		echo "Waiting for backend..."; \
		for i in $$(seq 1 15); do \
			if curl -sf http://127.0.0.1:8085/health > /dev/null 2>&1; then \
				echo "✅ Backend ready"; break; \
			fi; \
			[ "$$i" -eq 15 ] && echo "⚠️  Backend timeout — make backend-logs" || echo "  Attempt $$i/15..." && sleep 2; \
		done; \
		pm2 start ecosystem.config.js --env "$$ENV" --only mcp-frontend; \
		echo ""; \
		echo "Waiting for frontend..."; \
		for i in $$(seq 1 30); do \
			code=$$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000"); \
			[ "$$code" = "200" -o "$$code" = "302" ] && echo "✅ Frontend ready (HTTP $$code)" && break; \
			[ "$$i" -eq 30 ] && echo "⚠️  Frontend timeout — make frontend-logs" || echo "  Attempt $$i/30..." && sleep 3; \
		done; \
		echo ""; \
		echo "============================"; \
		echo "  ✅ All services started!"; \
		echo "  Frontend: http://localhost:3000"; \
		echo "  Backend:  http://localhost:8085"; \
		echo "============================"; \
	'

stop: ## Stop all services gracefully
	@bash -c '\
		echo "Stopping..."; \
		if command -v pm2 &>/dev/null; then \
			pm2 stop mcp-backend mcp-frontend 2>/dev/null && echo "  Services stopped"; \
			pm2 delete mcp-backend mcp-frontend 2>/dev/null || true; \
			echo "✅ All stopped gracefully"; \
		else \
			pkill -f "uvicorn server:app" 2>/dev/null && echo "  Backend stopped" || true; \
			pkill -f "next dev" 2>/dev/null && echo "  Frontend stopped" || true; \
		fi; \
		echo "Done."; \
	'

restart: ## Restart all services
	$(MAKE) stop
	@sleep 2
	$(MAKE) start

status: ## Show PM2 process status
	@pm2 status

logs: ## Tail logs from all services
	@pm2 logs

backend-logs: ## Tail backend logs only
	@pm2 logs mcp-backend

frontend-logs: ## Tail frontend logs only
	@pm2 logs mcp-frontend

setup: ## Install all dependencies (Python + Node)
	@echo "Installing Python dependencies..."
	@pip3 install -r aws-mcp-server/requirements.txt -q --break-system-packages
	@echo "Installing Node dependencies..."
	@npm install --silent
	@echo "✅ Setup complete"

build: ## Build frontend for production
	@npm run build

clean: ## Clean logs, cache, and build artifacts
	@rm -rf logs/ .next/ __pycache__/
	@find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
	@rm -f tsconfig.tsbuildinfo
	@echo "✅ Cleaned logs, cache, pycache"

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
