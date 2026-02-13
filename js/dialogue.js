/**
 * Dialogue and textbox: parsing dialogue lines (including [effect:...]), showing messages, advancing.
 * Effect lines are never shown as text; they are parsed and run via Game.runEffect.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G) return;

  /** Split by comma only when not inside [ ] so in=[textbox:x=-1,y=-11,scale=5] stays one part. */
  function splitEffectParts(inner) {
    var parts = [];
    var depth = 0;
    var start = 0;
    for (var i = 0; i < inner.length; i++) {
      var c = inner[i];
      if (c === '[') depth++;
      else if (c === ']') depth--;
      else if (c === ',' && depth === 0) {
        parts.push(inner.slice(start, i).trim());
        start = i + 1;
      }
    }
    if (start < inner.length) parts.push(inner.slice(start).trim());
    return parts;
  }

  /** Find the matching ] for the first [ so we only parse one [effect:...] block. */
  function findEffectBlockEnd(str, start) {
    var depth = 0;
    for (var i = start; i < str.length; i++) {
      if (str[i] === '[') depth++;
      else if (str[i] === ']') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  function parseEffectLine(line) {
    var str = String(line).trim();
    var start = str.indexOf('[effect:');
    if (start === -1) return null;
    var end = findEffectBlockEnd(str, start);
    if (end === -1 || end <= start) return null;
    str = str.slice(start, end + 1);
    var inner = str.slice(8, -1).trim();
    var out = { effect: true, in: ['screen'] };
    var parts = splitEffectParts(inner);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      var eq = p.indexOf('=');
      if (eq === -1) continue;
      var key = p.slice(0, eq).trim();
      var val = p.slice(eq + 1).trim();
      if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      if (key === 'in') {
        var raw = val.replace(/[\[\]]/g, '').trim();
        var inSpecs = [];
        var specs;
        if (raw.indexOf(';') !== -1) {
          specs = raw.split(';').map(function (s) { return s.trim(); });
        } else if (raw.indexOf(':') !== -1) {
          specs = [raw];
        } else {
          specs = raw.split(',').map(function (s) { return s.trim(); });
        }
        for (var j = 0; j < specs.length; j++) {
          var spec = specs[j];
          if (!spec) continue;
          var colonIdx = spec.indexOf(':');
          var placeObj = { place: '' };
          if (colonIdx === -1) {
            placeObj.place = spec;
          } else {
            placeObj.place = spec.slice(0, colonIdx).trim();
            var opts = spec.slice(colonIdx + 1).split(',');
            for (var k = 0; k < opts.length; k++) {
              var opt = opts[k].trim();
              var oeq = opt.indexOf('=');
              if (oeq !== -1) {
                var ok = opt.slice(0, oeq).trim().toLowerCase();
                var ov = parseFloat(opt.slice(oeq + 1).trim());
                if (!isNaN(ov)) placeObj[ok] = ov;
              }
            }
          }
          if (placeObj.place) inSpecs.push(placeObj);
        }
        if (inSpecs.length) out.in = inSpecs; else out.in = [{ place: 'screen' }];
      } else if (key === 'duration') {
        out.duration = parseFloat(val) || 0.5;
      } else {
        out[key] = val;
      }
    }
    return out;
  }

  function parseDialogueLine(line) {
    var str = String(line).trim();
    var effect = parseEffectLine(str);
    if (effect) return effect;
    var idx = str.indexOf(':');
    if (idx === -1) return { speaker: null, message: str };
    var speaker = str.slice(0, idx).trim();
    var message = str.slice(idx + 1).trim();
    if (!speaker) return { speaker: null, message: message };
    return { speaker: speaker, message: message };
  }

  function showDialogue(name, message) {
    var box = G.dialogueBoxEl;
    var speakerEl = G.dialogueSpeakerEl;
    var msgEl = G.dialogueMessageEl;
    if (!box || !msgEl) return;
    box.classList.remove('dialogue', 'narrator');
    var isNarrator = !name || !String(name).trim() || String(name).trim().toLowerCase() === 'narrator';
    if (!isNarrator) {
      box.classList.add('dialogue');
      if (speakerEl) {
        speakerEl.textContent = String(name).trim();
        speakerEl.style.display = 'block';
      }
    } else {
      box.classList.add('narrator');
      if (speakerEl) speakerEl.style.display = 'none';
    }
    msgEl.textContent = message || '';
    box.classList.add('visible');
  }

  function hideDialogue() {
    if (G.dialogueBoxEl) G.dialogueBoxEl.classList.remove('visible');
  }

  function startNextLineEffectIfAny() {
    var state = G.dialogueState;
    if (!state || !state.active || !state.lines || !G.runEffect) return;
    var nextIdx = state.lineIndex + 1;
    while (nextIdx < state.lines.length) {
      var next = state.lines[nextIdx];
      if (!next || !next.effect) break;
      G.runEffect(next);
      nextIdx++;
    }
  }

  /** Run all consecutive effect lines that immediately precede the message at msgIdx (so multiple effects play concurrently). */
  function runEffectBeforeMessageIfAny(msgIdx) {
    if (!G.runEffect || msgIdx <= 0) return;
    var lines = G.dialogueState.lines;
    var i = msgIdx - 1;
    while (i >= 0 && lines[i] && lines[i].effect) {
      G.runEffect(lines[i]);
      i--;
    }
  }

  function startDialogue(ev) {
    G.dialogueState.customOnComplete = null;
    G.dialogueState.active = true;
    G.dialogueState.lines = (ev.dialogue && ev.dialogue.slice) ? ev.dialogue.slice() : [];
    var idx = 0;
    while (idx < G.dialogueState.lines.length && G.dialogueState.lines[idx].effect) idx++;
    if (idx >= G.dialogueState.lines.length) {
      G.dialogueState.active = false;
      if (G.onDialogueComplete) G.onDialogueComplete();
      return;
    }
    G.dialogueState.lineIndex = idx;
    runEffectBeforeMessageIfAny(idx);
    var first = G.dialogueState.lines[idx];
    showDialogue(first.speaker, first.message);
  }

  /** Start a dialogue from raw TOML-style lines (e.g. "Name: message" or "message"). Optional onComplete when dialogue ends. */
  function startDialogueWithLines(rawLines, onComplete) {
    var parseDialogueLine = G.parseDialogueLine;
    if (!parseDialogueLine) return;
    var lines = (rawLines && rawLines.length) ? rawLines.map(parseDialogueLine) : [];
    G.dialogueState.customOnComplete = onComplete || null;
    G.dialogueState.active = true;
    G.dialogueState.lines = lines;
    var idx = 0;
    while (idx < lines.length && lines[idx].effect) idx++;
    if (idx >= lines.length) {
      G.dialogueState.active = false;
      if (G.dialogueState.customOnComplete) {
        G.dialogueState.customOnComplete();
        G.dialogueState.customOnComplete = null;
      } else if (G.onDialogueComplete) G.onDialogueComplete();
      return;
    }
    G.dialogueState.lineIndex = idx;
    runEffectBeforeMessageIfAny(idx);
    var first = lines[idx];
    showDialogue(first.speaker, first.message);
  }

  function advanceDialogue() {
    if (!G.dialogueState.active) return;
    G.dialogueState.lineIndex++;
    while (G.dialogueState.lineIndex < G.dialogueState.lines.length && G.dialogueState.lines[G.dialogueState.lineIndex].effect) {
      G.dialogueState.lineIndex++;
    }
    if (G.dialogueState.lineIndex >= G.dialogueState.lines.length) {
      G.dialogueState.active = false;
      hideDialogue();
      if (G.dialogueState.customOnComplete) {
        G.dialogueState.customOnComplete();
        G.dialogueState.customOnComplete = null;
      } else if (G.onDialogueComplete) G.onDialogueComplete();
      return;
    }
    var idx = G.dialogueState.lineIndex;
    runEffectBeforeMessageIfAny(idx);
    var line = G.dialogueState.lines[idx];
    showDialogue(line.speaker, line.message);
  }

  G.parseEffectLine = parseEffectLine;
  G.parseDialogueLine = parseDialogueLine;
  G.showDialogue = showDialogue;
  G.hideDialogue = hideDialogue;
  G.startNextLineEffectIfAny = startNextLineEffectIfAny;
  G.startDialogue = startDialogue;
  G.startDialogueWithLines = startDialogueWithLines;
  G.advanceDialogue = advanceDialogue;
})();
