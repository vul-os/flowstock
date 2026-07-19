VERSION := $(shell cat VERSION 2>/dev/null || echo dev)

.PHONY: dev dev-app build build-frontend test test-go lint screenshots run

# UI-only dev (browser + demo data)
dev:
	npm run dev

# Go server proxying to the Vite dev server
dev-app:
	go run ./backend/cmd/flowstock

# Full single-binary build (frontend embedded)
build:
	npm run build:all

build-frontend:
	npm run build

# Tests
test: test-go test-e2e

test-go:
	go test ./backend/...

# Browser end-to-end tests against the real binary (builds it if stale).
# Needs `npx playwright install chromium` once.
test-e2e:
	npx playwright test

lint:
	npm run lint

screenshots:
	npm run screenshots

run: build
	./flowstock
