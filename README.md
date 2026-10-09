# Penthouse Baccarat

A private, high-limit Punto Banco table in a night-time penthouse overlooking the Shanghai skyline — in the browser, in 3D.
You sit at the table, place your chips, and an android croupier deals from an eight-deck shoe, turns every card,
pays the winners and sweeps the losers.

Play it at **https://jxstrr0.github.io/BaccaratTable/**.

## Play

```bash
npm install
npm run dev      # http://localhost:5173
```

`npm run build` produces a static site in `dist/` (deployed to GitHub Pages by `.github/workflows/pages.yml`).

### Controls

| | |
| --- | --- |
| Left-click a betting spot | Place the selected chip |
| Right-click a betting spot | Take a chip back |
| Right-drag / scroll | Look around / lean in |
| `1`–`5` | Select chip ($100 → $25K) |
| `Space` · `R` · `D` · `C` · `Backspace` | Deal · rebet · double · clear · undo |

On touch screens: tap a spot to bet, press and hold to take a chip back, drag with one finger to look around,
and pinch to lean in.

## Rules & payouts

Standard Punto Banco with the full third-card tableau, burn on a new shoe and a cut card about a deck from the end.

| Bet | Pays |
| --- | --- |
| Player | 1 : 1 |
| Banker | 0.95 : 1 (5% commission) |
| Tie | 8 : 1 (Player/Banker bets push) |
| Player Pair / Banker Pair | 11 : 1 |

Bankroll, settings and stats are saved in your browser. `npm test` runs the rules engine tests.

## Code map

| Path | |
| --- | --- |
| `src/game/baccarat.js` | Pure rules: shoe, totals, tableau, settlement (unit tested) |
| `src/game/game.js` | Round flow: betting, dealing, reveals, settlement, persistence; mouse and touch input |
| `src/scene/*` | Renderer/post-processing (with adaptive resolution), penthouse, table & felt layout, cards, chips, dealer (two-bone IK), camera |
| `src/scene/textures.js` | Procedural card faces, backs, chips and felt maps |
| `src/audio/audio.js` | Procedural Web Audio: card/chip foley, lounge music, room tone, dealer voice |

Third-party textures and HDRIs are CC0 — see [CREDITS.md](CREDITS.md).
