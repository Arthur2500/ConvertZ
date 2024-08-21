# Use an official Node.js runtime as a parent image
FROM node:22

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
RUN npm install --omit=dev

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Run the application
CMD ["node", "main.js"]
