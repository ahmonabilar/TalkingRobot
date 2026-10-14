.PHONY: dev frontend backend

dev:
	@set -e; \
	started=0; \
	if curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then \
		echo "Ollama is already running"; \
	else \
		if ! command -v ollama >/dev/null 2>&1; then \
			echo "Ollama is not installed. Install it from https://ollama.com" >&2; \
			exit 1; \
		fi; \
		echo "Starting Ollama"; \
		ollama serve & \
		backend_pid=$$!; \
		started=1; \
		i=0; \
		while [ $$i -lt 20 ]; do \
			if curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then \
				break; \
			fi; \
			i=$$((i + 1)); \
			sleep 0.3; \
		done; \
	fi; \
	trap 'if [ "$$started" = 1 ]; then kill $$backend_pid 2>/dev/null || true; fi' EXIT INT TERM; \
	npm run dev

frontend:
	npm run dev

backend:
	ollama serve
