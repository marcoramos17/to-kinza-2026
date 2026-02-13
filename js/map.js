/**
 * Map: world layout, tiles, decorations, particles, events and player drawing, camera, collision.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G) return;

  function getCamera() {
    var player = G.player;
    var canvas = G.canvas;
    var config = G.config;
    var TILE = G.TILE;
    if (!player || !canvas || !config) return { x: 0, y: 0 };
    var cx = player.x + player.w / 2 - canvas.width / 2;
    var cy = player.y + player.h / 2 - canvas.height / 2;
    cx = Math.max(0, Math.min(cx, config.worldWidth * TILE - canvas.width));
    cy = Math.max(0, Math.min(cy, config.worldHeight * TILE - canvas.height));
    return { x: cx, y: cy };
  }

  function getTileAtPixel(px, py) {
    var TILE = G.TILE;
    var config = G.config;
    var mapTerrain = G.mapTerrain;
    var tx = Math.floor(px / TILE);
    var ty = Math.floor(py / TILE);
    if (tx < 0 || ty < 0 || tx >= config.worldWidth || ty >= config.worldHeight) return 'water';
    return mapTerrain[ty][tx];
  }

  function isBlocked(tx, ty) {
    var config = G.config;
    var mapTerrain = G.mapTerrain;
    if (tx < 0 || ty < 0 || tx >= config.worldWidth || ty >= config.worldHeight) return true;
    var t = mapTerrain[ty][tx];
    if (config.blockedTiles.indexOf(t) !== -1) return true;
    var key = tx + ',' + ty;
    return G.decorationBlocked && G.decorationBlocked[key];
  }

  function isRectBlocked(px, py, w, h) {
    var TILE = G.TILE;
    var config = G.config;
    var minTx = Math.floor(px / TILE);
    var maxTx = Math.floor((px + w - 0.001) / TILE);
    var minTy = Math.floor(py / TILE);
    var maxTy = Math.floor((py + h - 0.001) / TILE);
    for (var ty = minTy; ty <= maxTy; ty++) {
      for (var tx = minTx; tx <= maxTx; tx++) {
        if (G.isBlocked(tx, ty)) return true;
      }
    }
    return false;
  }

  function patchNoise(ix, iy, seed) {
    var n = Math.sin(ix * 12.9898 + iy * 78.233 + seed * 91.123) * 43758.5453;
    return n - Math.floor(n);
  }

  function generatePatchItems(patch, config, mapTerrain, worldW, worldH) {
    var emoji = patch.emoji || patch.type;
    if (!emoji && config.decorations && patch.type) emoji = config.decorations[patch.type];
    emoji = emoji || '🌿';
    var cx = patch.x;
    var cy = patch.y;
    var exX = Math.max(0, patch.expand_x != null ? patch.expand_x : (patch.expansion_x != null ? patch.expansion_x : 5));
    var exY = Math.max(0, patch.expand_y != null ? patch.expand_y : (patch.expansion_y != null ? patch.expansion_y : 4));
    var area = (2 * exX + 1) * (2 * exY + 1);
    var rawDensity = patch.density != null ? patch.density : 0.35;
    var density = (rawDensity > 1 && area > 0) ? Math.min(1, rawDensity / area) : Math.max(0.01, Math.min(1, rawDensity));
    var baseScale = (patch.scale != null ? patch.scale : 0.5);
    var scaleVar = (patch.scale_var != null ? patch.scale_var : 0.2);
    var wind = patch.wind !== false;
    var collision = patch.collision === true;
    var seed = (cx * 7 + cy * 31) | 0;
    var items = [];
    var minX = cx - exX;
    var maxX = cx + exX;
    var minY = cy - exY;
    var maxY = cy + exY;
    for (var ty = minY; ty <= maxY; ty++) {
      for (var tx = minX; tx <= maxX; tx++) {
        if (ty < 0 || ty >= worldH || tx < 0 || tx >= worldW) continue;
        if (!mapTerrain[ty] || mapTerrain[ty][tx] !== 'grass') continue;
        var n = patchNoise(tx, ty, seed);
        if (n > density) continue;
        var scale = baseScale * (1 + (patchNoise(tx + 1, ty, seed) * 2 - 1) * scaleVar);
        scale = Math.max(0.2, Math.min(2, scale));
        items.push({
          emoji: emoji,
          x: tx,
          y: ty,
          scale: scale,
          wind: wind,
          collision: collision
        });
      }
    }
    items.sort(function (a, b) {
      return a.y !== b.y ? b.y - a.y : a.x - b.x;
    });
    return items;
  }

  function getWindOffset(windPhase) {
    return {
      x: Math.sin(windPhase) * 3,
      y: Math.cos(windPhase * 0.7) * 2
    };
  }

  function buildMapFromWorld(parsed) {
    var config = G.config;
    var w = parsed.width || 40;
    var h = parsed.height || 30;
    var rows = parsed.rows || [];
    var charToTerrain = { g: 'grass', w: 'water', p: 'pavement', s: 'sand' };
    var decList = parsed.decorations || [];
    G.mapTerrain = [];
    for (var y = 0; y < h; y++) {
      G.mapTerrain[y] = [];
      var row = rows[y] || '';
      for (var x = 0; x < w; x++) {
        var ch = row[x] || 'g';
        G.mapTerrain[y][x] = charToTerrain[ch] || 'grass';
      }
    }
    G.decorations = [];
    G.decorationBlocked = {};
    decList.forEach(function (d) {
      var emoji = d.emoji;
      if (!emoji && d.type)
        emoji = (config.decorations && config.decorations[d.type]) || d.type;
      if (!emoji) return;
      var collisionScale = (d.collision_scale != null) ? Math.max(0.01, Math.min(1, d.collision_scale)) : 1;
      var dec = {
        emoji: emoji,
        x: d.x,
        y: d.y,
        scale: (d.scale != null) ? d.scale : 1,
        collision: d.collision === true,
        wind: d.wind !== false,
        collision_scale: collisionScale
      };
      G.decorations.push(dec);
      if (dec.collision) {
        var half = Math.max(0, Math.floor(0.5 * dec.scale * collisionScale));
        for (var dy = -half; dy <= half; dy++) {
          for (var dx = -half; dx <= half; dx++) {
            var tx = dec.x + dx;
            var ty = dec.y + dy;
            if (tx >= 0 && tx < w && ty >= 0 && ty < h)
              G.decorationBlocked[tx + ',' + ty] = true;
          }
        }
      }
    });
    G.patchItems = [];
    (parsed.patch || parsed.patches || []).forEach(function (p) {
      var items = generatePatchItems(p, config, G.mapTerrain, w, h);
      items.forEach(function (item) {
        G.patchItems.push(item);
        if (item.collision) {
          var half = Math.max(0, Math.floor(0.5 * item.scale));
          for (var dy = -half; dy <= half; dy++) {
            for (var dx = -half; dx <= half; dx++) {
              var tx = item.x + dx;
              var ty = item.y + dy;
              if (tx >= 0 && tx < w && ty >= 0 && ty < h)
                G.decorationBlocked[tx + ',' + ty] = true;
            }
          }
        }
      });
    });
    G.patchItems.sort(function (a, b) { return a.y !== b.y ? b.y - a.y : a.x - b.x; });
    G.waterWaves = {};
    G.waterTileCoords = [];
    for (var wy = 0; wy < h; wy++) {
      for (var wx = 0; wx < w; wx++) {
        if (G.mapTerrain[wy] && G.mapTerrain[wy][wx] === 'water')
          G.waterTileCoords.push({ tx: wx, ty: wy });
      }
    }
    G.windPhase = 0;
    G.windOffset = getWindOffset(0);
  }

  function updateWaterWaves(dt) {
    var waves = G.waterWaves;
    var config = G.config;
    var waterCoords = G.waterTileCoords;
    if (!config || !waterCoords || waterCoords.length === 0) return;
    var TILE = G.TILE;
    var cam = G.getCamera ? G.getCamera() : { x: 0, y: 0 };
    var startTx = Math.floor(cam.x / TILE);
    var startTy = Math.floor(cam.y / TILE);
    var endTx = startTx + (G.VIEW_W || 22) + 2;
    var endTy = startTy + (G.VIEW_H || 17) + 2;
    var speed = 0.0004;
    for (var i = 0; i < waterCoords.length; i++) {
      var tx = waterCoords[i].tx;
      var ty = waterCoords[i].ty;
      if (tx < startTx || tx > endTx || ty < startTy || ty > endTy) continue;
      var key = tx + ',' + ty;
      if (!waves[key]) waves[key] = { phase: 0, cooldown: 8000 + Math.random() * 7000 };
      var state = waves[key];
      if (state.cooldown > 0) {
        state.cooldown -= dt;
        continue;
      }
      state.phase += dt * speed;
      if (state.phase >= 1) {
        state.phase = 0;
        state.cooldown = 6000 + Math.random() * 9000;
      }
    }
  }

  function findPatchViewRange(patchItems, startTy, endTy) {
    if (!patchItems.length) return { start: 0, end: -1 };
    var len = patchItems.length;
    var lo = 0, hi = len;
    while (lo < hi) {
      var mid = (lo + hi) >>> 1;
      if (patchItems[mid].y > endTy) lo = mid + 1;
      else hi = mid;
    }
    var startIdx = lo;
    lo = 0;
    hi = len;
    while (lo < hi) {
      mid = (lo + hi) >>> 1;
      if (patchItems[mid].y >= startTy) lo = mid + 1;
      else hi = mid;
    }
    return { start: startIdx, end: lo - 1 };
  }

  function drawMap(cam) {
    var ctx = G.ctx;
    var config = G.config;
    var mapTerrain = G.mapTerrain;
    var TILE = G.TILE;
    var VIEW_W = G.VIEW_W;
    var VIEW_H = G.VIEW_H;
    if (!ctx || !config) return;
    var startTx = Math.floor(cam.x / TILE);
    var startTy = Math.floor(cam.y / TILE);
    var endTx = Math.min(config.worldWidth, startTx + VIEW_W + 2);
    var endTy = Math.min(config.worldHeight, startTy + VIEW_H + 2);
    var windOff = G.windOffset || getWindOffset(G.windPhase || 0);

    for (var ty = startTy; ty < endTy; ty++) {
      for (var tx = startTx; tx < endTx; tx++) {
        var t = mapTerrain[ty] && mapTerrain[ty][tx] ? mapTerrain[ty][tx] : 'grass';
        var def = config.tiles[t] || config.tiles.grass || { color: '#3d7a35' };
        ctx.fillStyle = def.color;
        ctx.fillRect(tx * TILE - cam.x, ty * TILE - cam.y, TILE, TILE);
      }
    }

    var waterDef = config.tiles.water || { emoji: '🌊' };
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var lastWaveFont = '';
    for (var ty = startTy; ty < endTy; ty++) {
      for (var tx = startTx; tx < endTx; tx++) {
        if (!mapTerrain[ty] || mapTerrain[ty][tx] !== 'water') continue;
        var key = tx + ',' + ty;
        var state = G.waterWaves[key];
        if (!state || state.phase <= 0) continue;
        var waveScale = Math.sin(state.phase * Math.PI);
        var px = tx * TILE - cam.x + TILE / 2;
        var py = ty * TILE - cam.y + TILE / 2;
        var size = Math.round((TILE * 0.6 * waveScale) / 2) * 2;
        var font = size + 'px serif';
        if (font !== lastWaveFont) { ctx.font = font; lastWaveFont = font; }
        ctx.globalAlpha = waveScale;
        ctx.fillText(waterDef.emoji || '🌊', px, py);
      }
    }
    ctx.globalAlpha = 1;

    var patchItems = G.patchItems || [];
    var range = findPatchViewRange(patchItems, startTy, endTy);
    var lastPatchFont = '';
    for (var i = range.start; i <= range.end; i++) {
      var it = patchItems[i];
      if (it.x < startTx || it.x > endTx) continue;
      var px = it.x * TILE - cam.x + TILE / 2 + (it.wind ? windOff.x : 0);
      var py = it.y * TILE - cam.y + TILE / 2 + (it.wind ? windOff.y : 0);
      var size = Math.round((TILE * 0.55 * it.scale) / 2) * 2;
      var font = size + 'px serif';
      if (font !== lastPatchFont) { ctx.font = font; lastPatchFont = font; }
      ctx.fillText(it.emoji, px, py);
    }

    var decorations = G.decorations || [];
    var lastDecFont = '';
    for (var d = 0; d < decorations.length; d++) {
      var dec = decorations[d];
      if (dec.collision) continue;
      if (dec.x < startTx || dec.x > endTx || dec.y < startTy || dec.y > endTy) continue;
      var px = dec.x * TILE - cam.x + TILE / 2 + (dec.wind ? windOff.x : 0);
      var py = dec.y * TILE - cam.y + TILE / 2 + (dec.wind ? windOff.y : 0);
      var size = Math.round((TILE * 0.7 * dec.scale) / 2) * 2;
      var font = size + 'px serif';
      if (font !== lastDecFont) { ctx.font = font; lastDecFont = font; }
      ctx.fillText(dec.emoji, px, py);
    }
  }

  function drawCollidableDecorations(cam) {
    var ctx = G.ctx;
    var config = G.config;
    var TILE = G.TILE;
    var VIEW_W = G.VIEW_W;
    var VIEW_H = G.VIEW_H;
    if (!ctx || !config) return;
    var startTx = Math.floor(cam.x / TILE);
    var startTy = Math.floor(cam.y / TILE);
    var endTx = Math.min(config.worldWidth, startTx + VIEW_W + 2);
    var endTy = Math.min(config.worldHeight, startTy + VIEW_H + 2);
    var windOff = G.windOffset || getWindOffset(G.windPhase || 0);
    var decorations = G.decorations || [];
    var lastDecFont = '';
    for (var d = 0; d < decorations.length; d++) {
      var dec = decorations[d];
      if (!dec.collision) continue;
      if (dec.x < startTx || dec.x > endTx || dec.y < startTy || dec.y > endTy) continue;
      var px = dec.x * TILE - cam.x + TILE / 2 + (dec.wind ? windOff.x : 0);
      var py = dec.y * TILE - cam.y + TILE / 2 + (dec.wind ? windOff.y : 0);
      var size = Math.round((TILE * 0.7 * dec.scale) / 2) * 2;
      var font = size + 'px serif';
      if (font !== lastDecFont) { ctx.font = font; lastDecFont = font; }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(dec.emoji, px, py);
    }
  }

  function spawnParticlesForEvent(ev) {
    var name = ev.particles && ev.particles.trim();
    var particlesConfig = G.particlesConfig;
    if (!name || !particlesConfig || !particlesConfig[name]) return;
    var def = particlesConfig[name];
    var TILE = G.TILE;
    var cx = (ev.x + 0.5) * TILE;
    var cy = (ev.y + 0.5) * TILE;
    var count = def.count || 6;
    var colors = [def.color || '#ffb7c5', def.color_alt || '#fff'];
    G.particleInstances = [];
    for (var i = 0; i < count; i++) {
      var speed = (def.speed_min != null && def.speed_max != null)
        ? def.speed_min + Math.random() * (def.speed_max - def.speed_min) : 0.25;
      var angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.7;
      var drift = speed * 14;
      G.particleInstances.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * drift,
        vy: Math.sin(angle) * drift,
        life: (def.lifetime != null) ? def.lifetime : 2,
        maxLife: (def.lifetime != null) ? def.lifetime : 2,
        size: (def.size_min != null && def.size_max != null)
          ? def.size_min + Math.random() * (def.size_max - def.size_min) : 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        emoji: def.emoji || '',
        style: def.style || 'float'
      });
    }
  }

  function updateParticles(dt) {
    var sec = dt / 1000;
    var particleInstances = G.particleInstances;
    var events = G.events;
    var currentEventIndex = G.currentEventIndex;
    if (particleInstances && particleInstances.length > 0) {
      for (var i = particleInstances.length - 1; i >= 0; i--) {
        var p = particleInstances[i];
        p.x += p.vx * sec * 60;
        p.y += p.vy * sec * 60;
        p.life -= sec;
        if (p.life <= 0) particleInstances.splice(i, 1);
      }
    }
    if (events && currentEventIndex < events.length && events[currentEventIndex].particles &&
        (!particleInstances || particleInstances.length < 2)) {
      spawnParticlesForEvent(events[currentEventIndex]);
    }
  }

  function drawParticles(cam) {
    var particleInstances = G.particleInstances;
    var ctx = G.ctx;
    if (!particleInstances || !particleInstances.length || !ctx) return;
    particleInstances.forEach(function (p) {
      var sx = p.x - cam.x;
      var sy = p.y - cam.y;
      var alpha = p.life / p.maxLife;
      if (alpha <= 0) return;
      ctx.globalAlpha = alpha;
      if (p.emoji) {
        ctx.font = (p.size || 14) + 'px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = p.color || '#ffb7c5';
        ctx.fillText(p.emoji, sx, sy);
      } else {
        ctx.fillStyle = p.color || '#ffb7c5';
        ctx.beginPath();
        ctx.arc(sx, sy, p.size || 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
  }

  function drawEvents(cam) {
    var events = G.events;
    var currentEventIndex = G.currentEventIndex;
    var ctx = G.ctx;
    var config = G.config;
    var TILE = G.TILE;
    var finalEventImg = G.finalEventImg;
    var finalEventLoaded = G.finalEventLoaded;
    var charScale = (config && config.characterScale != null) ? config.characterScale : 1;
    var otherScale = charScale * 0.3;
    if (currentEventIndex >= events.length || !ctx) return;
    var ev = events[currentEventIndex];
    var px = ev.x * TILE - cam.x;
    var py = ev.y * TILE - cam.y;
    if (px < -TILE || py < -TILE || px > G.canvas.width || py > G.canvas.height) return;
    if (ev.triggersMinigame && finalEventImg && finalEventLoaded) {
      var iw = finalEventImg.naturalWidth;
      var ih = finalEventImg.naturalHeight;
      if (iw && ih) {
        var scale = Math.min(TILE / iw, TILE / ih) * charScale;
        var dw = iw * scale;
        var dh = ih * scale;
        ctx.drawImage(finalEventImg, px + (TILE - dw) / 2, py + (TILE - dh) / 2, dw, dh);
      } else {
        ctx.drawImage(finalEventImg, px, py, TILE, TILE);
      }
    } else {
      var emojiScale = charScale * otherScale;
      ctx.font = (TILE * 0.85 * emojiScale) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(255, 200, 220, 0.9)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillText(ev.emoji, px + TILE / 2, py + TILE / 2);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }
  }

  function drawPlayer(cam) {
    var ctx = G.ctx;
    var player = G.player;
    var playerImg = G.playerImg;
    var spriteLoaded = G.spriteLoaded;
    var config = G.config;
    var charScale = (config && config.characterScale != null) ? config.characterScale : 1;
    if (!ctx || !player) return;
    var px = player.x - cam.x;
    var py = player.y - cam.y;
    var walkTime = player.walkTime || 0;
    var tiltAngle = 0;
    if (walkTime > 0) {
      var cycle = (walkTime * 0.01) % 1;
      tiltAngle = Math.sin(cycle * Math.PI * 2) * 0.022;
    }
    var cx = px + player.w / 2;
    var cy = py + player.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tiltAngle);
    ctx.translate(-player.w / 2, -player.h / 2);
    px = 0;
    py = 0;
    if (playerImg && spriteLoaded) {
      var iw = playerImg.naturalWidth;
      var ih = playerImg.naturalHeight;
      if (iw && ih) {
        var scale = Math.min(player.w / iw, player.h / ih) * charScale;
        var dw = iw * scale;
        var dh = ih * scale;
        player.drawnW = dw;
        player.drawnH = dh;
        ctx.drawImage(playerImg, px + (player.w - dw) / 2, py + (player.h - dh) / 2, dw, dh);
      } else {
        player.drawnW = player.w * charScale;
        player.drawnH = player.h * charScale;
        ctx.drawImage(playerImg, px + (player.w - player.drawnW) / 2, py + (player.h - player.drawnH) / 2, player.drawnW, player.drawnH);
      }
    } else {
      player.drawnW = player.w * charScale;
      player.drawnH = player.h * charScale;
      ctx.fillStyle = '#c41e3a';
      ctx.fillRect(px + (player.w - player.drawnW) / 2, py + (player.h - player.drawnH) / 2, player.drawnW, player.drawnH);
    }
    ctx.restore();
  }

  function updateMap(dt) {
    if (G.windPhase == null) G.windPhase = 0;
    G.windPhase += dt * 0.002;
    G.windOffset = getWindOffset(G.windPhase);
    updateWaterWaves(dt);
  }

  G.getCamera = getCamera;
  G.getTileAtPixel = getTileAtPixel;
  G.isBlocked = isBlocked;
  G.isRectBlocked = isRectBlocked;
  G.buildMapFromWorld = buildMapFromWorld;
  G.drawMap = drawMap;
  G.drawCollidableDecorations = drawCollidableDecorations;
  G.updateMap = updateMap;
  G.spawnParticlesForEvent = spawnParticlesForEvent;
  G.updateParticles = updateParticles;
  G.drawParticles = drawParticles;
  G.drawEvents = drawEvents;
  G.drawPlayer = drawPlayer;
})();
