/**
 * Dungeon Delver: Legends
 * High-Performance Roguelike Engine
 */

// --- Configuration ---
const TILE_SIZE = 48;
const COLORS = {
    bg: '#0a0a0c',
    white: '#fbf5ef', red: '#d04648', green: '#6daa2c', blue: '#597dce', yellow: '#dad45e', grey: '#8595a1',
    f_floor: ['#1a2e1a', '#1f3520'], f_wall: '#2d1d12', f_top: '#2d5e2d', // Forest
    s_floor: ['#8b5a3c', '#9a6644'], s_wall: '#5c3a20', s_top: '#c9956c', // Desert
    d_floor: ['#1a1520', '#1f1825'], d_wall: '#2a1f30', d_top: '#4a3d55'  // Dungeon
};

class SeededRandom {
    constructor(seed) {
        this.seed = seed % 2147483647;
        if (this.seed <= 0) this.seed += 2147483646;
    }
    next() {
        return this.seed = this.seed * 16807 % 2147483647;
    }
    float() {
        return (this.next() - 1) / 2147483646;
    }
}

class ShadowCaster {
    constructor(isBlocking) { this.isBlocking = isBlocking; }
    compute(cx, cy, r, callback) {
        callback(cx, cy);
        const steps = 720;
        for (let i = 0; i < steps; i++) {
            let rad = (i / steps) * Math.PI * 2;
            let dx = Math.cos(rad);
            let dy = Math.sin(rad);
            let x = cx + 0.5, y = cy + 0.5;
            for (let j = 0; j < r; j++) {
                x += dx; y += dy;
                let tx = Math.floor(x), ty = Math.floor(y);
                callback(tx, ty);
                if (this.isBlocking(tx, ty)) break;
            }
        }
    }
}

class Entity {
    constructor(game, x, y) {
        this.game = game;
        this.x = x; this.y = y;
        this.vx = x; this.vy = y;
        this.hp = 10; this.maxHp = 10;
        this.dead = false;
        this.color = '#fff';
    }

    update() {
        this.vx += (this.x - this.vx) * 0.25;
        this.vy += (this.y - this.vy) * 0.25;
    }

    draw(ctx) {
        let px = this.vx * TILE_SIZE, py = this.vy * TILE_SIZE;
        ctx.fillStyle = this.color;
        ctx.fillRect(px + 12, py + 12, 24, 24);
    }

    takeDamage(amount, type) {
        this.hp -= amount;
        this.game.addText(this.vx * TILE_SIZE + 24, this.vy * TILE_SIZE, `-${amount}`, '#fff');
        if (this.hp <= 0) this.die();
    }

    die() { this.dead = true; }
}

class Player extends Entity {
    constructor(game) {
        super(game, 1, 1);
        this.xp = 0; this.nextXp = 50; this.lvl = 1;
        this.baseDmg = 5;
        this.class = 'knight';
        this.moving = false;
        this.timer = 0;
        this.inputBuffer = null;
        this.inventory = [null, null, null];
        this.weapon = { name: 'Rusty Sword', rarity: 'common', dmg: 2, element: null };
        this.skillCooldown = 0;
        this.maxCooldown = 20;
    }

    get dmg() { return this.baseDmg + (this.weapon ? this.weapon.dmg : 0); }

    update() {
        super.update();
        const cdEl = document.getElementById('skill-cooldown');
        if (cdEl) {
            let pct = (this.skillCooldown / this.maxCooldown) * 100;
            cdEl.style.height = `${pct}%`;
        }
    }

