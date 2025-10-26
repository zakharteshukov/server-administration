FROM node:18-alpine

# Install system dependencies and build tools
RUN apk add --no-cache \
    bash \
    procps \
    util-linux \
    coreutils \
    python3 \
    make \
    g++ \
    curl \
    wget \
    nano \
    vim \
    htop \
    && rm -rf /var/cache/apk/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY . .

# Copy and setup host wrapper script
COPY host-wrapper.sh /usr/local/bin/host-wrapper
RUN chmod +x /usr/local/bin/host-wrapper

# Copy cursor-agent wrapper
COPY cursor-agent-wrapper.sh /usr/local/bin/cursor-agent
RUN chmod +x /usr/local/bin/cursor-agent

# Copy bashrc for terminal setup
COPY bashrc /tmp/bashrc

# Ensure we can access host system
RUN chmod +x /app/server.js

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/system', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application as root
CMD ["node", "server.js"]
