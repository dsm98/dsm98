/**
 * Dungeon Delver: Ultimate Edition
 * Production-Ready Game Engine
 */

// --- Configuration ---
const TILE_SIZE = 48;
const COLORS = {
    bg: '#0a0a0c',
    white: '#fbf5ef', red: '#d04648', green: '#6daa2c', blue: '#597dce', yellow: '#dad45e', grey: '#8595a1',
    f_floor: ['#1a2e1a', '#1f3520'], f_wall: '#0d1f0d', f_top: '#2d5e2d',
    s_floor: ['#8b5a3c', '#9a6644'], s_wall: '#5c3a20', s_top: '#c9956c',
    d_floor: ['#1a1520', '#1f1825'], d_wall: '#2a1f30', d_top: '#4a3d55'
};

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.mapCache = document.createElement('canvas');
        this.mapCtx = this.mapCache.getContext('2d', { alpha: false });

        const mmEl = document.getElementById('minimap-container');
        this.mmCtx = mmEl ? mmEl.getContext('2d') : null;

        this.width = 800; this.height = 600;
        this.biome = 'dungeon';
        this.depth = 1;
        this.active = false;
        this.paused = false;
        this.tick = 0;

        // Score & Coins System
        this.score = 0;
        this.coins = 0;
        this.combo = 0;
        this.comboTimer = 0;
        this.highScores = this.loadHighScores();
        this.totalCoins = parseInt(localStorage.getItem('totalCoins') || '0');

        // Power System
        this.powerReady = false;
        this.isBossLevel = false;
        this.boss = null;

        this.map = [];
        this.decorations = [];
        this.visited = [];
        this.scent = [];
        this.entities = [];
        this.particles = [];
        this.texts = [];
        this.items = [];
        this.traps = [];

        this.player = { x: 0, y: 0, vx: 0, vy: 0, hp: 50, maxHp: 50, xp: 0, nextXp: 50, lvl: 1, dmg: 5, moving: false, timer: 0 };
        this.camera = { x: 0, y: 0 };
        this.shake = 0;

        // Sound System
        this.sounds = {};
        this.initSounds();

        this.keys = {};
        this.bindInput();
        window.addEventListener('resize', () => this.resize());
        this.resize();
    }

    initSounds() {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.audioCtx = audioCtx;

        // Create simple sound effects
        this.playSound = (type) => {
            if (!this.audioCtx) return;
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.connect(gain);
            gain.connect(this.audioCtx.destination);

            if (type === 'hit') { osc.frequency.value = 200; gain.gain.value = 0.3; }
            else if (type === 'kill') { osc.frequency.value = 400; gain.gain.value = 0.2; }
            else if (type === 'coin') { osc.frequency.value = 800; gain.gain.value = 0.15; }
            else if (type === 'hurt') { osc.frequency.value = 150; gain.gain.value = 0.4; }
            else if (type === 'levelup') { osc.frequency.value = 600; gain.gain.value = 0.2; }
            else if (type === 'step') { osc.frequency.value = 100; gain.gain.value = 0.05; }

            osc.type = type === 'coin' ? 'sine' : 'square';
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.2);
            osc.start(); osc.stop(this.audioCtx.currentTime + 0.2);
        };
    }

    loadHighScores() {
        try { return JSON.parse(localStorage.getItem('highScores') || '[]'); }
        catch { return []; }
    }

    saveHighScore() {
        this.highScores.push({ score: this.score, depth: this.depth, biome: this.biome, date: Date.now() });
        this.highScores.sort((a, b) => b.score - a.score);
        this.highScores = this.highScores.slice(0, 10);
        localStorage.setItem('highScores', JSON.stringify(this.highScores));
        localStorage.setItem('totalCoins', this.totalCoins.toString());
    }

    bindInput() {
        window.addEventListener('keydown', e => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd', 'r'].includes(e.key)) e.preventDefault();
            this.keys[e.key] = true;

            // Escape to toggle pause
            if (e.key === 'Escape' && this.active) {
                this.togglePause();
            }

            // Space for dash attack
            if (e.key === ' ' && this.active && !this.paused) {
                this.dashAttack();
            }

            // R for ranged attack
            if ((e.key === 'r' || e.key === 'R') && this.active && !this.paused) {
                this.rangedAttack();
            }
        });
        window.addEventListener('keyup', e => this.keys[e.key] = false);

        document.querySelectorAll('.btn').forEach(b => {
            ['touchstart', 'mousedown'].forEach(evt => b.addEventListener(evt, e => { e.preventDefault(); this.keys[b.dataset.key] = true; }));
            ['touchend', 'mouseup', 'mouseleave'].forEach(evt => b.addEventListener(evt, e => { e.preventDefault(); this.keys[b.dataset.key] = false; }));
        });
    }

    togglePause() {
        this.paused = !this.paused;
        const pauseMenu = document.getElementById('pause-menu');
        if (pauseMenu) pauseMenu.style.display = this.paused ? 'flex' : 'none';
    }

    resize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.ctx.imageSmoothingEnabled = false;
    }

    start(biome) {
        this.biome = biome;
        this.depth = 1;
        this.score = 0;
        this.coins = 0;
        this.combo = 0;

        // Apply shop upgrades
        const upgrades = JSON.parse(localStorage.getItem('upgrades') || '{}');
        let baseDmg = 5 + (upgrades.attack || 0) * 2;
        let baseHp = 50 + (upgrades.defense || 0) * 10;

        this.player = { x: 1, y: 1, vx: 1, vy: 1, hp: baseHp, maxHp: baseHp, xp: 0, nextXp: 50, lvl: 1, dmg: baseDmg, moving: false, timer: 0 };
        this.active = true;
        this.paused = false;

        // Resume audio context on user interaction
        if (this.audioCtx && this.audioCtx.state === 'suspended') this.audioCtx.resume();

        this.generateLevel();
        requestAnimationFrame(() => this.loop());

        const mainMenu = document.getElementById('main-menu');
        const uiLayer = document.getElementById('ui-layer');
        const controls = document.getElementById('controls');
        const gameOver = document.getElementById('game-over');
        if (mainMenu) mainMenu.style.display = 'none';
        if (gameOver) gameOver.style.display = 'none';
        if (uiLayer) uiLayer.style.display = 'flex';
        if (controls) controls.style.display = (window.innerWidth < 800) ? 'flex' : 'none';

        // Show action buttons if owned
        const dashBtn = document.getElementById('dash-btn');
        const rangedBtn = document.getElementById('ranged-btn');
        if (dashBtn) dashBtn.style.display = upgrades.dash ? 'flex' : 'none';
        if (rangedBtn) rangedBtn.style.display = upgrades.ranged ? 'flex' : 'none';
    }

    loop() {
        if (!this.active) return;
        this.tick++;
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    update() {
        if (this.paused) return; // Don't update when paused

        if (!this.player.moving) {
            let dx = 0, dy = 0;
            if (this.keys['ArrowUp'] || this.keys['w']) dy = -1;
            else if (this.keys['ArrowDown'] || this.keys['s']) dy = 1;
            else if (this.keys['ArrowLeft'] || this.keys['a']) dx = -1;
            else if (this.keys['ArrowRight'] || this.keys['d']) dx = 1;

            if (dx !== 0 || dy !== 0) this.movePlayer(dx, dy);
        } else {
            this.player.timer--;
            if (this.player.timer <= 0) this.player.moving = false;
        }

        // Camera
        let tx = this.player.vx * TILE_SIZE - this.width / 2 + TILE_SIZE / 2;
        let ty = this.player.vy * TILE_SIZE - this.height / 2 + TILE_SIZE / 2;
        this.camera.x += (tx - this.camera.x) * 0.1;
        this.camera.y += (ty - this.camera.y) * 0.1;

        // Lerps
        this.player.vx += (this.player.x - this.player.vx) * 0.25;
        this.player.vy += (this.player.y - this.player.vy) * 0.25;
        this.entities.forEach(e => { e.vx += (e.x - e.vx) * 0.15; e.vy += (e.y - e.vy) * 0.15; });

        // Particles
        this.particles = this.particles.filter(p => p.life > 0);
        this.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life--; if (!p.ambient) p.vy += 0.3; });
        if (this.tick % 8 === 0) this.spawnAmbientParticle();

        // Texts
        this.texts = this.texts.filter(t => t.life > 0);
        this.texts.forEach(t => { t.y -= 0.8; t.life--; });

        if (this.shake > 0) this.shake *= 0.85;
    }

    movePlayer(dx, dy) {
        let nx = this.player.x + dx, ny = this.player.y + dy;
        if (nx < 0 || nx >= this.mapW || ny < 0 || ny >= this.mapH) return;

        let target = this.entities.find(e => e.x === nx && e.y === ny);
        if (target) {
            this.attack(this.player, target);
            this.player.vx += dx * 0.3; this.player.vy += dy * 0.3;
            this.processTurn();
            return;
        }

        // Block walls (1), water (2), and mountains (3)
        if (this.map[ny][nx] !== 0) return;

        this.player.x = nx; this.player.y = ny;
        this.player.moving = true; this.player.timer = 6;

        let itemIdx = this.items.findIndex(i => i.x === nx && i.y === ny);
        if (itemIdx !== -1) { this.collect(this.items[itemIdx]); this.items.splice(itemIdx, 1); }

        // Check for traps
        let trap = this.traps.find(t => t.x === nx && t.y === ny);
        if (trap) {
            this.triggerTrap(trap);
        }

        this.updateVisibility();
        this.processTurn();
    }

    triggerTrap(trap) {
        let px = this.player.vx * TILE_SIZE + 24, py = this.player.vy * TILE_SIZE;
        trap.triggered = true;

        if (trap.type === 'spike') {
            let dmg = 5 + this.depth;
            this.player.hp -= dmg;
            this.addText(px, py, `Spikes! -${dmg}`, '#d04648');
            this.addParticles(px, py + 24, '#aaa', 10);
            this.shake = 4;
        } else if (trap.type === 'poison') {
            let dmg = 3 + Math.floor(this.depth / 2);
            this.player.hp -= dmg;
            this.addText(px, py, `Poison! -${dmg}`, '#9933ff');
            this.addParticles(px, py + 24, '#9933ff', 12);
        } else if (trap.type === 'fire') {
            let dmg = 8 + this.depth;
            this.player.hp -= dmg;
            this.addText(px, py, `Fire! -${dmg}`, '#ff6600');
            this.addParticles(px, py + 24, '#ff6600', 15);
            this.shake = 6;
        } else if (trap.type === 'vine') {
            // Vine trap - skip next turn
            this.player.timer = 12;
            this.addText(px, py, `Tangled!`, '#6daa2c');
            this.addParticles(px, py + 24, '#6daa2c', 8);
        } else if (trap.type === 'quicksand') {
            let dmg = 4;
            this.player.hp -= dmg;
            this.player.timer = 15; // Slow
            this.addText(px, py, `Quicksand! -${dmg}`, '#c9956c');
            this.addParticles(px, py + 24, '#c9956c', 10);
        }

        if (this.player.hp <= 0) this.gameOver();
        this.updateUI();
    }

    processTurn() {
        this.updateScentMap();
        this.entities.forEach(e => {
            let dist = Math.abs(e.x - this.player.x) + Math.abs(e.y - this.player.y);
            if (dist < 8) {
                if (dist === 1) { this.attack(e, this.player); }
                else {
                    let best = { x: e.x, y: e.y, val: this.scent[e.y]?.[e.x] ?? 9999 };
                    [[0, 1], [0, -1], [1, 0], [-1, 0]].sort(() => Math.random() - 0.5).forEach(([ddx, ddy]) => {
                        let nx = e.x + ddx, ny = e.y + ddy;
                        if (nx >= 0 && nx < this.mapW && ny >= 0 && ny < this.mapH && this.map[ny][nx] === 0) {
                            if (!this.entities.find(en => en.x === nx && en.y === ny) && (nx !== this.player.x || ny !== this.player.y)) {
                                let val = this.scent[ny]?.[nx] ?? 9999;
                                if (val < best.val) best = { x: nx, y: ny, val };
                            }
                        }
                    });
                    if (best.val < (this.scent[e.y]?.[e.x] ?? 9999)) { e.x = best.x; e.y = best.y; }
                }
            }
        });
    }

    attack(attacker, defender) {
        let dmg = Math.max(1, attacker.dmg + Math.floor(Math.random() * 3) - 1);
        defender.hp -= dmg;
        this.addText(defender.vx * TILE_SIZE + 24, defender.vy * TILE_SIZE, `-${dmg}`, defender === this.player ? '#ff6b6b' : '#fff');
        this.shake = 6;
        this.addParticles(defender.vx * TILE_SIZE + 24, defender.vy * TILE_SIZE + 24, defender === this.player ? '#d04648' : '#6daa2c', 8);

        if (defender === this.player) {
            this.playSound('hurt');
            this.combo = 0;
        } else {
            this.playSound('hit');
        }

        if (defender.hp <= 0) {
            if (defender === this.player) { this.gameOver(); }
            else {
                this.playSound('kill');
                this.entities = this.entities.filter(e => e !== defender);
                this.player.xp += defender.xp;

                // Score & Combo
                this.combo++;
                this.comboTimer = 60;
                let scoreGain = defender.xp * (1 + this.combo * 0.2);
                this.score += Math.floor(scoreGain);

                // Drop coins
                let coinDrop = 1 + Math.floor(Math.random() * 2);
                this.coins += coinDrop;
                this.totalCoins += coinDrop;

                this.addText(defender.vx * TILE_SIZE + 24, defender.vy * TILE_SIZE - 10, `+${defender.xp} XP`, '#ffd700');
                if (this.combo > 1) this.addText(defender.vx * TILE_SIZE + 24, defender.vy * TILE_SIZE - 25, `${this.combo}x COMBO!`, '#ff9900');
                if (this.player.xp >= this.player.nextXp) this.levelUp();
            }
        }
        this.updateUI();
    }

    levelUp() {
        this.player.lvl++;
        this.player.xp -= this.player.nextXp;
        this.player.nextXp = Math.floor(this.player.nextXp * 1.4);
        this.player.maxHp += 10; this.player.hp = this.player.maxHp;
        this.player.dmg += 2;
        this.score += 100 * this.player.lvl;
        this.playSound('levelup');

        // Grant power on level up
        this.powerReady = true;
        const powerBtn = document.getElementById('power-btn');
        if (powerBtn) powerBtn.style.display = 'flex';

        this.addText(this.player.vx * TILE_SIZE + 24, this.player.vy * TILE_SIZE - 20, "LEVEL UP! 💥 POWER READY!", '#ffd700');
        this.addParticles(this.player.vx * TILE_SIZE + 24, this.player.vy * TILE_SIZE + 24, '#ffd700', 25);
    }

    // Special power attack - damages all nearby enemies
    usePower() {
        if (!this.powerReady || !this.active || this.paused) return;

        this.powerReady = false;
        const powerBtn = document.getElementById('power-btn');
        if (powerBtn) powerBtn.style.display = 'none';

        this.playSound('levelup');
        this.shake = 15;

        let px = this.player.vx * TILE_SIZE + 24;
        let py = this.player.vy * TILE_SIZE + 24;

        // Damage all enemies in range 3
        let killCount = 0;
        this.entities.forEach(e => {
            let dist = Math.abs(e.x - this.player.x) + Math.abs(e.y - this.player.y);
            if (dist <= 3) {
                let dmg = this.player.dmg * 3;
                e.hp -= dmg;
                this.addText(e.vx * TILE_SIZE + 24, e.vy * TILE_SIZE, `-${dmg}`, '#ffd700');
                this.addParticles(e.vx * TILE_SIZE + 24, e.vy * TILE_SIZE + 24, '#ffd700', 10);
                if (e.hp <= 0) killCount++;
            }
        });

        // Remove dead entities
        this.entities = this.entities.filter(e => e.hp > 0);
        this.score += killCount * 50;

        // Big explosion effect
        this.addParticles(px, py, '#ffd700', 40);
        this.addParticles(px, py, '#ff9900', 30);
        this.addText(px, py - 30, `💥 POWER BLAST! ${killCount} kills`, '#ffd700');

        this.updateUI();
    }

    // Dash Attack - rush forward and damage enemies
    dashAttack() {
        if (!this.active || this.paused || this.player.moving) return;
        const upgrades = JSON.parse(localStorage.getItem('upgrades') || '{}');
        if (!upgrades.dash) return;

        // Find direction based on last movement or facing
        let dx = 0, dy = 0;
        if (this.keys['ArrowUp'] || this.keys['w']) dy = -1;
        else if (this.keys['ArrowDown'] || this.keys['s']) dy = 1;
        else if (this.keys['ArrowLeft'] || this.keys['a']) dx = -1;
        else if (this.keys['ArrowRight'] || this.keys['d']) dx = 1;
        else dx = 1; // Default right

        this.playSound('hit');
        this.shake = 8;

        // Dash 3 tiles
        for (let i = 1; i <= 3; i++) {
            let nx = this.player.x + dx * i;
            let ny = this.player.y + dy * i;

            if (nx < 0 || nx >= this.mapW || ny < 0 || ny >= this.mapH || this.map[ny][nx] !== 0) break;

            // Check for enemy at this position
            let enemy = this.entities.find(e => e.x === nx && e.y === ny);
            if (enemy) {
                let dmg = this.player.dmg * 2;
                enemy.hp -= dmg;
                this.addText(enemy.vx * TILE_SIZE + 24, enemy.vy * TILE_SIZE, `-${dmg}`, '#00ffff');
                this.addParticles(enemy.vx * TILE_SIZE + 24, enemy.vy * TILE_SIZE + 24, '#00ffff', 15);
                if (enemy.hp <= 0) {
                    this.entities = this.entities.filter(e => e !== enemy);
                    this.score += 30;
                }
                break;
            }

            this.player.x = nx;
            this.player.y = ny;
        }

        this.player.vx = this.player.x;
        this.player.vy = this.player.y;
        this.addParticles(this.player.vx * TILE_SIZE + 24, this.player.vy * TILE_SIZE + 24, '#00ffff', 10);
        this.updateVisibility();
        this.processTurn();
    }

    // Ranged Attack - shoot projectile
    rangedAttack() {
        if (!this.active || this.paused) return;
        const upgrades = JSON.parse(localStorage.getItem('upgrades') || '{}');
        if (!upgrades.ranged) return;

        // Find direction
        let dx = 0, dy = 0;
        if (this.keys['ArrowUp'] || this.keys['w']) dy = -1;
        else if (this.keys['ArrowDown'] || this.keys['s']) dy = 1;
        else if (this.keys['ArrowLeft'] || this.keys['a']) dx = -1;
        else if (this.keys['ArrowRight'] || this.keys['d']) dx = 1;
        else dx = 1;

        this.playSound('hit');

        // Find first enemy in line
        for (let i = 1; i <= 5; i++) {
            let nx = this.player.x + dx * i;
            let ny = this.player.y + dy * i;

            if (nx < 0 || nx >= this.mapW || ny < 0 || ny >= this.mapH || this.map[ny][nx] === 1) break;

            // Arrow visual
            this.addParticles(nx * TILE_SIZE + 24, ny * TILE_SIZE + 24, '#ffaa00', 2);

            let enemy = this.entities.find(e => e.x === nx && e.y === ny);
            if (enemy) {
                let dmg = Math.floor(this.player.dmg * 1.5);
                enemy.hp -= dmg;
                this.addText(enemy.vx * TILE_SIZE + 24, enemy.vy * TILE_SIZE, `-${dmg} 🏹`, '#ffaa00');
                this.addParticles(enemy.vx * TILE_SIZE + 24, enemy.vy * TILE_SIZE + 24, '#ffaa00', 12);
                if (enemy.hp <= 0) {
                    this.entities = this.entities.filter(e => e !== enemy);
                    this.score += 25;
                }
                break;
            }
        }

        this.processTurn();
    }

    // Get upgrades and apply them
    getUpgrades() {
        return JSON.parse(localStorage.getItem('upgrades') || '{}');
    }

    collect(item) {
        let px = this.player.vx * TILE_SIZE + 24, py = this.player.vy * TILE_SIZE;
        this.playSound('coin');
        this.score += 10;

        if (item.type === 'potion') {
            let heal = 20 + this.depth * 3;
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
            this.addText(px, py, `+${heal} HP`, '#ff6b6b');
            this.addParticles(px, py + 24, '#ff6b6b', 10);
        } else if (item.type === 'mana') {
            let xp = 15 + this.depth * 2;
            this.player.xp += xp;
            this.score += 15;
            this.addText(px, py, `+${xp} XP`, '#7b9fdd');
            this.addParticles(px, py + 24, '#597dce', 12);
        } else if (item.type === 'strength') {
            this.player.dmg += 2;
            this.score += 25;
            this.addText(px, py, `+2 DMG!`, '#ff9900');
            this.addParticles(px, py + 24, '#ff9900', 15);
        } else if (item.type === 'shield') {
            this.player.maxHp += 10;
            this.player.hp += 10;
            this.score += 25;
            this.addText(px, py, `+10 MAX HP!`, '#6daa2c');
            this.addParticles(px, py + 24, '#6daa2c', 15);
        } else if (item.type === 'coin') {
            this.coins += 5;
            this.totalCoins += 5;
            this.addText(px, py, `+5 💰`, '#ffd700');
        } else if (item.type === 'gem') {
            this.coins += 15;
            this.totalCoins += 15;
            this.score += 30;
            this.addText(px, py, `+15 💎`, '#ff55ff');
            this.addParticles(px, py + 24, '#ff55ff', 8);
        } else if (item.type === 'mushroom') {
            if (Math.random() < 0.7) {
                let heal = 10;
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
                this.addText(px, py, `+${heal} HP`, '#6daa2c');
            } else {
                this.player.hp -= 5;
                this.playSound('hurt');
                this.addText(px, py, `Poison! -5 HP`, '#9933ff');
            }
            this.addParticles(px, py + 24, '#6daa2c', 6);
        } else if (item.type === 'chest') {
            this.depth++;
            this.score += 200 * this.depth;
            this.addText(px, py - 20, `DEPTH ${this.depth}`, '#fff');
            this.addParticles(px, py, '#ffd700', 30);
            setTimeout(() => this.generateLevel(), 300);
        }
        if (this.player.xp >= this.player.nextXp) this.levelUp();
        this.updateUI();
    }

    // --- GENERATION ---
    generateLevel() {
        let size = Math.min(50, 18 + this.depth * 4);
        this.mapW = size; this.mapH = size;

        this.map = []; this.scent = []; this.visited = []; this.decorations = [];
        for (let y = 0; y < this.mapH; y++) {
            this.map.push(new Array(this.mapW).fill(1));
            this.scent.push(new Array(this.mapW).fill(9999));
            this.visited.push(new Array(this.mapW).fill(false));
            this.decorations.push(new Array(this.mapW).fill(0));
        }
        this.entities = []; this.items = [];

        // Generate using random walk (GUARANTEED CONNECTIVITY)
        this.generateWalkMap();

        // Add biome decorations
        this.addDecorations();

        // Spawn Player at a guaranteed open spot
        let start = this.getEmptyTile();
        this.player.x = this.player.vx = start.x;
        this.player.y = this.player.vy = start.y;
        this.camera.x = start.x * TILE_SIZE - this.width / 2;
        this.camera.y = start.y * TILE_SIZE - this.height / 2;
        this.updateVisibility();
        this.updateScentMap();

        // Boss every 5 levels
        this.isBossLevel = this.depth % 5 === 0;
        this.boss = null;

        // Entities
        let count = this.isBossLevel ? Math.floor(this.depth * 0.5) : Math.min(15, 4 + Math.floor(this.depth * 1.2));
        for (let i = 0; i < count; i++) {
            let t = this.getEmptyTile();
            if (Math.abs(t.x - this.player.x) + Math.abs(t.y - this.player.y) < 4) continue;
            this.entities.push({ x: t.x, y: t.y, vx: t.x, vy: t.y, ...this.getMobStats() });
        }

        // Spawn BOSS on boss levels
        if (this.isBossLevel) {
            let bossPos = this.getEmptyTile();
            // Ensure boss spawns far from player
            for (let attempts = 0; attempts < 50; attempts++) {
                if (Math.abs(bossPos.x - this.player.x) + Math.abs(bossPos.y - this.player.y) >= 8) break;
                bossPos = this.getEmptyTile();
            }

            this.boss = {
                x: bossPos.x, y: bossPos.y, vx: bossPos.x, vy: bossPos.y,
                type: 'boss',
                hp: 80 + this.depth * 20,
                maxHp: 80 + this.depth * 20,
                dmg: 8 + this.depth * 2,
                xp: 100 + this.depth * 20,
                color: this.biome === 'forest' ? '#2d5e2d' : (this.biome === 'desert' ? '#8b4513' : '#4a1a4a'),
                speed: 0.5
            };
            this.entities.push(this.boss);
            this.addText(this.player.vx * TILE_SIZE + 24, this.player.vy * TILE_SIZE - 40, "⚠️ BOSS LEVEL!", '#ff0000');
        }

        // Items - more variety!
        const itemPool = this.biome === 'forest'
            ? ['potion', 'potion', 'mushroom', 'mushroom', 'coin', 'mana', 'gem']
            : this.biome === 'desert'
                ? ['potion', 'coin', 'coin', 'gem', 'strength', 'shield', 'mana']
                : ['potion', 'potion', 'mana', 'strength', 'shield', 'coin', 'gem'];

        let itemCount = 5 + Math.floor(this.depth * 1.5);
        for (let i = 0; i < itemCount; i++) {
            let t = this.getEmptyTile();
            let type = itemPool[Math.floor(Math.random() * itemPool.length)];
            this.items.push({ x: t.x, y: t.y, type });
        }
        // Always spawn exit chest
        let exit = this.getEmptyTile();
        this.items.push({ x: exit.x, y: exit.y, type: 'chest' });

        // TRAPS - biome specific
        this.traps = [];
        const trapPool = this.biome === 'forest'
            ? ['spike', 'poison', 'vine']
            : this.biome === 'desert'
                ? ['spike', 'quicksand', 'fire']
                : ['spike', 'spike', 'fire', 'poison'];

        let trapCount = 3 + Math.floor(this.depth * 0.8);
        for (let i = 0; i < trapCount; i++) {
            let t = this.getEmptyTile();
            // Don't place trap near player start
            if (Math.abs(t.x - this.player.x) + Math.abs(t.y - this.player.y) < 3) continue;
            let type = trapPool[Math.floor(Math.random() * trapPool.length)];
            this.traps.push({ x: t.x, y: t.y, type, triggered: false });
        }

        this.renderMapCache();
        this.updateUI();
    }

    generateWalkMap() {
        // Drunkard's Walk - guarantees connectivity
        let cx = Math.floor(this.mapW / 2), cy = Math.floor(this.mapH / 2);
        let floorGoal = Math.floor(this.mapW * this.mapH * 0.45);
        let floorCount = 0;
        let dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];

        while (floorCount < floorGoal) {
            if (this.map[cy][cx] === 1) { this.map[cy][cx] = 0; floorCount++; }
            let d = dirs[Math.floor(Math.random() * 4)];
            let nx = cx + d[0], ny = cy + d[1];
            if (nx > 0 && nx < this.mapW - 1 && ny > 0 && ny < this.mapH - 1) { cx = nx; cy = ny; }
        }

        // Add rooms for dungeon
        if (this.biome === 'dungeon') {
            for (let i = 0; i < 3 + this.depth; i++) {
                let rx = 2 + Math.floor(Math.random() * (this.mapW - 6));
                let ry = 2 + Math.floor(Math.random() * (this.mapH - 6));
                let rw = 3 + Math.floor(Math.random() * 3);
                let rh = 3 + Math.floor(Math.random() * 3);
                for (let y = ry; y < ry + rh && y < this.mapH - 1; y++) {
                    for (let x = rx; x < rx + rw && x < this.mapW - 1; x++) {
                        this.map[y][x] = 0;
                    }
                }
            }
        }

        // Add WATER features (lakes, ponds, rivers) - type 2
        if (this.biome === 'forest') {
            // Create 2-4 lakes
            for (let l = 0; l < 2 + Math.floor(Math.random() * 3); l++) {
                let lx = 3 + Math.floor(Math.random() * (this.mapW - 6));
                let ly = 3 + Math.floor(Math.random() * (this.mapH - 6));
                let lr = 2 + Math.floor(Math.random() * 3);
                for (let dy = -lr; dy <= lr; dy++) {
                    for (let dx = -lr; dx <= lr; dx++) {
                        if (dx * dx + dy * dy <= lr * lr) {
                            let nx = lx + dx, ny = ly + dy;
                            if (nx > 0 && nx < this.mapW - 1 && ny > 0 && ny < this.mapH - 1) {
                                if (this.map[ny][nx] === 0) this.map[ny][nx] = 2; // Water
                            }
                        }
                    }
                }
            }
            // Add a river/stream
            let rx = 1, ry = Math.floor(Math.random() * this.mapH);
            while (rx < this.mapW - 1) {
                if (this.map[ry][rx] !== 1) this.map[ry][rx] = 2;
                rx++;
                ry += Math.floor(Math.random() * 3) - 1;
                ry = Math.max(1, Math.min(this.mapH - 2, ry));
            }
        }

        // WATER features - ONLY placed on floor tiles, with connectivity check
        // Forest: small ponds (not rivers that could block)
        if (this.biome === 'forest') {
            for (let l = 0; l < 2; l++) {
                let lx = 3 + Math.floor(Math.random() * (this.mapW - 6));
                let ly = 3 + Math.floor(Math.random() * (this.mapH - 6));
                let lr = 1 + Math.floor(Math.random() * 2); // Smaller radius
                for (let dy = -lr; dy <= lr; dy++) {
                    for (let dx = -lr; dx <= lr; dx++) {
                        if (dx * dx + dy * dy <= lr * lr) {
                            let nx = lx + dx, ny = ly + dy;
                            if (nx > 1 && nx < this.mapW - 2 && ny > 1 && ny < this.mapH - 2) {
                                if (this.map[ny][nx] === 0) this.map[ny][nx] = 2;
                            }
                        }
                    }
                }
            }
        }

        // Desert: single small oasis
        if (this.biome === 'desert') {
            let ox = Math.floor(this.mapW / 2);
            let oy = Math.floor(this.mapH / 2);
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    if (dx * dx + dy * dy <= 3) {
                        let nx = ox + dx, ny = oy + dy;
                        if (nx > 1 && nx < this.mapW - 2 && ny > 1 && ny < this.mapH - 2) {
                            if (this.map[ny][nx] === 0) this.map[ny][nx] = 2;
                        }
                    }
                }
            }
        }

        // Dungeon: decorative water (not blocking paths)
        // Skip canal - it blocks too much

        // Validate connectivity - if broken, remove water
        if (!this.validateConnectivity()) {
            // Remove all water if map is not connected
            for (let y = 0; y < this.mapH; y++) {
                for (let x = 0; x < this.mapW; x++) {
                    if (this.map[y][x] === 2) this.map[y][x] = 0;
                }
            }
        }

        // Mountains as visual only (on walls, doesn't affect pathing)
        let mountainCount = this.biome === 'forest' ? 4 : (this.biome === 'desert' ? 6 : 3);
        for (let m = 0; m < mountainCount; m++) {
            let mx = 2 + Math.floor(Math.random() * (this.mapW - 4));
            let my = 2 + Math.floor(Math.random() * (this.mapH - 4));
            if (this.map[my][mx] === 1) this.map[my][mx] = 3;
        }
    }

    // Check if all floor tiles are connected
    validateConnectivity() {
        // Find first floor tile
        let startX = -1, startY = -1;
        outer: for (let y = 1; y < this.mapH - 1; y++) {
            for (let x = 1; x < this.mapW - 1; x++) {
                if (this.map[y][x] === 0) { startX = x; startY = y; break outer; }
            }
        }
        if (startX === -1) return false;

        // Flood fill
        let visited = [];
        for (let y = 0; y < this.mapH; y++) visited.push(new Array(this.mapW).fill(false));

        let queue = [{ x: startX, y: startY }];
        visited[startY][startX] = true;
        let count = 0;

        while (queue.length > 0) {
            let curr = queue.shift();
            count++;
            [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dy]) => {
                let nx = curr.x + dx, ny = curr.y + dy;
                if (nx >= 0 && nx < this.mapW && ny >= 0 && ny < this.mapH) {
                    if (this.map[ny][nx] === 0 && !visited[ny][nx]) {
                        visited[ny][nx] = true;
                        queue.push({ x: nx, y: ny });
                    }
                }
            });
        }

        // Count total floor tiles
        let totalFloor = 0;
        for (let y = 0; y < this.mapH; y++) {
            for (let x = 0; x < this.mapW; x++) {
                if (this.map[y][x] === 0) totalFloor++;
            }
        }

        // If we reached at least 80% of floor tiles, it's connected enough
        return count >= totalFloor * 0.8;
    }

    addDecorations() {
        for (let y = 1; y < this.mapH - 1; y++) {
            for (let x = 1; x < this.mapW - 1; x++) {
                if (this.map[y][x] === 0) {
                    // More decorations for a lush feel
                    let chance = this.biome === 'forest' ? 0.4 : (this.biome === 'desert' ? 0.15 : 0.12);
                    if (Math.random() < chance) {
                        // 6 decoration types per biome
                        this.decorations[y][x] = 1 + Math.floor(Math.random() * 6);
                    }
                }
            }
        }
    }

    getMobStats() {
        let hpBase = 8 + this.depth * 4, dmgBase = 2 + Math.floor(this.depth * 0.8);
        let roll = Math.random();

        if (this.biome === 'forest') {
            // Forest enemies: Slime, Spider, Treant
            if (roll < 0.5) return { type: 'slime', hp: hpBase, maxHp: hpBase, dmg: dmgBase, xp: 8 + this.depth, color: '#6daa2c', speed: 1 };
            if (roll < 0.8) return { type: 'spider', hp: hpBase - 3, maxHp: hpBase - 3, dmg: dmgBase + 2, xp: 10 + this.depth, color: '#4a3040', speed: 2 };
            return { type: 'treant', hp: hpBase + 10, maxHp: hpBase + 10, dmg: dmgBase + 1, xp: 15 + this.depth, color: '#5c3a20', speed: 0.5 };
        }

        if (this.biome === 'desert') {
            // Desert enemies: Scorpion, Mummy, Sandworm
            if (roll < 0.5) return { type: 'scorpion', hp: hpBase, maxHp: hpBase, dmg: dmgBase + 1, xp: 10 + this.depth, color: '#c9956c', speed: 1 };
            if (roll < 0.8) return { type: 'mummy', hp: hpBase + 5, maxHp: hpBase + 5, dmg: dmgBase, xp: 12 + this.depth, color: '#d4c4a0', speed: 0.7 };
            return { type: 'sandworm', hp: hpBase + 8, maxHp: hpBase + 8, dmg: dmgBase + 3, xp: 18 + this.depth, color: '#8b6b4a', speed: 0.5 };
        }

        // Dungeon enemies: Skeleton, Ghost, Demon
        if (roll < 0.5) return { type: 'skeleton', hp: hpBase, maxHp: hpBase, dmg: dmgBase + 1, xp: 10 + this.depth, color: '#ccc', speed: 1 };
        if (roll < 0.8) return { type: 'ghost', hp: hpBase - 5, maxHp: hpBase - 5, dmg: dmgBase + 2, xp: 12 + this.depth, color: '#8888cc', speed: 1.5 };
        return { type: 'demon', hp: hpBase + 12, maxHp: hpBase + 12, dmg: dmgBase + 4, xp: 20 + this.depth, color: '#d04648', speed: 0.8 };
    }

    getEmptyTile() {
        let attempts = 0;
        while (attempts < 500) {
            let x = 1 + Math.floor(Math.random() * (this.mapW - 2));
            let y = 1 + Math.floor(Math.random() * (this.mapH - 2));
            if (this.map[y][x] === 0 && !this.entities.find(e => e.x === x && e.y === y) && !this.items.find(i => i.x === x && i.y === y)) {
                if (!(x === this.player.x && y === this.player.y)) return { x, y };
            }
            attempts++;
        }
        // Fallback: find any empty tile
        for (let y = 1; y < this.mapH - 1; y++) {
            for (let x = 1; x < this.mapW - 1; x++) {
                if (this.map[y][x] === 0) return { x, y };
            }
        }
        return { x: 1, y: 1 };
    }

    renderMapCache() {
        this.mapCache.width = this.mapW * TILE_SIZE;
        this.mapCache.height = this.mapH * TILE_SIZE;
        let cx = this.mapCtx;
        let pal = this.biome === 'forest' ? 'f' : (this.biome === 'desert' ? 's' : 'd');
        let cFloor = COLORS[pal + '_floor'], cWall = COLORS[pal + '_wall'], cTop = COLORS[pal + '_top'];

        for (let y = 0; y < this.mapH; y++) {
            for (let x = 0; x < this.mapW; x++) {
                let px = x * TILE_SIZE, py = y * TILE_SIZE;
                // Floor
                cx.fillStyle = cFloor[(x + y) % 2];
                cx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

                if (this.map[y][x] === 1) {
                    cx.fillStyle = cWall;
                    cx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                    cx.fillStyle = cTop;
                    if (this.biome === 'forest') {
                        cx.beginPath(); cx.arc(px + 24, py + 20, 20, 0, Math.PI * 2); cx.fill();
                        cx.fillStyle = '#1a3a1a'; cx.fillRect(px + 20, py + 38, 8, 10);
                    } else if (this.biome === 'desert') {
                        cx.beginPath(); cx.moveTo(px + 5, py + 48); cx.lineTo(px + 24, py + 5); cx.lineTo(px + 43, py + 48); cx.fill();
                    } else {
                        cx.fillRect(px + 2, py + 2, 44, 12);
                        cx.fillStyle = '#1a1520'; cx.fillRect(px + 8, py + 22, 8, 6); cx.fillRect(px + 32, py + 22, 8, 6);
                    }
                } else if (this.map[y][x] === 2) {
                    // WATER tile - base layer (animation done in draw())
                    cx.fillStyle = this.biome === 'dungeon' ? '#1a3040' : '#2a5580';
                    cx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                    // Water edge details
                    cx.fillStyle = this.biome === 'dungeon' ? '#0f2030' : '#1a4570';
                    cx.fillRect(px, py, TILE_SIZE, 4);
                    cx.fillRect(px, py + TILE_SIZE - 4, TILE_SIZE, 4);
                } else if (this.map[y][x] === 3) {
                    // MOUNTAIN tile
                    cx.fillStyle = cFloor[(x + y) % 2];
                    cx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                    // Mountain shape
                    if (this.biome === 'forest') {
                        cx.fillStyle = '#4a5a5a';
                        cx.beginPath(); cx.moveTo(px, py + 48); cx.lineTo(px + 24, py + 5); cx.lineTo(px + 48, py + 48); cx.fill();
                        cx.fillStyle = '#6a7a7a';
                        cx.beginPath(); cx.moveTo(px + 10, py + 48); cx.lineTo(px + 24, py + 15); cx.lineTo(px + 38, py + 48); cx.fill();
                        // Snow cap
                        cx.fillStyle = '#fff';
                        cx.beginPath(); cx.moveTo(px + 18, py + 20); cx.lineTo(px + 24, py + 5); cx.lineTo(px + 30, py + 20); cx.fill();
                    } else if (this.biome === 'desert') {
                        // Sand dune / mesa
                        cx.fillStyle = '#a07040';
                        cx.beginPath(); cx.moveTo(px, py + 48); cx.lineTo(px + 12, py + 10); cx.lineTo(px + 36, py + 10); cx.lineTo(px + 48, py + 48); cx.fill();
                        cx.fillStyle = '#c09060';
                        cx.fillRect(px + 12, py + 10, 24, 10);
                    } else {
                        // Dungeon pillar/stalagmite
                        cx.fillStyle = '#3a3040';
                        cx.fillRect(px + 14, py + 8, 20, 38);
                        cx.fillStyle = '#4a4050';
                        cx.fillRect(px + 16, py + 10, 16, 4);
                    }
                } else {
                    let d = this.decorations[y][x];
                    if (d > 0) {
                        if (this.biome === 'forest') {
                            // Forest: 1=grass, 2=flower red, 3=flower yellow, 4=bush, 5=mushroom, 6=rock
                            if (d === 1) {
                                cx.fillStyle = '#4a8a4a';
                                for (let i = 0; i < 3; i++) cx.fillRect(px + 14 + i * 8, py + 30, 3, 12);
                            } else if (d === 2) {
                                cx.fillStyle = '#d04648'; cx.beginPath(); cx.arc(px + 24, py + 34, 5, 0, Math.PI * 2); cx.fill();
                                cx.fillStyle = '#3a6a3a'; cx.fillRect(px + 22, py + 38, 4, 8);
                            } else if (d === 3) {
                                cx.fillStyle = '#dad45e'; cx.beginPath(); cx.arc(px + 24, py + 34, 5, 0, Math.PI * 2); cx.fill();
                                cx.fillStyle = '#3a6a3a'; cx.fillRect(px + 22, py + 38, 4, 8);
                            } else if (d === 4) {
                                cx.fillStyle = '#2d5e2d'; cx.beginPath(); cx.arc(px + 24, py + 32, 10, 0, Math.PI * 2); cx.fill();
                                cx.fillStyle = '#3a7a3a'; cx.beginPath(); cx.arc(px + 20, py + 30, 6, 0, Math.PI * 2); cx.fill();
                            } else if (d === 5) {
                                cx.fillStyle = '#8b4513'; cx.fillRect(px + 22, py + 36, 4, 8);
                                cx.fillStyle = '#cc6666'; cx.beginPath(); cx.arc(px + 24, py + 34, 6, Math.PI, 0); cx.fill();
                            } else {
                                cx.fillStyle = '#555'; cx.beginPath(); cx.arc(px + 24, py + 38, 6, 0, Math.PI * 2); cx.fill();
                            }
                        } else if (this.biome === 'desert') {
                            // Desert: 1=cactus, 2=skull, 3=rock, 4=dead bush, 5=bones, 6=sand pile
                            if (d === 1) {
                                cx.fillStyle = '#5a8a4a'; cx.fillRect(px + 22, py + 14, 4, 28);
                                cx.fillRect(px + 14, py + 22, 8, 4); cx.fillRect(px + 26, py + 28, 8, 4);
                            } else if (d === 2) {
                                cx.fillStyle = '#ddd'; cx.beginPath(); cx.arc(px + 24, py + 36, 6, 0, Math.PI * 2); cx.fill();
                                cx.fillStyle = '#333'; cx.fillRect(px + 20, py + 34, 3, 3); cx.fillRect(px + 25, py + 34, 3, 3);
                            } else if (d === 3) {
                                cx.fillStyle = '#8b6b4a'; cx.beginPath(); cx.arc(px + 24, py + 38, 8, 0, Math.PI * 2); cx.fill();
                            } else if (d === 4) {
                                cx.fillStyle = '#6b5030'; for (let i = 0; i < 4; i++) cx.fillRect(px + 16 + i * 5, py + 32, 2, 10);
                            } else if (d === 5) {
                                cx.fillStyle = '#ccc'; cx.fillRect(px + 18, py + 38, 12, 3); cx.fillRect(px + 22, py + 34, 4, 8);
                            } else {
                                cx.fillStyle = '#c9a06c'; cx.beginPath(); cx.arc(px + 24, py + 40, 10, Math.PI, 0); cx.fill();
                            }
                        } else {
                            // Dungeon: 1=crack, 2=bones, 3=cobweb, 4=puddle, 5=rubble, 6=torch sconce
                            if (d === 1) {
                                cx.strokeStyle = '#1a1520'; cx.lineWidth = 2;
                                cx.beginPath(); cx.moveTo(px + 20, py + 30); cx.lineTo(px + 28, py + 38); cx.stroke();
                            } else if (d === 2) {
                                cx.fillStyle = '#aaa'; cx.fillRect(px + 18, py + 38, 12, 3); cx.fillRect(px + 22, py + 34, 4, 6);
                            } else if (d === 3) {
                                cx.strokeStyle = '#444'; cx.lineWidth = 1;
                                for (let i = 0; i < 4; i++) { cx.beginPath(); cx.moveTo(px + 24, py + 24); cx.lineTo(px + 10 + i * 10, py + 40); cx.stroke(); }
                            } else if (d === 4) {
                                cx.fillStyle = '#2a3a4a'; cx.beginPath(); cx.ellipse(px + 24, py + 38, 10, 5, 0, 0, Math.PI * 2); cx.fill();
                            } else if (d === 5) {
                                cx.fillStyle = '#3a3040'; for (let i = 0; i < 3; i++) cx.fillRect(px + 14 + i * 8, py + 36, 6, 6);
                            } else {
                                cx.fillStyle = '#5a4a40'; cx.fillRect(px + 20, py + 28, 8, 14);
                                cx.fillStyle = '#ff9933'; cx.beginPath(); cx.arc(px + 24, py + 26, 5, 0, Math.PI * 2); cx.fill();
                            }
                        }
                    }
                }
            }
        }
    }

    draw() {
        this.ctx.fillStyle = COLORS.bg;
        this.ctx.fillRect(0, 0, this.width, this.height);

        this.ctx.save();
        let sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
        this.ctx.translate(-Math.floor(this.camera.x) + sx, -Math.floor(this.camera.y) + sy);

        this.ctx.drawImage(this.mapCache, 0, 0);

        // ANIMATED WATER - draw waves on top of cached water tiles
        let wStartX = Math.floor(this.camera.x / TILE_SIZE) - 1;
        let wStartY = Math.floor(this.camera.y / TILE_SIZE) - 1;
        let wEndX = wStartX + Math.ceil(this.width / TILE_SIZE) + 2;
        let wEndY = wStartY + Math.ceil(this.height / TILE_SIZE) + 2;

        for (let y = wStartY; y < wEndY; y++) {
            for (let x = wStartX; x < wEndX; x++) {
                if (y >= 0 && y < this.mapH && x >= 0 && x < this.mapW && this.map[y][x] === 2) {
                    let px = x * TILE_SIZE, py = y * TILE_SIZE;
                    // Animated wave highlights
                    let wave1 = Math.sin(this.tick * 0.1 + x * 0.5 + y * 0.3) * 0.3 + 0.5;
                    let wave2 = Math.sin(this.tick * 0.15 + x * 0.7 - y * 0.2) * 0.2 + 0.5;

                    this.ctx.fillStyle = `rgba(100, 180, 255, ${wave1 * 0.3})`;
                    this.ctx.fillRect(px + 5, py + 10 + Math.sin(this.tick * 0.1 + x) * 3, 38, 6);

                    this.ctx.fillStyle = `rgba(150, 220, 255, ${wave2 * 0.4})`;
                    this.ctx.fillRect(px + 10, py + 25 + Math.sin(this.tick * 0.12 + x + 1) * 2, 28, 4);

                    // Sparkles
                    if (Math.random() < 0.02) {
                        this.ctx.fillStyle = '#fff';
                        this.ctx.fillRect(px + Math.random() * 40 + 4, py + Math.random() * 40 + 4, 3, 3);
                    }

                    // Waterfall effect if wall above
                    if (y > 0 && this.map[y - 1][x] === 1) {
                        this.ctx.fillStyle = 'rgba(150, 200, 255, 0.6)';
                        for (let i = 0; i < 3; i++) {
                            let fy = (this.tick * 3 + i * 15) % 48;
                            this.ctx.fillRect(px + 10 + i * 10, py - 10 + fy * 0.3, 4, 12);
                        }
                    }
                }
            }
        }

        // TRAPS
        this.traps.forEach(t => {
            if (!this.visited[t.y]?.[t.x]) return; // Only show discovered traps
            let x = t.x * TILE_SIZE, y = t.y * TILE_SIZE;
            let pulse = Math.sin(this.tick * 0.15) * 0.2 + 0.8;

            if (t.type === 'spike') {
                this.ctx.fillStyle = t.triggered ? '#666' : '#888';
                for (let i = 0; i < 3; i++) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(x + 12 + i * 10, y + 40);
                    this.ctx.lineTo(x + 17 + i * 10, y + 25);
                    this.ctx.lineTo(x + 22 + i * 10, y + 40);
                    this.ctx.fill();
                }
            } else if (t.type === 'poison') {
                this.ctx.fillStyle = `rgba(153, 51, 255, ${pulse * 0.6})`;
                this.ctx.beginPath(); this.ctx.arc(x + 24, y + 30, 12, 0, Math.PI * 2); this.ctx.fill();
                this.ctx.fillStyle = '#6a2299';
                this.ctx.beginPath(); this.ctx.arc(x + 20, y + 28, 3, 0, Math.PI * 2); this.ctx.fill();
            } else if (t.type === 'fire') {
                this.ctx.fillStyle = `rgba(255, 102, 0, ${pulse})`;
                this.ctx.beginPath();
                this.ctx.moveTo(x + 24, y + 15 + Math.sin(this.tick * 0.2) * 3);
                this.ctx.lineTo(x + 34, y + 40); this.ctx.lineTo(x + 14, y + 40);
                this.ctx.fill();
                this.ctx.fillStyle = '#ffcc00';
                this.ctx.beginPath(); this.ctx.arc(x + 24, y + 32, 6, 0, Math.PI * 2); this.ctx.fill();
            } else if (t.type === 'vine') {
                this.ctx.fillStyle = '#4a7a3a';
                for (let i = 0; i < 4; i++) {
                    this.ctx.fillRect(x + 10 + i * 8, y + 20 + Math.sin(i + this.tick * 0.1) * 3, 4, 20);
                }
            } else if (t.type === 'quicksand') {
                this.ctx.fillStyle = `rgba(180, 140, 80, ${pulse * 0.7})`;
                this.ctx.beginPath(); this.ctx.ellipse(x + 24, y + 32, 16, 10, 0, 0, Math.PI * 2); this.ctx.fill();
            }
        });

        // Items
        this.items.forEach(i => {
            let x = i.x * TILE_SIZE, y = i.y * TILE_SIZE + Math.sin(this.tick * 0.08 + i.x) * 4;
            if (i.type === 'chest') {
                this.ctx.fillStyle = '#6b4423'; this.ctx.fillRect(x + 10, y + 20, 28, 20);
                this.ctx.fillStyle = '#8b6433'; this.ctx.fillRect(x + 10, y + 16, 28, 8);
                this.ctx.fillStyle = '#ffd700'; this.ctx.fillRect(x + 22, y + 22, 4, 8);
            } else if (i.type === 'potion') {
                // Health Potion - Red
                this.ctx.fillStyle = '#d04648'; this.ctx.beginPath(); this.ctx.arc(x + 24, y + 30, 8, 0, Math.PI * 2); this.ctx.fill();
                this.ctx.fillStyle = '#ff8888'; this.ctx.beginPath(); this.ctx.arc(x + 22, y + 28, 3, 0, Math.PI * 2); this.ctx.fill();
                this.ctx.fillStyle = '#8b3030'; this.ctx.fillRect(x + 21, y + 20, 6, 6);
            } else if (i.type === 'mana') {
                // Mana Potion - Blue
                this.ctx.fillStyle = '#597dce'; this.ctx.beginPath(); this.ctx.arc(x + 24, y + 30, 8, 0, Math.PI * 2); this.ctx.fill();
                this.ctx.fillStyle = '#99bbff'; this.ctx.beginPath(); this.ctx.arc(x + 22, y + 28, 3, 0, Math.PI * 2); this.ctx.fill();
                this.ctx.fillStyle = '#3a5590'; this.ctx.fillRect(x + 21, y + 20, 6, 6);
            } else if (i.type === 'strength') {
                // Strength Scroll - Orange
                this.ctx.fillStyle = '#cc7722'; this.ctx.fillRect(x + 18, y + 22, 12, 16);
                this.ctx.fillStyle = '#ff9944'; this.ctx.fillRect(x + 20, y + 24, 8, 12);
                this.ctx.fillStyle = '#ffcc00'; this.ctx.fillText('⚔', x + 24, y + 34);
            } else if (i.type === 'shield') {
                // Shield Scroll - Green
                this.ctx.fillStyle = '#447733'; this.ctx.fillRect(x + 18, y + 22, 12, 16);
                this.ctx.fillStyle = '#66aa55'; this.ctx.fillRect(x + 20, y + 24, 8, 12);
                this.ctx.fillStyle = '#aaffaa'; this.ctx.fillText('🛡', x + 24, y + 34);
            } else if (i.type === 'coin') {
                // Gold Coin
                this.ctx.fillStyle = '#ffd700'; this.ctx.beginPath(); this.ctx.arc(x + 24, y + 28, 6, 0, Math.PI * 2); this.ctx.fill();
                this.ctx.fillStyle = '#ffee88'; this.ctx.beginPath(); this.ctx.arc(x + 23, y + 27, 2, 0, Math.PI * 2); this.ctx.fill();
            } else if (i.type === 'gem') {
                // Purple Gem
                this.ctx.fillStyle = '#aa33ff';
                this.ctx.beginPath();
                this.ctx.moveTo(x + 24, y + 20); this.ctx.lineTo(x + 32, y + 30); this.ctx.lineTo(x + 24, y + 38); this.ctx.lineTo(x + 16, y + 30);
                this.ctx.closePath(); this.ctx.fill();
                this.ctx.fillStyle = '#dd88ff'; this.ctx.beginPath(); this.ctx.arc(x + 22, y + 28, 3, 0, Math.PI * 2); this.ctx.fill();
            } else if (i.type === 'mushroom') {
                // Forest Mushroom
                this.ctx.fillStyle = '#8b4513'; this.ctx.fillRect(x + 22, y + 32, 4, 10);
                this.ctx.fillStyle = '#d04648'; this.ctx.beginPath(); this.ctx.arc(x + 24, y + 30, 8, Math.PI, 0); this.ctx.fill();
                this.ctx.fillStyle = '#fff';
                this.ctx.beginPath(); this.ctx.arc(x + 20, y + 26, 2, 0, Math.PI * 2); this.ctx.fill();
                this.ctx.beginPath(); this.ctx.arc(x + 28, y + 28, 2, 0, Math.PI * 2); this.ctx.fill();
            }
        });

        // Entities
        this.entities.sort((a, b) => a.y - b.y).forEach(e => {
            let x = e.vx * TILE_SIZE, y = e.vy * TILE_SIZE;

            // BOSS rendering
            if (e.type === 'boss') {
                let pulse = Math.sin(this.tick * 0.1) * 0.1 + 1;
                // Large shadow
                this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
                this.ctx.beginPath(); this.ctx.ellipse(x + 24, y + 44, 20 * pulse, 8, 0, 0, Math.PI * 2); this.ctx.fill();
                // Large body
                this.ctx.fillStyle = e.color;
                this.ctx.beginPath(); this.ctx.ellipse(x + 24, y + 28, 18 * pulse, 20 * pulse, 0, 0, Math.PI * 2); this.ctx.fill();
                // Eyes - glowing red
                this.ctx.fillStyle = '#ff0000';
                this.ctx.beginPath(); this.ctx.arc(x + 18, y + 22, 5, 0, Math.PI * 2); this.ctx.fill();
                this.ctx.beginPath(); this.ctx.arc(x + 30, y + 22, 5, 0, Math.PI * 2); this.ctx.fill();
                // Crown/horns
                this.ctx.fillStyle = '#ffd700';
                this.ctx.beginPath();
                this.ctx.moveTo(x + 10, y + 10); this.ctx.lineTo(x + 16, y + 0); this.ctx.lineTo(x + 22, y + 10);
                this.ctx.fill();
                this.ctx.beginPath();
                this.ctx.moveTo(x + 26, y + 10); this.ctx.lineTo(x + 32, y + 0); this.ctx.lineTo(x + 38, y + 10);
                this.ctx.fill();
                // Boss HP bar (larger)
                this.ctx.fillStyle = '#333'; this.ctx.fillRect(x, y - 10, 48, 8);
                this.ctx.fillStyle = '#ff0000'; this.ctx.fillRect(x, y - 10, 48 * (e.hp / e.maxHp), 8);
                this.ctx.strokeStyle = '#ffd700'; this.ctx.lineWidth = 1; this.ctx.strokeRect(x, y - 10, 48, 8);
                return;
            }

            // Shadow
            this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
            this.ctx.beginPath(); this.ctx.ellipse(x + 24, y + 42, 14, 5, 0, 0, Math.PI * 2); this.ctx.fill();
            // Body
            this.ctx.fillStyle = e.color;
            if (e.type === 'slime') {
                let bounce = Math.sin(this.tick * 0.15) * 2;
                this.ctx.beginPath(); this.ctx.ellipse(x + 24, y + 30 + bounce, 14, 12 - bounce / 2, 0, 0, Math.PI * 2); this.ctx.fill();
            } else if (e.type === 'scorpion') {
                this.ctx.fillRect(x + 12, y + 32, 24, 8);
                this.ctx.fillRect(x + 8, y + 28, 6, 6); this.ctx.fillRect(x + 34, y + 28, 6, 6);
                this.ctx.fillStyle = '#ff6b6b'; this.ctx.fillRect(x + 38, y + 18, 4, 12);
            } else if (e.type === 'spider') {
                this.ctx.beginPath(); this.ctx.ellipse(x + 24, y + 32, 10, 8, 0, 0, Math.PI * 2); this.ctx.fill();
                for (let i = 0; i < 4; i++) {
                    this.ctx.fillRect(x + 8 + i * 2, y + 26 + i * 3, 2, 8);
                    this.ctx.fillRect(x + 36 - i * 2, y + 26 + i * 3, 2, 8);
                }
            } else if (e.type === 'ghost') {
                this.ctx.globalAlpha = 0.7;
                this.ctx.beginPath(); this.ctx.ellipse(x + 24, y + 28, 12, 14, 0, 0, Math.PI * 2); this.ctx.fill();
                this.ctx.fillStyle = '#fff'; this.ctx.fillRect(x + 18, y + 22, 4, 4); this.ctx.fillRect(x + 26, y + 22, 4, 4);
                this.ctx.globalAlpha = 1;
            } else {
                this.ctx.fillRect(x + 18, y + 18, 12, 20);
                this.ctx.fillStyle = '#fff'; this.ctx.fillRect(x + 20, y + 20, 3, 3); this.ctx.fillRect(x + 25, y + 20, 3, 3);
            }
            // HP Bar
            this.ctx.fillStyle = '#333'; this.ctx.fillRect(x + 10, y + 8, 28, 4);
            this.ctx.fillStyle = '#d04648'; this.ctx.fillRect(x + 10, y + 8, 28 * (e.hp / e.maxHp), 4);
        });

        // Player
        let px = this.player.vx * TILE_SIZE, py = this.player.vy * TILE_SIZE;
        this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
        this.ctx.beginPath(); this.ctx.ellipse(px + 24, py + 42, 12, 5, 0, 0, Math.PI * 2); this.ctx.fill();
        // Body
        this.ctx.fillStyle = '#fbf5ef'; this.ctx.fillRect(px + 18, py + 20, 12, 18);
        // Armor
        this.ctx.fillStyle = '#597dce'; this.ctx.fillRect(px + 16, py + 24, 16, 10);
        // Helmet
        this.ctx.fillStyle = '#4a6db8'; this.ctx.fillRect(px + 16, py + 14, 16, 10);
        this.ctx.fillStyle = '#fff'; this.ctx.fillRect(px + 18, py + 17, 4, 4); this.ctx.fillRect(px + 26, py + 17, 4, 4);

        // Particles
        this.particles.forEach(p => {
            this.ctx.globalAlpha = Math.min(1, p.life / 15);
            this.ctx.fillStyle = p.color;
            this.ctx.fillRect(p.x - 2, p.y - 2, p.size || 4, p.size || 4);
        });
        this.ctx.globalAlpha = 1;

        // Texts
        this.ctx.font = "bold 18px 'Segoe UI', sans-serif";
        this.ctx.textAlign = "center";
        this.texts.forEach(t => {
            this.ctx.fillStyle = '#000'; this.ctx.fillText(t.text, t.x + 1, t.y + 1);
            this.ctx.fillStyle = t.color; this.ctx.fillText(t.text, t.x, t.y);
        });

        // Fog
        this.ctx.fillStyle = '#000';
        let startX = Math.floor(this.camera.x / TILE_SIZE) - 1;
        let startY = Math.floor(this.camera.y / TILE_SIZE) - 1;
        let endX = startX + Math.ceil(this.width / TILE_SIZE) + 2;
        let endY = startY + Math.ceil(this.height / TILE_SIZE) + 2;
        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                if (y >= 0 && y < this.mapH && x >= 0 && x < this.mapW && !this.visited[y][x]) {
                    this.ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
            }
        }

        this.ctx.restore();
        this.drawMinimap();
        this.drawVignette();
    }

    drawVignette() {
        let grd = this.ctx.createRadialGradient(this.width / 2, this.height / 2, this.height * 0.3, this.width / 2, this.height / 2, this.height * 0.8);
        grd.addColorStop(0, 'rgba(0,0,0,0)');
        grd.addColorStop(1, 'rgba(0,0,0,0.5)');
        this.ctx.fillStyle = grd;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    drawMinimap() {
        if (!this.mmCtx) return;
        let mm = this.mmCtx;
        mm.fillStyle = '#111'; mm.fillRect(0, 0, 120, 90);
        let tw = 120 / this.mapW, th = 90 / this.mapH;
        for (let y = 0; y < this.mapH; y++) {
            for (let x = 0; x < this.mapW; x++) {
                if (this.visited[y][x]) {
                    let tile = this.map[y][x];
                    if (tile === 1) mm.fillStyle = '#444';        // Wall
                    else if (tile === 2) mm.fillStyle = '#2a5580'; // Water
                    else if (tile === 3) mm.fillStyle = '#5a5a5a'; // Mountain
                    else mm.fillStyle = '#2a2a2a';                 // Floor
                    mm.fillRect(x * tw, y * th, Math.ceil(tw), Math.ceil(th));
                }
            }
        }
        mm.fillStyle = '#d04648';
        this.entities.forEach(e => { if (this.visited[e.y]?.[e.x]) mm.fillRect(e.x * tw, e.y * th, tw * 1.5, th * 1.5); });
        mm.fillStyle = '#ffd700';
        this.items.filter(i => i.type === 'chest').forEach(i => { if (this.visited[i.y]?.[i.x]) mm.fillRect(i.x * tw, i.y * th, tw * 2, th * 2); });
        mm.fillStyle = '#fff';
        mm.fillRect(this.player.x * tw, this.player.y * th, tw * 2, th * 2);
    }

    updateScentMap() {
        for (let y = 0; y < this.mapH; y++) this.scent[y].fill(9999);
        let q = [{ x: this.player.x, y: this.player.y }];
        this.scent[this.player.y][this.player.x] = 0;
        while (q.length) {
            let c = q.shift();
            let d = this.scent[c.y][c.x];
            if (d > 15) continue;
            [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dy]) => {
                let nx = c.x + dx, ny = c.y + dy;
                if (nx >= 0 && nx < this.mapW && ny >= 0 && ny < this.mapH && this.map[ny][nx] === 0 && this.scent[ny][nx] > d + 1) {
                    this.scent[ny][nx] = d + 1;
                    q.push({ x: nx, y: ny });
                }
            });
        }
    }

    updateVisibility() {
        let r = 6;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                let x = this.player.x + dx, y = this.player.y + dy;
                if (x >= 0 && x < this.mapW && y >= 0 && y < this.mapH && dx * dx + dy * dy < r * r) {
                    this.visited[y][x] = true;
                }
            }
        }
    }

    updateUI() {
        const hpEl = document.getElementById('val-hp');
        const hpFill = document.getElementById('hp-fill');
        const depthEl = document.getElementById('val-depth');
        const lvlEl = document.getElementById('val-lvl');
        const scoreEl = document.getElementById('val-score');
        const coinsEl = document.getElementById('val-coins');

        if (hpEl) hpEl.innerText = `${this.player.hp}/${this.player.maxHp}`;
        if (hpFill) hpFill.style.width = `${(this.player.hp / this.player.maxHp) * 100}%`;
        if (depthEl) depthEl.innerText = this.depth + (this.isBossLevel ? ' 👹' : '');
        if (lvlEl) lvlEl.innerText = this.player.lvl;
        if (scoreEl) scoreEl.innerText = this.score;
        if (coinsEl) coinsEl.innerText = this.coins;

        // XP bar
        const xpEl = document.getElementById('val-xp');
        const xpFill = document.getElementById('xp-fill');
        if (xpEl) xpEl.innerText = `${this.player.xp}/${this.player.nextXp}`;
        if (xpFill) xpFill.style.width = `${(this.player.xp / this.player.nextXp) * 100}%`;
    }

    addText(x, y, text, color) { this.texts.push({ x, y, text, color, life: 50 }); }
    addParticles(x, y, color, n) {
        for (let i = 0; i < n; i++) {
            this.particles.push({ x, y, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8 - 2, life: 25 + Math.random() * 15, color, size: 3 + Math.random() * 3 });
        }
    }
    spawnAmbientParticle() {
        let x = this.camera.x + Math.random() * this.width;
        let y = this.camera.y + Math.random() * this.height;
        let c = this.biome === 'forest' ? '#4a7a4a' : (this.biome === 'desert' ? '#c9956c55' : '#4a4a5a');
        this.particles.push({ x, y, vx: (Math.random() - 0.5) * 0.5, vy: this.biome === 'desert' ? -0.3 : 0.3, life: 80, color: c, size: 2, ambient: true });
    }
    gameOver() {
        this.active = false;
        this.saveHighScore();

        const goEl = document.getElementById('game-over');
        if (goEl) {
            goEl.style.display = 'flex';
            // Add score display
            let scoreDiv = goEl.querySelector('.final-score');
            if (!scoreDiv) {
                scoreDiv = document.createElement('div');
                scoreDiv.className = 'final-score';
                goEl.insertBefore(scoreDiv, goEl.querySelector('.menu-btn'));
            }
            scoreDiv.innerHTML = `<div style="margin:20px 0;font-size:24px;">Score: <span style="color:#ffd700">${this.score}</span></div>
                <div style="font-size:16px;opacity:0.8;">Coins: ${this.coins} | Depth: ${this.depth} | Level: ${this.player.lvl}</div>`;
        }
    }
}

// Initialize
const game = new Game();
function selectMission(type) {
    if (type === 'forest') window.location.href = 'forest.html';
    else if (type === 'desert') window.location.href = 'desert.html';
    else if (type === 'dungeon') window.location.href = 'dungeon.html';
}
function resetGame() { if (game) game.start(game.biome); }
function resumeGame() { if (game) game.togglePause(); }
function showMainMenu() { window.location.href = 'index.html'; }

