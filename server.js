const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const si = require('systeminformation');
const pty = require('node-pty');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();

// Create HTTP server only (nginx handles SSL termination)
const httpServer = http.createServer(app);

// Socket.IO configuration
const io = socketIo(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const HTTP_PORT = process.env.HTTP_PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// No redirect needed - nginx handles HTTPS termination

// Store terminal sessions
const terminals = new Map();

// Authentication configuration
const ADMIN_PASSWORD = 'admin123'; // Change this password
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');

// Load sessions from file on startup
const sessions = new Map();
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');

try {
  if (fs.existsSync(SESSIONS_FILE)) {
    const data = fs.readFileSync(SESSIONS_FILE, 'utf8');
    const sessionsData = JSON.parse(data);
    const now = Date.now();
    for (const [token, session] of Object.entries(sessionsData)) {
      // Only load sessions less than 30 days old
      if (now - session.lastAccess < 30 * 24 * 60 * 60 * 1000) {
        sessions.set(token, session);
      }
    }
    console.log(`Loaded ${sessions.size} sessions from file`);
  }
} catch (err) {
  console.error('Error loading sessions:', err);
}

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
  saveSessions(); // Save to disk
  return token;
}

// Save sessions to file
function saveSessions() {
  try {
    const sessionsObj = {};
    sessions.forEach((value, key) => {
      sessionsObj[key] = value;
    });
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessionsObj, null, 2));
  } catch (err) {
    console.error('Error saving sessions:', err);
  }
}

function updateSession(token) {
  if (sessions.has(token)) {
    sessions.get(token).lastAccess = Date.now();
    saveSessions(); // Save to disk
  }
}

// Clean up expired sessions (older than 30 days)
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now - session.lastAccess > 30 * 24 * 60 * 60 * 1000) {
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

app.get('/terminal-fullscreen', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terminal-fullscreen.html'));
});

