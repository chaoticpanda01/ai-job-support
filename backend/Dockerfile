# =============================================================================
# Backend — Multi-stage Dockerfile
# Stage 1: base     — Python + system deps + fonts
# Stage 2: builder  — install Python packages into venv
# Stage 3: runtime  — minimal production image
#
# Target: --target=runtime (default) for API server
#         --target=celery   for Celery workers (same image, different CMD)
# =============================================================================

# ---- Stage 1: Base ----
FROM python:3.12-slim AS base

# System packages:
#   build-essential   — C extensions (asyncpg, python-magic)
#   libmagic1         — python-magic MIME detection
#   fonts-noto-cjk    — Noto Sans JP for WeasyPrint PDF generation (Japanese support)
#   libpango-1.0-0 libpangocairo-1.0-0 libcairo2   — WeasyPrint rendering engine
#   libffi-dev        — cryptography package
#   curl              — healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libmagic1 \
    fonts-noto-cjk \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    libssl-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Verify Japanese font installation — build fails here if fonts are missing
# (prevents silent font fallback producing unreadable PDFs)
RUN fc-list :lang=ja | grep -q "Noto" || (echo "ERROR: Noto CJK fonts not found" && exit 1)

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

# ---- Stage 2: Builder ----
FROM base AS builder

WORKDIR /app

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ---- Stage 3: Runtime ----
FROM base AS runtime

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Create non-root user
RUN addgroup --system --gid 1001 appgroup && \
    adduser  --system --uid 1001 --ingroup appgroup appuser

COPY --chown=appuser:appgroup . .

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]

# ---- Stage 4: Celery worker (inherits runtime) ----
FROM runtime AS celery

CMD ["celery", "-A", "app.workers.celery_app", "worker", \
     "--loglevel=info", \
     "--queues=documents,analysis", \
     "--concurrency=2"]
