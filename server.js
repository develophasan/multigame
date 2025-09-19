const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Atlas Connection
const mongoURI = 'mongodb+srv://black4rtscode_db_user:NqqtB6BJSPh4Mwmv@arenecluster.o8ojkgf.mongodb.net/multiplayer-game?retryWrites=true&w=majority&appName=arenecluster';

mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000, // 5 saniye timeout
  socketTimeoutMS: 45000, // 45 saniye socket timeout
  connectTimeoutMS: 10000, // 10 saniye connection timeout
}).then(() => {
  console.log('✅ MongoDB Atlas connected successfully');
  dbConnected = true;
}).catch((error) => {
  console.error('❌ MongoDB Atlas connection error:', error.message);
  console.log('🔄 Trying local MongoDB as fallback...');
  
  // Fallback to local MongoDB
  mongoose.connect('mongodb://localhost:27017/multiplayer-game', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
  }).then(() => {
    console.log('✅ Connected to local MongoDB');
    dbConnected = true;
  }).catch((err) => {
    console.error('❌ Local MongoDB connection failed:', err.message);
    console.log('⚠️  Starting server without database...');
    dbConnected = false;
  });
});

// Game Models
const GameSchema = new mongoose.Schema({
  gameId: { type: String, unique: true, required: true },
  hostId: { type: String, required: true },
  hostNickname: { type: String, required: true },
  players: [{
    socketId: String,
    nickname: String,
    isReady: { type: Boolean, default: false },
    shape: { type: String, default: 'circle' },
    position: { x: Number, y: Number }
  }],
  gameState: { type: String, enum: ['lobby', 'playing', 'ended'], default: 'lobby' },
  createdAt: { type: Date, default: Date.now }
});

const Game = mongoose.model('Game', GameSchema);

// Database connection status
let dbConnected = false;

// Store active games in memory for real-time updates
const activeGames = new Map();

