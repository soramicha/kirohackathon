# Dockerfile for FastAPI backend
FROM python:3.13-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy uv files
COPY pyproject.toml ./
COPY .python-version ./

# Install uv
RUN pip install uv

# Install dependencies
RUN uv sync --frozen

# Copy application code
COPY src/ ./src/

# Expose port
EXPOSE 8000

# Run the application
CMD ["uv", "run", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