    useSkill() {
        if (this.skillCooldown > 0) {
            this.game.addText(this.vx * TILE_SIZE + 24, this.vy * TILE_SIZE - 20, "Not Ready!", '#888');
            return;
        }

        let used = false;
        if (this.class === 'knight') {
            used = true;
            this.game.shake = 20;
            this.game.playSound('kill');
            this.game.addText(this.vx * TILE_SIZE + 24, this.vy * TILE_SIZE - 30, "POWER STRIKE!", '#ffd700');
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx===0 && dy===0) continue;
                    let nx = this.x + dx, ny = this.y + dy;
                    let enemy = this.game.entities.find(e => e.x === nx && e.y === ny);
                    if (enemy) {
                        enemy.takeDamage(this.dmg * 3, 'physical');
                        this.game.addParticles(nx * TILE_SIZE + 24, ny * TILE_SIZE + 24, '#ffd700', 15);
                    }
                }
            }
        } else if (this.class === 'rogue') {
            used = true;
            this.game.addText(this.vx * TILE_SIZE + 24, this.vy * TILE_SIZE - 30, "SHADOW DASH!", '#00ffff');
            this.game.playSound('coin');

            let best = null;
            // Try to teleport forward (based on input buffer or random)
            for(let i=0; i<10; i++) {
                let rx = this.x + Math.floor(this.game.random() * 9) - 4;
                let ry = this.y + Math.floor(this.game.random() * 9) - 4;
                if (rx > 0 && rx < this.game.mapW && this.game.map[ry][rx] === 0) {
                    best = {x:rx, y:ry};
                    if (this.game.random() > 0.5) break;
                }
            }
            if (best) {
                this.x = best.x; this.y = best.y;
                this.vx = this.x; this.vy = this.y;
                this.game.updateFOV();
            }
        } else if (this.class === 'wizard') {
            used = true;
            this.game.shake = 15;
            this.game.playSound('levelup');
            this.game.addText(this.vx * TILE_SIZE + 24, this.vy * TILE_SIZE - 30, "THUNDER NOVA!", '#9933ff');
            this.game.entities.forEach(e => {
                if (this.game.visible[e.y]?.[e.x]) {
                    e.takeDamage(this.dmg * 2, 'magic');
                    this.game.addParticles(e.vx * TILE_SIZE + 24, e.vy * TILE_SIZE + 24, '#9933ff', 20);
                }
            });
        }

        if (used) {
            this.skillCooldown = this.maxCooldown;
            this.game.processTurn();
        }
    }

    draw(ctx) {
        let px = this.vx * TILE_SIZE, py = this.vy * TILE_SIZE;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.ellipse(px + 24, py + 42, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fbf5ef'; ctx.fillRect(px + 18, py + 20, 12, 18);
        let armorColor = this.class === 'rogue' ? '#333' : (this.class === 'wizard' ? '#4a1a4a' : '#888');
        ctx.fillStyle = armorColor; ctx.fillRect(px + 16, py + 24, 16, 10);
        ctx.fillStyle = this.class === 'knight' ? '#aaa' : (this.class === 'rogue' ? '#222' : '#593399');
        ctx.fillRect(px + 16, py + 14, 16, 10);
        ctx.fillStyle = '#fff'; ctx.fillRect(px + 18, py + 17, 4, 4); ctx.fillRect(px + 26, py + 17, 4, 4);

        if (this.weapon) {
            ctx.fillStyle = this.weapon.rarity === 'legendary' ? '#ffd700' : (this.weapon.rarity === 'rare' ? '#9933ff' : '#888');
            ctx.fillRect(px + 30, py + 24, 4, 12);
        }
    }
}

class Enemy extends Entity {
    constructor(game, x, y, type) {
        super(game, x, y);
        this.type = type;
        // Stats based on type
        this.hp = 20; this.dmg = 3; this.xp = 10; this.color = '#ccc';
        if (type === 'slime') { this.hp = 15; this.color = '#6daa2c'; }
        if (type === 'bat') { this.hp = 10; this.color = '#a020f0'; }
        if (type === 'goblin') { this.hp = 25; this.color = '#2d5e2d'; }
        if (type === 'skeleton') { this.hp = 20; this.color = '#eee'; }
        if (type === 'archer') { this.hp = 15; this.color = '#888'; }
        if (type === 'mummy') { this.hp = 30; this.color = '#d4c4a0'; }
        if (type === 'boss') { this.hp = 100; this.color = '#d04648'; this.maxHp = 100; }
        this.maxHp = this.hp;

        this.state = 'IDLE';
        this.alerted = false;
        this.attackTarget = null;
    }

