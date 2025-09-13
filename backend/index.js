const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } 
});

const PORT = process.env.PORT || 3000;

// Configuración - Canvas 1920x951
const CANVAS_WIDTH = 3840;
const CANVAS_HEIGHT = 1902;
const COOLDOWN_TIME = 5000; // 5 segundos
const SAVE_INTERVAL = 30000; // Guardar cada 30 segundos
const DATA_FILE = path.join(__dirname, 'canvas_data.json');

// Lienzo
let canvas = Array(CANVAS_HEIGHT).fill().map(() => Array(CANVAS_WIDTH).fill(null));

// Estadísticas
let stats = {
  totalPixels: 0,
  startTime: Date.now(),
  userCount: 0,
  pixelHistory: []
};

// Cooldown y usuarios
let lastAction = {};
let connectedUsers = new Set();

// Cargar datos guardados
function loadCanvasData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      canvas = data.canvas || canvas;
      stats = { ...stats, ...data.stats };
      console.log("Canvas cargado desde archivo");
    }
  } catch (error) {
    console.error("Error cargando datos:", error);
  }
}

// Guardar datos
function saveCanvasData() {
  try {
    const data = {
      canvas,
      stats: {
        totalPixels: stats.totalPixels,
        startTime: stats.startTime,
        pixelHistory: stats.pixelHistory.slice(-1000) // Solo últimos 1000 píxeles
      },
      timestamp: Date.now()
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log("Canvas guardado");
  } catch (error) {
    console.error("Error guardando datos:", error);
  }
}

// Validar color
function isValidColor(color) {
  const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  return hexColorRegex.test(color);
}

// Obtener estadísticas en tiempo real
function getStats() {
  const uptime = Date.now() - stats.startTime;
  const hours = Math.floor(uptime / (1000 * 60 * 60));
  const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((uptime % (1000 * 60)) / 1000);
  
  return {
    ...stats,
    userCount: connectedUsers.size,
    uptime: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  };
}

// Broadcast estadísticas
function broadcastStats() {
  const currentStats = getStats();
  io.emit("stats_update", currentStats);
  io.emit("user_count", currentStats.userCount);
  io.emit("pixel_count", currentStats.totalPixels);
}

// Eventos del socket
io.on("connection", (socket) => {
  console.log(`Usuario conectado: ${socket.id}`);
  connectedUsers.add(socket.id);
  
  // Enviar datos iniciales
  socket.emit("init", canvas);
  broadcastStats();

  // Colocar píxel
  socket.on("place_pixel", ({ x, y, color }) => {
    const now = Date.now();
    
    // Validar cooldown
    if (lastAction[socket.id] && now - lastAction[socket.id] < COOLDOWN_TIME) {
      const remaining = Math.ceil((COOLDOWN_TIME - (now - lastAction[socket.id])) / 1000);
      socket.emit("error", `Espera ${remaining} segundos antes de colocar otro píxel`);
      return;
    }

    // Validar coordenadas
    if (x < 0 || x >= CANVAS_WIDTH || y < 0 || y >= CANVAS_HEIGHT) {
      socket.emit("error", "Coordenadas inválidas");
      return;
    }

    // Validar color
    if (!isValidColor(color)) {
      socket.emit("error", "Color inválido");
      return;
    }

    // Colocar píxel
    const oldColor = canvas[y][x];
    canvas[y][x] = color;
    lastAction[socket.id] = now;
    
    // Actualizar estadísticas
    stats.totalPixels++;
    stats.pixelHistory.push({
      x, y, color, oldColor,
      userId: socket.id,
      timestamp: now
    });

    // Enviar actualización a todos los clientes
    io.emit("update_pixel", { 
      x, y, color, 
      userId: socket.id,
      timestamp: now 
    });

    // Broadcast estadísticas actualizadas
    broadcastStats();

    console.log(`Píxel colocado: (${x}, ${y}) por ${socket.id}`);
  });

  // Solicitar estadísticas
  socket.on("get_stats", () => {
    socket.emit("stats_update", getStats());
  });

  // Solicitar historial reciente
  socket.on("get_recent_pixels", () => {
    const recent = stats.pixelHistory.slice(-50); // Últimos 50 píxeles
    socket.emit("recent_pixels", recent);
  });

  // Desconexión
  socket.on("disconnect", () => {
    console.log(`Usuario desconectado: ${socket.id}`);
    connectedUsers.delete(socket.id);
    delete lastAction[socket.id];
    broadcastStats();
  });

  // Heartbeat para mantener conexión activa
  socket.on("ping", () => {
    socket.emit("pong");
  });
});

// Middleware para servir archivos estáticos
app.use(express.static(path.join(__dirname, '../frontend')));

// Ruta para estadísticas (API REST)
app.get('/api/stats', (req, res) => {
  res.json(getStats());
});

// Ruta para obtener el canvas completo
app.get('/api/canvas', (req, res) => {
  res.json({ canvas, width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
});

// Ruta para obtener píxeles recientes
app.get('/api/recent', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(stats.pixelHistory.slice(-limit));
});

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Inicialización
function initializeServer() {
  loadCanvasData();
  
  // Guardar datos periódicamente
  setInterval(saveCanvasData, SAVE_INTERVAL);
  
  // Broadcast estadísticas cada 5 segundos
  setInterval(broadcastStats, 5000);
  
  // Limpiar historial antiguo cada hora
  setInterval(() => {
    if (stats.pixelHistory.length > 5000) {
      stats.pixelHistory = stats.pixelHistory.slice(-2000);
    }
  }, 3600000);

  server.listen(PORT, () => {
    console.log(`🎨 r/place servidor iniciado en puerto ${PORT}`);
    console.log(`📊 Canvas: ${CANVAS_WIDTH}x${CANVAS_HEIGHT} píxeles`);
    console.log(`⏰ Cooldown: ${COOLDOWN_TIME/1000}s`);
    console.log(`💾 Guardado automático cada ${SAVE_INTERVAL/1000}s`);
  });
}

// Manejar cierre graceful
process.on('SIGINT', () => {
  console.log('\n🛑 Cerrando servidor...');
  saveCanvasData();
  server.close(() => {
    console.log('✅ Servidor cerrado correctamente');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Cerrando servidor...');
  saveCanvasData();
  server.close(() => {
    console.log('✅ Servidor cerrado correctamente');
    process.exit(0);
  });
});

// Iniciar servidor
initializeServer();
