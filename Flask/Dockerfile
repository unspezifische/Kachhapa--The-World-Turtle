# Dockerfile for Flask app with Python 3.9.6 (64-bit)
FROM python:3.9.6-slim-buster

# Set the working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Expose the port Gunicorn will run on
EXPOSE 5000

# Command to run the app with Gunicorn, enabling WebSockets
CMD ["gunicorn", "-k", "geventwebsocket.gunicorn.workers.GeventWebSocketWorker", "-w", "4", "-b", "unix:/Flask/flask_app.sock", "app:app"]