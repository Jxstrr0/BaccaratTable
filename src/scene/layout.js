// Table geometry constants and the betting-layout zones, shared by the felt painter,
// hit-testing and chip placement. Units are metres; x right, z toward the player seat.

export const TABLE_Y = 0.76; // felt surface height
export const CARD_W = 0.079; // jumbo baccarat cards (1.25× poker size)
export const CARD_H = 0.11;

// Table outline: straight dealer edge at z = DEALER_EDGE, elliptical arc toward the player.
export const DEALER_EDGE = -0.62;
export const OUTER = { a: 1.25, b: 1.5 };
export const FELT = { a: 1.15, b: 1.4, edge: -0.565 };

// Felt texture spans this rectangle.
export const FELT_BOUNDS = { x0: -FELT.a, x1: FELT.a, z0: FELT.edge, z1: DEALER_EDGE + FELT.b };

// Betting arcs are concentric around a point just behind the felt edge, in front of the player.
export const ARC_CENTER = { x: 0, z: 1.3 };
const deg = Math.PI / 180;

export const ZONES = [
  { key: 'player', label: 'PLAYER', sub: 'PAYS 1 TO 1', r0: 0.72, r1: 0.94, a0: -38 * deg, a1: -1 * deg, color: '#2f6fd6' },
  { key: 'banker', label: 'BANKER', sub: 'PAYS 0.95 TO 1', r0: 0.72, r1: 0.94, a0: 1 * deg, a1: 38 * deg, color: '#d43a3a' },
  { key: 'playerPair', label: 'P PAIR', sub: '11 TO 1', r0: 0.97, r1: 1.15, a0: -38 * deg, a1: -15 * deg, color: '#2f6fd6' },
  { key: 'tie', label: 'TIE', sub: '8 TO 1', r0: 0.97, r1: 1.15, a0: -13.5 * deg, a1: 13.5 * deg, color: '#2fa36b' },
  { key: 'bankerPair', label: 'B PAIR', sub: '11 TO 1', r0: 0.97, r1: 1.15, a0: 15 * deg, a1: 38 * deg, color: '#d43a3a' },
];

export function polarToXZ(r, a) {
  return { x: ARC_CENTER.x + r * Math.sin(a), z: ARC_CENTER.z - r * Math.cos(a) };
}

export function zoneCenter(zone) {
  return polarToXZ((zone.r0 + zone.r1) / 2, (zone.a0 + zone.a1) / 2);
}

export function zoneAt(x, z) {
  const dx = x - ARC_CENTER.x;
  const dz = ARC_CENTER.z - z;
  const r = Math.hypot(dx, dz);
  const a = Math.atan2(dx, dz);
  return ZONES.find((zn) => r >= zn.r0 && r <= zn.r1 && a >= zn.a0 && a <= zn.a1) || null;
}

// Where dealt cards rest. Third cards lie sideways beside the pair, toward the centre line.
export const CARD_SPOTS = {
  player: [
    { x: -0.44, z: -0.27, rot: 0 },
    { x: -0.34, z: -0.27, rot: 0 },
    { x: -0.215, z: -0.27, rot: Math.PI / 2 },
  ],
  banker: [
    { x: 0.34, z: -0.27, rot: 0 },
    { x: 0.44, z: -0.27, rot: 0 },
    { x: 0.215, z: -0.27, rot: Math.PI / 2 },
  ],
};

export const SHOE_POS = { x: 0.78, z: -0.36 };
export const DISCARD_POS = { x: -0.8, z: -0.4 };
export const FLOAT_POS = { x: 0, z: -0.5 }; // dealer's chip float
export const PLAYER_CHIPS = { x: 0, z: 0.665, spacing: 0.1 }; // player's bankroll stacks along the rail
