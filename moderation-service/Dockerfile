FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models/huggingface \
    SENTENCE_TRANSFORMERS_HOME=/models/sentence-transformers \
    OPENNSFW2_HOME=/models/opennsfw2 \
    OPENNSFW2_KERAS=tf-keras \
    TF_CPP_MIN_LOG_LEVEL=2 \
    TF_ENABLE_ONEDNN_OPTS=0 \
    PYTHONFAULTHANDLER=1 \
    MPLCONFIGDIR=/tmp/matplotlib \
    XDG_CACHE_HOME=/tmp/cache \
    TOKENIZERS_PARALLELISM=false \
    OMP_NUM_THREADS=4 \
    MKL_NUM_THREADS=4

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ffmpeg \
       fonts-dejavu-core \
       libgomp1 \
       openssl \
       tesseract-ocr \
       tesseract-ocr-eng \
       tesseract-ocr-rus \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /service
COPY requirements.txt ./
RUN python -m pip install --upgrade pip setuptools wheel \
    && python -m pip install \
       --index-url https://download.pytorch.org/whl/cpu \
       torch==2.6.0 \
       torchvision==0.21.0 \
    && python -m pip install -r requirements.txt \
    && python -m pip check \
    && python -c "import torch, transformers, sentence_transformers; assert torch.__version__.startswith('2.6.0'); assert transformers.__version__ == '4.48.3'; assert sentence_transformers.__version__ == '3.4.1'; from sentence_transformers import SentenceTransformer; print('ML dependency check: OK')"

COPY app ./app
COPY selftest.py ./selftest.py
COPY tests ./tests
RUN useradd --create-home --uid 10001 moderator \
    && mkdir -p /models \
    && chown -R moderator:moderator /models /service

USER moderator
EXPOSE 8091

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8091", "--workers", "1", "--no-access-log"]