// Docker containers endpoint
app.get('/api/docker', requireAuth, async (req, res) => {
  try {
    const { exec } = require('child_process');
    
    // Get Docker containers with detailed information
    const dockerContainers = await new Promise((resolve, reject) => {
      exec('docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.CreatedAt}}"', (error, stdout, stderr) => {
        if (error) {
          console.error('Docker command error:', error);
          resolve([]);
          return;
        }
        
        const containers = stdout.trim().split('\n').filter(line => line.trim()).map(line => {
          const [id, name, image, status, ports, createdAt] = line.split('|');
          return {
            id: id.substring(0, 12), // Short ID
            name: name,
            image: image,
            status: status,
            ports: ports || 'No ports',
            createdAt: createdAt,
            uptime: calculateUptime(status, createdAt)
          };
        });
        
        resolve(containers);
      });
    });
    
    // Get Docker images
    const dockerImages = await new Promise((resolve, reject) => {
      exec('docker images --format "{{.Repository}}|{{.Tag}}|{{.ID}}|{{.CreatedAt}}|{{.Size}}"', (error, stdout, stderr) => {
        if (error) {
          console.error('Docker images error:', error);
          resolve([]);
          return;
        }
        
        const images = stdout.trim().split('\n').filter(line => line.trim()).map(line => {
          const [repository, tag, id, createdAt, size] = line.split('|');
          return {
            repository: repository,
            tag: tag,
            id: id.substring(0, 12),
            createdAt: createdAt,
            size: size
          };
        });
        
        resolve(images);
      });
    });
    
    res.json({
      containers: dockerContainers,
      images: dockerImages,
      totalContainers: dockerContainers.length,
      runningContainers: dockerContainers.filter(c => c.status.includes('Up')).length,
      stoppedContainers: dockerContainers.filter(c => c.status.includes('Exited')).length
    });
  } catch (error) {
    console.error('Docker API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Docker container control endpoints
app.post('/api/docker/start', requireAuth, async (req, res) => {
  try {
    const { container, password } = req.body;
    
    // Verify password
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    
    if (!container) {
      return res.status(400).json({ error: 'Container name is required' });
    }
    
    const { exec } = require('child_process');
    
    // Start the container
    exec(`docker start ${container}`, (error, stdout, stderr) => {
      if (error) {
        console.error('Docker start error:', error);
        return res.status(500).json({ error: `Failed to start container: ${error.message}` });
      }
      
      res.json({ 
        status: 'success', 
        message: `Container '${container}' started successfully`,
        output: stdout 
      });
    });
    
  } catch (error) {
    console.error('Docker start API error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/docker/stop', requireAuth, async (req, res) => {
  try {
    const { container, password } = req.body;
    
    // Verify password
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    
    if (!container) {
      return res.status(400).json({ error: 'Container name is required' });
    }
    
    const { exec } = require('child_process');
    
    // Stop the container
    exec(`docker stop ${container}`, (error, stdout, stderr) => {
      if (error) {
        console.error('Docker stop error:', error);
        return res.status(500).json({ error: `Failed to stop container: ${error.message}` });
      }
      
      res.json({ 
        status: 'success', 
        message: `Container '${container}' stopped successfully`,
        output: stdout 
      });
    });
    
  } catch (error) {
    console.error('Docker stop API error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/docker/restart', requireAuth, async (req, res) => {
  try {
    const { container, password } = req.body;
    
    // Verify password
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    
    if (!container) {
      return res.status(400).json({ error: 'Container name is required' });
    }
    
    const { exec } = require('child_process');
    
    // Restart the container
    exec(`docker restart ${container}`, (error, stdout, stderr) => {
      if (error) {
        console.error('Docker restart error:', error);
        return res.status(500).json({ error: `Failed to restart container: ${error.message}` });
      }
      
      res.json({ 
        status: 'success', 
        message: `Container '${container}' restarted successfully`,
        output: stdout 
      });
    });
    
  } catch (error) {
    console.error('Docker restart API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// System services endpoint
app.get('/api/services', requireAuth, async (req, res) => {
  try {
    const { exec } = require('child_process');
    
    // Get system services using chroot to access host systemctl
    const services = await new Promise((resolve, reject) => {
      exec('chroot /host systemctl list-units --type=service --state=active,inactive,failed', (error, stdout, stderr) => {
        if (error) {
          console.error('Systemctl command error:', error);
          resolve([]);
          return;
        }
        
        const serviceList = stdout.trim().split('\n').filter(line => line.trim() && !line.includes('UNIT') && !line.includes('LOAD')).map(line => {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 4) {
            const unit = parts[0];
            const load = parts[1];
            const active = parts[2];
            const sub = parts[3];
            const description = parts.slice(4).join(' ') || 'No description';
            
            return {
              name: unit,
              load: load,
              active: active,
              sub: sub,
              description: description,
              status: getServiceStatus(active, sub),
              uptime: getServiceUptime(active)
            };
          }
          return null;
        }).filter(service => service !== null);
        
        resolve(serviceList);
      });
    });
    
    // Filter out systemd services and focus on user services
    const filteredServices = services.filter(service => 
      !service.name.includes('systemd') && 
      !service.name.includes('dbus') &&
      !service.name.includes('getty') &&
      service.name.length > 0
    );
    
    res.json({
      services: filteredServices,
      totalServices: filteredServices.length,
      activeServices: filteredServices.filter(s => s.status === 'active').length,
      inactiveServices: filteredServices.filter(s => s.status === 'inactive').length,
      failedServices: filteredServices.filter(s => s.status === 'failed').length
    });
  } catch (error) {
    console.error('Services API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to determine service status
function getServiceStatus(active, sub) {
  if (active === 'active' && sub === 'running') {
    return 'active';
  } else if (active === 'inactive') {
    return 'inactive';
  } else if (active === 'failed') {
    return 'failed';
  } else {
    return 'inactive';
  }
}

// Helper function to get service uptime
function getServiceUptime(active) {
  if (active.includes('active')) {
    // Extract uptime from active status (e.g., "active (running) since Mon 2025-10-26 12:00:00 UTC; 1h 30min ago")
    const uptimeMatch = active.match(/since.*?; (.*?) ago/);
    if (uptimeMatch) {
      return uptimeMatch[1];
    }
    return 'Running';
  } else {
    return 'Inactive';
  }
}

// System services control endpoints
app.post('/api/services/start', requireAuth, async (req, res) => {
  try {
    const { service, password } = req.body;
    
    // Verify password
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid password', status: 'error' });
    }
    
    if (!service) {
      return res.status(400).json({ error: 'Service name is required', status: 'error' });
    }
    
    const { exec } = require('child_process');
    
    // Start the service
    exec(`chroot /host systemctl start ${service}`, (error, stdout, stderr) => {
      if (error) {
        console.error('Service start error:', error);
        return res.status(500).json({ 
          status: 'error',
          error: `Failed to start service: ${error.message}` 
        });
      }
      
      res.json({ 
        status: 'success', 
        message: `Service '${service}' started successfully`,
        output: stdout 
      });
    });
    
  } catch (error) {
    console.error('Service start API error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

app.post('/api/services/stop', requireAuth, async (req, res) => {
  try {
    const { service, password } = req.body;
    
    // Verify password
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid password', status: 'error' });
    }
    
    if (!service) {
      return res.status(400).json({ error: 'Service name is required', status: 'error' });
    }
    
    const { exec } = require('child_process');
    
    // Stop the service
    exec(`chroot /host systemctl stop ${service}`, (error, stdout, stderr) => {
      if (error) {
        console.error('Service stop error:', error);
        return res.status(500).json({ 
          status: 'error',
          error: `Failed to stop service: ${error.message}` 
        });
      }
      
      res.json({ 
        status: 'success', 
        message: `Service '${service}' stopped successfully`,
        output: stdout 
      });
    });
    
  } catch (error) {
    console.error('Service stop API error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

app.post('/api/services/restart', requireAuth, async (req, res) => {
  try {
    const { service, password } = req.body;
    
    // Verify password
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid password', status: 'error' });
    }
    
    if (!service) {
      return res.status(400).json({ error: 'Service name is required', status: 'error' });
    }
    
    const { exec } = require('child_process');
    
    // Restart the service
    exec(`chroot /host systemctl restart ${service}`, (error, stdout, stderr) => {
      if (error) {
        console.error('Service restart error:', error);
        return res.status(500).json({ 
          status: 'error',
          error: `Failed to restart service: ${error.message}` 
        });
      }
      
      res.json({ 
        status: 'success', 
        message: `Service '${service}' restarted successfully`,
        output: stdout 
      });
    });
    
  } catch (error) {
    console.error('Service restart API error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// Helper function to calculate uptime
function calculateUptime(status, createdAt) {
  if (status.includes('Up')) {
    // Extract uptime from status (e.g., "Up 2 hours", "Up 3 days")
    const uptimeMatch = status.match(/Up (.*)/);
    if (uptimeMatch) {
      return uptimeMatch[1];
    }
    return 'Running';
  } else if (status.includes('Exited')) {
    return 'Inactive';
  } else {
    return 'Unknown';
  }
}

// Custom function to read host memory
async function getHostMemory() {
  try {
    const meminfo = fs.readFileSync('/host/proc/meminfo', 'utf8');
    const parseMeminfo = (str) => {
      const data = {};
      str.split('\n').forEach(line => {
        // Match lines like "MemTotal:       16369768 kB"
        const match = line.match(/^(\w+):\s+(\d+)\s+kB$/);
        if (match) {
          data[match[1]] = parseInt(match[2]) * 1024;
        }
      });
      return data;
    };
    
    const mem = parseMeminfo(meminfo);
    
    // Calculate actual used memory (exclude cached and buffers from used)
    const usedMem = mem.MemTotal - mem.MemFree - mem.Cached - mem.Buffers;
    const availableMem = mem.MemAvailable || (mem.MemFree + mem.Cached);
    
    return {
      total: mem.MemTotal,
      free: mem.MemFree,
      used: usedMem,
      active: mem.Active,
      buffers: mem.Buffers,
      cached: mem.Cached,
      available: availableMem,
      swaptotal: mem.SwapTotal,
      swapused: mem.SwapUsed || 0,
      swapfree: mem.SwapFree || mem.SwapTotal
    };
  } catch (error) {
    console.error('Error reading host memory:', error);
    // Fallback to regular si.mem()
    return await si.mem();
  }
}

// Custom function to read host CPU load
async function getHostLoad() {
  try {
    const loadavg = fs.readFileSync('/host/proc/loadavg', 'utf8');
    const parts = loadavg.trim().split(/\s+/);
    const cpuCount = parseInt(fs.readFileSync('/host/proc/cpuinfo', 'utf8').split('\n')
      .filter(line => line.startsWith('processor')).length);
    
    return {
      currentload: parseFloat(parts[0]) / cpuCount * 100,
      currentload_user: parseFloat(parts[0]),
      currentload_system: 0,
      currentload_nice: 0,
      currentload_idle: 0,
      currentload_iowait: 0,
      currentload_irq: 0,
      currentload_softirq: 0,
      cpus: Array(cpuCount).fill(null).map(() => ({
        load: parseFloat(parts[0]) / cpuCount * 100,
        load_user: parseFloat(parts[0]) / cpuCount,
        load_system: 0,
        load_nice: 0,
        load_idle: 0,
        load_iowait: 0,
        load_irq: 0,
        load_softirq: 0
      }))
    };
  } catch (error) {
    // Fallback to regular si.currentLoad()
    return await si.currentLoad();
  }
}

// Custom function to read host disk usage
async function getHostDisk() {
  try {
    const dfOutput = await new Promise((resolve, reject) => {
      require('child_process').exec('df -T /host 2>/dev/null || df -T /', (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });
    
    const diskInfo = dfOutput.trim().split('\n').slice(1).map(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 7) return null;
      return {
        fs: parts[0],
        type: parts[1],
        size: parseInt(parts[2]) * 1024,
        used: parseInt(parts[3]) * 1024,
        available: parseInt(parts[4]) * 1024,
        use: parseFloat(parts[5].replace('%', '')),
        mount: parts[6]
      };
    }).filter(fs => fs !== null && !fs.mount.includes('/var/lib/docker/overlay2') && !fs.type.includes('overlay'));
    
    // Get root filesystem info - prioritize /host mount
    const rootFs = diskInfo.find(fs => fs.mount === '/host') || 
                   diskInfo.find(fs => fs.mount === '/') ||
                   diskInfo[0];
    
    // Return the most relevant disk info
    return rootFs ? [rootFs] : diskInfo;
  } catch (error) {
    console.error('Error reading host disk:', error);
    // Fallback to regular si.fsSize()
    return await si.fsSize();
  }
}

// System information endpoints
app.get('/api/system', requireAuth, async (req, res) => {
  try {
    // Use host system paths for monitoring
    const [cpu, memory, disk, osInfo, network] = await Promise.all([
      si.cpu(),
      getHostMemory(),
      getHostDisk(),
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
      getHostLoad(),
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

// File Manager endpoints
app.get('/api/files', requireAuth, (req, res) => {
  try {
    const { path: dirPath = '/host/root' } = req.query;
    const { exec } = require('child_process');
    
    exec(`ls -lah ${dirPath}`, (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({ error: `Failed to list directory: ${error.message}` });
      }
      
      const lines = stdout.trim().split('\n').slice(1); // Skip header
      const files = lines.map(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 9) return null;
        
        const permissions = parts[0];
        const links = parts[1];
        const owner = parts[2];
        const group = parts[3];
        const size = parts[4];
        const date = parts[5];
        const time = parts[6];
        const name = parts.slice(8).join(' ');
        const isDir = permissions.startsWith('d');
        const isSymlink = permissions.includes('l');
        
        return {
          name,
          type: isDir ? 'directory' : (isSymlink ? 'symlink' : 'file'),
          permissions,
          size,
          owner,
          group,
          modified: `${date} ${time}`,
          path: `${dirPath}/${name}`.replace('//', '/')
        };
      }).filter(item => item !== null);
      
      res.json({ files, path: dirPath });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/files/download', requireAuth, (req, res) => {
  try {
    const { filePath } = req.query;
    const file = path.resolve('/host', filePath);
    
    if (!file.startsWith('/host')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(file)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    if (!fs.statSync(file).isFile()) {
      return res.status(400).json({ error: 'Not a file' });
    }
    
    res.download(file);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Security Dashboard endpoints
app.get('/api/security/ssh', requireAuth, async (req, res) => {
  try {
    const { exec } = require('child_process');
    
    exec('chroot /host who', (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      
      const sessions = stdout.trim().split('\n').filter(line => line.trim()).map(line => {
        // Parse different who output formats
        line = line.trim();
        
        // Format: "user + tty date time idle ip"
        if (line.includes('(') && line.includes(')')) {
          const match = line.match(/^(\S+)\s+[\+\-]?\s*(\S+)\s+(.+?)\s+(.+?)\s+\((.+)\)$/);
          if (match) {
            return {
              user: match[1],
              tty: match[2],
              loginDate: match[3],
              loginTime: match[4],
              idleTime: '00:00',
              ip: match[5],
              sessionDuration: calculateSessionDuration(match[3], match[4])
            };
          }
        }
        
        // Format: "user tty date time ip"
        const match = line.match(/^(\S+)\s+([^\s]+)\s+(\S+ \S+)\s+(\d{1,2}:\d{2})\s+\((.+)\)$/);
        if (match) {
          return {
            user: match[1],
            tty: match[2],
            loginDate: match[3],
            loginTime: match[4],
            idleTime: '00:00',
            ip: match[6],
            sessionDuration: calculateSessionDuration(match[3], match[4])
          };
        }
        
        // Fallback
        const parts = line.trim().split(/\s+/);
        return {
          user: parts[0] || 'unknown',
          tty: parts[1] || 'unknown',
          loginDate: parts[2] || '',
          loginTime: parts[3] || '',
          idleTime: parts[4] || '00:00',
          ip: parts[parts.length - 1]?.replace(/[()]/g, '') || 'localhost',
          sessionDuration: 'unknown'
        };
      }).filter(s => s.user && s.tty && s.tty.includes('pts'));
      
      res.json({ sessions, total: sessions.length });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function calculateSessionDuration(dateStr, timeStr) {
  try {
    const now = new Date();
    const date = new Date(dateStr + ' ' + timeStr);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
  } catch (e) {
    return 'unknown';
  }
}

app.get('/api/security/openvpn', requireAuth, async (req, res) => {
  try {
    const { exec } = require('child_process');
    
    // Read OpenVPN status file
    exec('docker exec openvpn-server cat /tmp/openvpn-status.log 2>/dev/null', (statusError, statusOut, statusErr) => {
      if (!statusError && statusOut) {
        const lines = statusOut.trim().split('\n');
        const clients = [];
        let inClientSection = false;
        
        // Parse clients from status file
        const clientList = [];
        lines.forEach(line => {
          if (line.includes('CLIENT LIST')) {
            inClientSection = true;
            return;
          }
          if (line.includes('ROUTING TABLE')) {
            inClientSection = false;
            return;
          }
          if (inClientSection && line && !line.includes('Updated,') && !line.includes('Common Name')) {
            const [name, address, bytesReceived, bytesSent, connectedSince] = line.split(',');
            if (name && address) {
              clientList.push({
                name: name.trim(),
                address: address.trim(),
                realIP: address.trim().split(':')[0]
              });
            }
          }
        });
        
        // For each client in the list, verify they are actually connected
        // by checking if their IP appears in the routing table or ARP
        let verifiedClients = [];
        let processedCount = 0;
        let hasResponded = false; // Prevent multiple responses
        
        if (clientList.length === 0) {
          return res.json({ clients: [], total: 0 });
        }
        
        clientList.forEach((clientInfo) => {
          // Get the original line data from the status file
          const originalLine = lines.find(l => l.includes(clientInfo.name) && l.includes(clientInfo.address));
          if (!originalLine) return;
          
          const parts = originalLine.split(',');
          const received = parseInt(parts[2]) || 0;
          const sent = parseInt(parts[3]) || 0;
          const connectedSince = parts[4] || '';
          
          // Calculate connection duration
          let duration = 'unknown';
          if (connectedSince) {
            try {
              const connectDate = new Date(connectedSince);
              const now = new Date();
              const diffMs = now - connectDate;
              const diffMins = Math.floor(diffMs / 60000);
              const hours = Math.floor(diffMins / 60);
              const mins = diffMins % 60;
              duration = `${hours}h ${mins}m`;
            } catch (e) {}
          }
          
          // Check if "Last Ref" timestamp is recent (within last 2 minutes)
          // This indicates the client is actively using the connection
          const routingLine = lines.find(l => l.includes('ROUTING TABLE') || (l.includes(clientInfo.name) && l.includes(clientInfo.realIP))) || '';
          let isActive = true;
          
          if (routingLine.includes('Last Ref')) {
            try {
              const lastRefMatch = routingLine.match(/Last Ref:?\s*(\w+ \w+ \d+ \d+:\d+:\d+ \d+)/);
              if (lastRefMatch) {
                const lastRefDate = new Date(lastRefMatch[1]);
                const now = new Date();
                const diffMs = now - lastRefDate;
                const diffMinutes = diffMs / 60000;
                
                // If last activity was more than 2 minutes ago, consider inactive
                if (diffMinutes > 2) {
                  isActive = false;
                  console.log(`Client ${clientInfo.name} appears inactive (last activity ${Math.floor(diffMinutes)} minutes ago)`);
                }
              }
            } catch (e) {
              // If we can't parse, assume active
            }
          }
          
          processedCount++;
          
          if (isActive) {
            verifiedClients.push({
              clientName: clientInfo.name,
              ip: clientInfo.realIP,
              port: clientInfo.address.split(':')[1] || '',
              bytesReceived: received,
              bytesSent: sent,
              dataIn: received,
              dataOut: sent,
              connectedSince: connectedSince,
              duration: duration
            });
          }
          
          // When all clients have been processed, return the results
          if (processedCount === clientList.length && !hasResponded) {
            hasResponded = true;
            console.log(`OpenVPN clients: ${verifiedClients.length} active out of ${clientList.length} listed`);
            return res.json({ clients: verifiedClients, total: verifiedClients.length });
          }
        });
        
        // Set a timeout to return results even if verification takes too long
        setTimeout(() => {
          if (!hasResponded && verifiedClients.length > 0) {
            hasResponded = true;
            console.log(`Timeout: Returning ${verifiedClients.length} verified OpenVPN clients`);
            return res.json({ clients: verifiedClients, total: verifiedClients.length });
          }
        }, 2000);
      } else {
        // Fallback to process check
        exec('chroot /host ps aux | grep openvpn | grep -v grep', (error, stdout, stderr) => {
          if (error && error.code !== 1) {
            return res.status(500).json({ error: error.message });
          }
          
          const processes = stdout.trim().split('\n').filter(line => line.trim()).map(line => {
            const parts = line.trim().split(/\s+/);
            return {
              user: parts[0],
              pid: parts[1],
              cpu: parts[2],
              mem: parts[3]
            };
          });
          
          res.json({ clients: [], processes, total: processes.length });
        });
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/security/connections', requireAuth, async (req, res) => {
  try {
    const { exec } = require('child_process');
    
    // Function to get process description based on process name and port
    function getProcessDescription(processInfo, localAddr) {
      const port = localAddr.split(':')[1] || '';
      
      // Extract process name from users:((process_name...
      const procMatch = processInfo.match(/\("([^"]+)"/);
      const processName = procMatch ? procMatch[1] : '';
      
      // Process-specific descriptions
      if (processName.includes('sshd')) return 'SSH Server';
      if (processName.includes('smbd')) return 'Samba File Sharing';
      if (processName.includes('nmbd')) return 'Samba Name Service';
      if (processName.includes('node')) {
        if (port === '3443' || port === '3000' || port === '3001' || port === '3002') return 'System Monitor Server';
        return 'Node.js Application';
      }
      if (processName.includes('nginx')) return 'Web Server';
      if (processName.includes('apache')) return 'Web Server';
      if (processName.includes('docker')) return 'Docker Engine';
      if (processName.includes('postgres')) return 'PostgreSQL Database';
      if (processName.includes('mysql')) return 'MySQL Database';
      if (processName.includes('redis')) return 'Redis Cache';
      
      // Port-based descriptions for unknown processes
      if (port === '22') return 'SSH Server';
      if (port === '80') return 'HTTP Web Server';
      if (port === '443') return 'HTTPS Web Server';
      if (port === '3306') return 'MySQL Database';
      if (port === '5432') return 'PostgreSQL Database';
      if (port === '6379') return 'Redis';
      if (port === '445') return 'SMB File Sharing';
      
      return processName || 'Unknown Process';
    }
    
    exec('chroot /host ss -tnp | grep -E "ESTAB|LISTEN"', (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      
      const connections = stdout.trim().split('\n').filter(line => line.trim()).map(line => {
        const parts = line.trim().split(/\s+/);
        const processInfo = parts.slice(5).join(' ');
        return {
          state: parts[0],
          local: parts[3],
          peer: parts[4] || '',
          process: processInfo,
          description: getProcessDescription(processInfo, parts[3])
        };
      });
      
      res.json({ connections, total: connections.length });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Terminate SSH session endpoint
app.post('/api/security/ssh/terminate', requireAuth, (req, res) => {
  try {
    const { user, tty, password } = req.body;
    
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid password', status: 'error' });
    }
    
    if (!user || !tty) {
      return res.status(400).json({ error: 'User and TTY are required', status: 'error' });
    }
    
    const { exec } = require('child_process');
    
    // Kill the SSH session by TTY
    exec(`chroot /host pkill -9 -t ${tty}`, (error, stdout, stderr) => {
      if (error) {
        console.error('Error terminating SSH session:', error);
        return res.status(500).json({ error: error.message, status: 'error' });
      }
      
      res.json({ status: 'success', message: 'SSH session terminated successfully' });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Terminate OpenVPN client endpoint - REMOVED
// The front-end button remains but this endpoint has been disabled

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
  
  // Track socket's terminals
  const socketTerminals = new Map();
  
  // Create new terminal session
  socket.on('terminal:create', (data) => {
    const { cols = 120, rows = 30, tabId, sessionId } = data;
    
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
    
    const terminalId = `${socket.id}-${tabId || sessionId || Date.now()}`;
    terminals.set(terminalId, terminal);
    socketTerminals.set(tabId || sessionId, terminalId);
    
    // Send initial commands to set up the terminal
    setTimeout(() => {
      terminal.write('cd /host/root\r');
      terminal.write('clear\r');
    }, 200);
    
    terminal.on('data', (data) => {
      socket.emit('terminal:data', { data, tabId, sessionId });
    });
    
    terminal.on('exit', (code) => {
      socket.emit('terminal:exit', { code, tabId, sessionId });
      terminals.delete(terminalId);
      if (tabId) socketTerminals.delete(tabId);
      if (sessionId) socketTerminals.delete(sessionId);
    });
    
    socket.emit('terminal:created', { tabId, sessionId, backendId: terminalId });
  });
  
  // Handle terminal input
  socket.on('terminal:input', (data) => {
    const { data: inputData, tabId, sessionId } = data;
    const terminalId = socketTerminals.get(tabId || sessionId);
    if (terminalId) {
      const terminal = terminals.get(terminalId);
      if (terminal) {
        terminal.write(inputData);
      }
    }
  });
  
  // Handle terminal resize
  socket.on('terminal:resize', (data) => {
    const { cols, rows, tabId, sessionId } = data;
    const terminalId = socketTerminals.get(tabId || sessionId);
    if (terminalId) {
      const terminal = terminals.get(terminalId);
      if (terminal) {
        terminal.resize(cols, rows);
      }
    }
  });
  
  // Clean up on disconnect
  socket.on('disconnect', () => {
    socketTerminals.forEach((terminalId) => {
      const terminal = terminals.get(terminalId);
      if (terminal) {
        terminal.kill();
        terminals.delete(terminalId);
      }
    });
    console.log('Client disconnected:', socket.id);
  });
});

// Real-time system monitoring
setInterval(async () => {
  try {
    const [currentLoad, memory, uptime] = await Promise.all([
      getHostLoad(),
      getHostMemory(),
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

// Start HTTP server (nginx handles SSL termination)
httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`HTTP server running on http://0.0.0.0:${HTTP_PORT}`);
});
