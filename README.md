# Penthouse Baccarat

*A Longlight Interactive game.*

A private, high-limit Punto Banco table in a night-time penthouse overlooking the Shanghai skyline — in the browser, in 3D.
You sit at the table, place your chips, and an android croupier deals from an eight-deck shoe, turns every card,
pays the winners and sweeps the losers.

Score badges by each hand show every card's point value and the running total, and call-outs explain each
step of the drawing rules ("Player has 5 — draws on 0 to 5").

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
| `M` · `H` · `Esc` | Sound on/off · how to play · close panels |

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

Bankroll, settings and stats are saved in your browser. `npm test` runs the rules engine and save code tests.

## Save codes (move your progress to another device)

Your progress only lives in the browser you play in. A save code lets you take it somewhere else,
like from your phone to a laptop, or into a new browser.

1. Open **Settings** (the ⚙ button, top right) and tap **Back up**.
2. Tap **Copy code** and paste it somewhere safe, like your notes app or a message to yourself.
3. On the other device, open **Settings**, tap **Restore**, paste the code and tap **Restore**.
   The game shows what's in the code and asks first. Tap **Yes, restore** to swap it in.

A code holds your bankroll (chips on the felt count too), your hands played and biggest win,
your settings and your last bet for Rebet. It looks like `BT1:eyJiYWxh...` and is about 250 characters.
If a code is cut short, changed, or from another game, the game says so and changes nothing.
Codes are made and read right in your browser: nothing is sent anywhere.

How it works: `src/game/savecode.js` turns the save into `BT1:` + the save as base64url text +
a 6-character checksum, and checks every value before a restore. The window itself is
`src/ui/savecode-dialog.js` (HTML in `index.html`, the `#save-code` block).

## Code map

| Path | |
| --- | --- |
| `src/game/baccarat.js` | Pure rules: shoe, totals, tableau, settlement (unit tested) |
| `src/game/game.js` | Round flow: betting, dealing, reveals, settlement, persistence; mouse and touch input |
| `src/game/savecode.js` | Save codes: make, read and check `BT1:` codes (unit tested) |
| `src/ui/savecode-dialog.js` | The Back up / Restore window opened from Settings |
| `src/scene/*` | Renderer/post-processing (with adaptive resolution), penthouse, table & felt layout, cards, chips, dealer (two-bone IK), camera |
| `src/scene/textures.js` | Procedural card faces, backs, chips and felt maps |
| `src/audio/audio.js` | Procedural Web Audio: card/chip foley, lounge music, room tone |

Third-party textures and HDRIs are CC0 — see [CREDITS.md](CREDITS.md).

## Status

**v1.0.0 — final.** The game is feature-complete and parked. Ideas if it's picked up again:

- **Roads:** Big Road / Big Eye Boy scoreboards alongside the bead road, and keep the road through a reload.
- **Squeeze:** an optional player-controlled card squeeze on big bets.
- **Bundle:** split three.js into its own cached chunk (the single bundle is ~730 kB, ~195 kB gzipped).
- **Polish:** quality presets (low/high) next to the adaptive resolution, and a reduced-motion setting.
- **Table:** additional rooms or table themes, and a no-commission (EZ Baccarat) variant.
