const express = require('express');
const path = require('path');
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Serve static files
app.use(express.static('public'));

// API Routes
app.use('/v2/api/check-usage', require('./api/v2/api/check-usage'));
app.use('/v2/api/test-openai', require('./api/v2/api/test-openai'));
app.use('/v2/api/process-command', require('./api/v2/api/process-command-ai')); // Using AI processor
app.use('/v2/api/generate-render', require('./api/v2/api/generate-render'));
app.use('/v2/api/generate-simple', require('./api/v2/api/generate-simple'));
app.use('/v2/api/generate-test', require('./api/v2/api/generate-test'));

// Game state API endpoints
app.post('/api/game/save', async (req, res) => {
  try {
    const { userId, worldId, gameState } = req.body;
    const result = await db.saveGameState(userId, worldId, gameState);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/game/load/:userId/:worldId', async (req, res) => {
  try {
    const { userId, worldId } = req.params;
    const gameState = await db.getGameState(userId, worldId);
    res.json({ success: true, data: gameState });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/game/worlds/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const worlds = await db.getUserWorlds(userId);
    res.json({ success: true, data: worlds });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// HTML Routes (must come after API routes)
app.get('/v2', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'v2-index.html'));
});

app.get('/v2-debug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'v2-index-debug.html'));
});

app.get('/test-console', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test-console.html'));
});

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('404 - Page not found');
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).send('Internal Server Error');
});

// Initialize database and start server
async function startServer() {
  try {
    console.log('Initializing database...');
    await db.initialize();
    console.log('Database initialized successfully');
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Database connected: ${process.env.DATABASE_URL ? 'Yes' : 'No'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();