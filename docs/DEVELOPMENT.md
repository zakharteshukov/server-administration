# Development Setup

This guide explains how to run the SERVER-DASHBOARD in development mode with hot-reloading.

## Why is it slow in production mode?

The production Docker setup (`docker-compose.yml`) copies your source code into the Docker image. When you make changes to the code, you need to:
1. Stop the container
2. Rebuild the image
3. Start the container again

This process takes time because it rebuilds the entire Docker image.

## Development Mode (Hot Reload)

Development mode uses:
- **Volume mounts**: Your source code is mounted directly into the container
- **Nodemon**: Automatically restarts the server when you make changes
- **Dev dependencies**: Includes nodemon and other development tools

### Quick Start

1. **Stop the current production container:**
   ```bash
   cd projects/SERVER-DASHBOARD
   docker-compose down
   ```

2. **Start in development mode:**
   ```bash
   docker-compose -f docker-compose.dev.yml up --build
   ```

3. **Make your changes** - the server will automatically restart when you save files!

### Switching Back to Production

When you're done developing and want to deploy:

1. **Stop the development container:**
   ```bash
   docker-compose -f docker-compose.dev.yml down
   ```

2. **Start in production mode:**
   ```bash
   docker-compose up --build
   ```

## What's Different?

### Development Mode (`docker-compose.dev.yml`)
- ✅ Source code mounted as volume (changes reflect immediately)
- ✅ Nodemon auto-reloads on file changes
- ✅ Dev dependencies installed (nodemon, etc.)
- ⚠️ Slightly larger Docker image

### Production Mode (`docker-compose.yml`)
- ✅ Optimized image size
- ✅ Only production dependencies
- ⚠️ Requires rebuild for code changes

## Troubleshooting

### Changes not reflecting?

1. Check that nodemon is running:
   ```bash
   docker logs system-monitor-dev
   ```
   You should see messages like: `[nodemon] restarting due to changes...`

2. Verify the volume mount is working:
   ```bash
   docker exec system-monitor-dev ls -la /app
   ```

### Container won't start?

- Make sure you stopped the production container first:
  ```bash
  docker-compose down
  ```

### Still having issues?

Check the container logs:
```bash
docker logs system-monitor-dev
```

