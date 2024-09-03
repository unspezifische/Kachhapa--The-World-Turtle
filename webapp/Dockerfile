# Dockerfile for React app with Nginx
FROM node:18-alpine AS build

# Set the working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./

# Install the specific version of npm
RUN npm install -g npm@10.8.3

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the React app
RUN npm run build

# Stage 2: Nginx
FROM nginx:alpine

# Copy the build output to Nginx's html directory
COPY --from=build /app/build /usr/share/nginx/html

# Copy the custom Nginx configuration file
COPY nginx-docker.conf /etc/nginx/nginx.conf

# Expose the port Nginx will listen on
EXPOSE 80