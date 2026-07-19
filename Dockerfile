# Build the single embedded binary, then ship it on a minimal base.
FROM node:20-bookworm AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM golang:1.25-bookworm AS backend
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /app/dist ./backend/cmd/flowstock/dist
ARG VERSION=docker
RUN CGO_ENABLED=0 go build -tags embed_frontend \
    -ldflags "-s -w -X main.Version=${VERSION}" \
    -o /flowstock ./backend/cmd/flowstock

FROM gcr.io/distroless/static-debian12
COPY --from=backend /flowstock /flowstock
ENV FLOWSTOCK_HOST=0.0.0.0 \
    FLOWSTOCK_PORT=8787 \
    FLOWSTOCK_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8787
ENTRYPOINT ["/flowstock"]
