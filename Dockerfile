# Use an official Python runtime as a parent image
FROM python:3.13-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set work directory inside container
WORKDIR /app

# Copy requirements first for caching
COPY fastAPI/requirements.txt .

# Install dependencies
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# Copy the rest of the FastAPI app
COPY fastAPI/ ./fastAPI/

# Expose the port your app runs on
EXPOSE 8080

# Command to run the app
CMD ["uvicorn", "fastAPI.app.main:app", "--host", "0.0.0.0", "--port", "8080"]