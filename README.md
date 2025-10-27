# System Monitor Web Application

A comprehensive system monitoring web application with an embedded terminal, built with Node.js and Docker.

## Features

- **Real-time System Monitoring**: CPU, Memory, Disk usage
- **Process Monitoring**: Top processes with CPU usage
- **Embedded Terminal**: Full terminal access via web interface
- **Modern UI**: Responsive design with real-time updates
- **Docker Support**: Easy deployment with Docker Compose

## Quick Start

### Using Docker (Recommended)

**Production Mode:**
```bash
docker-compose up --build
```

**Development Mode** (with hot-reload):
```bash
# Stop any running containers first
docker-compose down

# Start in development mode
docker-compose -f docker-compose.dev.yml up --build
```

For more details, see [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)

### Manual Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the application:**
   ```bash
   # Production mode
   npm start

   # Development mode with hot-reload
   npm run dev
   ```

3. **Access the application:**
   Open your browser and go to `http://localhost:3000`

## API Endpoints

- `GET /api/system` - Complete system information
- `GET /api/processes` - Running processes
- `GET /api/load` - CPU load and temperature

## WebSocket Events

- `terminal:create` - Create new terminal session
- `terminal:input` - Send input to terminal
- `terminal:resize` - Resize terminal
- `system:update` - Real-time system updates

## Security Notes

- The application runs with privileged access to monitor system resources
- Terminal access provides full system control - use with caution
- Consider firewall rules for production deployments

## Requirements

- Docker and Docker Compose
- Node.js 18+ (for manual installation)
- Linux system (for system monitoring features)

## License

MIT License
