# Penthouse Baccarat

A private, high-limit Punto Banco table in a night-time penthouse overlooking the Shanghai skyline — in the browser, in 3D.
You sit at the table; an android croupier deals from an eight-deck shoe, and when you back a side, the cards are
pushed across to you with the paddle so you can **squeeze** them: peel each card up from an edge or corner with the mouse
until the pips show, then it turns over.

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
| During the squeeze: drag an edge/corner toward the centre | Bend the card up |
| Double-click a card · `F` | Flip it over |
| `Q` | Rotate the card 90° (squeeze from the long side) |

## Rules & payouts

Standard Punto Banco with the full third-card tableau, burn on a new shoe and a cut card about a deck from the end.

| Bet | Pays |
| --- | --- |
| Player | 1 : 1 |
| Banker | 0.95 : 1 (5% commission) |
| Tie | 8 : 1 (Player/Banker bets push) |
| Player Pair / Banker Pair | 11 : 1 |
| Dragon Bonus (Player or Banker) | Natural win 1:1, natural tie push; non-natural win by 9 → 30:1, 8 → 10:1, 7 → 6:1, 6 → 4:1, 5 → 2:1, 4 → 1:1 |

Bankroll, settings and stats are saved in your browser. `npm test` runs the rules engine tests.

## Code map

| Path | |
| --- | --- |
| `src/game/baccarat.js` | Pure rules: shoe, totals, tableau, settlement (unit tested) |
| `src/game/game.js` | Round flow: betting, dealing, reveal/squeeze, settlement, persistence |
| `src/game/squeeze.js` | Mouse/touch card squeezing |
| `src/scene/*` | Renderer/post-processing, penthouse, table & felt layout, cards (bendable mesh), chips, dealer (two-bone IK), camera |
| `src/scene/textures.js` | Procedural card faces, backs, chips and felt maps |
| `src/audio/audio.js` | Procedural Web Audio: card/chip foley, lounge music, room tone, dealer voice |

Third-party textures and HDRIs are CC0 — see [CREDITS.md](CREDITS.md).
