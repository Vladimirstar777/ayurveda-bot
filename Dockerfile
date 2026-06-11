FROM python:3.11-slim

# Install system dependencies needed for building wheels (build-essential, gcc, etc.)
RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the project source
COPY . /app

# Environment variables (override in production)
ENV HOST=0.0.0.0
ENV PORT=8080
ENV WEBAPP_URL=${WEBAPP_URL}
ENV BOT_TOKEN=${BOT_TOKEN}
ENV WEBHOOK_PATH=/webhook

EXPOSE 8080

# Run the bot (which also serves the webapp)
CMD ["python", "bot.py"]
