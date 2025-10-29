# SERVER-DASHBOARD - Project Structure

This document explains the organization and structure of the SERVER-DASHBOARD project.

## Directory Structure

```
SERVER-DASHBOARD/
├── src/                          # Source code
│   └── server.js                 # Main server application
├── public/                       # Frontend files
│   ├── index.html               # Main dashboard interface (links styles and app script)
│   ├── styles.css               # Extracted global styles for dashboard
│   ├── app.js                   # Extracted frontend logic for dashboard
│   ├── login.html               # Login page
│   ├── terminal-fullscreen.html # Terminal interface
│   ├── favicon.jpg              # Application icon
│   └── macbook.code-workspace   # Editor configuration
├── config/                       # Configuration files
│   └── bashrc                   # Bash configuration for terminal
├── scripts/                      # Utility scripts
│   ├── host-wrapper.sh         # Host system command wrapper
│   └── cursor-agent-wrapper.sh # Cursor agent wrapper
├── docs/                         # Documentation
│   ├── DEVELOPMENT.md          # Development guide
│   ├── PROJECT_STRUCTURE.md    # This file
│   └── instructions.txt        # Quick reference
├── ssl/                          # SSL certificates (gitignored)
├── Dockerfile                    # Production Docker configuration
├── Dockerfile.dev               # Development Docker configuration
├── docker-compose.yml           # Production docker-compose
├── docker-compose.dev.yml       # Development docker-compose
├── package.json                 # NPM configuration
├── README.md                    # Main documentation
└── .gitignore                   # Git ignore rules
```

## Directory Descriptions

### `src/`
Contains the main application source code:
- **server.js**: The main Node.js Express server with all API endpoints, authentication, WebSocket handling, and system monitoring logic

### `public/`
Frontend files served to users:
- **index.html**: Main dashboard interface with system monitoring
- **login.html**: Authentication page
- **terminal-fullscreen.html**: Terminal interface
- **favicon.jpg**: Application icon

### `config/`
Configuration files used by the application:
- **bashrc**: Custom bash configuration for terminal sessions within the container

### `scripts/`
Utility scripts for system access:
- **host-wrapper.sh**: Allows execution of host system commands from within the container
- **cursor-agent-wrapper.sh**: Wrapper for cursor agent to work from container context

### `docs/`
Documentation and guides:
- **DEVELOPMENT.md**: Development setup and hot-reload instructions
- **PROJECT_STRUCTURE.md**: This file
- **instructions.txt**: Quick reference for development workflow

## Key Files

### Docker Configuration
- **Dockerfile**: Production build - optimizes image size
- **Dockerfile.dev**: Development build - includes dev dependencies and volume mounts
- **docker-compose.yml**: Production deployment
- **docker-compose.dev.yml**: Development mode with hot-reload

### Configuration
- **package.json**: NPM dependencies and scripts
- **.gitignore**: Files to exclude from git

## Development Workflow

1. **Production Mode**: Uses optimized Docker image
   ```bash
   docker-compose up --build
   ```

2. **Development Mode**: Hot-reload enabled
   ```bash
   docker-compose -f docker-compose.dev.yml up --build
   ```

## File Paths

When making changes, note these important path relationships:

- **Server code** is in `src/server.js`
- **Public files** are served from `public/`
- **Docker copies** from `scripts/` and `config/` to container paths
- **Documentation** references are updated to use `docs/` prefix

## Notes

- The application runs in a privileged Docker container to access host system resources
- SSL certificates are stored in `ssl/` directory (gitignored)
- Session data is stored in `sessions.json` at the project root (gitignored)
- All configuration files that are copied into the Docker image are in organized directories for easier maintenance