// Routes
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.post('/api/create-game', async (req, res) => {
  try {
    const { nickname } = req.body;
    const gameId = uuidv4().substring(0, 8).toUpperCase();
    const hostId = uuidv4();
    
    const game = {
      gameId,
      hostId: hostId,
      hostNickname: nickname,
      players: [],
      gameState: 'lobby',
      createdAt: new Date()
    };
    
    // Save to database if connected
    if (dbConnected) {
      const gameDoc = new Game(game);
      await gameDoc.save();
    }
    
    // Always save to memory
    activeGames.set(gameId, game);
    
    res.json({ success: true, gameId });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/game/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    
    // First check memory
    let game = activeGames.get(gameId);
    
    // If not in memory and DB is connected, try database
    if (!game && dbConnected) {
      game = await Game.findOne({ gameId });
    }
    
    if (!game) {
      return res.status(404).json({ success: false, error: 'Game not found' });
    }
    
    res.json({ success: true, game });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join game lobby
  socket.on('join-game', async (data) => {
    console.log('🎮 Join game event received:', data); // Debug log
    try {
      const { gameId, nickname } = data;
      
      // First check memory
      let game = activeGames.get(gameId);
      console.log('🔍 Game found in memory:', !!game); // Debug log
      
      // If not in memory and DB is connected, try database
      if (!game && dbConnected) {
        game = await Game.findOne({ gameId });
        if (game) {
          activeGames.set(gameId, game);
        }
      }
      
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      
      if (game.players.length >= 8) {
        socket.emit('error', { message: 'Game is full' });
        return;
      }
      
      // Check if nickname already exists
      const existingPlayer = game.players.find(p => p.nickname === nickname);
      if (existingPlayer) {
        socket.emit('error', { message: 'Nickname already taken' });
        return;
      }
      
    // Add player to game
    const player = {
      socketId: socket.id,
      nickname,
      isReady: false,
      shape: 'circle',
      position: { x: Math.random() * 400, y: Math.random() * 400 }
    };
    
    game.players.push(player);
    
    // If this is the first player and no host is set, make them host
    if (game.players.length === 1) {
      game.hostId = socket.id;
    }
    
    // Set isHost flag for the client
    const isHost = game.hostId === socket.id;
      
      // Save to database if connected
      if (dbConnected) {
        try {
          await Game.findOneAndUpdate({ gameId }, game, { upsert: true });
        } catch (error) {
          console.error('Database save error:', error);
        }
      }
      
      // Always update memory
      activeGames.set(gameId, game);
      
      socket.join(gameId);
      socket.gameId = gameId;
      socket.nickname = nickname;
      
      // Notify the joining player
      socket.emit('player-joined', {
        player,
        players: game.players,
        isHost: isHost
      });
      
      // Notify other players (without isHost info)
      socket.to(gameId).emit('player-joined', {
        player,
        players: game.players
      });
      
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Toggle ready status
  socket.on('toggle-ready', async (data) => {
    console.log('🎮 Toggle ready event received:', data);
    try {
      const { gameId } = data;
      const game = activeGames.get(gameId);
      
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      
      const player = game.players.find(p => p.socketId === socket.id);
      if (player) {
        player.isReady = !player.isReady;
        console.log(`Player ${player.nickname} ready status: ${player.isReady}`);
        
        // Save to database if connected
        if (dbConnected) {
          try {
            await Game.findOneAndUpdate({ gameId }, game);
          } catch (error) {
            console.error('Database update error:', error);
          }
        }
        
        // Update memory
        activeGames.set(gameId, game);
        
        io.to(gameId).emit('player-ready-changed', {
          player,
          players: game.players
        });
      }
    } catch (error) {
      console.error('Error toggling ready status:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Change shape
  socket.on('change-shape', async (data) => {
    try {
      const { gameId, shape } = data;
      const game = activeGames.get(gameId);
      
      if (!game) return;
      
      const player = game.players.find(p => p.socketId === socket.id);
      if (player) {
        player.shape = shape;
        
        // Save to database if connected
        if (dbConnected) {
          try {
            await Game.findOneAndUpdate({ gameId }, game, { upsert: true });
          } catch (error) {
            console.error('Database update error:', error.message);
            // Database hatası varsa sadece memory'de tut
            console.log('⚠️  Continuing with memory-only mode...');
          }
        }
        
        // Update memory
        activeGames.set(gameId, game);
        
        io.to(gameId).emit('player-shape-changed', {
          player,
          players: game.players
        });
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Start game (only host can start)
  socket.on('start-game', async (data) => {
    console.log('🎮 Start game event received:', data);
    try {
      const { gameId } = data;
      const game = activeGames.get(gameId);
      
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      
      const player = game.players.find(p => p.socketId === socket.id);
      if (!player || game.hostId !== socket.id) {
        socket.emit('error', { message: 'Only host can start the game' });
        return;
      }
      
      // Check if all players are ready
      const allReady = game.players.every(p => p.isReady);
      if (!allReady) {
        socket.emit('error', { message: 'All players must be ready' });
        return;
      }
      
      console.log('🚀 Starting game for all players...');
      game.gameState = 'playing';
      
      // Initialize health and stats for all players
      game.players.forEach(player => {
        player.health = 100;
        player.stats = { damage: 0, kills: 0, deaths: 0 };
      });
      
      // Save to database if connected
      if (dbConnected) {
        try {
          await Game.findOneAndUpdate({ gameId }, game);
        } catch (error) {
          console.error('Database update error:', error);
        }
      }
      
      // Update memory
      activeGames.set(gameId, game);
      
      // Notify all players to start the game
      io.to(gameId).emit('game-started', {
        players: game.players
      });
      
      console.log('✅ Game started successfully!');
      
    } catch (error) {
      console.error('Error starting game:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Handle player movement in game
  socket.on('player-move', (data) => {
    const { gameId, position } = data;
    const game = activeGames.get(gameId);
    
    if (!game || game.gameState !== 'playing') return;
    
    const player = game.players.find(p => p.socketId === socket.id);
    if (player) {
      player.position = position;
      
      // Broadcast movement to other players
      socket.to(gameId).emit('player-moved', {
        playerId: socket.id,
        position
      });
    }
  });

  // Handle player shooting
  socket.on('player-shoot', (data) => {
    const { gameId, projectile } = data;
    const game = activeGames.get(gameId);
    
    if (!game || game.gameState !== 'playing') return;
    
    // Projeksiyona hit flag'i ekle
    projectile.hit = false;
    
    // Broadcast projectile to all players
    io.to(gameId).emit('projectile-fired', {
      projectile: projectile
    });
  });

  // Handle player damage
  socket.on('player-damage', (data) => {
    const { gameId, targetId, damage } = data;
    const game = activeGames.get(gameId);
    
    if (!game || game.gameState !== 'playing') return;
    
    const target = game.players.find(p => p.socketId === targetId);
    const killer = game.players.find(p => p.socketId === socket.id);
    
    if (target && killer && target.socketId !== killer.socketId) {
      // Initialize stats if not exists
      if (!target.stats) target.stats = { damage: 0, kills: 0, deaths: 0 };
      if (!killer.stats) killer.stats = { damage: 0, kills: 0, deaths: 0 };
      
      // Initialize health if not exists
      if (!target.health) target.health = 100;
      
      // Apply damage
      target.health -= damage;
      if (target.health < 0) target.health = 0;
      
      // Update killer's damage stats
      killer.stats.damage += damage;
      
      // Broadcast damage to all players
      io.to(gameId).emit('player-took-damage', {
        targetId: targetId,
        damage: damage,
        newHealth: target.health,
        killerId: socket.id // ✅ Killer ID'yi gönder
      });
      
      // Check for death
      if (target.health <= 0) {
        target.stats.deaths++;
        target.health = 100; // Respawn
        
        // Update killer's kill stats
        killer.stats.kills++;
        
        console.log(`💀 ${killer.nickname} killed ${target.nickname}! Kills: ${killer.stats.kills}`);
        
        // Broadcast death
        io.to(gameId).emit('player-died', {
          targetId: targetId,
          killerId: socket.id
        });
      }
    }
  });

  // Handle leave game request
  socket.on('leave-game', async (data) => {
    console.log('🎮 Leave game event received:', data);
    try {
      const { gameId } = data;
      const game = activeGames.get(gameId);
      
      if (game) {
        // Notify all players to return to lobby
        io.to(gameId).emit('return-to-lobby', {
          message: 'Bir oyuncu oyundan çıktı, lobiye dönülüyor...'
        });
        
        // Reset game state
        game.gameState = 'lobby';
        
        // Save to database if connected
        if (dbConnected) {
          try {
            await Game.findOneAndUpdate({ gameId }, game);
          } catch (error) {
            console.error('Database update error:', error);
          }
        }
        
        // Update memory
        activeGames.set(gameId, game);
        
        console.log('✅ All players returned to lobby');
      }
    } catch (error) {
      console.error('Error handling leave game:', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    try {
      if (socket.gameId) {
        const game = activeGames.get(socket.gameId);
        if (game) {
          const playerIndex = game.players.findIndex(p => p.socketId === socket.id);
          if (playerIndex !== -1) {
            game.players.splice(playerIndex, 1);
            
            // Save to database if connected
            if (dbConnected) {
              try {
                await Game.findOneAndUpdate({ gameId: socket.gameId }, game);
              } catch (error) {
                console.error('Database update error:', error);
              }
            }
            
            // If no players left, delete the game
            if (game.players.length === 0) {
              if (dbConnected) {
                try {
                  await Game.deleteOne({ gameId: socket.gameId });
                } catch (error) {
                  console.error('Database delete error:', error);
                }
              }
              activeGames.delete(socket.gameId);
            } else {
              // Notify remaining players
              io.to(socket.gameId).emit('player-left', {
                players: game.players
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
