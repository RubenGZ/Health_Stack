# ============================================================
# HealthStack Pro — Makefile
# Uso: make <comando>
# ============================================================

.PHONY: help dev stop build test seed migrate logs

help:
	@echo "Comandos disponibles:"
	@echo "  make dev      - Arranca el stack completo (Docker)"
	@echo "  make stop     - Para todos los contenedores"
	@echo "  make build    - Rebuild de la imagen backend"
	@echo "  make test     - Ejecuta todos los tests"
	@echo "  make seed     - Poblar BD con datos de nutrición"
	@echo "  make migrate  - Ejecutar migraciones Alembic"
	@echo "  make logs     - Ver logs del backend"

dev:
	docker compose up -d

stop:
	docker compose down

build:
	docker compose build backend

test:
	cd backend && PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe -m pytest tests/ -v

seed:
	cd backend && PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe scripts/seed_nutrition.py

migrate:
	cd backend && .venv/Scripts/python.exe -m alembic upgrade head

logs:
	docker logs healthstack_backend -f
