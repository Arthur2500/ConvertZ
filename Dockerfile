# Dockerfile
FROM python:3.9-slim

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg

# Install required Python packages
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy application code
COPY app /app

WORKDIR /app

# Expose port
EXPOSE 5000

# Run the application
CMD ["python", "app.py"]
