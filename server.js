const express = require('express');
const http = require('http');
const https = require('https');
const socketIo = require('socket.io');
const cors = require('cors');
const si = require('systeminformation');
const pty = require('node-pty');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();

// SSL Configuration
const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, 'ssl', 'key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'ssl', 'cert.pem'))
};

// Create both HTTP and HTTPS servers
const httpServer = http.createServer(app);
const httpsServer = https.createServer(sslOptions, app);

// Socket.IO configuration for both servers
const io = socketIo(httpsServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const HTTP_PORT = process.env.HTTP_PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Redirect HTTP to HTTPS (only for HTTP server)
app.use((req, res, next) => {
  if (req.secure) {
    next();
  } else {
    res.redirect(`https://${req.headers.host.replace(/:\d+$/, '')}:${HTTPS_PORT}${req.url}`);
  }
});

// Store terminal sessions
const terminals = new Map();

// Authentication configuration
const ADMIN_PASSWORD = 'admin123'; // Change this password
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');
const sessions = new Map(); // Store active sessions

// Session management
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function isValidSession(token) {
  return sessions.has(token);
}

function createSession() {
  const token = generateSessionToken();
  sessions.set(token, {
    createdAt: Date.now(),
    lastAccess: Date.now()
  });
  return token;
}

function updateSession(token) {
  if (sessions.has(token)) {
    sessions.get(token).lastAccess = Date.now();
  }
}

// Clean up expired sessions (older than 24 hours)
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now - session.lastAccess > 24 * 60 * 60 * 1000) {
      sessions.delete(token);
    }
  }
}, 60 * 60 * 1000); // Run every hour

// Authentication middleware
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  
  if (!token || !isValidSession(token)) {
    return res.status(401).json({ error: 'Unauthorized', status: 'error' });
  }
  
  updateSession(token);
  next();
}

// Routes
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ 
        error: 'Invalid password', 
        status: 'error' 
      });
    }
    
    const token = createSession();
    res.json({ 
      message: 'Login successful', 
      status: 'success',
      token: token
    });
  } catch (error) {
    res.status(500).json({ error: error.message, status: 'error' });
  }
});

app.post('/api/logout', (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token && sessions.has(token)) {
      sessions.delete(token);
    }
    res.json({ message: 'Logout successful', status: 'success' });
  } catch (error) {
    res.status(500).json({ error: error.message, status: 'error' });
  }
});

