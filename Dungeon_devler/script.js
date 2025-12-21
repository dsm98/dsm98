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

const CLASSES = {
    warrior: {
        name: 'Warrior', hp: 60, dmg: 3, color: '#aaa',
        skillName: 'Whirlwind', skillColor: '#ffd700',
        weapon: { name: 'Iron Sword', rarity: 'common', dmg: 3 }
    },
    mage: {
        name: 'Mage', hp: 30, dmg: 1, color: '#593399',
        skillName: 'Meteor', skillColor: '#ff4400',
        weapon: { name: 'Staff', rarity: 'common', dmg: 1 }
    },
    rogue: {
        name: 'Rogue', hp: 40, dmg: 2, color: '#222',
        skillName: 'Shadow Step', skillColor: '#00ffff',
        weapon: { name: 'Dagger', rarity: 'common', dmg: 2 }
    },
    ranger: {
        name: 'Ranger', hp: 35, dmg: 2, color: '#6daa2c',
        skillName: 'Rain of Arrows', skillColor: '#00ff00',
        weapon: { name: 'Bow', rarity: 'common', dmg: 2 }
    },
    paladin: {
        name: 'Paladin', hp: 50, dmg: 2, color: '#fff',
        skillName: 'Sanctuary', skillColor: '#ffffaa',
        weapon: { name: 'Hammer', rarity: 'common', dmg: 2 }
    },
    necromancer: {
        name: 'Necromancer', hp: 35, dmg: 2, color: '#444',
        skillName: 'Raise Army', skillColor: '#9933ff',
        weapon: { name: 'Scythe', rarity: 'common', dmg: 2 }
    },
    berserker: {
        name: 'Berserker', hp: 70, dmg: 4, color: '#d04648',
        skillName: 'Undying Rage', skillColor: '#ff0000',
        weapon: { name: 'Axe', rarity: 'common', dmg: 4 }
    },
    elementalist: {
        name: 'Elementalist', hp: 30, dmg: 2, color: '#597dce',
        skillName: 'Chaos Storm', skillColor: '#00ffff',
        weapon: { name: 'Wand', rarity: 'common', dmg: 2 }
    }
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
        this.class = 'warrior';
        this.moving = false;
        this.timer = 0;
        this.inputBuffer = null;
        this.inventory = [null, null, null];
        this.skillCooldown = 0;
        this.maxCooldown = 20;

        // Mechanics
        this.grit = 0;
        this.heat = 0;
        this.comboPoints = 0;
        this.focus = 0;
        this.devotion = 0;
        this.invincible = 0;
        this.undying = 0;
        this.attunement = 'fire'; // fire -> ice -> storm
        this.invisible = 0;
        this.fireImmunity = 0;
    }

    initClass(className) {
        if (!CLASSES[className]) className = 'warrior';
        this.class = className;
        const conf = CLASSES[className];
        this.maxHp = conf.hp;
        this.hp = conf.hp;
        this.baseDmg = conf.dmg;
        this.weapon = { ...conf.weapon, charge: 0, maxCharge: 5 };
    }

    get dmg() {
        let d = this.baseDmg + (this.weapon ? this.weapon.dmg : 0);

        // Mechanics modifiers
        if (this.class === 'warrior' && this.grit >= 5) { /* True damage handled in attack */ }
        if (this.class === 'mage') {
             // High heat doubles damage but burns
             if (this.heat > 5) d *= 2;
        }
        if (this.class === 'ranger') {
            d += this.focus;
        }
        if (this.class === 'berserker') {
            // Lower HP = Higher Dmg
            let missingPct = (this.maxHp - this.hp) / this.maxHp;
            d += Math.floor(missingPct * 5);
        }
        if (this.class === 'elementalist' && this.attunement === 'fire') {
            d += 2;
        }

        return d;
    }

    update() {
        super.update();
        const cdEl = document.getElementById('skill-cooldown');
        if (cdEl) {
            let pct = (this.skillCooldown / this.maxCooldown) * 100;
            cdEl.style.height = `${pct}%`;
        }
    }

    takeDamage(amount, type) {
        if (this.invincible > 0) {
            this.game.addText(this.vx * TILE_SIZE + 24, this.vy * TILE_SIZE, "BLOCKED", '#fff');
            return;
        }

        if (type === 'burn' && this.fireImmunity > 0) {
            this.game.addText(this.vx * TILE_SIZE + 24, this.vy * TILE_SIZE, "IMMUNE", '#fa0');
            return;
        }

        if (this.class === 'elementalist' && this.attunement === 'ice') {
            amount = Math.max(0, amount - 2); // Ice armor
        }

        super.takeDamage(amount, type);

        if (this.class === 'warrior') {
            this.grit = Math.min(5, this.grit + 1);
            this.game.addText(this.vx * TILE_SIZE + 24, this.vy * TILE_SIZE - 20, "Grit!", '#aaa');
        }
        if (this.class === 'paladin') {
            this.devotion = Math.min(10, this.devotion + 1);
        }

        // Berserker Undying logic check
        if (this.hp <= 0 && this.undying > 0) {
            this.hp = 1;
            this.dead = false;
        }
    }

    useSkill() {
        if (this.skillCooldown > 0) {
            this.game.addText(this.vx * TILE_SIZE + 24, this.vy * TILE_SIZE - 20, "Not Ready!", '#888');
            return;
        }

        let used = false;
        const conf = CLASSES[this.class];

        this.game.addText(this.vx * TILE_SIZE + 24, this.vy * TILE_SIZE - 30, conf.skillName.toUpperCase() + "!", conf.skillColor);

        if (this.class === 'warrior') { // Whirlwind
            used = true;
            this.game.shake = 20;
            this.game.playSound('kill');
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx===0 && dy===0) continue;
                    let nx = this.x + dx, ny = this.y + dy;
                    let enemy = this.game.entities.find(e => e.x === nx && e.y === ny);
                    if (enemy) {
                        enemy.takeDamage(this.dmg * 2, 'physical');
                        this.game.addParticles(nx * TILE_SIZE + 24, ny * TILE_SIZE + 24, '#ffd700', 15);
                    }
                }
            }
        }
        else if (this.class === 'mage') { // Meteor
            used = true;
            this.game.addText(this.vx * TILE_SIZE + 24, this.vy * TILE_SIZE - 40, "CASTING...", '#ff4400');
            // Delayed effect
            setTimeout(() => {
                this.game.shake = 30;
                this.game.playSound('kill'); // Big boom
                // Hit random area near player or enemies? GDD says 3x3 area. Let's target nearest enemy.
                let target = this.game.entities.length > 0 ? this.game.entities[0] : {x:this.x, y:this.y};
                for(let dy=-1; dy<=1; dy++) {
                    for(let dx=-1; dx<=1; dx++) {
                         let nx = target.x + dx, ny = target.y + dy;
                         this.game.addParticles(nx * TILE_SIZE + 24, ny * TILE_SIZE + 24, '#ff4400', 20);
                         let enemy = this.game.entities.find(e => e.x === nx && e.y === ny);
                         if(enemy) enemy.takeDamage(20, 'magic');
                    }
                }
            }, 500); // Visual delay for effect, logic happens somewhat instantly in turn based, but here we do it simply
        }
        else if (this.class === 'rogue') { // Shadow Step
            used = true;
            this.game.playSound('coin');
            // Find nearest enemy
            let target = this.game.entities.sort((a,b) => {
                let da = Math.abs(a.x - this.x) + Math.abs(a.y - this.y);
                let db = Math.abs(b.x - this.x) + Math.abs(b.y - this.y);
                return da - db;
            })[0];

            if (target) {
                let dmg = this.dmg * 3;
                // Combo points usage
                if (this.comboPoints > 0) {
                    dmg += this.comboPoints * 5;
                    this.game.addText(this.x*TILE_SIZE, this.y*TILE_SIZE, `COMBO x${this.comboPoints}!`, '#ffff00');
                    this.comboPoints = 0;
                }

                if (target.type !== 'boss') {
                     target.takeDamage(999, 'crit');
                     this.x = target.x; this.y = target.y;
                     this.vx = this.x; this.vy = this.y;
                } else {
                    target.takeDamage(dmg, 'crit');
                }
            } else {
                 let rx = this.x + Math.floor(this.game.random() * 9) - 4;
                 let ry = this.y + Math.floor(this.game.random() * 9) - 4;
                 if (rx > 0 && rx < this.game.mapW && this.game.map[ry][rx] === 0) {
                     this.x = rx; this.y = ry;
                 }
            }
            this.game.updateFOV();
        }
        else if (this.class === 'ranger') { // Rain of Arrows
            used = true;
            for(let i=0; i<5; i++) {
                let rx = this.x + Math.floor(this.game.random() * 7) - 3;
                let ry = this.y + Math.floor(this.game.random() * 7) - 3;
                let enemy = this.game.entities.find(e => e.x === rx && e.y === ry);
                if (enemy) enemy.takeDamage(this.dmg, 'ranged');
                this.game.addParticles(rx * TILE_SIZE + 24, ry * TILE_SIZE + 24, '#00ff00', 10);
            }
        }
        else if (this.class === 'paladin') { // Sanctuary
            used = true;
            this.invincible = 3;
            this.game.addText(this.vx * TILE_SIZE + 24, this.vy * TILE_SIZE - 40, "INVINCIBLE!", '#ffffaa');
        }
        else if (this.class === 'necromancer') { // Raise Army
            used = true;
            // Spawn skeletons
            for(let i=0; i<3; i++) {
                 let t = this.game.getEmptyTileNear(this.x, this.y);
                 if (t) {
                     // We need a friendly entity class? For now let's just damage enemies around as "spirits"
                     // Or spawn a temporary ally.
                     // Simpler: massive damage to all enemies on screen (Soul Bomb)
                     this.game.entities.forEach(e => {
                         if (Math.abs(e.x - this.x) < 8 && Math.abs(e.y - this.y) < 8) {
                             e.takeDamage(5, 'magic');
                         }
                     });
                     this.game.addParticles(t.x * TILE_SIZE + 24, t.y * TILE_SIZE + 24, '#444', 10);
                 }
            }
        }
        else if (this.class === 'berserker') { // Undying Rage
            used = true;
            this.undying = 5;
            this.hp = Math.max(1, Math.floor(this.maxHp * 0.1)); // Heal a bit?
             this.game.addText(this.vx * TILE_SIZE + 24, this.vy * TILE_SIZE - 40, "UNDYING!", '#d04648');
        }
        else if (this.class === 'elementalist') { // Chaos Storm
            used = true;
            // Apply all effects
            this.game.entities.forEach(e => {
                if (Math.abs(e.x - this.x) < 5 && Math.abs(e.y - this.y) < 5) {
                    e.takeDamage(this.dmg * 2, 'magic'); // Fire
                    // Ice/Storm visual
                }
            });
             this.game.addParticles(this.vx * TILE_SIZE + 24, this.vy * TILE_SIZE + 24, '#597dce', 30);
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

        let conf = CLASSES[this.class] || CLASSES['warrior'];
        ctx.fillStyle = conf.color;

        // Armor
        ctx.fillRect(px + 16, py + 24, 16, 10);
        ctx.fillStyle = this.color; // Head? No, body

        // Helmet/Head
        ctx.fillStyle = conf.color;
        ctx.fillRect(px + 16, py + 14, 16, 10);

        ctx.fillStyle = '#fff'; ctx.fillRect(px + 18, py + 17, 4, 4); ctx.fillRect(px + 26, py + 17, 4, 4);

        if (this.weapon) {
            ctx.fillStyle = this.weapon.rarity === 'legendary' ? '#ffd700' : (this.weapon.rarity === 'rare' ? '#9933ff' : '#888');
            ctx.fillRect(px + 30, py + 24, 4, 12);

            // Charge glow
            if (this.weapon.charge >= this.weapon.maxCharge) {
                ctx.strokeStyle = '#00ffff';
                ctx.lineWidth = 2;
                ctx.strokeRect(px + 30, py + 24, 4, 12);
            }
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
        if (type === 'boss_ogre') { this.hp = 100; this.color = '#8b4513'; this.maxHp = 100; }
        if (type === 'boss_spider') { this.hp = 80; this.color = '#4a1a4a'; this.maxHp = 80; }
        this.maxHp = this.hp;

        this.archetype = 'chaser';
        if (['archer', 'skeleton'].includes(type)) this.archetype = 'ranger';
        if (['goblin'].includes(type)) this.archetype = 'coward';
        if (type.startsWith('boss')) this.archetype = 'boss';

        this.state = 'IDLE';
        this.bossTimer = 0;
        this.alerted = false;
        this.attackTarget = null;
    }

    takeTurn() {
        if (this.dead) return;
        if (this.game.player.invisible > 0) { this.state = 'IDLE'; return; }

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
            if (this.archetype === 'boss') {
                this.bossTimer++;
                if (this.type === 'boss_ogre') {
                    if (dist === 1 && this.bossTimer >= 3) {
                        this.state = 'PREPARE';
                        this.attackTarget = { x: this.game.player.x, y: this.game.player.y, type: 'smash' }; // New Smash attack
                        this.bossTimer = 0;
                        this.game.addText(this.x*TILE_SIZE, this.y*TILE_SIZE, "ROAR!", '#ff0000');
                        return;
                    }
                } else if (this.type === 'boss_spider') {
                    if (this.bossTimer >= 4) {
                        // Spawn Spiderling
                        let t = this.game.getEmptyTileNear(this.x, this.y);
                        if (t) {
                            this.game.entities.push(new Enemy(this.game, t.x, t.y, 'bat')); // Use Bat as spiderling for now
                            this.game.addText(this.x*TILE_SIZE, this.y*TILE_SIZE, "SPAWN!", '#00ff00');
                        }
                        this.bossTimer = 0;
                    }
                }
            }

            if (this.archetype === 'ranger') {
                // Try to keep distance 4
                if (dist <= 6 && this.hasLineOfSight(this.game.player.x, this.game.player.y)) {
                    // Attack if good shot
                    this.state = 'PREPARE';
                    this.attackTarget = { x: this.game.player.x, y: this.game.player.y, type: 'ranged' };
                    return;
                }
                if (dist < 4) {
                    // Flee
                    this.moveAwayFromPlayer();
                    return;
                }
            } else if (this.archetype === 'coward') {
                if (this.hp < this.maxHp * 0.5) {
                    this.moveAwayFromPlayer();
                    return;
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

    moveAwayFromPlayer() {
        let best = { x: this.x, y: this.y, val: -1 };
        [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dy]) => {
            let nx = this.x + dx, ny = this.y + dy;
            if (nx >= 0 && nx < this.game.mapW && ny >= 0 && ny < this.game.mapH && this.game.map[ny][nx] === 0) {
                if (!this.game.entities.find(e => e.x === nx && e.y === ny)) {
                    // Use scent map: higher value = further from player
                    let val = this.game.scent[ny]?.[nx] ?? 0;
                    if (val > best.val) best = { x: nx, y: ny, val };
                }
            }
        });
        if (best.val !== -1) { this.x = best.x; this.y = best.y; }
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
        if (this.attackTarget.type === 'smash') { // Ogre Smash
             for(let dy=-1; dy<=1; dy++) {
                 for(let dx=-1; dx<=1; dx++) {
                     if (Math.abs(this.game.player.x - (this.attackTarget.x+dx)) < 0.1 && Math.abs(this.game.player.y - (this.attackTarget.y+dy)) < 0.1) {
                         this.game.attack(this, this.game.player);
                     }
                     this.game.addParticles((this.attackTarget.x+dx) * TILE_SIZE + 24, (this.attackTarget.y+dy) * TILE_SIZE + 24, '#ff0000', 5);
                 }
             }
             return;
        }

        if (this.game.player.x === this.attackTarget.x && this.game.player.y === this.attackTarget.y) {
            this.game.attack(this, this.game.player);
        } else {
            this.game.addText(this.attackTarget.x * TILE_SIZE + 24, this.attackTarget.y * TILE_SIZE, "MISS", "#aaa");
        }
    }

    draw(ctx) {
        let px = this.vx * TILE_SIZE, py = this.vy * TILE_SIZE;

        // Attack Bump Animation
        if (this.bumpX !== undefined && this.bumpX !== 0) {
            px += this.bumpX;
            this.bumpX *= 0.8;
            if (Math.abs(this.bumpX) < 0.5) this.bumpX = 0;
        }
        if (this.bumpY !== undefined && this.bumpY !== 0) {
            py += this.bumpY;
            this.bumpY *= 0.8;
            if (Math.abs(this.bumpY) < 0.5) this.bumpY = 0;
        }

        if (this.state === 'PREPARE') {
            ctx.fillStyle = '#ff0000'; ctx.beginPath(); ctx.moveTo(px + 12, py - 5); ctx.lineTo(px + 36, py - 5); ctx.lineTo(px + 24, py + 5); ctx.fill();
            if (this.attackTarget && this.attackTarget.type === 'ranged') {
                ctx.save();
                ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(px + 24, py + 24); ctx.lineTo(this.attackTarget.x * TILE_SIZE + 24, this.attackTarget.y * TILE_SIZE + 24); ctx.stroke();
                ctx.restore();
            }
        }

        ctx.fillStyle = this.type.startsWith('boss') ? this.color : (this.state === 'PREPARE' ? '#ff4444' : this.color);
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

        this.inputState = 'NORMAL'; // NORMAL, TARGETING
        this.targetCursor = { x: 0, y: 0 };
        this.selectedSlot = -1;

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
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd', 'q', '1', '2', '3', 't', 'Enter'].includes(e.key)) e.preventDefault();
            this.handleInput(e.key);
        });
        window.addEventListener('keyup', e => this.keys[e.key] = false);

        this.bindTouchControls();
    }

    bindTouchControls() {
        // D-Pad Bindings
        document.querySelectorAll('.btn').forEach(btn => {
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const key = btn.getAttribute('data-key');
                this.handleInput(key);
            }, {passive: false});

            // Mouse click for testing
            btn.addEventListener('mousedown', (e) => {
                const key = btn.getAttribute('data-key');
                this.handleInput(key);
            });
        });

        // Swipe Detection
        let tsX, tsY;
        this.canvas.addEventListener('touchstart', (e) => {
            tsx = e.changedTouches[0].screenX;
            tsy = e.changedTouches[0].screenY;
        }, {passive: false});

        this.canvas.addEventListener('touchend', (e) => {
            let teX = e.changedTouches[0].screenX;
            let teY = e.changedTouches[0].screenY;

            let dx = teX - tsX;
            let dy = teY - tsy;

            if (Math.abs(dx) > 30 || Math.abs(dy) > 30) {
                if (Math.abs(dx) > Math.abs(dy)) {
                    this.handleInput(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
                } else {
                    this.handleInput(dy > 0 ? 'ArrowDown' : 'ArrowUp');
                }
            } else {
                // Tap might trigger targeting click if we implement touch targeting
            }
        }, {passive: false});
    }

    handleInput(key) {
        if (!this.active || this.paused) {
            if (key === 'Escape') this.togglePause();
            return;
        }

        if (this.inputState === 'TARGETING') {
            if (key === 'Escape') {
                this.inputState = 'NORMAL';
                this.addText(this.player.x*TILE_SIZE, this.player.y*TILE_SIZE, "CANCEL", '#aaa');
            } else if (key === 'Enter' || key === ' ' || key === 't' || key === 'Space') {
                this.throwItem();
            } else {
                let dx=0, dy=0;
                if (key==='ArrowUp'||key==='w') dy=-1;
                else if (key==='ArrowDown'||key==='s') dy=1;
                else if (key==='ArrowLeft'||key==='a') dx=-1;
                else if (key==='ArrowRight'||key==='d') dx=1;

                this.targetCursor.x += dx;
                this.targetCursor.y += dy;
            }
            return;
        }

        if (key === 't') {
            this.toggleThrow();
            return;
        }

        if (key === ' ' || key === 'Space') {
            this.wait();
            return;
        }

        if (key === 'q') {
            this.player.useSkill();
            return;
        }

        if (['1','2','3'].includes(key)) {
            this.useItem(parseInt(key)-1);
            return;
        }

        if (key === 'Escape') {
            this.togglePause();
            return;
        }

        // Movement
        this.player.inputBuffer = key;
    }

    toggleThrow() {
        if (this.inputState === 'NORMAL') {
            this.inputState = 'TARGETING';
            this.targetCursor = {x: this.player.x, y: this.player.y};
            this.selectedSlot = 0;
            this.addText(this.player.x*TILE_SIZE, this.player.y*TILE_SIZE, "AIM!", '#fff');
        } else {
            this.throwItem(); // Clicking again throws
        }
    }

    wait() {
        this.addText(this.player.x*TILE_SIZE, this.player.y*TILE_SIZE, "WAIT", '#aaa');
        this.processTurn();
    }

    togglePause() { this.paused = !this.paused; document.getElementById('pause-menu').style.display = this.paused ? 'flex' : 'none'; }

    start(biome) {
        this.biome = biome;
        this.depth = 1;
        this.player = new Player(this);
        let cls = localStorage.getItem('selectedClass') || 'warrior';

        // Migration of old saves
        if (cls === 'knight') cls = 'warrior';
        if (cls === 'wizard') cls = 'mage';
        if (!CLASSES[cls]) cls = 'warrior';

        this.player.initClass(cls);

        this.generateLevel();
        this.active = true;
        this.updateUI();
        requestAnimationFrame(() => this.loop());

        const mainMenu = document.getElementById('main-menu');
        if (mainMenu) mainMenu.style.display = 'none';

        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) uiLayer.style.display = 'flex';

        const gameOver = document.getElementById('game-over');
        if (gameOver) gameOver.style.display = 'none';
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
        this.texts.forEach(t => {
            t.y += t.vy;
            t.vy *= 0.95; // Drag
            t.life--;
        });
        if (this.shake > 0) this.shake *= 0.85;
    }

    movePlayer(dx, dy) {
        if (this.player.class === 'ranger') this.player.focus = 0; // Ranger mechanic reset

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
        if (trap) {
            trap.triggered = true;
            if (trap.type === 'spike') {
                this.player.takeDamage(5, 'trap');
                this.addText(nx*TILE_SIZE, ny*TILE_SIZE, "SPIKES!", '#f00');
            } else if (trap.type === 'root') {
                this.addText(nx*TILE_SIZE, ny*TILE_SIZE, "ROOTED!", '#6daa2c');
                this.player.moving = true; // Wait animation
                this.player.timer = 15; // Stuck for longer
            } else {
                this.player.takeDamage(5, 'trap');
                this.addText(nx*TILE_SIZE, ny*TILE_SIZE, "TRAP!", '#f00');
            }
        }
        this.updateFOV();
        this.processTurn();
    }

    processTurn() {
        this.updateScentMap();

        // Update Traps (Damage Enemies + Life)
        this.traps = this.traps.filter(t => {
            // Apply effect to enemies on tile
            let enemy = this.entities.find(e => e.x === t.x && e.y === t.y);
            if (enemy) {
                if (t.type === 'fire') {
                    enemy.takeDamage(5, 'fire');
                    this.addParticles(t.x*TILE_SIZE+24, t.y*TILE_SIZE+24, '#ff4400', 3);
                } else if (t.type === 'gas') {
                    enemy.takeDamage(3, 'poison');
                    this.addParticles(t.x*TILE_SIZE+24, t.y*TILE_SIZE+24, '#00ff00', 3);
                } else if (t.type === 'spike') {
                    enemy.takeDamage(5, 'trap');
                }
            }
            // Decrement life for temporary traps (fire/gas)
            if (t.life !== undefined) {
                t.life--;
                return t.life > 0;
            }
            return true;
        });

        // Counters
        if (this.player.invincible > 0) this.player.invincible--;
        if (this.player.undying > 0) this.player.undying--;
        if (this.player.invisible > 0) this.player.invisible--;
        if (this.player.fireImmunity > 0) this.player.fireImmunity--;

        // Passives
        if (this.player.class === 'ranger') {
            this.player.focus = Math.min(5, this.player.focus + 1);
        }
        if (this.player.class === 'elementalist') {
            const cycle = ['fire', 'ice', 'storm'];
            let idx = cycle.indexOf(this.player.attunement);
            this.player.attunement = cycle[(idx + 1) % 3];
            this.addText(this.player.vx*TILE_SIZE, this.player.vy*TILE_SIZE - 20, this.player.attunement.toUpperCase(), '#888');
        }
        if (this.player.class === 'mage') {
             // Burn if high heat
             if (this.player.heat > 5) {
                 this.player.takeDamage(2, 'burn');
                 this.addText(this.player.vx*TILE_SIZE, this.player.vy*TILE_SIZE, "BURN", '#ff4400');
             }
             this.player.heat = Math.max(0, this.player.heat - 1);
        }

        this.entities.forEach(e => e.takeTurn());
        if (this.player.skillCooldown > 0) this.player.skillCooldown--;
        this.updateUI();
    }

    // Helper to find valid spawn
    getEmptyTileNear(x, y) {
        let best = null;
        [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]].sort(()=>Math.random()-0.5).forEach(([dx, dy]) => {
             let nx=x+dx, ny=y+dy;
             if (nx>=0 && nx<this.mapW && ny>=0 && ny<this.mapH && this.map[ny][nx] === 0) {
                 if (!this.entities.find(e => e.x === nx && e.y === ny) && (nx!==this.player.x || ny!==this.player.y)) {
                     best = {x:nx, y:ny};
                 }
             }
        });
        return best;
    }

    attack(attacker, defender) {
        let dmg = attacker.dmg;

        // Visual Bump
        let dx = Math.sign(defender.x - attacker.x);
        let dy = Math.sign(defender.y - attacker.y);
        attacker.bumpX = dx * 10;
        attacker.bumpY = dy * 10;

        if (attacker === this.player) {
            // Warrior Grit Mechanic
            if (this.player.class === 'warrior' && this.player.grit >= 5) {
                this.player.grit = 0;
                this.addText(attacker.vx*TILE_SIZE, attacker.vy*TILE_SIZE, "TRUE DMG!", '#ffd700');
                // True Damage: Ignore armor? Current game has no armor mechanic, so we just boost dmg significantly.
                dmg = Math.max(dmg, 10); // Minimum 10 damage
            }

            // Weapon Charge Mechanic
            if (this.player.weapon) {
                this.player.weapon.charge = Math.min(this.player.weapon.maxCharge, (this.player.weapon.charge || 0) + 1);
                if (this.player.weapon.charge >= this.player.weapon.maxCharge) {
                    this.player.weapon.charge = 0;
                    this.playSound('levelup');

                    let wName = this.player.weapon.name.toLowerCase();
                    if (wName.includes('sword')) {
                        this.addText(attacker.vx*TILE_SIZE, attacker.vy*TILE_SIZE, "CRIT!", '#ff0000');
                        dmg *= 2;
                    } else if (wName.includes('dagger')) {
                        if (defender.hp < defender.maxHp * 0.3 && defender.type !== 'boss') {
                            this.addText(attacker.vx*TILE_SIZE, attacker.vy*TILE_SIZE, "EXECUTE!", '#555');
                            dmg = defender.hp + 10;
                        } else {
                            this.addText(attacker.vx*TILE_SIZE, attacker.vy*TILE_SIZE, "STAB!", '#aaa');
                            dmg *= 1.5;
                        }
                    } else if (wName.includes('spear') || wName.includes('staff')) {
                        this.addText(attacker.vx*TILE_SIZE, attacker.vy*TILE_SIZE, "PIERCE!", '#00ff00');
                        // Hit enemy behind?
                        let dx = Math.sign(defender.x - attacker.x);
                        let dy = Math.sign(defender.y - attacker.y);
                        let nx = defender.x + dx, ny = defender.y + dy;
                        let behind = this.entities.find(e => e.x === nx && e.y === ny);
                        if (behind) {
                            this.addText(behind.vx*TILE_SIZE, behind.vy*TILE_SIZE, "PIERCED!", '#00ff00');
                            behind.takeDamage(dmg, 'pierce');
                        }
                    } else if (wName.includes('wand')) {
                        this.addText(attacker.vx*TILE_SIZE, attacker.vy*TILE_SIZE, "SIPHON!", '#00ffff');
                        this.player.skillCooldown = Math.max(0, this.player.skillCooldown - 5);
                        dmg *= 1.2;
                    } else {
                        this.addText(attacker.vx*TILE_SIZE, attacker.vy*TILE_SIZE, "CHARGE!", '#fff');
                        dmg *= 1.5;
                    }
                }
            }

            if (this.player.class === 'mage') this.player.heat += 2;
            if (this.player.class === 'rogue') this.player.comboPoints = Math.min(5, this.player.comboPoints + 1);
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
        if (r < 0.6) {
            // New Potions Logic
            const potions = ['Health', 'Fire', 'Invis', 'Toxic'];
            const pType = potions[Math.floor(this.random() * potions.length)];
            this.items.push({x, y, type: 'potion', pType: pType, rarity:'common'});
        }
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
                    this.addText(this.player.x*TILE_SIZE, this.player.y*TILE_SIZE, "Got " + (item.pType || "Potion"), '#0f0');
                    break;
                }
            }
            if (!added) {
                // Auto consume if full? Or just fail? Original code auto-consumed health.
                // Let's keep auto-consume health if it is a health potion
                if (item.pType === 'Health' || !item.pType) {
                    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
                    this.addText(this.player.x*TILE_SIZE, this.player.y*TILE_SIZE, "+20 HP", '#0f0');
                } else {
                    this.addText(this.player.x*TILE_SIZE, this.player.y*TILE_SIZE, "Full!", '#f00');
                }
            }
        } else if (item.type === 'weapon') {
            let w = { name: 'Sword', rarity: item.rarity, dmg: item.rarity==='rare'?5:3, element: null, charge: 0, maxCharge: 5 };
            let types = ['Sword', 'Dagger', 'Spear', 'Wand'];
            w.name = types[Math.floor(this.random() * types.length)];
            this.player.weapon = w;
            this.addText(this.player.x*TILE_SIZE, this.player.y*TILE_SIZE, "Equipped " + this.player.weapon.name, '#ff0');
        } else if (item.type === 'chest') {
            this.depth++;
            this.generateLevel();
        }
        this.updateUI();
    }

    useItem(slot) {
        if (this.inputState === 'TARGETING') {
            this.selectedSlot = slot;
            this.updateUI();
            return;
        }

        if (this.player.inventory[slot]) {
            let item = this.player.inventory[slot];
            if (item.type === 'potion') {
                const pType = item.pType || 'Health';

                if (pType === 'Health') {
                    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 30);
                    this.addText(this.player.x*TILE_SIZE, this.player.y*TILE_SIZE, "+30 HP", '#0f0');
                } else if (pType === 'Fire') {
                    this.addText(this.player.x*TILE_SIZE, this.player.y*TILE_SIZE, "Fire Immunity!", '#fa0');
                    this.player.fireImmunity = 10;
                } else if (pType === 'Invis') {
                     this.addText(this.player.x*TILE_SIZE, this.player.y*TILE_SIZE, "Invisible!", '#aaa');
                     this.player.invisible = 5;
                } else if (pType === 'Toxic') {
                    // Drink to cure poison
                    this.addText(this.player.x*TILE_SIZE, this.player.y*TILE_SIZE, "Cured!", '#0f0');
                }
            }

            this.player.inventory[slot] = null;
            this.updateUI();
        }
    }

    throwItem() {
        if (this.selectedSlot < 0 || !this.player.inventory[this.selectedSlot]) {
            this.inputState = 'NORMAL';
            return;
        }

        let item = this.player.inventory[this.selectedSlot];
        this.player.inventory[this.selectedSlot] = null;
        this.inputState = 'NORMAL';

        // Effects
        let tx = this.targetCursor.x, ty = this.targetCursor.y;
        this.addText(tx*TILE_SIZE, ty*TILE_SIZE, "SPLASH!", '#fff');

        if (item.type === 'potion') {
            let pType = item.pType || 'Health';
            if (pType === 'Fire') {
                // Create fire area 3x3
                for(let dy=-1; dy<=1; dy++) {
                    for(let dx=-1; dx<=1; dx++) {
                        let nx=tx+dx, ny=ty+dy;
                        this.traps.push({x:nx, y:ny, type:'fire', life:5}); // Temporary fire
                        this.addParticles(nx*TILE_SIZE+24, ny*TILE_SIZE+24, '#ff4400', 5);
                    }
                }
            } else if (pType === 'Toxic') {
                // Poison cloud
                for(let dy=-1; dy<=1; dy++) {
                    for(let dx=-1; dx<=1; dx++) {
                        let nx=tx+dx, ny=ty+dy;
                        this.traps.push({x:nx, y:ny, type:'gas', life:10});
                        this.addParticles(nx*TILE_SIZE+24, ny*TILE_SIZE+24, '#00ff00', 5);
                    }
                }
            } else if (pType === 'Health') {
                // Damage undead
                let target = this.entities.find(e => e.x === tx && e.y === ty);
                if (target && ['skeleton','mummy'].includes(target.type)) {
                    target.takeDamage(20, 'holy');
                    this.addText(tx*TILE_SIZE, ty*TILE_SIZE, "HOLY BURN!", '#ffff00');
                }
            } else if (pType === 'Invis') {
                // Blind enemy?
                let target = this.entities.find(e => e.x === tx && e.y === ty);
                if (target) {
                    target.state = 'IDLE';
                    this.addText(tx*TILE_SIZE, ty*TILE_SIZE, "CONFUSED", '#aaa');
                }
            }
        }

        this.processTurn();
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
        let radius = 10;
        // Torch Flicker
        if (this.random() < 0.1) radius += (this.random() > 0.5 ? 1 : -1);
        if (this.biome === 'desert') radius = Math.min(radius, 6); // Sandstorm cap

        const caster = new ShadowCaster((x,y) => x<0||x>=this.mapW||y<0||y>=this.mapH || this.map[y][x] === 1);
        caster.compute(this.player.x, this.player.y, radius, (x, y) => {
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

        // Hazards
        if (this.biome === 'forest') {
            for(let i=0; i<8; i++) {
                let t = this.getEmptyTile();
                this.traps.push({x:t.x, y:t.y, type:'root'});
            }
        } else if (this.biome === 'dungeon') {
            for(let i=0; i<8; i++) {
                let t = this.getEmptyTile();
                this.traps.push({x:t.x, y:t.y, type:'spike'});
            }
        }
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

        // Spawn Boss every 5 levels
        if (this.depth % 5 === 0) {
            let t = this.getEmptyTile();
            let bossType = 'boss_ogre';
            if (this.depth === 10) bossType = 'boss_spider';
            // if (this.depth === 20) bossType = 'boss_worm';
            this.entities.push(new Enemy(this, t.x, t.y, bossType));
            this.addText(this.player.x*TILE_SIZE, this.player.y*TILE_SIZE, "BOSS!", '#ff0000');
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

        // Optimize rendering bounds based on canvas size
        let tilesX = Math.ceil(this.width / TILE_SIZE) + 2;
        let tilesY = Math.ceil(this.height / TILE_SIZE) + 2;

        let startX = Math.floor(this.player.vx - tilesX/2);
        let startY = Math.floor(this.player.vy - tilesY/2);
        let endX = startX + tilesX;
        let endY = startY + tilesY;

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

        // Draw Target Cursor
        if (this.inputState === 'TARGETING') {
            let tx = this.targetCursor.x * TILE_SIZE, ty = this.targetCursor.y * TILE_SIZE;
            this.ctx.strokeStyle = '#00ff00';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(tx, ty, TILE_SIZE, TILE_SIZE);
            this.ctx.beginPath();
            this.ctx.moveTo(tx, ty); this.ctx.lineTo(tx+TILE_SIZE, ty+TILE_SIZE);
            this.ctx.moveTo(tx+TILE_SIZE, ty); this.ctx.lineTo(tx, ty+TILE_SIZE);
            this.ctx.stroke();
        }

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
        // Charge Bar indicator
        const weaponSlot = document.getElementById('slot-weapon');
        if (this.player.weapon) {
             let pct = (this.player.weapon.charge / this.player.weapon.maxCharge) * 100;
             weaponSlot.style.background = `linear-gradient(to top, rgba(0,255,255,0.3) ${pct}%, transparent ${pct}%)`;
        }

        for(let i=0; i<3; i++) {
            let slot = document.getElementById('slot-'+(i+1));
            let item = this.player.inventory[i];
            if (item) {
                // Determine icon based on type
                if (item.type === 'potion') {
                    if (item.pType === 'Fire') slot.innerText = '🔥';
                    else if (item.pType === 'Invis') slot.innerText = '👻';
                    else if (item.pType === 'Toxic') slot.innerText = '🤢';
                    else slot.innerText = '🧪'; // Health
                } else {
                    slot.innerText = '?';
                }
                slot.style.borderColor = '#fff';
            } else {
                slot.innerText = (i+1);
                slot.style.borderColor = '#444';
            }
        }
    }

    addText(x, y, text, color) {
        this.texts.push({
            x, y, text, color, life:50,
            vy: -1 - Math.random() // Upward float
        });
    }
    addParticles(x, y, color, n) {
        for(let i=0; i<n; i++) {
            this.particles.push({
                x, y,
                vx:(Math.random()-0.5)*5,
                vy:(Math.random()-0.5)*5,
                color, life:20
            });
        }
    }

    // Add missing gameOver
    gameOver() {
        this.active = false;
        document.getElementById('game-over').style.display = 'flex';
        document.getElementById('ui-layer').style.display = 'none';
        this.playSound('kill');
    }
}

const game = new Game();
function resetGame() { game.start('dungeon'); }
function startDailyChallenge() { window.location.href = `?daily=true&seed=${new Date().toISOString().slice(0,10).replace(/-/g,'')}`; }
function selectClass(c) { localStorage.setItem('selectedClass', c); document.querySelectorAll('.class-card').forEach(el=>el.classList.remove('selected')); document.getElementById('class-'+c).classList.add('selected'); }

// --- Menu Enhancements ---
function initMenuAnimation() {
    const canvas = document.getElementById('menu-bg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let particles = [];
    for(let i=0; i<50; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vy: 0.5 + Math.random(),
            size: 1 + Math.random() * 2
        });
    }

    function animate() {
        ctx.fillStyle = '#0a0a0c';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';

        particles.forEach(p => {
            p.y += p.vy;
            if (p.y > canvas.height) p.y = -10;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
            ctx.fill();
        });
        requestAnimationFrame(animate);
    }
    animate();
}
window.addEventListener('load', initMenuAnimation);
