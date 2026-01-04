# Dockerfile for Flask app with Python 3.9.6 (64-bit)
FROM python:3.9.6-slim-buster

# Set the working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY Flask/requirements.txt requirements.txt
RUN pip install -r requirements.txt --no-cache-dir

# Copy the rest of the application code
COPY Flask/ .
# COPY GameElements/ GameElements/

# Command to run the app with Gunicorn, using eventlet
CMD ["gunicorn", "-k", "eventlet", "-w", "1", "--bind", "unix:/tmp/myapp.socket", "--reload", "app:app"]