    takeTurn() {
        if (this.dead) return;
        const dist = Math.abs(this.x - this.game.player.x) + Math.abs(this.y - this.game.player.y);

        if (this.state === 'COOLDOWN') { this.state = 'CHASE'; return; }
        if (this.state === 'ATTACK') { this.state = 'IDLE'; }
        if (this.state === 'PREPARE') {
            this.state = 'ATTACK';
            this.performAttack();
            this.state = 'COOLDOWN';
            return;
        }

        if (dist < 8) {
            this.state = 'CHASE';
            if (!this.alerted) { this.alerted = true; this.game.addText(this.x * TILE_SIZE + 24, this.y * TILE_SIZE, "!", "#ff0000"); }
        }

        if (this.state === 'CHASE') {
            // Ranged Logic (Archer, Skeleton)
            if (['archer', 'skeleton'].includes(this.type)) {
                let dx = this.game.player.x - this.x;
                let dy = this.game.player.y - this.y;
                if ((dx === 0 || dy === 0) && dist <= 6) {
                    if (this.hasLineOfSight(this.game.player.x, this.game.player.y)) {
                        this.state = 'PREPARE';
                        this.attackTarget = { x: this.game.player.x, y: this.game.player.y, type: 'ranged' };
                        this.game.playSound('step');
                        return;
                    }
                }
            }

            if (dist === 1) {
                this.state = 'PREPARE';
                this.attackTarget = { x: this.game.player.x, y: this.game.player.y, type: 'melee' };
                this.game.playSound('step');
            } else {
                this.moveTowardsPlayer();
            }
        }
    }

    hasLineOfSight(tx, ty) {
        let dx = Math.sign(tx - this.x);
        let dy = Math.sign(ty - this.y);
        let x = this.x + dx, y = this.y + dy;
        while (x !== tx || y !== ty) {
             let tile = this.game.map[y][x];
             if (tile === 1 || tile === 3) return false;
             x += dx; y += dy;
        }
        return true;
    }

    moveTowardsPlayer() {
        let best = { x: this.x, y: this.y, val: 9999 };
        [[0, 1], [0, -1], [1, 0], [-1, 0]].sort(() => this.game.random() - 0.5).forEach(([dx, dy]) => {
            let nx = this.x + dx, ny = this.y + dy;
            if (nx >= 0 && nx < this.game.mapW && ny >= 0 && ny < this.game.mapH && this.game.map[ny][nx] === 0) {
                if (!this.game.entities.find(e => e.x === nx && e.y === ny) && (nx !== this.game.player.x || ny !== this.game.player.y)) {
                    let val = this.game.scent[ny]?.[nx] ?? 9999;
                    if (val < best.val) best = { x: nx, y: ny, val };
                }
            }
        });
        if (best.x !== this.x || best.y !== this.y) { this.x = best.x; this.y = best.y; }
    }

    performAttack() {
        if (!this.attackTarget) return;
        if (this.attackTarget.type === 'ranged') {
            this.game.addParticles(this.attackTarget.x * TILE_SIZE + 24, this.attackTarget.y * TILE_SIZE + 24, '#ff0000', 5);
        }
        if (this.game.player.x === this.attackTarget.x && this.game.player.y === this.attackTarget.y) {
            this.game.attack(this, this.game.player);
        } else {
            this.game.addText(this.attackTarget.x * TILE_SIZE + 24, this.attackTarget.y * TILE_SIZE, "MISS", "#aaa");
        }
    }