app.get('/', (req, res) => {
  // Check if user has valid session token
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  
  if (!token || !isValidSession(token)) {
    return res.redirect('/login');
  }
  
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// System information endpoints
app.get('/api/system', requireAuth, async (req, res) => {
  try {
    // Use host system paths for monitoring
    const [cpu, memory, disk, osInfo, network] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
      si.networkInterfaces()
    ]);
    
    // Override OS info to show host system
    const hostOsInfo = {
      ...osInfo,
      platform: 'linux',
      distro: 'Arch Linux',
      release: 'rolling',
      kernel: '6.17.5-arch1-1',
      arch: 'x64',
      hostname: 'srv1042867'
    };
    
    res.json({
      cpu,
      memory,
      disk,
      osInfo: hostOsInfo,
      network
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/processes', async (req, res) => {
  try {
    const processes = await si.processes();
    res.json(processes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/load', async (req, res) => {
  try {
    const [currentLoad, cpuTemperature] = await Promise.all([
      si.currentLoad(),
      si.cpuTemperature()
    ]);
    
    res.json({
      load: currentLoad,
      temperature: cpuTemperature
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Server control endpoints
app.post('/api/shutdown', requireAuth, (req, res) => {
  try {
    const { password } = req.body;
    
    // Simple password verification (you can change this password)
    const correctPassword = 'admin123';
    
    if (!password || password !== correctPassword) {
      return res.status(401).json({ 
        error: 'Invalid password', 
        status: 'error' 
      });
    }
    
    console.log('Server shutdown requested with valid password');
    res.json({ message: 'Server shutdown initiated', status: 'success' });
    
    // Execute shutdown command after response
    setTimeout(() => {
      require('child_process').exec('shutdown -h +1', (error, stdout, stderr) => {
        if (error) {
          console.error('Shutdown error:', error);
        } else {
          console.log('Shutdown command executed');
        }
      });
    }, 1000);
  } catch (error) {
    res.status(500).json({ error: error.message, status: 'error' });
  }
});

app.post('/api/reboot', requireAuth, (req, res) => {
  try {
    const { password } = req.body;
    
    // Simple password verification (you can change this password)
    const correctPassword = 'admin123';
    
    if (!password || password !== correctPassword) {
      return res.status(401).json({ 
        error: 'Invalid password', 
        status: 'error' 
      });
    }
    
    console.log('Server reboot requested with valid password');
    res.json({ message: 'Server reboot initiated', status: 'success' });
    
    // Execute reboot command after response
    setTimeout(() => {
      require('child_process').exec('shutdown -r +1', (error, stdout, stderr) => {
        if (error) {
          console.error('Reboot error:', error);
        } else {
          console.log('Reboot command executed');
        }
      });
    }, 1000);
  } catch (error) {
    res.status(500).json({ error: error.message, status: 'error' });
  }
});

// Socket.IO authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  
  if (!token || !isValidSession(token)) {
    return next(new Error('Authentication failed'));
  }
  
  updateSession(token);
  next();
});

// WebSocket connection for terminal
io.on('connection', (socket) => {
  console.log('Authenticated client connected:', socket.id);
  
  // Create new terminal session
  socket.on('terminal:create', (data) => {
    const { cols = 120, rows = 30 } = data;
    
    const terminal = pty.spawn('bash', ['--rcfile', '/tmp/bashrc'], {
      name: 'xterm-color',
      cols: cols,
      rows: rows,
      cwd: '/host/root',
      env: {
        ...process.env,
        USER: 'root',
        HOME: '/host/root',
        SHELL: '/bin/bash',
        PATH: '/host/root/.local/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin',
        HOSTNAME: 'srv1042867',
        TERM: 'xterm-256color',
        SSH_CLIENT: '127.0.0.1 22 3000',
        SSH_CONNECTION: '127.0.0.1 22 127.0.0.1 3000',
        SSH_TTY: '/dev/pts/0',
        PS1: '\\[\\033[01;32m\\]root@srv1042867\\[\\033[00m\\]:\\[\\033[01;34m\\]\\w\\[\\033[00m\\]\\$ '
      },
      uid: 0,
      gid: 0
    });
    
    terminals.set(socket.id, terminal);
    
    // Send initial commands to set up the terminal
    setTimeout(() => {
      terminal.write('cd /host/root\r');
      terminal.write('clear\r');
    }, 200);
    
    terminal.on('data', (data) => {
      socket.emit('terminal:data', data);
    });
    
    terminal.on('exit', (code) => {
      socket.emit('terminal:exit', code);
      terminals.delete(socket.id);
    });
    
    socket.emit('terminal:created');
  });
  
  // Handle terminal input
  socket.on('terminal:input', (data) => {
    const terminal = terminals.get(socket.id);
    if (terminal) {
      terminal.write(data);
    }
  });
  
  // Handle terminal resize
  socket.on('terminal:resize', (data) => {
    const terminal = terminals.get(socket.id);
    if (terminal) {
      terminal.resize(data.cols, data.rows);
    }
  });
  
  // Clean up on disconnect
  socket.on('disconnect', () => {
    const terminal = terminals.get(socket.id);
    if (terminal) {
      terminal.kill();
      terminals.delete(socket.id);
    }
    console.log('Client disconnected:', socket.id);
  });
});

// Real-time system monitoring
setInterval(async () => {
  try {
    const [currentLoad, memory, uptime] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.time()
    ]);
    
    io.emit('system:update', {
      load: currentLoad,
      memory,
      uptime: uptime.uptime
    });
  } catch (error) {
    console.error('Error updating system data:', error);
  }
}, 2000); // Update every 2 seconds

// Start both HTTP and HTTPS servers
httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`HTTP server running on http://0.0.0.0:${HTTP_PORT}`);
});

httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
  console.log(`HTTPS server running on https://0.0.0.0:${HTTPS_PORT}`);
});
