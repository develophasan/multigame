class MultiplayerGame {
    constructor() {
        // ---- Socket & durum ----
        this.socket = io();
        this.socketId = null;

        // Ekran durumları
        this.currentScreen = 'main-menu';
        this.gameId = null;
        this.nickname = null;
        this.isReady = false;
        this.isHost = false;
        this.gameStarted = false;
        this.gameEnded = false;

        // Oyuncular
        this.players = [];            // Sunucudan gelen gösterim listesi
        this.playerMap = new Map();   // socketId -> {state, renderState} (interpolasyon için)
        this.health = 100;
        this.maxHealth = 100;
        this.stats = { damage: 0, kills: 0, deaths: 0 };

        // Zamanlayıcılar
        this.gameTime = 300; // sn
        this.gameTimer = 0;
        this.timerInterval = null;

        // Çizim
        this.canvas = null;
        this.ctx = null;
        this.mousePos = { x: 0, y: 0 };
        
        // Sprite sistemi
        this.sprites = {};
        this.spriteFrames = {};
        this.spriteDimensions = {};
        this.currentAnimation = 'idle';
        this.animationFrame = 0;
        this.animationSpeed = 0.1;
        this.lastAnimationUpdate = 0;
        this.backgroundImage = null;
        this.attackAnimationTimer = 0;
        this.isAttacking = false;
        this.isDead = false;
        this.deathTimer = 0;
        this.respawnTime = 3; // 3 saniye sonra dirilme
        this.killStreak = 0;
        this.lastKillTime = 0;
        this.notifications = [];
        this.sounds = {};
        this.soundEnabled = true;
        this.backgroundMusic = null;
        this.musicEnabled = true;
        this.gameWidth = 800;
        this.gameHeight = 600;

        // Giriş (input)
        this.keys = {};
        this.moveSpeed = 180; // px/s (dt ile çarpılıyor)
        this.lastInputSentAt = 0;
        this.inputSendInterval = 50; // ms

        // Skill/saldırı
        this.skills = {
            fire:      { cooldown: 0, maxCooldown: 3, damage: 25, range: 150, color: '#ff4444', name: 'Ateş' },
            water:     { cooldown: 0, maxCooldown: 4, damage: 20, range: 120, color: '#4444ff', name: 'Su' },
            air:       { cooldown: 0, maxCooldown: 2, damage: 15, range: 100, color: '#44ffff', name: 'Hava' },
            earth:     { cooldown: 0, maxCooldown: 5, damage: 35, range:  80, color: '#8B4513', name: 'Toprak' },
            lightning: { cooldown: 0, maxCooldown: 6, damage: 40, range: 200, color: '#ffff44', name: 'Elektrik' }
        };
        this.skillBar = ['fire', 'water', 'air', 'earth', 'lightning'];
        this.skillIndex = 0;
        this.currentSkill = this.skillBar[this.skillIndex];
        this.selectedTarget = null;

        // Görsel mermiler (otorite: sunucu; burada yalnız görüntülenir)
        this.projectiles = [];

        // Render döngüsü
        this._raf = null;
        this._lastFrameTs = performance.now();

        // Başlat
        this.init();
    }

    // -----------------------------
    // INIT
    // -----------------------------
    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.setupSocketListeners();
        this.initializeReadyButton();
        this.loadSprites();
        this.loadSounds();
        this.renderLoop(performance.now()); // tek sefer çağır, sürekli döner
    }

    setupCanvas() {
        this.canvas = document.getElementById('game-canvas');
        if (!this.canvas) return; // sayfa henüz game screen değilse
        this.ctx = this.canvas.getContext('2d');
        
        // Responsive canvas boyutları
        this.resizeCanvas();
        
        // Window resize event listener
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    resizeCanvas() {
        if (!this.canvas) return;
        
        // Ekran boyutlarını al
        const container = this.canvas.parentElement;
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        // Aspect ratio'yu koru (16:9)
        const aspectRatio = 16 / 9;
        let canvasWidth = containerWidth;
        let canvasHeight = containerWidth / aspectRatio;
        
        // Eğer yükseklik çok büyükse, yüksekliği sınırla
        if (canvasHeight > containerHeight) {
            canvasHeight = containerHeight;
            canvasWidth = canvasHeight * aspectRatio;
        }
        
        // Minimum ve maksimum boyutlar
        canvasWidth = Math.max(320, Math.min(canvasWidth, 1920));
        canvasHeight = Math.max(180, Math.min(canvasHeight, 1080));
        
        // Canvas boyutlarını ayarla
        this.canvas.width = canvasWidth;
        this.canvas.height = canvasHeight;
        this.canvas.style.width = canvasWidth + 'px';
        this.canvas.style.height = canvasHeight + 'px';
        
        // Oyun sınırlarını güncelle
        this.gameWidth = canvasWidth;
        this.gameHeight = canvasHeight;
        
        console.log(`🎮 Canvas resized: ${canvasWidth}x${canvasHeight}`);
    }

    initializeReadyButton() {
        const readyBtn = document.getElementById('toggle-ready');
        if (readyBtn) {
            readyBtn.textContent = 'Hazır Değilim';
            readyBtn.classList.add('not-ready');
        }
    }

    loadSprites() {
        // Sprite dosyalarını yükle
        const spriteFiles = {
            'idle': 'sprite/Idle.png',
            'walk': 'sprite/Walk.png',
            'run': 'sprite/Run.png',
            'attack1': 'sprite/Attack_1.png',
            'attack2': 'sprite/Attack_2.png',
            'hurt': 'sprite/Hurt.png',
            'dead': 'sprite/Dead.png',
            'jump': 'sprite/Jump.png',
            'charge': 'sprite/Charge.png'
        };

        let loadedCount = 0;
        const totalSprites = Object.keys(spriteFiles).length;

        Object.entries(spriteFiles).forEach(([name, path]) => {
            const img = new Image();
            img.onload = () => {
                this.sprites[name] = img;
                loadedCount++;
                console.log(`✅ Sprite loaded: ${name}`);
                
                if (loadedCount === totalSprites) {
                    console.log('🎮 All sprites loaded successfully!');
                    this.setupSpriteFrames();
                }
            };
            img.onerror = () => {
                console.warn(`❌ Failed to load sprite: ${name}`);
                loadedCount++;
            };
            img.src = path;
        });

        // Arka plan resmini yükle
        const bgImg = new Image();
        bgImg.onload = () => {
            this.backgroundImage = bgImg;
            console.log('✅ Background image loaded!');
        };
        bgImg.onerror = () => {
            console.warn('❌ Failed to load background image');
        };
        bgImg.src = 'bg.jpg';
    }

    loadSounds() {
        // Skill seslerini yükle
        const soundFiles = {
            'fire': 'sound/mixkit-short-fire-whoosh-1345.wav',      // Ateş
            'water': 'sound/mixkit-water-splash-1311.wav',          // Su
            'air': 'sound/mixkit-ending-wind-swoosh-1482.wav',      // Hava
            'earth': 'sound/mixkit-alien-blast-in-the-earth-2546.wav', // Toprak
            'lightning': 'sound/mixkit-static-electric-glitch-2597.wav' // Elektrik
        };

        let loadedCount = 0;
        const totalSounds = Object.keys(soundFiles).length;

        Object.entries(soundFiles).forEach(([skill, path]) => {
            const audio = new Audio();
            audio.preload = 'auto';
            audio.volume = 0.7; // Ses seviyesi
            
            audio.oncanplaythrough = () => {
                this.sounds[skill] = audio;
                loadedCount++;
                console.log(`🔊 Sound loaded: ${skill}`);
                
                if (loadedCount === totalSounds) {
                    console.log('🎵 All sounds loaded successfully!');
                }
            };
            
            audio.onerror = () => {
                console.warn(`❌ Failed to load sound: ${skill}`);
                loadedCount++;
            };
            
            audio.src = path;
        });

        // Arka plan müziğini yükle
        this.loadBackgroundMusic();
    }

    loadBackgroundMusic() {
        this.backgroundMusic = new Audio();
        this.backgroundMusic.src = 'sound/bg.mp3';
        this.backgroundMusic.preload = 'auto';
        this.backgroundMusic.volume = 0.3; // Düşük ses seviyesi
        this.backgroundMusic.loop = true; // Tekrar tekrar çal
        
        this.backgroundMusic.oncanplaythrough = () => {
            console.log('🎵 Background music loaded!');
        };
        
        this.backgroundMusic.onerror = () => {
            console.warn('❌ Failed to load background music');
        };
    }

    playSound(skillName) {
        if (!this.soundEnabled) return;
        
        const sound = this.sounds[skillName];
        if (sound) {
            // Ses çalarken tekrar baştan başlat
            sound.currentTime = 0;
            sound.play().catch(e => {
                console.warn('Sound play failed:', e);
            });
        }
    }

    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        const soundBtn = document.getElementById('toggle-sound');
        if (soundBtn) {
            soundBtn.textContent = this.soundEnabled ? '🔊' : '🔇';
            soundBtn.title = this.soundEnabled ? 'Sesi Kapat' : 'Sesi Aç';
        }
        console.log(`🔊 Sound ${this.soundEnabled ? 'enabled' : 'disabled'}`);
    }

    playBackgroundMusic() {
        if (!this.musicEnabled || !this.backgroundMusic) return;
        
        this.backgroundMusic.play().catch(e => {
            console.warn('Background music play failed:', e);
        });
    }

    stopBackgroundMusic() {
        if (this.backgroundMusic) {
            this.backgroundMusic.pause();
            this.backgroundMusic.currentTime = 0;
        }
    }

    toggleMusic() {
        this.musicEnabled = !this.musicEnabled;
        const musicBtn = document.getElementById('toggle-music');
        if (musicBtn) {
            musicBtn.textContent = this.musicEnabled ? '🎵' : '🎶';
            musicBtn.title = this.musicEnabled ? 'Müziği Kapat' : 'Müziği Aç';
        }
        
        if (this.musicEnabled) {
            this.playBackgroundMusic();
        } else {
            this.stopBackgroundMusic();
        }
        
        console.log(`🎵 Music ${this.musicEnabled ? 'enabled' : 'disabled'}`);
    }

    setupSpriteFrames() {
        // Her sprite için frame sayılarını ayarla (gerçek değerler)
        this.spriteFrames = {
            'idle': 7,      // Idle.png - 7 frame
            'walk': 7,      // Walk.png - 7 frame  
            'run': 7,       // Run.png - 7 frame
            'attack1': 7,   // Attack_1.png - 7 frame
            'attack2': 7,   // Attack_2.png - 7 frame
            'hurt': 7,      // Hurt.png - 7 frame
            'dead': 7,      // Dead.png - 7 frame
            'jump': 7,      // Jump.png - 7 frame
            'charge': 7     // Charge.png - 7 frame
        };
        
        // Sprite boyutlarını ayarla (her frame için)
        this.spriteDimensions = {
            'idle': { width: 128, height: 128 },
            'walk': { width: 128, height: 128 },
            'run': { width: 128, height: 128 },
            'attack1': { width: 128, height: 128 },
            'attack2': { width: 128, height: 128 },
            'hurt': { width: 128, height: 128 },
            'dead': { width: 128, height: 128 },
            'jump': { width: 128, height: 128 },
            'charge': { width: 128, height: 128 }
        };
    }

    // -----------------------------
    // DOM & INPUT
    // -----------------------------
    setupEventListeners() {
        // Aynı dinleyicileri iki kez eklememek için guard
        if (this._listenersBound) return;
        this._listenersBound = true;

        const createGameBtn = document.getElementById('create-game-btn');
        createGameBtn?.addEventListener('click', () => this.showScreen('create-game'));

        const joinGameBtn = document.getElementById('join-game-btn');
        joinGameBtn?.addEventListener('click', () => this.showScreen('join-game'));

        document.getElementById('create-game-submit')?.addEventListener('click', () => this.createGame());
        document.getElementById('join-game-submit')?.addEventListener('click', () => this.joinGame());

        document.getElementById('back-to-menu')?.addEventListener('click', () => this.showScreen('main-menu'));
        document.getElementById('back-to-menu-2')?.addEventListener('click', () => this.showScreen('main-menu'));

        document.getElementById('toggle-ready')?.addEventListener('click', () => this.toggleReady());
        document.getElementById('start-game')?.addEventListener('click', () => this.startGame());

        // Şekil seçimi
        document.querySelectorAll('.shape-btn')?.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const shape = e.currentTarget?.dataset?.shape;
                if (shape) this.selectShape(shape);
            });
        });

        document.getElementById('leave-game')?.addEventListener('click', () => this.leaveGame());
        
        // Ses açma/kapama butonu
        document.getElementById('toggle-sound')?.addEventListener('click', () => this.toggleSound());
        
        // Müzik açma/kapama butonu
        document.getElementById('toggle-music')?.addEventListener('click', () => this.toggleMusic());

        // Mouse (hedefleme & nişan)
        const gameCanvas = document.getElementById('game-canvas');
        gameCanvas?.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        gameCanvas?.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        gameCanvas?.addEventListener('contextmenu', (e) => e.preventDefault());

        // Klavye
        document.addEventListener('keydown', (e) => this.handleKeyDown(e), { passive: false });
        document.addEventListener('keyup',   (e) => this.handleKeyUp(e),   { passive: false });

        // Skor ekranı
        document.getElementById('back-to-lobby')?.addEventListener('click', () => this.backToLobby());
        document.getElementById('back-to-main')?.addEventListener('click', () => this.backToMain());
    }

    // -----------------------------
    // SOCKET
    // -----------------------------
    setupSocketListeners() {
        this.socket.on('connect', () => {
            this.socketId = this.socket.id;
            console.log('✅ Socket connected', this.socketId);
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Socket disconnected');
        });

        this.socket.on('connect_error', (err) => {
            console.error('❌ Socket error:', err);
        });

        this.socket.on('player-joined', (data) => {
            // Sadece kendi join event'imde isHost'u güncelle
            if (data.isHost !== undefined) {
                this.isHost = data.isHost;
                console.log('🎯 Host status updated:', this.isHost);
            }
            this.players = data.players || [];
            this.hydratePlayerMap(this.players);
            this.updateLobbyUI();
            if (!this.isHost) this.showScreen('lobby');
        });

        this.socket.on('player-left', (data) => {
            this.players = data.players || [];
            this.hydratePlayerMap(this.players);
            this.updateLobbyUI();
        });

        this.socket.on('player-ready-changed', (data) => {
            this.players = data.players || [];
            this.hydratePlayerMap(this.players);
            this.updatePlayersList();
        });

        this.socket.on('player-shape-changed', (data) => {
            this.players = data.players || [];
            this.hydratePlayerMap(this.players);
            this.updatePlayersList();
        });

        this.socket.on('game-started', (data) => {
            this.gameStarted = true;
            this.gameEnded = false;
            this.gameTime = 300;
            this.players = data.players || [];
            this.hydratePlayerMap(this.players, true);
            
            // Initialize health and stats for all players
            this.players.forEach(player => {
                if (!player.health) player.health = 100;
                if (!player.stats) player.stats = { damage: 0, kills: 0, deaths: 0 };
            });
            
            // Set local player's health and stats
            const me = this.players.find(p => p.socketId === this.socketId);
            if (me) {
                this.health = me.health || 100;
                this.stats = me.stats || { damage: 0, kills: 0, deaths: 0 };
            } else {
                this.health = 100;
                this.stats = { damage: 0, kills: 0, deaths: 0 };
            }
            
            // Kendi istatistiklerimi sıfırla
            this.stats = { damage: 0, kills: 0, deaths: 0 };
            
            this.maxHealth = 100;
            this.projectiles = [];
            this.selectedTarget = null;
            this.selectSkill(0);
            this.showScreen('game-screen');
            
            // Canvas'ı responsive yap
            setTimeout(() => this.resizeCanvas(), 100);
            
            this.startGameTimer();
            this.updateUI();
            
            // Arka plan müziğini başlat
            this.playBackgroundMusic();
        });

        this.socket.on('return-to-lobby', (data) => {
            this.gameStarted = false;
            this.gameEnded = false;
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
            // tüm oyuncuları hazır değil yap
            this.players.forEach(p => p.isReady = false);
            this.isReady = false;
            
            // Müziği durdur
            this.stopBackgroundMusic();
            const readyBtn = document.getElementById('toggle-ready');
            if (readyBtn) { readyBtn.textContent = 'Hazır Değilim'; readyBtn.classList.add('not-ready'); }
            this.showScreen('lobby');
            this.updatePlayersList();
            this.updatePlayerCount();
            if (data?.message) this.showError(data.message);
        });

        // Sunucu hareket yayınlıyorsa (senin kodunda vardı)
        this.socket.on('player-moved', (data) => {
            const p = this.players.find(p => p.socketId === data.playerId);
            if (p && p.socketId !== this.socketId) {
                this.setTargetPosition(p.socketId, data.position);
            }
        });

        // Sunucu otoritesi: görsel mermileri listeye ekle
        this.socket.on('projectile-fired', (data) => {
            if (data?.projectile) this.projectiles.push(data.projectile);
        });

        this.socket.on('player-took-damage', (data) => {
            const p = this.players.find(x => x.socketId === data.targetId);
            if (p) {
                p.health = data.newHealth;
                if (p.socketId === this.socketId) {
                    this.health = data.newHealth;
                    this.updateUI(); // ✅ Can barını güncelle
                }
            }
            // Eğer hasar veren kişi ben isem, hasar istatistiğimi güncelle
            if (data.killerId === this.socketId) {
                this.stats.damage += data.damage;
                this.updateUI(); // ✅ Hasar istatistiğini güncelle
            }
        });

        this.socket.on('player-died', (data) => {
            const p = this.players.find(x => x.socketId === data.targetId);
            if (p) {
                p.health = 100; // respawn görsel
                if (p.socketId === this.socketId) {
                    this.health = 100;
                    this.isDead = true; // Ölme durumunu ayarla
                    this.deathTimer = 0;
                    this.updateUI(); // ✅ Can barını güncelle
                }
                // respawn pozisyonunu server güncelleyecektir; interpolasyon akacak
            }
            
            // Eğer ölen kişi ben isem, ölüm sayımı artır
            if (data.targetId === this.socketId) {
                this.stats.deaths++;
                this.killStreak = 0; // Kill streak sıfırla
                this.addNotification("💀 Öldün!", "#dc3545");
                this.updateUI(); // ✅ Ölüm sayısını güncelle
            }
            
            // Eğer öldüren kişi ben isem, öldürme sayımı artır
            if (data.killerId === this.socketId) {
                this.stats.kills++;
                this.killStreak++;
                this.lastKillTime = Date.now();
                
                // Kill streak bildirimleri
                if (this.killStreak === 2) {
                    this.addNotification("🔥 Double Kill!", "#ff6b35");
                } else if (this.killStreak === 3) {
                    this.addNotification("⚡ Triple Kill!", "#ffd700");
                } else if (this.killStreak === 4) {
                    this.addNotification("💥 Quadra Kill!", "#e91e63");
                } else if (this.killStreak >= 5) {
                    this.addNotification("👑 PENTAKILL!", "#9c27b0");
                } else {
                    this.addNotification("💀 Öldürdün!", "#28a745");
                }
                
                this.updateUI(); // ✅ Öldürme sayısını güncelle
            }
        });

        // (opsiyonel) maç bitti sinyali gelirse
        this.socket.on('match-ended', (data) => {
            this.gameEnded = true;
            if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
            if (data?.players) {
                this.players = data.players;
                this.hydratePlayerMap(this.players);
            }
            this.showScoreScreen();
        });

        this.socket.on('error', (data) => {
            if (data?.message) this.showError(data.message);
        });
    }

    // -----------------------------
    // EKRAN & LOBİ
    // -----------------------------
    showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        const el = document.getElementById(screenName);
        if (el) el.classList.remove('hidden');
        this.currentScreen = screenName;
        if (screenName === 'game-screen' && !this.ctx) this.setupCanvas();
    }

    async createGame() {
        const nickname = (document.getElementById('host-nickname')?.value || '').trim();
        if (!nickname) return this.showError('Lütfen bir nickname girin');

        try {
            const res = await fetch('/api/create-game', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ nickname })});
            const data = await res.json();
            if (!data.success) return this.showError(data.error || 'Oyun oluşturulamadı');

            this.gameId = data.gameId;
            this.nickname = nickname;
            this.isHost = true;

            // Hemen lobby ekranı ve socket join
            this.showScreen('lobby');
            this.updateGameInfo();
            this.socket.emit('join-game', { gameId: this.gameId, nickname: this.nickname });
            this.showSuccess(`Oyun oluşturuldu! Kod: ${this.gameId}`);
        } catch (e) {
            this.showError('Oyun oluşturulurken hata oluştu');
        }
    }

    joinGame() {
        const nickname = (document.getElementById('join-nickname')?.value || '').trim();
        const gameCode = (document.getElementById('game-code')?.value || '').trim().toUpperCase();
        if (!nickname || !gameCode) return this.showError('Lütfen nickname ve oyun kodunu girin');

        this.nickname = nickname;
        this.gameId = gameCode;
        this.isHost = false;

        this.socket.emit('join-game', { gameId: gameCode, nickname });
    }

    leaveGame() {
        if (this.gameId) this.socket.emit('leave-game', { gameId: this.gameId });
        this.resetGame();
        this.showScreen('main-menu');
    }

    resetGame() {
        this.gameId = null;
        this.nickname = null;
        this.isReady = false;
        this.isHost = false;
        this.players = [];
        this.playerMap.clear();
        this.gameStarted = false;
        this.gameTimer = 0;
        this.gameEnded = false;

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        const hn = document.getElementById('host-nickname');
        const jn = document.getElementById('join-nickname');
        const gc = document.getElementById('game-code');
        if (hn) hn.value = '';
        if (jn) jn.value = '';
        if (gc) gc.value = '';
    }

    updateGameInfo() {
        const codeDisp = document.getElementById('game-code-display');
        if (codeDisp) codeDisp.textContent = this.gameId || '—';
        this.updatePlayerCount();
    }

    updatePlayerCount() {
        const el = document.getElementById('player-count');
        if (el) el.textContent = String(this.players.length);
    }

    updatePlayersList() {
        const container = document.getElementById('players-container');
        if (!container) return;
        container.innerHTML = '';

        this.players.forEach(p => {
            const item = document.createElement('div');
            item.className = 'player-item';

            const isMe = p.socketId === this.socketId;
            const isHostHere = p.socketId === this.socketId && this.isHost;

            item.innerHTML = `
                <div class="player-info">
                    <div class="player-shape ${p.shape || 'circle'}"></div>
                    <span class="player-name">${p.nickname || 'Oyuncu'} ${isHostHere ? '(Host)' : ''} ${isMe ? '(Sen)' : ''}</span>
                </div>
                <div class="player-status ${p.isReady ? 'ready' : 'not-ready'}">${p.isReady ? 'Hazır' : 'Hazır Değil'}</div>
            `;
            container.appendChild(item);
        });

        const startBtn = document.getElementById('start-game');
        if (startBtn) {
            console.log('Start button check - isHost:', this.isHost, 'players:', this.players.length);
            if (this.isHost) {
                startBtn.classList.remove('hidden');
                console.log('✅ Start button shown');
            } else {
                startBtn.classList.add('hidden');
                console.log('❌ Start button hidden');
            }
        } else {
            console.error('❌ Start button element not found!');
        }
    }

    updateLobbyUI() {
        this.updatePlayersList();
        this.updatePlayerCount();
        this.updateGameInfo();
    }

    // -----------------------------
    // READY / START
    // -----------------------------
    toggleReady() {
        if (!this.gameId) return;
        this.isReady = !this.isReady;
        this.socket.emit('toggle-ready', { gameId: this.gameId });

        const btn = document.getElementById('toggle-ready');
        if (btn) {
            if (this.isReady) { btn.textContent = 'Hazırım'; btn.classList.remove('not-ready'); }
            else { btn.textContent = 'Hazır Değilim'; btn.classList.add('not-ready'); }
        }
    }

    selectShape(shape) {
        if (!this.gameId) return;
        // UI
        document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
        const active = document.querySelector(`[data-shape="${shape}"]`);
        active?.classList.add('active');
        // Server
        this.socket.emit('change-shape', { gameId: this.gameId, shape });
    }

    startGame() {
        if (!this.gameId || !this.isHost) return;
        this.socket.emit('start-game', { gameId: this.gameId });
    }

    // -----------------------------
    // ZAMAN & SKOR
    // -----------------------------
    startGameTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            if (!this.gameStarted) return;
            this.gameTimer++;
            this.gameTime = Math.max(0, this.gameTime - 1);
            const m = Math.floor(this.gameTime / 60);
            const s = this.gameTime % 60;
            const el = document.getElementById('game-timer');
            if (el) el.textContent = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
            if (this.gameTime <= 0) this.endGame();
        }, 1000);
    }

    endGame() {
        this.gameEnded = true;
        if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
        
        // Müziği durdur
        this.stopBackgroundMusic();
        
        this.showScoreScreen();
    }

    showScoreScreen() {
        // Skor hesap
        const sorted = [...this.players].sort((a,b)=>{
            const scA = (a.stats?.kills||0)*100 + (a.stats?.damage||0)*0.1 - (a.stats?.deaths||0)*50;
            const scB = (b.stats?.kills||0)*100 + (b.stats?.damage||0)*0.1 - (b.stats?.deaths||0)*50;
            return scB - scA;
        });
        if (sorted.length) {
            const winEl = document.getElementById('winner-name');
            if (winEl) winEl.textContent = sorted[0].nickname || 'Kazanan';
        }
        const list = document.getElementById('score-list');
        if (list) {
            list.innerHTML = '';
            sorted.forEach(p=>{
                const div = document.createElement('div');
                div.className = 'score-item';
                div.innerHTML = `
                  <div class="score-player-info">
                    <div class="score-player-shape ${p.shape||'circle'}"></div>
                    <span class="score-player-name">${p.nickname||'Oyuncu'}</span>
                  </div>
                  <div class="score-stats">
                    <div class="score-stat"><div class="score-stat-value">${p.stats?.damage||0}</div><div class="score-stat-label">Zarar</div></div>
                    <div class="score-stat"><div class="score-stat-value">${p.stats?.kills||0}</div><div class="score-stat-label">Öldürme</div></div>
                    <div class="score-stat"><div class="score-stat-value">${p.stats?.deaths||0}</div><div class="score-stat-label">Ölüm</div></div>
                  </div>
                `;
                list.appendChild(div);
            });
        }
        this.showScreen('score-screen');
    }

    backToLobby() {
        this.gameEnded = false;
        this.gameStarted = false;
        this.showScreen('lobby');
    }

    backToMain() {
        this.gameEnded = false;
        this.gameStarted = false;
        this.resetGame();
        this.showScreen('main-menu');
    }

    // -----------------------------
    // INPUT & NİŞAN
    // -----------------------------
    handleMouseDown(e) {
        if (!this.gameStarted || this.gameEnded || !this.canvas) return;

        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        if (e.button === 0) {
            this.selectTargetAndShoot(mx, my);
        }
    }

    handleMouseMove(e) {
        if (!this.gameStarted || this.gameEnded || !this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        this.mousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    handleKeyDown(e) {
        // Sadece oyun ekranında ve input alanında değilken engelle
        const isGame = this.currentScreen === 'game-screen';
        const isTyping = ['INPUT','TEXTAREA'].includes(document.activeElement?.tagName);
        if (isGame && !isTyping) {
            // Skill 1..5
            if (e.code >= 'Digit1' && e.code <= 'Digit5') {
                const idx = parseInt(e.code.slice(-1), 10) - 1;
                this.selectSkill(idx);
                e.preventDefault();
                return;
            }
            this.keys[e.code] = true;
            e.preventDefault();
        }
    }

    handleKeyUp(e) {
        const isGame = this.currentScreen === 'game-screen';
        const isTyping = ['INPUT','TEXTAREA'].includes(document.activeElement?.tagName);
        if (isGame && !isTyping) {
            this.keys[e.code] = false;
            e.preventDefault();
        }
    }

    selectSkill(skillIndex) {
        if (skillIndex < 0 || skillIndex >= this.skillBar.length) return;
        this.skillIndex = skillIndex;
        this.currentSkill = this.skillBar[skillIndex];
        this.updateSkillBar();
    }

    updateSkillBar() {
        document.querySelectorAll('.skill-slot').forEach((slot, idx) => {
            if (idx === this.skillIndex) slot.classList.add('active');
            else slot.classList.remove('active');
        });
    }

    selectTargetAndShoot(mouseX, mouseY) {
        if (this.isDead) return; // Ölüyken saldırma
        const me = this.players.find(p => p.socketId === this.socketId);
        if (!me) return;
        const skill = this.skills[this.currentSkill];
        if (skill.cooldown > 0) return;

        // Tıklanan noktaya en yakın düşmanı bul (eşik 48px)
        let best = null, bestDist = Infinity;
        for (const p of this.players) {
            if (p.socketId === this.socketId) continue;
            const d = Math.hypot(p.position.x - mouseX, p.position.y - mouseY);
            if (d < 48 && d < bestDist) { best = p; bestDist = d; }
        }
        if (!best) return;

        // Menzil kontrolü (benim pozisyonumdan hedefe)
        const distToEnemy = Math.hypot(best.position.x - me.position.x, best.position.y - me.position.y);
        if (distToEnemy > skill.range) {
            this.showMessage('Hedef menzil dışında', 'error');
            return;
        }

        this.selectedTarget = best;

        // Cooldown başlat (görsel; asıl otorite sunucu)
        skill.cooldown = skill.maxCooldown;

        // Saldırı animasyonu başlat
        this.isAttacking = true;
        this.attackAnimationTimer = 0.5; // 0.5 saniye saldırı animasyonu

        // Skill sesini çal
        this.playSound(this.currentSkill);

        // Sunucuya atış bildir
        this.socket.emit('player-shoot', {
            gameId: this.gameId,
            projectile: {
                // Görsel uyum için mevcut yapını koruyorum
                id: Date.now() + Math.random(),
                x: me.position.x,
                y: me.position.y,
                targetX: best.position.x,
                targetY: best.position.y,
                targetId: best.socketId,
                skill: this.currentSkill,
                damage: skill.damage,  // ✅ Skill'in damage değeri
                color: skill.color,
                speed: 8,
                owner: this.socketId,
                hit: false  // ✅ Başlangıçta hit false
            }
        });

        // Alternatif (sunucu shoot event'i farklıysa):
        // this.socket.emit('shoot', { gameId: this.gameId, targetId: best.socketId });
    }

    // -----------------------------
    // OYUN DÖNGÜSÜ & FİZİK
    // -----------------------------
    renderLoop(ts) {
        const dt = Math.min(0.05, (ts - this._lastFrameTs) / 1000); // 50ms tavan
        this._lastFrameTs = ts;

        // Input'ları sabit aralıkla gönder (sunucu otoritesi)
        this.pumpMovement(dt);

        // Cooldown & mermiler (görsel)
        this.updateCooldowns(dt);
        this.updateProjectilesVisual(dt);
        this.updateAnimation(dt);

        // UI
        this.updateUI();

        // Çizim
        this.drawFrame();

        this._raf = requestAnimationFrame((t)=>this.renderLoop(t));
    }

    pumpMovement(dt) {
        if (!this.gameStarted || this.gameEnded || this.isDead) return; // Ölüyken hareket etme
        const now = performance.now();
        if (now - this.lastInputSentAt < this.inputSendInterval) return;
        this.lastInputSentAt = now;

        // Sunucuya sadece tuş durumlarını ve dt'yi gönder
        if (this.gameId) {
            this.socket.emit('player-move', { gameId: this.gameId, /* eskisiyle uyum için */ position: this._predictMyNewPos(dt) });
        }

        // Kendi ekranda gecikme hissetmemek için client-side prediction (yalın)
        const me = this.players.find(p => p.socketId === this.socketId);
        if (me) {
            // Hızlı hareket kontrolü (Shift tuşu)
            const isRunning = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
            const speed = isRunning ? this.moveSpeed * 1.5 : this.moveSpeed; // Koşma 1.5x hızlı
            
            let nx = (this.keys['ArrowRight']||this.keys['KeyD']?1:0) - (this.keys['ArrowLeft']||this.keys['KeyA']?1:0);
            let ny = (this.keys['ArrowDown']||this.keys['KeyS']?1:0) - (this.keys['ArrowUp']||this.keys['KeyW']?1:0);
            const len = Math.hypot(nx, ny) || 1;
            nx /= len; ny /= len;
            const cw = this.gameWidth, ch = this.gameHeight;
            me.position.x = Math.max(20, Math.min(cw-20, me.position.x + nx * speed * dt));
            me.position.y = Math.max(20, Math.min(ch-20, me.position.y + ny * speed * dt));
            // playerMap'te render hedefini de güncelle
            const node = this.playerMap.get(me.socketId);
            if (node) {
                node.render.x = me.position.x;
                node.render.y = me.position.y;
                node.target.x = me.position.x;
                node.target.y = me.position.y;
            }
        }
    }

    _predictMyNewPos(dt) {
        const me = this.players.find(p => p.socketId === this.socketId);
        if (!me) return null;
        let nx = (this.keys['ArrowRight']||this.keys['KeyD']?1:0) - (this.keys['ArrowLeft']||this.keys['KeyA']?1:0);
        let ny = (this.keys['ArrowDown']||this.keys['KeyS']?1:0) - (this.keys['ArrowUp']||this.keys['KeyW']?1:0);
        const len = Math.hypot(nx, ny) || 1;
        nx /= len; ny /= len;
        const cw = this.gameWidth, ch = this.gameHeight;
        const x = Math.max(20, Math.min(cw-20, me.position.x + nx * this.moveSpeed * dt));
        const y = Math.max(20, Math.min(ch-20, me.position.y + ny * this.moveSpeed * dt));
        return { x, y };
    }

    updateCooldowns(dt) {
        this.skillBar.forEach(s => {
            const skill = this.skills[s];
            if (skill.cooldown > 0) {
                skill.cooldown -= dt;
                if (skill.cooldown < 0) skill.cooldown = 0;
            }
        });
        // Skill slot UI
        this.skillBar.forEach((name, idx) => {
            const slot = document.querySelector(`[data-skill="${idx+1}"]`);
            if (!slot) return;
            const cdEl = slot.querySelector('.skill-cooldown');
            if (!cdEl) return;
            const left = this.skills[name].cooldown;
            if (left > 0) {
                cdEl.classList.add('active');
                cdEl.textContent = Math.ceil(left);
            } else {
                cdEl.classList.remove('active');
                cdEl.textContent = '';
            }
        });
    }

    updateAnimation(dt) {
        const now = performance.now();
        if (now - this.lastAnimationUpdate > 1000 / 12) { // 12 FPS animasyon (daha akıcı)
            this.animationFrame++;
            this.lastAnimationUpdate = now;
        }

        // Saldırı animasyonu süresi
        if (this.isAttacking) {
            this.attackAnimationTimer -= dt;
            if (this.attackAnimationTimer <= 0) {
                this.isAttacking = false;
            }
        }

        // Ölme ve dirilme sistemi
        if (this.isDead) {
            this.deathTimer += dt;
            if (this.deathTimer >= this.respawnTime) {
                this.isDead = false;
                this.deathTimer = 0;
                this.health = 100; // Canı doldur
                this.addNotification("💀 Dirildin!", "#28a745");
            }
        }

        // Bildirimleri güncelle
        this.updateNotifications(dt);

        // Animasyon döngüsü
        const maxFrames = this.spriteFrames[this.currentAnimation] || 7;
        if (this.animationFrame >= maxFrames) {
            this.animationFrame = 0;
        }
    }

    setAnimation(animationName) {
        if (this.currentAnimation !== animationName) {
            this.currentAnimation = animationName;
            this.animationFrame = 0;
        }
    }

    addNotification(text, color = "#fff") {
        this.notifications.push({
            text: text,
            color: color,
            life: 3.0, // 3 saniye görünür
            y: this.notifications.length * 30 + 100, // Y pozisyonu
            alpha: 1.0
        });
    }

    updateNotifications(dt) {
        this.notifications = this.notifications.filter(notification => {
            notification.life -= dt;
            notification.alpha = Math.min(1.0, notification.life / 1.0); // Son 1 saniyede fade out
            return notification.life > 0;
        });
    }

    drawNotifications() {
        if (!this.ctx) return;
        
        this.ctx.save();
        this.notifications.forEach(notification => {
            this.ctx.globalAlpha = notification.alpha;
            this.ctx.fillStyle = notification.color;
            this.ctx.font = "bold 20px Arial";
            this.ctx.textAlign = "center";
            this.ctx.strokeStyle = "#000";
            this.ctx.lineWidth = 2;
            
            // Metin gölgesi
            this.ctx.strokeText(notification.text, this.canvas.width / 2, notification.y);
            this.ctx.fillText(notification.text, this.canvas.width / 2, notification.y);
        });
        this.ctx.restore();
    }

    updateProjectilesVisual(dt) {
        // Görsel amaçlı mevcut mantığını koruyorum
        this.projectiles = this.projectiles.filter(p => {
            // Hedefi bul
            const t = this.players.find(x => x.socketId === p.targetId);
            if (!t) return false;

            // Hedefin güncel pozisyonuna doğru ilerle
            const dx = t.position.x - p.x;
            const dy = t.position.y - p.y;
            const dist = Math.hypot(dx, dy);
            const speed = (p.speed || 8) * 60; // mevcut veride 8 "frame-speed" idi; görsel hız = px/s
            if (dist < speed * dt) {
                // SUNUCUYA HASAR GÖNDER (projeksiyonun kendi damage değerini kullan)
                // Sadece bir kez hasar ver, tekrar hasar vermesin
                if (!p.hit) {
                    p.hit = true; // ✅ Tekrar hasar vermesin
                    this.socket.emit('player-damage', {
                        gameId: this.gameId,
                        targetId: t.socketId,
                        damage: p.damage || 20  // ✅ Projeksiyonun kendi damage değeri
                    });
                }

                // Server'dan gelen istatistikler daha güvenilir, yerel güncelleme yapmıyoruz
                return false;
            }
            p.x += (dx / dist) * speed * dt;
            p.y += (dy / dist) * speed * dt;
            return true;
        });
    }

    // -----------------------------
    // INTERPOLASYON
    // -----------------------------
    hydratePlayerMap(players, reset = false) {
        const now = performance.now();
        const seen = new Set();
        for (const p of players) {
            seen.add(p.socketId);
            if (!this.playerMap.has(p.socketId) || reset) {
                this.playerMap.set(p.socketId, {
                    render: { x: p.position.x, y: p.position.y },
                    target: { x: p.position.x, y: p.position.y },
                    lastUpdate: now
                });
            } else {
                const node = this.playerMap.get(p.socketId);
                node.target.x = p.position.x;
                node.target.y = p.position.y;
                node.lastUpdate = now;
            }
        }
        // Silinenleri temizle
        for (const id of this.playerMap.keys()) {
            if (!seen.has(id)) this.playerMap.delete(id);
        }
    }

    setTargetPosition(socketId, pos) {
        const node = this.playerMap.get(socketId);
        if (node) {
            node.target.x = pos.x;
            node.target.y = pos.y;
            node.lastUpdate = performance.now();
        }
        // players dizisini de güncelle (UI kullandığı için)
        const p = this.players.find(x => x.socketId === socketId);
        if (p) p.position = { x: pos.x, y: pos.y };
    }

    // -----------------------------
    // ÇİZİM
    // -----------------------------
    drawFrame() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Arka plan resmi çiz
        if (this.backgroundImage) {
            ctx.drawImage(this.backgroundImage, 0, 0, this.canvas.width, this.canvas.height);
        }

        // Interpolasyon
        const lerp = (a,b,t)=>a+(b-a)*t;
        const smooth = 0.18; // yumuşatma katsayısı

        // Oyuncular
        for (const p of this.players) {
            const node = this.playerMap.get(p.socketId);
            if (node) {
                node.render.x = lerp(node.render.x, node.target.x, smooth);
                node.render.y = lerp(node.render.y, node.target.y, smooth);

                // Player çiz
                this.drawPlayerAt(p, node.render.x, node.render.y);
            } else {
                this.drawPlayerAt(p, p.position.x, p.position.y);
            }
        }

        // Projeksiyonlar
        for (const pr of this.projectiles) {
            this.drawProjectile(pr);
        }

        // Hedef işaretçisi
        if (this.selectedTarget) {
            this.drawTargetIndicator(this.selectedTarget);
        }

        // Aktif skill menzil halkası
        if (this.currentSkill) this.drawSkillRange();
        
        // Bildirimleri çiz
        this.drawNotifications();
    }

    drawPlayerAt(player, x, y) {
        const isMe = player.socketId === this.socketId;
        const ctx = this.ctx;

        ctx.save();
        
        // Sprite çizimi
        this.drawSprite(player, x, y, isMe);
        
        // İsim
        ctx.fillStyle = '#333';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.nickname || 'Oyuncu', x, y + 40);
        ctx.restore();
    }

    drawSprite(player, x, y, isMe) {
        const ctx = this.ctx;
        
        // Animasyon durumunu belirle
        let animationType = 'idle';
        
        // Hareket durumuna göre animasyon seç
        if (isMe) {
            const isMoving = this.keys['ArrowUp'] || this.keys['ArrowDown'] || 
                           this.keys['ArrowLeft'] || this.keys['ArrowRight'] ||
                           this.keys['KeyW'] || this.keys['KeyS'] || 
                           this.keys['KeyA'] || this.keys['KeyD'];
            
            // Hızlı hareket kontrolü (Shift tuşu)
            const isRunning = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
            
            // Ölme animasyonu kontrolü
            if (this.isDead) {
                animationType = 'dead';     // Ölüm animasyonu
            } else if (this.isAttacking) {
                animationType = 'attack1';  // Saldırı animasyonu
            } else if (isMoving) {
                if (isRunning) {
                    animationType = 'run';  // Koşma animasyonu
                } else {
                    animationType = 'walk'; // Yürüme animasyonu
                }
            } else {
                animationType = 'idle';     // Durma animasyonu
            }
        } else {
            // Diğer oyuncular için ölme durumunu kontrol et
            const otherPlayer = this.players.find(p => p.socketId !== this.socketId);
            if (otherPlayer && otherPlayer.isDead) {
                animationType = 'dead';
            } else {
                animationType = 'idle';
            }
        }
        
        // Sprite yüklenmemişse fallback çiz
        if (!this.sprites[animationType]) {
            this.drawFallbackShape(player, x, y, isMe);
            return;
        }
        
        // Sprite çiz
        const sprite = this.sprites[animationType];
        const frameCount = this.spriteFrames[animationType] || 7;
        const frameWidth = 128; // Her frame 128px genişlik
        const frameHeight = 128; // Her frame 128px yükseklik
        
        const sourceX = this.animationFrame * frameWidth; // sx = index * 128
        const sourceY = 0; // sy = 0
        const sourceWidth = frameWidth;
        const sourceHeight = frameHeight;
        
        // Oyun içi boyutlar (daha büyük ve net)
        const gameWidth = 60;  // Oyun içi genişlik
        const gameHeight = 60; // Oyun içi yükseklik
        
        const destX = x - gameWidth / 2; // Sprite merkezi
        const destY = y - gameHeight / 2;
        
        // Yön belirleme (hareket yönüne göre)
        if (isMe && (this.keys['ArrowLeft'] || this.keys['KeyA'])) {
            ctx.save();
            ctx.scale(-1, 1);
            ctx.drawImage(sprite, sourceX, sourceY, sourceWidth, sourceHeight, 
                         -destX - gameWidth, destY, gameWidth, gameHeight);
            ctx.restore();
        } else {
            ctx.drawImage(sprite, sourceX, sourceY, sourceWidth, sourceHeight, 
                         destX, destY, gameWidth, gameHeight);
        }
    }

    drawFallbackShape(player, x, y, isMe) {
        const ctx = this.ctx;
        
        // Sprite yüklenmemişse eski şekil sistemini kullan
        if (isMe) { 
            ctx.shadowColor = '#667eea'; 
            ctx.shadowBlur = 10; 
        }
        ctx.fillStyle = isMe ? '#667eea' : '#6c757d';
        ctx.strokeStyle = isMe ? '#5a6fd8' : '#5a6268';
        ctx.lineWidth = 2;

        switch (player.shape) {
            case 'circle':
                ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                break;
            case 'square':
                ctx.fillRect(x-20, y-20, 40, 40); ctx.strokeRect(x-20, y-20, 40, 40);
                break;
            case 'triangle':
                ctx.beginPath();
                ctx.moveTo(x, y-20); ctx.lineTo(x-20, y+20); ctx.lineTo(x+20, y+20);
                ctx.closePath(); ctx.fill(); ctx.stroke();
                break;
            case 'rectangle':
                ctx.fillRect(x-30, y-15, 60, 30); ctx.strokeRect(x-30, y-15, 60, 30);
                break;
            default:
                ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        }
    }

    drawProjectile(projectile) {
        const ctx = this.ctx;
        ctx.save();
        ctx.shadowColor = projectile.color || '#fff';
        ctx.shadowBlur = 10;
        ctx.fillStyle = projectile.color || '#fff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.arc(projectile.x, projectile.y, 8, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(projectile.x, projectile.y, 4, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    }

    drawTargetIndicator(target) {
        const ctx = this.ctx;
        const { x, y } = target.position;
        ctx.save();
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 4;
        ctx.setLineDash([8,8]);
        ctx.beginPath(); ctx.arc(x, y, 35, 0, Math.PI*2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 25, 0, Math.PI*2); ctx.stroke();
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x-15, y-15); ctx.lineTo(x+15, y+15);
        ctx.moveTo(x+15, y-15); ctx.lineTo(x-15, y+15);
        ctx.stroke();
        ctx.restore();
    }

    drawSkillRange() {
        const me = this.players.find(p => p.socketId === this.socketId);
        if (!me) return;
        const ctx = this.ctx;
        const s = this.skills[this.currentSkill];

        ctx.save();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 3;
        ctx.setLineDash([5,5]);
        ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.arc(me.position.x, me.position.y, s.range, 0, Math.PI*2); ctx.stroke();

        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;
        ctx.beginPath(); ctx.arc(me.position.x, me.position.y, s.range-10, 0, Math.PI*2); ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.fillStyle = s.color;
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(s.name, me.position.x, me.position.y - s.range - 20);
        ctx.restore();
    }

    // -----------------------------
    // UI YARDIMCI
    // -----------------------------
    updateUI() {
        // Can barı
        const hpPct = Math.max(0, Math.min(100, (this.health / this.maxHealth) * 100));
        const fill = document.getElementById('health-fill');
        const text = document.getElementById('health-text');
        if (fill) fill.style.width = hpPct + '%';
        if (text) text.textContent = `${Math.max(0, Math.floor(this.health))}/${this.maxHealth}`;

        // İstatistik
        document.getElementById('damage-stat')?.replaceChildren(document.createTextNode(String(this.stats.damage || 0)));
        document.getElementById('kills-stat')?.replaceChildren(document.createTextNode(String(this.stats.kills || 0)));
        document.getElementById('deaths-stat')?.replaceChildren(document.createTextNode(String(this.stats.deaths || 0)));
    }

    showError(msg) { this.showMessage(msg, 'error'); }
    showSuccess(msg) { this.showMessage(msg, 'success'); }

    showMessage(message, type) {
        document.querySelectorAll('.error-message, .success-message').forEach(el=>el.remove());
        const div = document.createElement('div');
        div.className = `${type}-message`;
        div.textContent = message;
        const container = document.querySelector('.container') || document.body;
        container.insertBefore(div, container.firstChild);
        setTimeout(()=>div.remove(), 3000);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Sayfada game-canvas vb. yoksa bile sınıf sorunsuz initialize olur.
    new MultiplayerGame();
});