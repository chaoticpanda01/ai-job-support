# =============================================================================
# Backend — Multi-stage Dockerfile
# Stage 1: base     — Python + system deps
# Stage 2: builder  — install Python packages into venv
# Stage 3: runtime  — minimal production image
#
# Target: --target=runtime (default) for API server
#         --target=celery   for Celery workers (same image, different CMD)
#
# Japanese font support for WeasyPrint PDF generation does NOT come from a
# system package here — production (Render) runs both services on Render's
# native Python buildpack, not this Dockerfile, so an apt-installed font
# would silently be absent there. The font is bundled as a repo asset
# instead (app/assets/fonts/) and loaded by an in-repo file path, which
# works identically under this image, Render's native runtime, or local
# dev. See app/utils/pdf_generator.py.
# =============================================================================

# ---- Stage 1: Base ----
FROM python:3.12-slim AS base

# System packages:
#   build-essential   — C extensions (asyncpg, python-magic)
#   libmagic1         — python-magic MIME detection
#   libpango-1.0-0 libpangocairo-1.0-0 libcairo2   — WeasyPrint rendering engine
#   libffi-dev        — cryptography package
#   curl              — healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libmagic1 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    libssl-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

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
