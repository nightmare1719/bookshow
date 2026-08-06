FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy dependency configs
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose port
EXPOSE 5000

# Start server
CMD ["node", "server.js"]
