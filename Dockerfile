# Use an official Node.js runtime as a parent image
FROM node:16

# Set the working directory
WORKDIR /app

# Install ffmpeg and clean up apt cache to reduce image size
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies with production flag to avoid dev dependencies in the production build
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Ensure the node process runs as a non-root user for better security
RUN useradd -m appuser && chown -R appuser /app
USER appuser

# Expose the port the app runs on
EXPOSE 3000

# Run the application
CMD ["node", "main.js"]