    draw(ctx) {
        let px = this.vx * TILE_SIZE, py = this.vy * TILE_SIZE;
        if (this.state === 'PREPARE') {
            ctx.fillStyle = '#ff0000'; ctx.beginPath(); ctx.moveTo(px + 12, py - 5); ctx.lineTo(px + 36, py - 5); ctx.lineTo(px + 24, py + 5); ctx.fill();
            if (this.attackTarget && this.attackTarget.type === 'ranged') {
                ctx.save();
                ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(px + 24, py + 24); ctx.lineTo(this.attackTarget.x * TILE_SIZE + 24, this.attackTarget.y * TILE_SIZE + 24); ctx.stroke();
                ctx.restore();
            }
        }

        ctx.fillStyle = this.type === 'boss' ? this.color : (this.state === 'PREPARE' ? '#ff4444' : this.color);
        if (this.type === 'slime') {
            let b = Math.sin(this.game.tick * 0.15) * 2;
            ctx.beginPath(); ctx.ellipse(px + 24, py + 30 + b, 14, 12-b/2, 0, 0, Math.PI*2); ctx.fill();
        } else {
            ctx.fillRect(px + 12, py + 12, 24, 24);
        }
        // HP Bar
        ctx.fillStyle = '#333'; ctx.fillRect(px + 10, py + 8, 28, 4);
        ctx.fillStyle = '#d04648'; ctx.fillRect(px + 10, py + 8, 28 * (this.hp / this.maxHp), 4);
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.mapCache = document.createElement('canvas');
        this.mapCtx = this.mapCache.getContext('2d');
        const mmEl = document.getElementById('minimap-container');
        this.mmCtx = mmEl ? mmEl.getContext('2d') : null;
        this.width = window.innerWidth; this.height = window.innerHeight;
        this.canvas.width = this.width; this.canvas.height = this.height;
        this.ctx.imageSmoothingEnabled = false;
        this.biome = 'dungeon';
        this.depth = 1;
        this.active = false; this.paused = false; this.tick = 0;
        this.map = []; this.visible = []; this.visited = []; this.scent = [];
        this.entities = []; this.particles = []; this.texts = []; this.items = []; this.traps = [];
        this.player = new Player(this);
        this.camera = { x: 0, y: 0 };
        this.shake = 0;
        const urlParams = new URLSearchParams(window.location.search);
        let seed = urlParams.get('seed') ? parseInt(urlParams.get('seed')) : Date.now();
        this.baseSeed = seed;
        this.rng = new SeededRandom(this.baseSeed);
        this.isDaily = urlParams.get('daily') === 'true';
        this.initSounds();
        this.bindInput();
        window.addEventListener('resize', () => this.resize());
    }

    random() { return this.rng.float(); }

