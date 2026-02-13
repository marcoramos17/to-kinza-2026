/**
 * Minimal TOML parser for config, events, and world files.
 * Supports: key = value (string, number, boolean), key = ["a","b"],
 * [section], [section.sub], [[array of tables]].
 */
(function (global) {
  'use strict';

  function parseValue(s) {
    s = s.trim();
    if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/\\"/g, '"');
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d*\.?\d+([eE][+-]?\d+)?$/.test(s)) return parseFloat(s);
    return s;
  }

  function setIn(obj, path, value) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var p = parts[i];
      if (!cur[p]) cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function parse(tomlText) {
    var out = {};
    var currentPath = '';
    var currentArrayPath = null;
    var currentArray = null;
    var lines = tomlText.split(/\r?\n/);
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];
      var trimmed = line.trim();
      i++;

      if (!trimmed || trimmed.startsWith('#')) continue;

      var tableMatch = trimmed.match(/^\[\[([^\]]+)\]\]$/);
      if (tableMatch) {
        currentPath = '';
        currentArrayPath = tableMatch[1].trim();
        var arrParts = currentArrayPath.split('.');
        var parent = out;
        for (var k = 0; k < arrParts.length - 1; k++) {
          if (!parent[arrParts[k]]) parent[arrParts[k]] = [];
          parent = parent[arrParts[k]];
        }
        var lastKey = arrParts[arrParts.length - 1];
        if (!parent[lastKey]) parent[lastKey] = [];
        parent[lastKey].push({});
        currentArray = parent[lastKey][parent[lastKey].length - 1];
        continue;
      }

      var singleTableMatch = trimmed.match(/^\[([^\]]+)\]$/);
      if (singleTableMatch) {
        currentArrayPath = null;
        currentArray = null;
        currentPath = singleTableMatch[1].trim();
        continue;
      }

      var eq = trimmed.indexOf('=');
      if (eq === -1) continue;

      var key = trimmed.slice(0, eq).trim();
      var valStr = trimmed.slice(eq + 1).trim();
      var target;
      if (currentArray) {
        target = currentArray;
      } else if (currentPath) {
        var parts = currentPath.split('.');
        target = out;
        for (var pi = 0; pi < parts.length; pi++) {
          if (!target[parts[pi]]) target[parts[pi]] = {};
          target = target[parts[pi]];
        }
      } else {
        target = out;
      }

      if (valStr.startsWith('[')) {
        var arr = [];
        var rest = valStr.slice(1).trim();
        var arrayClosed = false;
        function extractArrayItem(s) {
          s = s.trim();
          if (!s) return { item: null, rest: '', hitEnd: false };
          if (s.startsWith('"')) {
            var pos = 1;
            while (pos < s.length) {
              var ch = s[pos];
              if (ch === '\\' && pos + 1 < s.length) pos += 2;
              else if (ch === '"') {
                pos++;
                var item = s.slice(0, pos).trim();
                var remainder = s.slice(pos).trim();
                var hitEnd = remainder.indexOf(']') >= 0;
                if (remainder.startsWith(',')) remainder = remainder.slice(1).trim();
                if (remainder.startsWith(']')) remainder = remainder.slice(1).trim();
                return { item: item, rest: remainder, hitEnd: hitEnd };
              } else pos++;
            }
            return { item: s, rest: '', hitEnd: false };
          }
          var endB = s.indexOf(']');
          var comma = s.indexOf(',');
          var next = (comma !== -1 && (endB === -1 || comma < endB)) ? comma : endB;
          if (next === -1) return { item: s, rest: '', hitEnd: false };
          var item = s.slice(0, next).trim();
          var remainder = s.slice(next + 1).trim();
          var hitEnd = (next === endB);
          if (remainder.startsWith(',')) remainder = remainder.slice(1).trim();
          else if (remainder.startsWith(']')) remainder = remainder.slice(1).trim();
          return { item: item, rest: remainder, hitEnd: hitEnd };
        }
        while (true) {
          while (rest) {
            var extracted = extractArrayItem(rest);
            rest = extracted.rest;
            if (extracted.item) arr.push(parseValue(extracted.item));
            if (extracted.hitEnd) { rest = ''; arrayClosed = true; break; }
          }
          if (arrayClosed) break;
          if (i >= lines.length) break;
          rest = (rest ? rest + ' ' : '') + lines[i].trim();
          i++;
        }
        target[key] = arr;
      } else {
        target[key] = parseValue(valStr);
      }
    }

    return out;
  }

  global.parseTOML = parse;
})(typeof window !== 'undefined' ? window : this);
