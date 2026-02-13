/**
 * Main game: config loading, init, game loop, player movement, event triggering.
 * Depends on: game-setup.js, dialogue.js, effects.js, map.js (load before this).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G) return;

  var base64Sprite = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAOklEQVRYR+3OMQEAAAjDMMC/52ECvhBI0d1sZgOBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUDwBQb2AAH0Lh1lAAAAAElFTkSuQmCC';

  G.BASE = '';

  function loadText(url) {
    return fetch((G.BASE || '') + url).then(function (r) {
      if (!r.ok) throw new Error('Failed to load ' + url);
      return r.text();
    });
  }

  function buildConfigFromTOML(parsed) {
    var tiles = {};
    if (parsed.tiles) {
      Object.keys(parsed.tiles).forEach(function (k) {
        tiles[k] = { color: parsed.tiles[k].color || '#333', emoji: parsed.tiles[k].emoji || '' };
      });
    }
    var minigames = {};
    if (parsed.minigames) {
      Object.keys(parsed.minigames).forEach(function (k) {
        minigames[k] = parsed.minigames[k];
      });
    }
    return {
      worldWidth: (parsed.world && parsed.world.width) || 40,
      worldHeight: (parsed.world && parsed.world.height) || 30,
      tileSize: (parsed.world && parsed.world.tile_size) || 40,
      playerSpeed: (parsed.player && parsed.player.speed) || 4,
      blockedTiles: (parsed.blocked_tiles && parsed.blocked_tiles.list) || ['water'],
      tiles: tiles,
      decorations: parsed.decorations || {},
      playerSpriteUrl: (parsed.player && parsed.player.sprite_url) || '',
      finalEventSpriteUrl: (parsed.final_event && parsed.final_event.sprite_url) || '',
      characterScale: (parsed.sprites && parsed.sprites.character_scale != null) ? parsed.sprites.character_scale : 1,
      minigames: minigames,
      ui: {
        dialogueBg: (parsed.ui && parsed.ui.dialogue_bg) || '#fff5f8',
        dialogueBorder: (parsed.ui && parsed.ui.dialogue_border) || '#c41e3a',
        dialogueText: (parsed.ui && parsed.ui.dialogue_text) || '#2d1519',
        titleHearts: (parsed.ui && parsed.ui.title_hearts) || '❤️'
      }
    };
  }

  function buildEventsFromTOML(parsed) {
    var list = parsed.events || [];
    var parseDialogueLine = G.parseDialogueLine;
    if (!parseDialogueLine) return list.map(function (ev) {
      var minigameId = (ev.triggers_minigame && String(ev.triggers_minigame).trim()) || '';
      return { x: ev.x, y: ev.y, emoji: ev.emoji || '❓', triggersMinigame: minigameId, particles: (ev.particles && String(ev.particles).trim()) || '', dialogue: [] };
    });
    return list.map(function (ev) {
      var lines = (ev.dialogue || []).map(parseDialogueLine);
      var spriteUrl = (ev.sprite_url != null && String(ev.sprite_url).trim()) ? String(ev.sprite_url).trim() : '';
      var minigameId = (ev.triggers_minigame && String(ev.triggers_minigame).trim()) || '';
      return {
        x: ev.x,
        y: ev.y,
        emoji: ev.emoji || '❓',
        triggersMinigame: minigameId,
        particles: (ev.particles && String(ev.particles).trim()) || '',
        dialogue: lines,
        sprite_url: spriteUrl
      };
    });
  }

  function playerOverlapsEvent(ev) {
    var TILE = G.TILE;
    var player = G.player;
    var config = G.config;
    if (!player) return false;
    var charScale = (config && config.characterScale != null) ? config.characterScale : 1;
    var padding = Math.max(0, (charScale - 1) * TILE * 0.5);
    var tx = ev.x * TILE - padding, ty = ev.y * TILE - padding;
    var tw = TILE + padding * 2, th = TILE + padding * 2;
    var px = player.x + player.w / 2, py = player.y + player.h / 2;
    return px >= tx && px <= tx + tw && py >= ty && py <= ty + th;
  }

  function onDialogueComplete() {
    var events = G.events;
    var currentEventIndex = G.currentEventIndex;
    var completedIndex = currentEventIndex;
    G.currentEventIndex = currentEventIndex + 1;
    if (G.currentEventIndex < events.length && events[G.currentEventIndex].particles) {
      G.spawnParticlesForEvent(events[G.currentEventIndex]);
    }
    var ev = events[completedIndex];
    if (ev && ev.triggersMinigame) G.startMinigame(ev.triggersMinigame);
  }

  function startMinigame(minigameId) {
    if (!minigameId || !G.minigames || !G.minigames[minigameId]) {
      console.error('Minigame not found:', minigameId);
      return;
    }
    G.minigames[minigameId].start();
  }

  function tryTriggerEvent() {
    if (G.dialogueState.active) {
      G.advanceDialogue();
      return;
    }
    if (G.currentEventIndex >= G.events.length) return;
    var ev = G.events[G.currentEventIndex];
    if (playerOverlapsEvent(ev)) G.startDialogue(ev);
  }

  function update(dt) {
    G.updateParticles(dt);
    if (G.updateMap) G.updateMap(dt);
    if (G.dialogueState.active) return;
    var config = G.config;
    var player = G.player;
    var keys = G.keys;
    var TILE = G.TILE;
    var speed = (config.playerSpeed || 4) * (dt / 16);
    var nx = player.x, ny = player.y;
    var moving = false;
    if (keys['ArrowLeft']) { nx -= speed; moving = true; }
    if (keys['ArrowRight']) { nx += speed; moving = true; }
    if (keys['ArrowUp']) { ny -= speed; moving = true; }
    if (keys['ArrowDown']) { ny += speed; moving = true; }
    if (moving) {
      player.walkTime = (player.walkTime || 0) + dt;
    } else {
      player.walkTime = 0;
    }
    var dw = player.drawnW != null ? player.drawnW : player.w;
    var dh = player.drawnH != null ? player.drawnH : player.h;
    var ox = (player.w - dw) / 2;
    var oy = (player.h - dh) / 2;
    if (!G.isRectBlocked(nx + ox, player.y + oy, dw, dh)) player.x = nx;
    if (!G.isRectBlocked(player.x + ox, ny + oy, dw, dh)) player.y = ny;
  }

  function render() {
    var cam = G.getCamera();
    G.ctx.clearRect(0, 0, G.canvas.width, G.canvas.height);
    G.drawMap(cam);
    G.drawEvents(cam);
    G.drawParticles(cam);
    G.drawPlayer(cam);
    if (G.drawCollidableDecorations) G.drawCollidableDecorations(cam);
  }

  function loop(now) {
    var dt = Math.min(now - (loop.lastTime || 0), 64);
    loop.lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function init() {
    G.canvas = document.getElementById('gameCanvas');
    if (!G.canvas) return;
    G.ctx = G.canvas.getContext('2d');
    G.dialogueBoxEl = document.getElementById('dialogueBox');
    G.dialogueSpeakerEl = document.getElementById('dialogueSpeaker');
    G.dialogueMessageEl = document.getElementById('dialogueMessage');
    G.effectOverlayEl = document.getElementById('effectOverlay');
    G.effectEmojiPlayerEl = document.getElementById('effectEmojiPlayer');
    G.effectEmojiTextboxEl = document.getElementById('effectEmojiTextbox');
    G.imgBoxOverlayEl = document.getElementById('imgBoxOverlay');

    var titleEl = document.querySelector('h1');
    Promise.all([
      loadText('config/config.toml').then(function (t) { return parseTOML(t); }),
      loadText('config/events.toml').then(function (t) { return parseTOML(t); }),
      loadText('world/layout.toml').then(function (t) { return parseTOML(t); }),
      loadText('config/particles.toml').then(function (t) { return parseTOML(t); }),
      loadText('config/animations.toml').then(function (t) { return parseTOML(t); }),
      loadText('config/effects.toml').then(function (t) { return parseTOML(t); })
    ]).then(function (results) {
      G.config = buildConfigFromTOML(results[0]);
      G.events = buildEventsFromTOML(results[1]);
      G.buildMapFromWorld(results[2]);
      G.particlesConfig = results[3] || {};
      G.animationsConfig = results[4] || {};
      G.effectsConfig = results[5] || {};

      if (titleEl) titleEl.innerHTML = G.config.ui.titleHearts + ' Kinza 2026 ' + G.config.ui.titleHearts;

      G.TILE = G.config.tileSize;
      G.VIEW_W = Math.floor(G.canvas.width / G.TILE);
      G.VIEW_H = Math.floor(G.canvas.height / G.TILE);

      G.player = {
        x: 14 * G.TILE,
        y: 10 * G.TILE,
        w: G.TILE - 4,
        h: G.TILE - 4,
        drawnW: G.TILE - 4,
        drawnH: G.TILE - 4
      };
      G.keys = {};
      G.currentEventIndex = 0;
      G.dialogueState = { active: false, lines: [], lineIndex: 0 };
      G.particleInstances = [];
      if (G.events.length && G.events[0].particles) G.spawnParticlesForEvent(G.events[0]);

      var imgSrc = (G.config.playerSpriteUrl && G.config.playerSpriteUrl.trim()) ? (G.BASE + G.config.playerSpriteUrl) : base64Sprite;
      G.playerImg = new Image();
      G.spriteLoaded = false;
      G.playerImg.onload = function () { G.spriteLoaded = true; };
      G.playerImg.onerror = function () { G.spriteLoaded = false; G.playerImg = null; };
      G.playerImg.src = imgSrc;

      G.finalEventLoaded = false;
      G.finalEventImg = null;
      var finalEv = null;
      for (var ei = 0; ei < G.events.length; ei++) {
        if (G.events[ei].triggersMinigame) { finalEv = G.events[ei]; break; }
      }
      var finalUrl = (finalEv && finalEv.sprite_url) ? (G.BASE + finalEv.sprite_url) : ((G.config.finalEventSpriteUrl && G.config.finalEventSpriteUrl.trim()) ? (G.BASE + G.config.finalEventSpriteUrl.trim()) : '');
      if (finalUrl) {
        G.finalEventImg = new Image();
        G.finalEventImg.onload = function () { G.finalEventLoaded = true; };
        G.finalEventImg.onerror = function () { G.finalEventLoaded = false; G.finalEventImg = null; };
        G.finalEventImg.src = finalUrl;
      }

      G.onDialogueComplete = onDialogueComplete;
      G.startMinigame = startMinigame;

      document.addEventListener('keydown', function (e) {
        if (e.repeat) return;
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].indexOf(e.key) !== -1) e.preventDefault();
        G.keys[e.key] = true;
        if (e.key === ' ' || e.key === 'Enter') tryTriggerEvent();
      });
      document.addEventListener('keyup', function (e) { G.keys[e.key] = false; });

      requestAnimationFrame(loop);
    }).catch(function (err) {
      console.error(err);
      if (G.canvas && G.ctx) {
        G.ctx.fillStyle = '#333';
        G.ctx.font = '16px sans-serif';
        G.ctx.fillText('Failed to load config. Serve from a local server (e.g. Live Server).', 20, 40);
        G.ctx.fillText(err.message, 20, 70);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