    initSounds() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.playSound = (type) => {
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.connect(gain); gain.connect(this.audioCtx.destination);
            if (type === 'hit') { osc.type = 'square'; osc.frequency.setValueAtTime(150, this.audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(40, this.audioCtx.currentTime + 0.1); }
            else if (type === 'kill') { osc.type = 'sawtooth'; osc.frequency.value = 100; gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.3); }
            else if (type === 'coin') { osc.type = 'sine'; osc.frequency.setValueAtTime(1200, this.audioCtx.currentTime); osc.frequency.setValueAtTime(1600, this.audioCtx.currentTime + 0.1); }
            else if (type === 'step') { osc.type = 'triangle'; osc.frequency.value = 50; gain.gain.value = 0.1; gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.05); }
            else if (type === 'levelup') { osc.type = 'sine'; osc.frequency.setValueAtTime(400, this.audioCtx.currentTime); osc.frequency.linearRampToValueAtTime(800, this.audioCtx.currentTime + 0.5); }
            osc.start(); osc.stop(this.audioCtx.currentTime + 0.3);
        };
    }

    resize() {
        this.width = window.innerWidth; this.height = window.innerHeight;
        this.canvas.width = this.width; this.canvas.height = this.height;
        this.ctx.imageSmoothingEnabled = false;
    }

    bindInput() {
        this.keys = {};
        window.addEventListener('keydown', e => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd', 'q', '1', '2', '3'].includes(e.key)) e.preventDefault();
            this.keys[e.key] = true;
            this.player.inputBuffer = e.key;
            if (e.key === 'q') this.player.useSkill();
            if (['1','2','3'].includes(e.key)) this.useItem(parseInt(e.key)-1);
            if (e.key === 'Escape') this.togglePause();
        });
        window.addEventListener('keyup', e => this.keys[e.key] = false);
    }

    togglePause() { this.paused = !this.paused; document.getElementById('pause-menu').style.display = this.paused ? 'flex' : 'none'; }

    start(biome) {
        this.biome = biome;
        this.depth = 1;
        this.player = new Player(this);
        let cls = localStorage.getItem('selectedClass') || 'knight';
        if (cls === 'warrior') cls = 'knight';
        if (cls === 'mage') cls = 'wizard';
        this.player.class = cls;
        if (this.player.class === 'knight') { this.player.maxHp = 60; this.player.hp = 60; this.player.weapon = {name:'Iron Sword', rarity:'common', dmg:3}; }
        if (this.player.class === 'rogue') { this.player.maxHp = 40; this.player.hp = 40; this.player.weapon = {name:'Dagger', rarity:'common', dmg:2}; }
        if (this.player.class === 'wizard') { this.player.maxHp = 30; this.player.hp = 30; this.player.weapon = {name:'Staff', rarity:'common', dmg:1}; }
        this.generateLevel();
        this.active = true;
        this.updateUI();
        requestAnimationFrame(() => this.loop());
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('ui-layer').style.display = 'flex';
        document.getElementById('game-over').style.display = 'none';
    }

    loop() {
        if (!this.active) return;
        this.tick++;
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    update() {
        if (this.paused) return;
        if (!this.player.moving) {
            let k = this.player.inputBuffer;
            let dx=0, dy=0;
            if (k==='ArrowUp'||k==='w') dy=-1;
            else if (k==='ArrowDown'||k==='s') dy=1;
            else if (k==='ArrowLeft'||k==='a') dx=-1;
            else if (k==='ArrowRight'||k==='d') dx=1;
            if (dx!==0 || dy!==0) this.movePlayer(dx, dy);
        } else {
            this.player.timer--;
            if (this.player.timer<=0) this.player.moving=false;
        }
        if (this.player.moving) this.player.inputBuffer = null;
        let tx = this.player.vx * TILE_SIZE - this.width/2;
        let ty = this.player.vy * TILE_SIZE - this.height/2;
        this.camera.x += (tx - this.camera.x) * 0.1;
        this.camera.y += (ty - this.camera.y) * 0.1;
        this.player.update();
        this.entities.forEach(e => e.update());
        this.particles = this.particles.filter(p => p.life > 0);
        this.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life--; p.vy += 0.2; });
        this.texts = this.texts.filter(t => t.life > 0);
        this.texts.forEach(t => { t.y -= 0.5; t.life--; });
        if (this.shake > 0) this.shake *= 0.85;
    }

    movePlayer(dx, dy) {
        let nx = this.player.x + dx, ny = this.player.y + dy;
        if (nx<0||nx>=this.mapW||ny<0||ny>=this.mapH) return;
        let target = this.entities.find(e => e.x === nx && e.y === ny);
        if (target) {
            this.attack(this.player, target);
            this.player.vx += dx * 0.2; this.player.vy += dy * 0.2;
            this.player.moving = true; this.player.timer = 8;
            this.processTurn();
            return;
        }
        if (this.map[ny][nx] !== 0) return;
        this.player.x = nx; this.player.y = ny;
        this.player.moving = true; this.player.timer = 6;
        let itemIdx = this.items.findIndex(i => i.x === nx && i.y === ny);
        if (itemIdx !== -1) { this.collect(this.items[itemIdx]); this.items.splice(itemIdx, 1); }
        let trap = this.traps.find(t => t.x === nx && t.y === ny);
        if (trap) { trap.triggered = true; this.player.takeDamage(5, 'trap'); this.addText(nx*TILE_SIZE, ny*TILE_SIZE, "TRAP!", '#f00'); }
        this.updateFOV();
        this.processTurn();
    }

    processTurn() {
        this.updateScentMap();
        this.entities.forEach(e => e.takeTurn());
        if (this.player.skillCooldown > 0) this.player.skillCooldown--;
        this.updateUI();
    }

    attack(attacker, defender) {
        let dmg = attacker.dmg;
        if (attacker === this.player && this.player.weapon && this.player.weapon.element) {
            this.addText(defender.vx*TILE_SIZE, defender.vy*TILE_SIZE, this.player.weapon.element.toUpperCase() + "!", '#fa0');
        }
        defender.takeDamage(dmg);
        this.shake = 5;
        this.playSound('hit');
        if (defender.dead) {
            if (defender === this.player) { this.gameOver(); }
            else {
                this.entities = this.entities.filter(e => e !== defender);
                this.player.xp += defender.xp;
                if (this.player.xp >= this.player.nextXp) this.levelUp();
                if (this.random() < 0.3) this.dropLoot(defender.x, defender.y);
            }
        }
        this.updateUI();
    }

    dropLoot(x, y) {
        let r = this.random();
        if (r < 0.6) this.items.push({x, y, type: 'potion', rarity:'common'});
        else if (r < 0.9) this.items.push({x, y, type: 'weapon', rarity:'common'});
        else this.items.push({x, y, type: 'weapon', rarity:'rare'});
    }

    collect(item) {
        this.playSound('coin');
        if (item.type === 'potion') {
            let added = false;
            for(let i=0; i<3; i++) {
                if (!this.player.inventory[i]) {
                    this.player.inventory[i] = item;
                    added = true;
                    this.addText(this.player.x*TILE_SIZE, this.player.y*TILE_SIZE, "Got Potion", '#0f0');
                    break;
                }
            }
            if (!added) {
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
                this.addText(this.player.x*TILE_SIZE, this.player.y*TILE_SIZE, "+20 HP", '#0f0');
            }
        } else if (item.type === 'weapon') {
            this.player.weapon = { name: 'Sword', rarity: item.rarity, dmg: item.rarity==='rare'?5:3, element: this.random()<0.3 ? 'burn' : null };
            this.addText(this.player.x*TILE_SIZE, this.player.y*TILE_SIZE, "Equipped " + this.player.weapon.name, '#ff0');
        } else if (item.type === 'chest') {
            this.depth++;
            this.generateLevel();
        }
        this.updateUI();
    }

    useItem(slot) {
        if (this.player.inventory[slot]) {
            let item = this.player.inventory[slot];
            if (item.type === 'potion') {
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + 30);
                this.addText(this.player.x*TILE_SIZE, this.player.y*TILE_SIZE, "+30 HP", '#0f0');
            }
            this.player.inventory[slot] = null;
            this.updateUI();
        }
    }

    levelUp() {
        this.player.lvl++;
        this.player.xp -= this.player.nextXp;
        this.player.nextXp = Math.floor(this.player.nextXp * 1.5);
        this.player.maxHp += 10; this.player.hp = this.player.maxHp;
        this.playSound('levelup');
        this.addText(this.player.x*TILE_SIZE, this.player.y*TILE_SIZE, "LEVEL UP!", '#ffd700');
    }

    updateFOV() {
        for(let y=0; y<this.mapH; y++) this.visible[y].fill(false);
        const caster = new ShadowCaster((x,y) => x<0||x>=this.mapW||y<0||y>=this.mapH || this.map[y][x] === 1);
        caster.compute(this.player.x, this.player.y, 10, (x, y) => {
            if(x>=0 && x<this.mapW && y>=0 && y<this.mapH) {
                this.visible[y][x] = true;
                this.visited[y][x] = true;
            }
        });
    }

    generateLevel() {
        this.rng = new SeededRandom(this.baseSeed + this.depth * 100);
        this.mapW = 50; this.mapH = 50;
        this.map = []; this.visible = []; this.visited = []; this.scent = []; this.decorations = [];
        for (let y = 0; y < this.mapH; y++) {
            this.map.push(new Array(this.mapW).fill(1));
            this.visible.push(new Array(this.mapW).fill(false));
            this.visited.push(new Array(this.mapW).fill(false));
            this.scent.push(new Array(this.mapW).fill(9999));
            this.decorations.push(new Array(this.mapW).fill(0));
        }

        let cx = 25, cy = 25, floors = 0;
        while(floors < 800) {
            if (this.map[cy][cx] === 1) { this.map[cy][cx] = 0; floors++; }
            let d = [[0,1],[0,-1],[1,0],[-1,0]][Math.floor(this.random()*4)];
            cx += d[0]; cy += d[1];
            if (cx<1 || cx>=this.mapW-1 || cy<1 || cy>=this.mapH-1) { cx=25; cy=25; }
        }

        // Biome Specifics: Water, Trees
        if (this.biome === 'forest') {
            for(let i=0; i<10; i++) {
                let rx = Math.floor(this.random() * this.mapW), ry = Math.floor(this.random() * this.mapH);
                if (this.map[ry][rx] === 0) this.map[ry][rx] = 2; // Water pool
            }
        }

        this.entities = []; this.items = []; this.traps = [];
        let start = this.getEmptyTile();
        this.player.x = start.x; this.player.y = start.y;
        this.player.vx = start.x; this.player.vy = start.y;
        this.updateFOV();
        this.updateScentMap();

        let mobCount = 10 + this.depth;
        for(let i=0; i<mobCount; i++) {
            let t = this.getEmptyTile();
            if (Math.abs(t.x-this.player.x) < 5) continue;
            let type = this.getMobType();
            this.entities.push(new Enemy(this, t.x, t.y, type));
        }

        let exit = this.getEmptyTile();
        this.items.push({x: exit.x, y: exit.y, type:'chest'});
    }

    getMobType() {
        let r = this.random();
        if (this.biome === 'forest') {
            if (r < 0.4) return 'slime';
            if (r < 0.7) return 'bat';
            return 'goblin';
        } else if (this.biome === 'desert') {
            if (r < 0.4) return 'snake';
            if (r < 0.7) return 'scorpion';
            return 'sandworm';
        }
        // Dungeon
        if (r < 0.4) return 'skeleton';
        if (r < 0.7) return 'bat';
        return 'archer';
    }

    getEmptyTile() {
        for(let i=0; i<1000; i++) {
            let x = 1 + Math.floor(this.random()*(this.mapW-2));
            let y = 1 + Math.floor(this.random()*(this.mapH-2));
            if (this.map[y][x] === 0) return {x, y};
        }
        return {x:1, y:1};
    }

    updateScentMap() {
        for(let y=0; y<this.mapH; y++) this.scent[y].fill(9999);
        let q = [{x:this.player.x, y:this.player.y, d:0}];
        this.scent[this.player.y][this.player.x] = 0;
        while(q.length) {
            let c = q.shift();
            if (c.d > 12) continue;
            [[0,1],[0,-1],[1,0],[-1,0]].forEach(([dx, dy]) => {
                let nx=c.x+dx, ny=c.y+dy;
                if (nx>=0 && nx<this.mapW && ny>=0 && ny<this.mapH && this.map[ny][nx]===0) {
                    if (this.scent[ny][nx] > c.d+1) {
                        this.scent[ny][nx] = c.d+1;
                        q.push({x:nx, y:ny, d:c.d+1});
                    }
                }
            });
        }
    }

    draw() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.width, this.height);

        this.ctx.save();
        this.ctx.translate(Math.floor(this.width/2 - this.player.vx*TILE_SIZE), Math.floor(this.height/2 - this.player.vy*TILE_SIZE));

        let pal = this.biome === 'forest' ? 'f' : (this.biome === 'desert' ? 's' : 'd');
        let cFloor = COLORS[pal+'_floor'];
        let cWall = COLORS[pal+'_wall'];
        let cTop = COLORS[pal+'_top'];

        let startX = Math.floor(this.player.vx - 15);
        let startY = Math.floor(this.player.vy - 12);
        let endX = startX + 30;
        let endY = startY + 25;

        this.entities.sort((a,b) => a.y - b.y);

        for (let y = startY; y <= endY; y++) {
            if (y<0 || y>=this.mapH) continue;
            for (let x = startX; x <= endX; x++) {
                if (x<0 || x>=this.mapW) continue;
                if (this.visited[y][x]) {
                    let visible = this.visible[y][x];
                    let px = x * TILE_SIZE, py = y * TILE_SIZE;

                    if (this.map[y][x] === 0) {
                        this.ctx.fillStyle = visible ? cFloor[(x+y)%2] : '#111';
                        this.ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                    }
                    else if (this.map[y][x] === 2) { // Water
                        this.ctx.fillStyle = '#2a5580';
                        this.ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                    }

                    if (this.map[y][x] === 1) {
                        this.ctx.fillStyle = visible ? cWall : '#222';
                        this.ctx.fillRect(px, py - 16, TILE_SIZE, TILE_SIZE + 16);
                        this.ctx.fillStyle = visible ? cTop : '#333';
                        this.ctx.fillRect(px, py - 16, TILE_SIZE, 16);
                    }

                    if (!visible) {
                        this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
                        this.ctx.fillRect(px, py - 16, TILE_SIZE, TILE_SIZE + 16);
                    }
                }
            }

            this.entities.forEach(e => {
                if (Math.floor(e.y) === y) {
                    if (this.visible[Math.floor(e.y)]?.[Math.floor(e.x)]) e.draw(this.ctx);
                }
            });
            if (Math.floor(this.player.y) === y) this.player.draw(this.ctx);
        }

        this.particles.forEach(p => {
            this.ctx.fillStyle = p.color;
            this.ctx.fillRect(p.x, p.y, 4, 4);
        });

        this.ctx.restore();

        if (this.mmCtx) {
            this.mmCtx.fillStyle = '#000';
            this.mmCtx.fillRect(0,0,120,90);
            let tw = 120/this.mapW, th = 90/this.mapH;
            for(let y=0; y<this.mapH; y++) {
                for(let x=0; x<this.mapW; x++) {
                    if(this.visited[y][x]) {
                        this.mmCtx.fillStyle = this.map[y][x]===1 ? '#444' : '#222';
                        this.mmCtx.fillRect(x*tw, y*th, tw, th);
                    }
                }
            }
            this.mmCtx.fillStyle = '#0f0';
            this.mmCtx.fillRect(this.player.x*tw, this.player.y*th, tw*2, th*2);
        }
    }

    updateUI() {
        document.getElementById('slot-weapon').innerText = this.player.weapon ? '⚔️' : '';
        for(let i=0; i<3; i++) {
            let slot = document.getElementById('slot-'+(i+1));
            if (this.player.inventory[i]) {
                slot.innerText = '🧪';
                slot.style.borderColor = '#fff';
            } else {
                slot.innerText = (i+1);
                slot.style.borderColor = '#444';
            }
        }
    }

    addText(x, y, text, color) { this.texts.push({x, y, text, color, life:50}); }
    addParticles(x, y, color, n) { for(let i=0; i<n; i++) this.particles.push({x, y, vx:(Math.random()-0.5)*5, vy:(Math.random()-0.5)*5, color, life:20}); }
}

const game = new Game();
function resetGame() { game.start('dungeon'); }
function startDailyChallenge() { window.location.href = `?daily=true&seed=${new Date().toISOString().slice(0,10).replace(/-/g,'')}`; }
function selectClass(c) { localStorage.setItem('selectedClass', c); document.querySelectorAll('.class-card').forEach(el=>el.classList.remove('selected')); document.getElementById('class-'+c).classList.add('selected'); }
