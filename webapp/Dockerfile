# Dockerfile for React app
FROM node:18-alpine as build

# Set the working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./

# Install the specific version of npm
RUN npm install -g npm@10.8.3

# Copy the rest of the application code
COPY . .

# Build the React app
RUN npm run build

# The build output will be in /app/build