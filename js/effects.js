/**
 * Effects: image on screen, emoji on player/textbox. Uses config/animations.toml.
 * Add new effect types here; trigger from dialogue via [effect:...].
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G) return;

  function easeOut(t) { return 1 - (1 - t) * (1 - t); }
  function easeIn(t) { return t * t; }

  function applyAnimation(el, animName, durationSec, onDone, scaleMultiplier) {
    var anim = (G.animationsConfig && G.animationsConfig[animName]) || (G.animationsConfig && G.animationsConfig['pop-up']) || null;
    var mult = 1;
    if (scaleMultiplier != null && scaleMultiplier > 0) mult = Number(scaleMultiplier);
    if (isNaN(mult) || mult <= 0) mult = 1;
    var scaleStart = 0;
    var scaleEnd = mult;
    var opacityStart = 0;
    var opacityEnd = 1;
    var yOffset = 0;
    var easingFn = function (t) { return t; };
    if (anim) {
      opacityStart = Number(anim.opacity_start);
      opacityEnd = Number(anim.opacity_end);
      if (isNaN(opacityStart)) opacityStart = 0;
      if (isNaN(opacityEnd)) opacityEnd = 1;
      if (anim.scale_start != null) scaleStart = Number(anim.scale_start) * mult;
      if (anim.scale_end != null) scaleEnd = Number(anim.scale_end) * mult;
      if (isNaN(scaleStart)) scaleStart = 0;
      if (isNaN(scaleEnd)) scaleEnd = mult;
      yOffset = Number(anim.y_offset);
      if (isNaN(yOffset)) yOffset = 0;
      easingFn = (anim.easing === 'ease-in') ? easeIn : (anim.easing === 'ease-out') ? easeOut : function (t) { return t; };
    }
    if (!el || !el.style) { if (onDone) onDone(); return; }
    el.style.transformOrigin = 'center center';
    var start = performance.now();
    function tick(now) {
      var elapsed = (now - start) / 1000;
      var t = Math.min(1, elapsed / durationSec);
      var e = easingFn(t);
      var s = scaleStart + (scaleEnd - scaleStart) * e;
      var ty = yOffset * e;
      var transformStr = 'scale(' + s + ')';
      if (ty !== 0) transformStr += ' translateY(' + ty + 'px)';
      el.style.setProperty('transform', transformStr);
      el.style.setProperty('opacity', String(opacityStart + (opacityEnd - opacityStart) * e));
      if (t < 1) requestAnimationFrame(tick);
      else if (onDone) onDone();
    }
    requestAnimationFrame(tick);
  }

  function hasPlace(targets, name) {
    if (!targets || !targets.length) return false;
    for (var t = 0; t < targets.length; t++) {
      var p = typeof targets[t] === 'string' ? targets[t] : (targets[t].place || '');
      if (p === name) return true;
    }
    return false;
  }

  function getPlaceSpec(targets, name) {
    if (!targets || !targets.length) return null;
    for (var t = 0; t < targets.length; t++) {
      var spec = targets[t];
      var p = typeof spec === 'string' ? spec : (spec.place || '');
      if (p === name) return typeof spec === 'object' ? spec : {};
    }
    return null;
  }

  function getPlaceConfig(placeName, inlineSpec) {
    var cfg = (G.effectsConfig && G.effectsConfig[placeName]) || {};
    var scale = (inlineSpec && inlineSpec.scale != null) ? Number(inlineSpec.scale) : (cfg.scale != null ? Number(cfg.scale) : 1);
    if (isNaN(scale) || scale <= 0) scale = 1;
    var offsetX = (inlineSpec && inlineSpec.x != null) ? Number(inlineSpec.x) : (cfg.offset_x != null ? Number(cfg.offset_x) : 0);
    var offsetY = (inlineSpec && inlineSpec.y != null) ? Number(inlineSpec.y) : (cfg.offset_y != null ? Number(cfg.offset_y) : 0);
    if (isNaN(offsetX)) offsetX = 0;
    if (isNaN(offsetY)) offsetY = 0;
    return { scale: scale, offsetX: offsetX, offsetY: offsetY };
  }

  function runEffect(effectObj) {
    if (!effectObj || !effectObj.effect) return;
    var imgBoxPath = effectObj['img-box'];
    if (imgBoxPath && G.imgBoxOverlayEl) {
      var box = G.imgBoxOverlayEl.querySelector('.img-box');
      var img = box && box.querySelector('.img-box-image');
      var closeBtn = box && box.querySelector('.img-box-close');
      if (img) {
        img.src = (G.BASE != null ? G.BASE : '') + imgBoxPath;
        img.alt = '';
      }
      G.imgBoxOverlayEl.classList.add('visible');
      if (closeBtn && !closeBtn._imgBoxClosed) {
        closeBtn._imgBoxClosed = true;
        closeBtn.addEventListener('click', function () {
          G.imgBoxOverlayEl.classList.remove('visible');
        });
      }
      return;
    }
    var animName = effectObj.animation || 'pop-up';
    var duration = effectObj.duration != null ? effectObj.duration : 0.5;
    var targets = effectObj.in || [{ place: 'screen' }];
    var BASE = G.BASE != null ? G.BASE : '';
    var TILE = G.TILE || 40;

    var animDef = (G.animationsConfig && G.animationsConfig[animName]) || (G.animationsConfig && G.animationsConfig['pop-up']) || {};
    var initialScale = Number(animDef.scale_start);
    if (isNaN(initialScale)) initialScale = 0;
    var initialOpacity = Number(animDef.opacity_start);
    if (isNaN(initialOpacity)) initialOpacity = 0;

    if (effectObj.emoji && hasPlace(targets, 'screen') && G.effectOverlayEl) {
      var screenSpec = getPlaceSpec(targets, 'screen');
      var screenCfg = getPlaceConfig('screen', screenSpec);
      var inner = document.createElement('span');
      inner.className = 'effect-emoji-screen effect-screen-inner';
      inner.style.marginLeft = screenCfg.offsetX + 'px';
      inner.style.marginTop = screenCfg.offsetY + 'px';
      inner.style.display = 'inline-block';
      inner.style.transformOrigin = 'center center';
      inner.textContent = effectObj.emoji;
      G.effectOverlayEl.innerHTML = '';
      G.effectOverlayEl.appendChild(inner);
      G.effectOverlayEl.classList.add('visible');
      inner.style.opacity = String(initialOpacity);
      inner.style.transform = 'scale(' + initialScale + ')';
      var emojiDur = duration;
      applyAnimation(inner, animName, emojiDur, function () {
        setTimeout(function () { G.effectOverlayEl.classList.remove('visible'); }, 200);
      }, screenCfg.scale);
    }
    if (effectObj.img && hasPlace(targets, 'screen') && G.effectOverlayEl) {
      var imgSpec = getPlaceSpec(targets, 'screen');
      var imgCfg = getPlaceConfig('screen', imgSpec);
      G.effectOverlayEl.innerHTML = '';
      var inner = document.createElement('div');
      inner.className = 'effect-screen-inner';
      inner.style.display = 'inline-block';
      inner.style.transformOrigin = 'center center';
      inner.style.marginLeft = imgCfg.offsetX + 'px';
      inner.style.marginTop = imgCfg.offsetY + 'px';
      var img = new Image();
      img.src = BASE + effectObj.img;
      img.alt = '';
      inner.appendChild(img);
      G.effectOverlayEl.appendChild(inner);
      G.effectOverlayEl.classList.add('visible');
      inner.style.opacity = String(initialOpacity);
      inner.style.transform = 'scale(' + initialScale + ')';
      var anim = G.animationsConfig && G.animationsConfig[animName];
      var dur = (anim && anim.duration != null) ? Number(anim.duration) : duration;
      applyAnimation(inner, animName, dur, function () {
        setTimeout(function () { G.effectOverlayEl.classList.remove('visible'); }, Math.max(0, (duration - dur)) * 1000);
      }, imgCfg.scale);
    }

    if (effectObj.emoji && (hasPlace(targets, 'player') || hasPlace(targets, 'textbox'))) {
      var emSize = 28;
      if (hasPlace(targets, 'player') && G.effectEmojiPlayerEl && G.getCamera && G.player) {
        var playerSpec = getPlaceSpec(targets, 'player');
        var playerCfg = getPlaceConfig('player', playerSpec);
        G.effectEmojiPlayerEl.innerHTML = '<span style="display:inline-block;font-size:' + emSize + 'px;line-height:1">' + effectObj.emoji + '</span>';
        G.effectEmojiPlayerEl.style.fontSize = '';
        G.effectEmojiPlayerEl.style.transformOrigin = 'center center';
        G.effectEmojiPlayerEl.style.opacity = String(initialOpacity);
        G.effectEmojiPlayerEl.style.transform = 'scale(' + initialScale + ')';
        var cam = G.getCamera();
        var centerX = (G.player.x - cam.x) + G.player.w / 2;
        var centerY = (G.player.y - cam.y) + G.player.h / 2;
        var px = centerX - emSize / 2 + playerCfg.offsetX;
        var py = centerY - emSize + playerCfg.offsetY;
        G.effectEmojiPlayerEl.style.left = px + 'px';
        G.effectEmojiPlayerEl.style.top = py + 'px';
        G.effectEmojiPlayerEl.classList.add('visible');
        applyAnimation(G.effectEmojiPlayerEl, animName, duration, function () {
          setTimeout(function () { G.effectEmojiPlayerEl.classList.remove('visible'); }, 200);
        }, playerCfg.scale);
      }
      if (hasPlace(targets, 'textbox') && G.effectEmojiTextboxEl && G.dialogueBoxEl) {
        var tbSpec = getPlaceSpec(targets, 'textbox');
        var tbCfg = getPlaceConfig('textbox', tbSpec);
        G.effectEmojiTextboxEl.innerHTML = '<span style="display:inline-block;font-size:' + emSize + 'px;line-height:1">' + effectObj.emoji + '</span>';
        G.effectEmojiTextboxEl.style.fontSize = '';
        G.effectEmojiTextboxEl.style.transformOrigin = 'center center';
        G.effectEmojiTextboxEl.style.opacity = String(initialOpacity);
        G.effectEmojiTextboxEl.style.transform = 'scale(' + initialScale + ')';
        var baseBottom = 55;
        var baseRight = 25;
        G.effectEmojiTextboxEl.style.bottom = (baseBottom - tbCfg.offsetY) + 'px';
        G.effectEmojiTextboxEl.style.right = (baseRight + tbCfg.offsetX) + 'px';
        G.effectEmojiTextboxEl.style.left = 'auto';
        G.effectEmojiTextboxEl.style.top = 'auto';
        G.effectEmojiTextboxEl.classList.add('visible');
        applyAnimation(G.effectEmojiTextboxEl, animName, duration, function () {
          setTimeout(function () { G.effectEmojiTextboxEl.classList.remove('visible'); }, 200);
        }, tbCfg.scale);
      }
    }
  }

  G.applyAnimation = applyAnimation;
  G.runEffect = runEffect;
})();
