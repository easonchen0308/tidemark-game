(function seedStaticTidemarkGame() {
    const game = window.TIDEMARK_GAME;
    if (!game || !game.config || !Array.isArray(game.puzzles)) return;

    const slug = 'tidemark';
    const seedVersionKey = `game_${slug}_github_pages_seed`;
    const seedVersion = String(game.version || '1');
    const currentVersion = localStorage.getItem(seedVersionKey);

    if (currentVersion !== seedVersion) {
        localStorage.setItem(`game_${slug}_config_v2`, JSON.stringify(game.config));
        localStorage.setItem(`game_${slug}_puzzles_v2`, JSON.stringify(game.puzzles));
        localStorage.setItem(seedVersionKey, seedVersion);
    }
})();
