/**
 * Lantern minigame: drag and drop a lantern to illuminate the screen and reveal a message.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G) return;

  var canvas, ctx;
  var overlayCanvas, overlayCtx;
  var config = {};
  var lanterns = [];
  var stars = [];
  var groundImg = null; // kmcats sprite, loaded when minigame starts
  var noButtonDropY = 0;
  var noButtonDropping = false;
  var noButtonPermanentlyGone = false;
  var draggedLanternIndex = -1;
  var startX = 0;
  var startY = 0;
  var animationId = null;

  function initConfig() {
    var minigameConfig = (G.config && G.config.minigames && G.config.minigames.lantern) || {};
    config.initialOpacity = minigameConfig.initial_opacity || 0.1;
    config.message = minigameConfig.message || 'Will you be my valentine?';
    config.backgroundColor = minigameConfig.background_color || '#0a0a0a';
    config.overlayColor = minigameConfig.overlay_color || '#000000';
    config.bloomRadius = minigameConfig.bloom_radius || 150;
    config.bloomIntensity = minigameConfig.bloom_intensity || 0.8;
    config.bloomBrightness = (minigameConfig.bloom_brightness != null) ? Math.max(0, Math.min(1, Number(minigameConfig.bloom_brightness))) : 1.0;
    config.stopHeight = minigameConfig.stop_height || 0.3;
    config.swayAmount = minigameConfig.sway_amount || 15;
    config.swaySpeed = minigameConfig.sway_speed || 2.0;
    config.floatSpeed = minigameConfig.float_speed || 50;
    config.opacitySpeed = minigameConfig.opacity_speed || 0.5;
    config.lanternScale = minigameConfig.lantern_scale || 1.0;
    config.flickerIntensity = minigameConfig.flicker_intensity || 0.15;
    config.flickerSpeed = minigameConfig.flicker_speed || 8.0;
    config.starCount = minigameConfig.star_count || 120;
    config.starSize = minigameConfig.star_size || 1.2;
    config.starFlickerSpeed = minigameConfig.star_flicker_speed || 3.0;
    config.starColor = minigameConfig.star_color || '#ffffff';
    config.groundColor = minigameConfig.ground_color || '#1a3d1a';
    config.groundHeight = minigameConfig.ground_height || 90;
    config.spriteUrl = (minigameConfig.sprite_url && String(minigameConfig.sprite_url).trim()) ? String(minigameConfig.sprite_url).trim() : 'images/events/kmcats.png';
    config.spriteScale = (minigameConfig.sprite_scale != null) ? Math.max(0.2, Math.min(1, Number(minigameConfig.sprite_scale))) : 0.5;
  }

  function initCanvas() {
    var container = document.getElementById('minigameContainer');
    if (!container) return false;

    container.innerHTML = '';
    canvas = document.createElement('canvas');
    canvas.id = 'minigameCanvas';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.cursor = 'grab';
    container.appendChild(canvas);

    var letterOverlay = document.getElementById('letterOverlay');
    if (letterOverlay) {
      var closeBtn = letterOverlay.querySelector('.letter-close');
      if (closeBtn) closeBtn.addEventListener('click', function() { letterOverlay.classList.remove('visible'); });
    }

    ctx = canvas.getContext('2d');
    
    overlayCanvas = document.createElement('canvas');
    overlayCtx = overlayCanvas.getContext('2d');
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return true;
  }

  function hitTestButtons(clientX, clientY) {
    if (!canvas || !lastYesRect) return null;
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var x = (clientX - rect.left) * scaleX;
    var y = (clientY - rect.top) * scaleY;
    if (x >= lastYesRect.x && x <= lastYesRect.x + lastYesRect.w && y >= lastYesRect.y && y <= lastYesRect.y + lastYesRect.h) return 'yes';
    if (!noButtonDropping && !noButtonPermanentlyGone && lastNoRect && x >= lastNoRect.x && x <= lastNoRect.x + lastNoRect.w && y >= lastNoRect.y && y <= lastNoRect.y + lastNoRect.h) return 'no';
    return null;
  }

  function onNoClick() {
    if (noButtonDropping) return;
    noButtonDropping = true;
    noButtonDropY = 0;
  }

  function onYesClick() {
    var base = (G.BASE != null ? G.BASE : '');
    fetch((base || '') + 'config/letter.toml')
      .then(function(r) { return r.text(); })
      .then(function(t) {
        var parsed = typeof parseTOML !== 'undefined' ? parseTOML(t) : {};
        var letter = parsed.letter || {};
        var content = letter.content;
        var text = Array.isArray(content) ? content.join('\n') : (content || '');
        var overlay = document.getElementById('letterOverlay');
        var contentEl = overlay && overlay.querySelector('.letter-content');
        if (contentEl) {
          contentEl.textContent = text;
          overlay.classList.add('visible');
        }
      })
      .catch(function(e) { console.error('Failed to load letter.toml', e); });
  }

  function resizeCanvas() {
    var container = document.getElementById('minigameContainer');
    if (!container || !canvas) return;
    var width = container.clientWidth || 800;
    var height = container.clientHeight || 600;
    canvas.width = width;
    canvas.height = height;
    if (overlayCanvas) {
      overlayCanvas.width = width;
      overlayCanvas.height = height;
    }
    startX = canvas.width / 2;
    startY = canvas.height - 80; // Bottom of screen
    generateStars();
  }

  function generateStars() {
    stars = [];
    var w = canvas.width;
    var h = canvas.height;
    for (var i = 0; i < config.starCount; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        phase: Math.random() * Math.PI * 2,
        size: config.starSize * (0.6 + Math.random() * 0.8) // Slight size variation
      });
    }
  }

  function createLantern() {
    // Random target height between 20% and 80% of screen height
    var minHeight = 0.2;
    var maxHeight = 0.8;
    var randomTargetHeight = minHeight + Math.random() * (maxHeight - minHeight);
    
    return {
      x: startX,
      y: startY,
      opacity: config.initialOpacity,
      isDragging: false,
      dragOffsetX: 0,
      dragOffsetY: 0,
      isFloating: false,
      targetY: canvas.height * randomTargetHeight, // Random target height
      swayPhase: Math.random() * Math.PI * 2, // Random starting phase for variety
      flickerPhase: Math.random() * Math.PI * 2, // Random starting flicker phase
      targetOpacity: config.initialOpacity
    };
  }

  function getMousePos(e) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  function getTouchPos(e) {
    if (e.touches && e.touches.length > 0) {
      var rect = canvas.getBoundingClientRect();
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return null;
  }

  function findLanternAt(x, y) {
    for (var i = 0; i < lanterns.length; i++) {
      var l = lanterns[i];
      if (!l.isFloating) {
        var dist = Math.sqrt(Math.pow(x - l.x, 2) + Math.pow(y - l.y, 2));
        if (dist < 60) return i;
      }
    }
    return -1;
  }

  function startDrag(x, y) {
    var index = findLanternAt(x, y);
    if (index === -1) return;
    
    draggedLanternIndex = index;
    var lantern = lanterns[index];
    lantern.isDragging = true;
    lantern.dragOffsetX = x - lantern.x;
    lantern.dragOffsetY = y - lantern.y;
    canvas.style.cursor = 'grabbing';
  }

  function updateDrag(x, y) {
    if (draggedLanternIndex === -1) return;
    var lantern = lanterns[draggedLanternIndex];
    if (!lantern.isDragging) return;
    
    lantern.x = x - lantern.dragOffsetX;
    lantern.y = y - lantern.dragOffsetY;
    // Keep lantern within bounds
    lantern.x = Math.max(50, Math.min(canvas.width - 50, lantern.x));
    lantern.y = Math.max(50, Math.min(canvas.height - 50, lantern.y));
  }

  function endDrag() {
    if (draggedLanternIndex === -1) return;
    var lantern = lanterns[draggedLanternIndex];
    if (!lantern.isDragging) return;
    
    lantern.isDragging = false;
    lantern.isFloating = true;
    lantern.targetOpacity = 1.0;
    draggedLanternIndex = -1;
    canvas.style.cursor = 'default';
    
    // Create a new lantern at the starting position
    lanterns.push(createLantern());
  }

  function setupEventListeners() {
    // Mouse events
    canvas.addEventListener('mousedown', function(e) {
      var hit = hitTestButtons(e.clientX, e.clientY);
      if (hit === 'yes') { onYesClick(); e.preventDefault(); return; }
      if (hit === 'no') { onNoClick(); e.preventDefault(); return; }
      var pos = getMousePos(e);
      var index = findLanternAt(pos.x, pos.y);
      if (index !== -1) {
        e.preventDefault();
        startDrag(pos.x, pos.y);
      }
    });

    canvas.addEventListener('mousemove', function(e) {
      var pos = getMousePos(e);
      updateDrag(pos.x, pos.y);
      
      if (draggedLanternIndex === -1) {
        var index = findLanternAt(pos.x, pos.y);
        if (index !== -1) {
          canvas.style.cursor = 'grab';
        } else {
          canvas.style.cursor = 'default';
        }
      }
    });

    canvas.addEventListener('mouseup', function(e) {
      if (draggedLanternIndex !== -1) {
        e.preventDefault();
        endDrag();
      }
    });

    canvas.addEventListener('mouseleave', function(e) {
      if (draggedLanternIndex !== -1) {
        endDrag();
      }
    });

    // Touch events
    canvas.addEventListener('touchstart', function(e) {
      if (e.touches && e.touches[0]) {
        var hit = hitTestButtons(e.touches[0].clientX, e.touches[0].clientY);
        if (hit === 'yes') { onYesClick(); e.preventDefault(); return; }
        if (hit === 'no') { onNoClick(); e.preventDefault(); return; }
      }
      var pos = getTouchPos(e);
      if (pos) {
        var index = findLanternAt(pos.x, pos.y);
        if (index !== -1) {
          e.preventDefault();
          startDrag(pos.x, pos.y);
        }
      }
    });

    canvas.addEventListener('touchmove', function(e) {
      if (draggedLanternIndex !== -1) {
        e.preventDefault();
        var pos = getTouchPos(e);
        if (pos) updateDrag(pos.x, pos.y);
      }
    });

    canvas.addEventListener('touchend', function(e) {
      if (draggedLanternIndex !== -1) {
        e.preventDefault();
        endDrag();
      }
    });
  }

  function update(dt) {
    for (var i = 0; i < lanterns.length; i++) {
      var lantern = lanterns[i];
      
      if (lantern.isFloating) {
        // Use the lantern's individual targetY instead of a global stopHeight
        if (lantern.y > lantern.targetY) {
          lantern.y -= (config.floatSpeed * dt / 1000);
          if (lantern.y < lantern.targetY) lantern.y = lantern.targetY;
        } else {
          // Reached target height, just sway
          lantern.swayPhase += config.swaySpeed * dt / 1000;
        }
      }

      // Update opacity towards target
      if (lantern.opacity < lantern.targetOpacity) {
        lantern.opacity += config.opacitySpeed * dt / 1000;
        if (lantern.opacity > lantern.targetOpacity) lantern.opacity = lantern.targetOpacity;
      }

      // Update sway phase even when not floating (but not when dragging)
      if (!lantern.isDragging) {
        lantern.swayPhase += config.swaySpeed * dt / 1000;
      }
      
      // Update flicker phase for realistic flame flickering
      lantern.flickerPhase += config.flickerSpeed * dt / 1000;
    }
    
    // Update star flicker phases
    for (var s = 0; s < stars.length; s++) {
      stars[s].phase += config.starFlickerSpeed * dt / 1000;
    }

    if (noButtonDropping) {
      noButtonDropY += 400 * dt / 1000;
      if (noButtonDropY > canvas.height + 60) {
        noButtonDropping = false;
        noButtonPermanentlyGone = true;
        var base = (G.BASE != null ? G.BASE : '');
        fetch((base || '') + 'config/lantern_dialogue.toml')
          .then(function(r) { return r.text(); })
          .then(function(t) {
            var parsed = typeof parseTOML !== 'undefined' ? parseTOML(t) : {};
            var block = parsed.no_response || {};
            var rawLines = block.dialogue || [];
            if (G.startDialogueWithLines && rawLines.length) {
              G.startDialogueWithLines(rawLines, function() {});
            }
          })
          .catch(function(e) { console.error('Failed to load lantern_dialogue.toml', e); });
      }
    }
  }
  
  function getFlickerMultiplier(flickerPhase) {
    // Create a flickering effect using multiple sine waves for realistic flame behavior
    var flicker1 = Math.sin(flickerPhase);
    var flicker2 = Math.sin(flickerPhase * 2.3);
    var flicker3 = Math.sin(flickerPhase * 3.7);
    var combined = (flicker1 + flicker2 * 0.5 + flicker3 * 0.25) / 1.75;
    return 1.0 + (combined * config.flickerIntensity);
  }
  
  function getStarBrightness(phase) {
    // Sparkle: mix of sine waves for twinkling
    var t1 = Math.sin(phase);
    var t2 = Math.sin(phase * 2.1);
    var t3 = Math.sin(phase * 3.4);
    var v = (t1 + t2 * 0.5 + t3 * 0.25) / 1.75;
    return 0.4 + 0.6 * (v * 0.5 + 0.5); // Opacity between 0.4 and 1.0
  }
  
  function drawStars() {
    overlayCtx.fillStyle = config.starColor;
    for (var i = 0; i < stars.length; i++) {
      var star = stars[i];
      var alpha = getStarBrightness(star.phase);
      overlayCtx.globalAlpha = alpha;
      overlayCtx.beginPath();
      overlayCtx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      overlayCtx.fill();
    }
    overlayCtx.globalAlpha = 1.0;
  }

  function drawBloomErase(x, y, opacity, flickerMult) {
    // Create a gradient mask to erase the dark overlay
    // destination-out uses alpha to determine how much to erase
    // Apply flicker to the radius; bloomBrightness scales max opacity
    var radius = config.bloomRadius * flickerMult;
    var gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    var brightness = (config.bloomBrightness != null) ? config.bloomBrightness : 1.0;
    var eraseAlpha = Math.min(opacity * brightness, 1.0);
    // Use full opacity at center, fading out
    gradient.addColorStop(0, 'rgba(255, 255, 255, ' + eraseAlpha + ')');
    gradient.addColorStop(0.2, 'rgba(255, 255, 255, ' + (eraseAlpha * 0.95) + ')');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, ' + (eraseAlpha * 0.7) + ')');
    gradient.addColorStop(0.8, 'rgba(255, 255, 255, ' + (eraseAlpha * 0.3) + ')');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBloomGlow(x, y, opacity, flickerMult) {
    if (opacity < 0.01) return;

    // Apply flicker to radius and intensity; bloomBrightness scales brightness
    var brightness = (config.bloomBrightness != null) ? config.bloomBrightness : 1.0;
    var radius = config.bloomRadius * flickerMult;
    var intensity = config.bloomIntensity * flickerMult * brightness;
    var gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    var alpha = opacity * intensity;
    gradient.addColorStop(0, 'rgba(255, 255, 200, ' + alpha + ')');
    gradient.addColorStop(0.3, 'rgba(255, 220, 150, ' + (alpha * 0.6) + ')');
    gradient.addColorStop(0.6, 'rgba(255, 180, 100, ' + (alpha * 0.3) + ')');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLantern(x, y, opacity, scale) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.font = '64px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏮', 0, 0);
    ctx.restore();
  }

  var lastYesRect = null;
  var lastNoRect = null;

  function drawMessageAndButtons() {
    var cx = canvas.width / 2;
    var cy = canvas.height / 2;
    var msg = config.message || 'Will you be my valentine?';

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg, cx, cy - 50);
    ctx.restore();

    var bw = 100;
    var bh = 44;
    var gap = 24;
    var by = cy + 24;

    function drawButton(x, y, label, isNo) {
      var r = 8;
      ctx.save();
      ctx.fillStyle = isNo ? 'rgba(254, 249, 251, 0.95)' : 'rgba(255, 232, 239, 0.95)';
      ctx.strokeStyle = '#c41e3a';
      ctx.lineWidth = 3;
      roundRect(ctx, x, y, bw, bh, r);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = isNo ? '#6b2d3d' : '#8b2942';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + bw / 2, y + bh / 2);
      ctx.restore();
    }

    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    var yesX = cx - bw - gap / 2;
    var noX = cx + gap / 2;
    var noY = by + (noButtonDropping ? noButtonDropY : 0);

    lastYesRect = { x: yesX, y: by, w: bw, h: bh };
    lastNoRect = noButtonPermanentlyGone ? null : { x: noX, y: noY, w: bw, h: bh };

    drawButton(yesX, by, 'Yes', false);
    if (!noButtonPermanentlyGone && (!noButtonDropping || noButtonDropY < canvas.height + bh)) {
      drawButton(noX, noY, 'No', true);
    }
  }

  function drawGround() {
    var h = config.groundHeight;
    var y = canvas.height - h;
    ctx.fillStyle = config.groundColor;
    ctx.fillRect(0, y, canvas.width, h);
  }

  function drawSprite() {
    if (!groundImg || !groundImg.complete || !groundImg.naturalWidth) return;
    var scale = config.lanternScale * (config.spriteScale != null ? config.spriteScale : 0.5);
    var img = groundImg;
    var w = img.naturalWidth * scale;
    var h = img.naturalHeight * scale;
    var x = (canvas.width - w) / 2;
    var y = canvas.height - config.groundHeight - h; // Bottom of sprite sits on top of ground
    ctx.drawImage(img, x, y, w, h);
  }

  function render() {
    // Clear with background color (night sky)
    ctx.fillStyle = config.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw message and buttons (will be revealed by bloom effect)
    drawMessageAndButtons();

    // Draw dark overlay on overlay canvas
    overlayCtx.fillStyle = config.overlayColor;
    overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    // Draw flickering stars on the dark screen (night sky)
    drawStars();
    
    // Erase parts of the overlay where lanterns are (reveals the message)
    overlayCtx.globalCompositeOperation = 'destination-out';
    for (var i = 0; i < lanterns.length; i++) {
      var lantern = lanterns[i];
      var swayX = lantern.isFloating && !lantern.isDragging ? Math.sin(lantern.swayPhase) * config.swayAmount : 0;
      var currentX = lantern.x + swayX;
      var currentY = lantern.y;
      
      // Only erase if lantern has some opacity
      if (lantern.opacity > 0.01) {
        var flickerMult = getFlickerMultiplier(lantern.flickerPhase);
        var radius = config.bloomRadius * flickerMult;
        var gradient = overlayCtx.createRadialGradient(currentX, currentY, 0, currentX, currentY, radius);
        var brightness = (config.bloomBrightness != null) ? config.bloomBrightness : 1.0;
        var eraseAlpha = Math.min(lantern.opacity * brightness, 1.0);
        gradient.addColorStop(0, 'rgba(255, 255, 255, ' + eraseAlpha + ')');
        gradient.addColorStop(0.2, 'rgba(255, 255, 255, ' + (eraseAlpha * 0.95) + ')');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, ' + (eraseAlpha * 0.7) + ')');
        gradient.addColorStop(0.8, 'rgba(255, 255, 255, ' + (eraseAlpha * 0.3) + ')');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        overlayCtx.fillStyle = gradient;
        overlayCtx.beginPath();
        overlayCtx.arc(currentX, currentY, radius, 0, Math.PI * 2);
        overlayCtx.fill();
      }
    }
    
    // Reset composite operation for next frame
    overlayCtx.globalCompositeOperation = 'source-over';
    
    // Draw the overlay with holes onto the main canvas
    ctx.drawImage(overlayCanvas, 0, 0);

    // Draw ground (grass) strip at the bottom
    drawGround();

    // Draw sprite (kmcats) right under where the lanterns spawn, scale = lanternScale
    drawSprite();

    // Draw bloom glow on top for each lantern
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (var i = 0; i < lanterns.length; i++) {
      var lantern = lanterns[i];
      var swayX = lantern.isFloating && !lantern.isDragging ? Math.sin(lantern.swayPhase) * config.swayAmount : 0;
      var currentX = lantern.x + swayX;
      var currentY = lantern.y;
      var flickerMult = getFlickerMultiplier(lantern.flickerPhase);
      drawBloomGlow(currentX, currentY, lantern.opacity, flickerMult);
    }
    ctx.restore();

    // Draw all lanterns
    for (var i = 0; i < lanterns.length; i++) {
      var lantern = lanterns[i];
      var swayX = lantern.isFloating && !lantern.isDragging ? Math.sin(lantern.swayPhase) * config.swayAmount : 0;
      var currentX = lantern.x + swayX;
      var currentY = lantern.y;
      drawLantern(currentX, currentY, lantern.opacity, config.lanternScale);
    }
  }

  function loop(now) {
    var dt = Math.min(now - (loop.lastTime || 0), 64);
    loop.lastTime = now;
    update(dt);
    render();
    animationId = requestAnimationFrame(loop);
  }

  function start() {
    initConfig();
    G.showMinigame();

    // Preload the ground sprite
    var base = (G.BASE != null ? G.BASE : '');
    groundImg = new Image();
    groundImg.onerror = function() { groundImg = null; };
    groundImg.src = base + config.spriteUrl;

    // Wait a frame for the container to be visible, then initialize canvas
    requestAnimationFrame(function() {
      if (!initCanvas()) {
        console.error('Failed to initialize minigame canvas');
        return;
      }

      // Initialize starting position
      startX = canvas.width / 2;
      startY = canvas.height - 80; // Bottom of screen
      
      // Reset lanterns array and create first lantern
      lanterns = [];
      lanterns.push(createLantern());
      draggedLanternIndex = -1;
      noButtonDropY = 0;
      noButtonDropping = false;
      noButtonPermanentlyGone = false;

      // Stars are generated in resizeCanvas when initCanvas runs
      if (stars.length === 0) generateStars();

      setupEventListeners();
      loop.lastTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      animationId = requestAnimationFrame(loop);
    });
  }

  function stop() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    window.removeEventListener('resize', resizeCanvas);
    G.hideMinigame();
  }

  // Register this minigame
  G.minigames.lantern = {
    start: start,
    stop: stop
  };
})();
