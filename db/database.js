const { Pool } = require('pg');

// Use internal URL when deployed on Render, external URL for local development
const connectionString = process.env.DATABASE_URL || 
  'postgresql://grue_user:SI58siege5HyvawSdWbTHRTTUFUshOMj@dpg-d2h1hmqdbo4c73akshkg-a/grue';

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Test database connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Helper functions
const db = {
  query: (text, params) => pool.query(text, params),
  
  // User operations
  async createUser(userId) {
    const query = `
      INSERT INTO users (user_id) 
      VALUES ($1) 
      ON CONFLICT (user_id) DO UPDATE 
      SET updated_at = CURRENT_TIMESTAMP
      RETURNING *`;
    const result = await pool.query(query, [userId]);
    return result.rows[0];
  },
  
  // Game world operations
  async saveGameWorld(userId, worldData) {
    const query = `
      INSERT INTO game_worlds (user_id, title, description, setting, world_data)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *`;
    const values = [
      userId,
      worldData.worldOverview?.title || 'Untitled World',
      worldData.worldOverview?.description || '',
      worldData.worldOverview?.setting || 'Fantasy',
      JSON.stringify(worldData)
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  },
  
  async getGameWorld(worldId) {
    const query = 'SELECT * FROM game_worlds WHERE id = $1';
    const result = await pool.query(query, [worldId]);
    return result.rows[0];
  },
  
  async getUserWorlds(userId) {
    const query = 'SELECT * FROM game_worlds WHERE user_id = $1 ORDER BY created_at DESC';
    const result = await pool.query(query, [userId]);
    return result.rows;
  },
  
  // Game state operations
  async saveGameState(userId, worldId, stateData, responseId = null) {
    const query = `
      INSERT INTO game_states (user_id, world_id, current_room, inventory, health, score, game_state, openai_response_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (user_id, world_id) DO UPDATE
      SET current_room = $3, inventory = $4, health = $5, score = $6, game_state = $7, openai_response_id = $8, updated_at = CURRENT_TIMESTAMP
      RETURNING *`;
    const values = [
      userId,
      worldId,
      stateData.currentRoom || 'start',
      JSON.stringify(stateData.inventory || []),
      stateData.health || 100,
      stateData.score || 0,
      JSON.stringify(stateData),
      responseId
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  },
  
  async getGameState(userId, worldId) {
    const query = 'SELECT * FROM game_states WHERE user_id = $1 AND world_id = $2';
    const result = await pool.query(query, [userId, worldId]);
    return result.rows[0];
  },
  
  // Game log operations
  async logAction(userId, worldId, action, details) {
    const query = `
      INSERT INTO game_logs (user_id, world_id, action, details)
      VALUES ($1, $2, $3, $4)
      RETURNING *`;
    const values = [userId, worldId, action, JSON.stringify(details)];
    const result = await pool.query(query, values);
    return result.rows[0];
  },
  
  async getUserLogs(userId, limit = 100) {
    const query = 'SELECT * FROM game_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2';
    const result = await pool.query(query, [userId, limit]);
    return result.rows;
  },
  
  // Initialize database tables
  async initialize() {
    try {
      const schemaSQL = `
        -- Users table
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(255) UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Game worlds table
        CREATE TABLE IF NOT EXISTS game_worlds (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL,
            title VARCHAR(255),
            description TEXT,
            setting VARCHAR(100),
            world_data JSONB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Game states table
        CREATE TABLE IF NOT EXISTS game_states (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL,
            world_id INTEGER NOT NULL,
            current_room VARCHAR(100),
            inventory JSONB DEFAULT '[]',
            health INTEGER DEFAULT 100,
            score INTEGER DEFAULT 0,
            game_state JSONB,
            openai_response_id VARCHAR(255),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, world_id)
        );
        
        -- Add column if it doesn't exist (for existing tables)
        ALTER TABLE game_states ADD COLUMN IF NOT EXISTS openai_response_id VARCHAR(255);

        -- Game logs table
        CREATE TABLE IF NOT EXISTS game_logs (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL,
            world_id INTEGER,
            action VARCHAR(255),
            details JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_game_worlds_user_id ON game_worlds(user_id);
        CREATE INDEX IF NOT EXISTS idx_game_states_user_id ON game_states(user_id);
        CREATE INDEX IF NOT EXISTS idx_game_states_world_id ON game_states(world_id);
        CREATE INDEX IF NOT EXISTS idx_game_logs_user_id ON game_logs(user_id);
      `;
      
      await pool.query(schemaSQL);
      console.log('Database tables initialized successfully');
    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    }
  }
};

module.exports = db;