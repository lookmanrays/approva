SHELL := /bin/sh

.PHONY: bootstrap dev demo start stop smoke

bootstrap:
	pnpm bootstrap
dev:
	sh ./scripts/dev-open-core.sh

demo:
	bash ./scripts/demo-flow.sh

start:
	docker compose up --build -d
	@echo ""
	@echo "Approva is starting in Docker."
	@echo "Next steps:"
	@echo "  - Console: http://localhost:3000/console/approvals"
	@echo "  - API docs: http://localhost:4000/docs"
	@echo "  - Follow logs: docker compose logs -f approva-api approva-console"
	@echo "  - The seeded approval URL will appear in approva-api logs on first boot"

stop:
	docker compose down

smoke:
	bash scripts/smoke-test.sh
