FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY scripts/ ./scripts/

ENV VERIBRAND_PYTHON_HOST=0.0.0.0
ENV VERIBRAND_PYTHON_PORT=8000

EXPOSE 8000
CMD ["python", "main.py"]
