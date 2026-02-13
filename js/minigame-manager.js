/**
 * Minigame manager: handles loading and starting minigames.
 * Minigames should register themselves with G.minigames[id] = { start: function() {...} }
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G) return;

  G.minigames = G.minigames || {};

  // Hide the main game and show minigame container
  G.showMinigame = function() {
    var mainGame = document.getElementById('mainGameWrapper');
    var minigameContainer = document.getElementById('minigameContainer');
    if (mainGame) mainGame.style.display = 'none';
    if (minigameContainer) {
      minigameContainer.style.display = 'block';
      minigameContainer.classList.add('active');
    }
  };

  // Hide minigame and show main game
  G.hideMinigame = function() {
    var mainGame = document.getElementById('mainGameWrapper');
    var minigameContainer = document.getElementById('minigameContainer');
    if (mainGame) mainGame.style.display = '';
    if (minigameContainer) {
      minigameContainer.style.display = 'none';
      minigameContainer.classList.remove('active');
    }
  };
})();
