// ============================================================================
// Cinematic boot registry.
//
// The 15 "built-in" boots live as bespoke branches inside BootScreen.svelte and
// are tied to themes. These 25 "cine" boots are DATA-DRIVEN: each is a config
// object rendered by one of four generic styles (log / machine / vhs / rain),
// so adding more is just adding entries here. They're decoupled from themes —
// pick one in the Boot Lab (/boot-gallery) to preview or set as your default.
// ============================================================================

export type CineStyle = 'log' | 'machine' | 'vhs' | 'rain';
export type CineGroup = 'Machine' | 'Backrooms' | 'Matrix' | 'Server' | 'Hacker' | 'Cinematic';

export interface CineBoot {
  id: string;
  name: string;
  group: CineGroup;
  style: CineStyle;
  desc: string;
  title: string;
  sub?: string;        // log / machine
  done: string;
  lines: string[];
  glyph?: string;      // log / machine prefix, e.g. '[ OK ]'
  accent: string;      // drives color independent of the active theme
  accent2?: string;
  duration: number;
  level?: string;      // vhs only
  verdict?: string;    // machine only
  verdictColor?: string;
}

// Lightweight metadata for the built-in (theme-bound) boots so the Boot Lab can
// list + preview them alongside the cine boots.
export interface BootInfo { id: string; name: string; group: string; accent: string; desc: string; }
export const BUILTIN_BOOTS: BootInfo[] = [
  { id: 'terminal', name: 'Terminal', group: 'Built-in', accent: '#2dff78', desc: 'Phosphor CRT power-on self test' },
  { id: 'hud', name: 'System HUD', group: 'Built-in', accent: '#00e5ff', desc: 'Reactor-core system boot' },
  { id: 'cosmic', name: 'Warp Drive', group: 'Built-in', accent: '#b06bff', desc: 'Spool the warp core & jump' },
  { id: 'matrix', name: 'Matrix', group: 'Built-in', accent: '#00ff41', desc: 'Classic green code rain' },
  { id: 'synthwave', name: 'Synthwave', group: 'Built-in', accent: '#ff2e97', desc: 'Outrun chrome + neon grid' },
  { id: 'arcade', name: 'Arcade', group: 'Built-in', accent: '#ff3d9a', desc: 'Insert coin · Player 1 start' },
  { id: 'minimal', name: 'Minimal', group: 'Built-in', accent: '#6d72f6', desc: 'Quick clean fade-in' },
  { id: 'hacker', name: 'Intrusion', group: 'Built-in', accent: '#00ff66', desc: 'Full ACCESS GRANTED breach' },
  { id: 'vr', name: 'VR Headset', group: 'Built-in', accent: '#0a84ff', desc: 'Headset tracking calibration' },
  { id: 'engine', name: 'Engine Start', group: 'Built-in', accent: '#ff2d2d', desc: 'Ignition with live tachometer' },
  { id: 'server', name: 'Datacenter', group: 'Built-in', accent: '#00e676', desc: 'Rack POST with blinkenlights' },
  { id: 'launch', name: 'Mission Launch', group: 'Built-in', accent: '#4d8cff', desc: 'T-minus countdown & liftoff' },
  { id: 'rig', name: 'Gaming Rig', group: 'Built-in', accent: '#ff0080', desc: 'RGB rig spec sweep' },
  { id: 'stream', name: 'Going Live', group: 'Built-in', accent: '#9147ff', desc: 'Twitch stream + viewer count' },
  { id: 'equalizer', name: 'Equalizer', group: 'Built-in', accent: '#1db954', desc: 'Music library equalizer' },
  { id: 'discord', name: 'Connecting', group: 'Built-in', accent: '#5865f2', desc: 'Discord-style connect + tips' },
];

export const CINE_BOOTS: CineBoot[] = [
  // ── Machine (Person of Interest) ─────────────────────────────────────────
  {
    id: 'poi-machine', name: 'The Machine', group: 'Machine', style: 'machine',
    desc: 'Person of Interest — surveillance AI assessing relevance',
    title: 'ADMIN', sub: 'ANALYZING THREAT LEVEL', done: 'USER IS RELEVANT · ADMIN ACCESS',
    verdict: 'RELEVANT', verdictColor: '#eaf4ff',
    lines: ['ACCESSING FEED · CAM 0427', 'FACIAL RECOGNITION · MATCH', 'CROSS-REFERENCING DATABASE', 'INTERCEPTING COMMUNICATIONS', 'PREDICTIVE MODEL · 99.7%', 'THREAT ASSESSMENT COMPLETE'],
    glyph: '▮', accent: '#dfe9f5', accent2: '#3da9fc', duration: 7600,
  },
  {
    id: 'poi-samaritan', name: 'Samaritan', group: 'Machine', style: 'machine',
    desc: 'The rival ASI — assume control, calculate the outcome',
    title: 'SAMARITAN', sub: 'DIRECTIVE · ASSUME CONTROL', done: 'OUTCOME CALCULATED · COMPLY',
    verdict: 'ASSET', verdictColor: '#ff3b30',
    lines: ['SCANNING ALL DEVICES', 'DEVIANCE DETECTED', 'REROUTING SURVEILLANCE GRID', 'IDENTITY CONFIRMED', 'SIMULATING 4.6M OUTCOMES', 'OPTIMAL PATH SELECTED'],
    glyph: '▰', accent: '#ff2d2d', accent2: '#ff6a3c', duration: 7600,
  },

  // ── Backrooms (analog-horror VHS) ────────────────────────────────────────
  {
    id: 'backrooms-lvl0', name: 'Backrooms · Level 0', group: 'Backrooms', style: 'vhs',
    desc: 'The Lobby — endless mono-yellow rooms, buzzing lights',
    level: 'LEVEL 0', title: 'THE LOBBY', done: 'SIGNAL LOST',
    lines: ['no-clip event logged', 'you are not alone here', 'humming detected · section 7B', 'exit not found', 'keep moving'],
    glyph: '', accent: '#d9c84a', duration: 8200,
  },
  {
    id: 'backrooms-lvl1', name: 'Backrooms · Level 1', group: 'Backrooms', style: 'vhs',
    desc: 'Habitable Zone — concrete warehouses, flickering tubes',
    level: 'LEVEL 1', title: 'HABITABLE ZONE', done: 'TRACKING LOST',
    lines: ['entity proximity · 40m', 'flickering lights ahead', 'warehouse sector mapped', 'battery · 12%', 'do not use the elevator'],
    glyph: '', accent: '#9fa86f', duration: 8000,
  },
  {
    id: 'backrooms-lvl2', name: 'Backrooms · Level 2', group: 'Backrooms', style: 'vhs',
    desc: 'Pipe Dreams — dark service tunnels, rising steam',
    level: 'LEVEL 2', title: 'PIPE DREAMS', done: 'TAPE DAMAGED',
    lines: ['steam pressure rising', 'footsteps behind you', 'do NOT look back', 'tunnel 0x1F sealed', 'valve 3 · jammed'],
    glyph: '', accent: '#c2603a', duration: 8000,
  },
  {
    id: 'backrooms-fun', name: 'Backrooms · Level Fun', group: 'Backrooms', style: 'vhs',
    desc: 'Level =) — the party never ends. please stay.',
    level: 'LEVEL  =)', title: 'IT NEVER ENDS', done: 'PLEASE STAY  =)',
    lines: ['the party never ends', 'smile for the camera  =)', 'balloons detected · 412', 'cake is ready', 'do not leave the fun'],
    glyph: '', accent: '#ff5da2', duration: 8400,
  },
  {
    id: 'backrooms-pools', name: 'Backrooms · Poolrooms', group: 'Backrooms', style: 'vhs',
    desc: 'The Poolrooms — sunlit liminal water with no sun',
    level: 'LEVEL 37', title: 'THE POOLROOMS', done: 'SIGNAL SUBMERGED',
    lines: ['water level · rising', 'sunlight without a sun', 'echo · echo · echo', 'tile grid · infinite', 'something swims below'],
    glyph: '', accent: '#4fd1e8', duration: 8200,
  },

  // ── Backrooms · 50 more levels (for the fans) ────────────────────────────
  { id: 'br-electrical', name: 'Backrooms · Level 3', group: 'Backrooms', style: 'vhs', desc: 'Electrical Station — buzzing transformers, exposed wiring', level: 'LEVEL 3', title: 'ELECTRICAL STATION', done: 'POWER FAILING', lines: ['transformers humming · 60Hz', 'wiring exposed · do not touch', 'breaker 7 · tripped', 'something moved in the dark', 'follow the cables out'], glyph: '', accent: '#b5c24a', duration: 8000 },
  { id: 'br-office', name: 'Backrooms · Level 4', group: 'Backrooms', style: 'vhs', desc: 'Abandoned Office — endless cubicles, ringing phones', level: 'LEVEL 4', title: 'ABANDONED OFFICE', done: 'TRACKING LOST', lines: ['cubicles · endless', 'phones ringing · no answer', 'elevator · out of order', 'fluorescent flicker', 'the windows show nothing'], glyph: '', accent: '#ccb94a', duration: 8000 },
  { id: 'br-hotel', name: 'Backrooms · Level 5', group: 'Backrooms', style: 'vhs', desc: 'Terror Hotel — ornate rooms locked from the inside', level: 'LEVEL 5', title: 'TERROR HOTEL', done: 'DO NOT KNOCK', lines: ['ballroom · music still playing', 'room 204 · locked from inside', 'guests · long gone', 'chandelier swaying', 'check-out is not allowed'], glyph: '', accent: '#b58a4a', duration: 8200 },
  { id: 'br-lightsout', name: 'Backrooms · Level 6', group: 'Backrooms', style: 'vhs', desc: 'Lights Out — pitch black, do not make a sound', level: 'LEVEL 6', title: 'LIGHTS OUT', done: 'STAY SILENT', lines: ['visibility · zero', 'do not turn on a light', 'something breathes nearby', 'feel along the wall', 'make no sound'], glyph: '', accent: '#3a6048', duration: 8400 },
  { id: 'br-thalasso', name: 'Backrooms · Level 7', group: 'Backrooms', style: 'vhs', desc: 'Thalassophobia — endless ocean over a bottomless void', level: 'LEVEL 7', title: 'THALASSOPHOBIA', done: 'SIGNAL SUBMERGED', lines: ['ocean · infinite', 'depth · unknown', 'something vast below', 'island · 4km', 'do not swim down'], glyph: '', accent: '#2b86c0', duration: 8200 },
  { id: 'br-caves', name: 'Backrooms · Level 8', group: 'Backrooms', style: 'vhs', desc: 'The Cave System — damp limestone tunnels forever', level: 'LEVEL 8', title: 'THE CAVE SYSTEM', done: 'ECHO LOST', lines: ['limestone · dripping', 'tunnels branch forever', 'fungal bloom detected', 'distant skittering', 'mark your path'], glyph: '', accent: '#8a7a5a', duration: 8200 },
  { id: 'br-suburbs', name: 'Backrooms · Level 9', group: 'Backrooms', style: 'vhs', desc: 'The Suburbs — a neighborhood under perpetual night', level: 'LEVEL 9', title: 'THE SUBURBS', done: 'PERPETUAL NIGHT', lines: ['streetlights · humming', 'every house · identical', 'no stars overhead', 'a dog barks · far off', 'keep to the sidewalk'], glyph: '', accent: '#5a6f95', duration: 8200 },
  { id: 'br-wheat', name: 'Backrooms · Level 10', group: 'Backrooms', style: 'vhs', desc: 'Limbo — a field of wheat under a real blue sky', level: 'LEVEL 10', title: 'LIMBO · FIELD OF WHEAT', done: 'BLUE SKY FADES', lines: ['wheat · to the horizon', 'a real sky · finally', 'the cabin · safe for now', 'wind in the stalks', 'rest, traveler'], glyph: '', accent: '#d4b65a', duration: 8400 },
  { id: 'br-city', name: 'Backrooms · Level 11', group: 'Backrooms', style: 'vhs', desc: 'Concrete Jungle — an endless empty city', level: 'LEVEL 11', title: 'CONCRETE JUNGLE', done: 'STATIC', lines: ['city blocks · infinite', 'traffic lights · all red', 'no cars · no people', 'newspaper · dated 19██', 'the streets loop back'], glyph: '', accent: '#8a8f98', duration: 8200 },
  { id: 'br-run', name: 'Backrooms · Level !', group: 'Backrooms', style: 'vhs', desc: 'Run For Your Life — you are being hunted', level: 'LEVEL !', title: 'RUN FOR YOUR LIFE', done: 'DO NOT STOP', lines: ['ENTITY · pursuing', 'distance · closing', 'do NOT look back', 'find the red door', 'RUN'], glyph: '', accent: '#ff2d2d', duration: 7800 },
  { id: 'br-window', name: 'Backrooms · Level 188', group: 'Backrooms', style: 'vhs', desc: 'The Window — one hallway, one window, brief calm', level: 'LEVEL 188', title: 'THE WINDOW', done: 'ONE WINDOW', lines: ['a single window · sunlight', 'the only calm here', 'rest by the glass', 'do not break it', 'the hum is gone'], glyph: '', accent: '#e8d44f', duration: 8000 },
  { id: 'br-motorpool', name: 'Backrooms · Level 94', group: 'Backrooms', style: 'vhs', desc: 'Motorpool — endless garages and idling cars', level: 'LEVEL 94', title: 'MOTORPOOL', done: 'ENGINE DEAD', lines: ['garages · endless', 'oil on the floor', 'headlights in the fog', 'key in the ignition', 'do not start the car'], glyph: '', accent: '#9aa07a', duration: 8000 },
  { id: 'br-lobby2', name: 'Backrooms · Level 0.2', group: 'Backrooms', style: 'vhs', desc: 'The Lobby, Deeper — Level 0 gone wrong', level: 'LEVEL 0.2', title: 'THE LOBBY · DEEPER', done: 'DEEPER STILL', lines: ['the carpet smells wrong', 'walls breathe faintly', 'hum · lower now', 'doorways multiply', 'you went too far'], glyph: '', accent: '#cabf4a', duration: 8200 },
  { id: 'br-home', name: 'Backrooms · Level 3999', group: 'Backrooms', style: 'vhs', desc: '“Home” — the realm where reality thins', level: 'LEVEL 3999', title: '“HOME”', done: 'T̷H̷E̷ ̷E̷N̷D̷', lines: ['reality · thinning', 'it is watching', 'do not speak its name', 'the walls remember', '███████'], glyph: '', accent: '#b06bff', duration: 8800 },
  { id: 'br-deeppools', name: 'Backrooms · Level 37.1', group: 'Backrooms', style: 'vhs', desc: 'The Deep Pools — sublayer of the Poolrooms', level: 'LEVEL 37.1', title: 'THE DEEP POOLS', done: 'WATER RISING', lines: ['filtered light · blue', 'water · waist deep', 'ladders lead nowhere', 'ripples · not yours', 'keep your head up'], glyph: '', accent: '#2dd4bf', duration: 8200 },
  { id: 'br-runlight', name: 'Backrooms · Level !-!', group: 'Backrooms', style: 'vhs', desc: 'Run From The Light — where it glows, you flee', level: 'LEVEL !-!', title: 'RUN FROM THE LIGHT', done: 'FASTER', lines: ['it brings the light', 'where it glows · run', 'shadows are safe', 'sprint the corridor', 'do not be seen'], glyph: '', accent: '#ff7a3a', duration: 7800 },
  { id: 'br-garden', name: 'Backrooms · Level 55', group: 'Backrooms', style: 'vhs', desc: 'The Garden — drywall overtaken by false nature', level: 'LEVEL 55', title: 'THE GARDEN', done: 'OVERGROWN', lines: ['vines through the drywall', 'false sunlight', 'fruit · do not eat', 'birdsong · recorded', 'the maze grows'], glyph: '', accent: '#6fae5a', duration: 8200 },
  { id: 'br-glass', name: 'Backrooms · Level 33', group: 'Backrooms', style: 'vhs', desc: 'Glass Castle — mirrors on every side', level: 'LEVEL 33', title: 'GLASS CASTLE', done: 'REFLECTION LOST', lines: ['mirrors on all sides', 'which one is you', 'glass underfoot', 'do not touch the twins', 'find the true exit'], glyph: '', accent: '#9fd0e0', duration: 8200 },
  { id: 'br-staircase', name: 'Backrooms · Level 230', group: 'Backrooms', style: 'vhs', desc: 'Endless Staircase — only down, forever', level: 'LEVEL 230', title: 'ENDLESS STAIRCASE', done: 'DOWN FOREVER', lines: ['stairs · only down', 'step count · 14,002', 'no landing in sight', 'the railing is warm', 'do not look over'], glyph: '', accent: '#b0a070', duration: 8400 },
  { id: 'br-falselobby', name: 'Backrooms · Level 0.11', group: 'Backrooms', style: 'vhs', desc: 'The False Lobby — almost Level 0, but wrong', level: 'LEVEL 0.11', title: 'THE FALSE LOBBY', done: 'IT IS WRONG', lines: ['almost like Level 0', 'the smell is off', 'your reflection lags', 'exits are painted on', 'leave now'], glyph: '', accent: '#d6c84a', duration: 8200 },
  { id: 'br-darkhalls', name: 'Backrooms · Level 6.1', group: 'Backrooms', style: 'vhs', desc: 'The Dark Halls — whispers in total black', level: 'LEVEL 6.1', title: 'THE DARK HALLS', done: 'WHISPERS', lines: ['pitch black still', 'whispers · multiplying', 'do not answer them', 'count your breaths', 'find the doorknob'], glyph: '', accent: '#33483a', duration: 8400 },
  { id: 'br-signal', name: 'Backrooms · Level 922', group: 'Backrooms', style: 'vhs', desc: 'Signal Lane — a radio voice counting you home', level: 'LEVEL 922', title: 'SIGNAL LANE', done: 'STATION FOUND', lines: ['radio static · faint', 'a voice · counting', 'follow the signal', 'antenna ahead', 'almost rescued'], glyph: '', accent: '#4fa0c0', duration: 8200 },
  { id: 'br-subway', name: 'Backrooms · Level 52', group: 'Backrooms', style: 'vhs', desc: 'The Subway — no trains, live third rail', level: 'LEVEL 52', title: 'THE SUBWAY', done: 'MIND THE GAP', lines: ['no trains · ever', 'third rail · live', 'tiles weeping', 'a horn in the dark', 'do not board'], glyph: '', accent: '#8a8f98', duration: 8200 },
  { id: 'br-redhalls', name: 'Backrooms · Level 666', group: 'Backrooms', style: 'vhs', desc: 'The Red Halls — warm, breathing, and hungry', level: 'LEVEL 666', title: 'THE RED HALLS', done: 'IT SMELLS YOU', lines: ['walls · breathing red', 'the air is thick', 'heat rising', 'do not bleed here', 'it can smell you'], glyph: '', accent: '#c0303a', duration: 8400 },
  { id: 'br-officeparty', name: 'Backrooms · Level 974', group: 'Backrooms', style: 'vhs', desc: 'Office Party — the celebration never ends', level: 'LEVEL 974', title: 'OFFICE PARTY', done: 'THE FUN CONTINUES', lines: ['confetti · ankle deep', 'cubicle balloons', 'cake · still warm', 'coworkers smiling too wide', 'you may not leave'], glyph: '', accent: '#e0a84a', duration: 8200 },
  { id: 'br-tiles', name: 'Backrooms · Level 283', group: 'Backrooms', style: 'vhs', desc: 'Tiled Abyss — white tiles with no doors', level: 'LEVEL 283', title: 'TILED ABYSS', done: 'TILES FOREVER', lines: ['white tiles · endless', 'drains hum softly', 'footsteps echo wrong', 'water seeps up', 'no doors here'], glyph: '', accent: '#7ac0c0', duration: 8200 },
  { id: 'br-sewers', name: 'Backrooms · Level 13', group: 'Backrooms', style: 'vhs', desc: 'The Sewers — rising water and bad air', level: 'LEVEL 13', title: 'THE SEWERS', done: 'GAS DETECTED', lines: ['murky water rising', 'pipes overhead', 'methane · high', 'ladder rungs · slick', 'surface · unknown'], glyph: '', accent: '#6f7a4a', duration: 8200 },
  { id: 'br-library', name: 'Backrooms · Level 27', group: 'Backrooms', style: 'vhs', desc: 'The Library — endless shelves of blank books', level: 'LEVEL 27', title: 'THE LIBRARY', done: 'SHELVED FOREVER', lines: ['shelves to the ceiling', 'books · all blank', 'a page turns alone', 'dust · undisturbed', 'do not read aloud'], glyph: '', accent: '#b09a6a', duration: 8200 },
  { id: 'br-mall', name: 'Backrooms · Level 49', group: 'Backrooms', style: 'vhs', desc: 'The Mall — after hours, gates half-down', level: 'LEVEL 49', title: 'THE MALL', done: 'AFTER HOURS', lines: ['escalators · frozen', 'music · tinny loop', 'stores · all empty', 'fountain still running', 'the gates are down'], glyph: '', accent: '#c08aae', duration: 8200 },
  { id: 'br-banquet', name: 'Backrooms · Level 5.1', group: 'Backrooms', style: 'vhs', desc: 'The Banquet — a table set for you alone', level: 'LEVEL 5.1', title: 'THE BANQUET', done: 'SEATED FOR YOU', lines: ['table set for one', 'candles · lit', 'your name on the card', 'the chair pulls out', 'do not sit'], glyph: '', accent: '#b58a5a', duration: 8400 },
  { id: 'br-snow', name: 'Backrooms · Level 88', group: 'Backrooms', style: 'vhs', desc: 'The Snowfield — a whiteout with no horizon', level: 'LEVEL 88', title: 'THE SNOWFIELD', done: 'WHITEOUT', lines: ['snow · no horizon', 'your tracks vanish', 'cold · without wind', 'a cabin light · far', 'do not freeze'], glyph: '', accent: '#cfe0ec', duration: 8200 },
  { id: 'br-garage', name: 'Backrooms · Level 64', group: 'Backrooms', style: 'vhs', desc: 'The Parking Garage — ramps that only descend', level: 'LEVEL 64', title: 'THE PARKING GARAGE', done: 'LEVEL P-13', lines: ['concrete · sloping down', 'ramps loop endlessly', 'a car alarm · distant', 'oil rainbows', 'no exit ramp'], glyph: '', accent: '#8a8f98', duration: 8200 },
  { id: 'br-greenhouse', name: 'Backrooms · Level 144', group: 'Backrooms', style: 'vhs', desc: 'The Greenhouse — humid glass and reaching plants', level: 'LEVEL 144', title: 'THE GREENHOUSE', done: 'THE DOOR FOGS SHUT', lines: ['glass roof · fogged', 'plants reaching out', 'sprinklers · ticking', 'soil · too rich', 'mind the vines'], glyph: '', accent: '#6fae6a', duration: 8200 },
  { id: 'br-wiring', name: 'Backrooms · Level 3.1', group: 'Backrooms', style: 'vhs', desc: 'The Wiring — conduits and intermittent sparks', level: 'LEVEL 3.1', title: 'THE WIRING', done: 'SHORT CIRCUIT', lines: ['conduits everywhere', 'sparks · intermittent', 'breaker panel ahead', 'do not touch the rail', 'follow the ground wire'], glyph: '', accent: '#c2b04a', duration: 8000 },
  { id: 'br-rooftops', name: 'Backrooms · Level 11.2', group: 'Backrooms', style: 'vhs', desc: 'The Rooftops — a city below with no way down', level: 'LEVEL 11.2', title: 'THE ROOFTOPS', done: 'NIGHT WIND', lines: ['city below · endless', 'no way down', 'antennas blink red', 'wind tugs your sleeve', 'do not step off'], glyph: '', accent: '#7a9ac0', duration: 8200 },
  { id: 'br-threshold', name: 'Backrooms · Level 200', group: 'Backrooms', style: 'vhs', desc: 'The Threshold — an ordinary door with daylight beneath', level: 'LEVEL 200', title: 'THE THRESHOLD', done: 'ALMOST OUT', lines: ['a door · ordinary', 'daylight beneath it', 'your hand · shaking', 'the knob is cold', 'push…'], glyph: '', accent: '#b0b0b0', duration: 8400 },
  { id: 'br-prelobby', name: 'Backrooms · Level 0.0', group: 'Backrooms', style: 'vhs', desc: 'Pre-Lobby — the instant after the no-clip', level: 'LEVEL 0.0', title: 'PRE-LOBBY', done: 'THE HUM BEGINS', lines: ['the no-clip just happened', 'walls forming', 'color · settling', 'the hum begins', 'welcome'], glyph: '', accent: '#e6d65a', duration: 8000 },
  { id: 'br-attic', name: 'Backrooms · Level 78', group: 'Backrooms', style: 'vhs', desc: 'The Attic — dust, boxes, and a rocking chair', level: 'LEVEL 78', title: 'THE ATTIC', done: 'MIND THE FLOOR', lines: ['rafters overhead', 'boxes · unlabeled', 'a rocking chair moves', 'insulation breathing', 'mind the floorboards'], glyph: '', accent: '#a98a5a', duration: 8200 },
  { id: 'br-escape', name: 'Backrooms · The Escape', group: 'Backrooms', style: 'vhs', desc: 'The last numbered level — a door marked EXIT', level: 'LEVEL 9223...807', title: 'THE ESCAPE', done: 'THE LAST LEVEL', lines: ['the final number', 'a door marked EXIT', 'the hum · fading', 'sunlight ahead', 'you made it… ?'], glyph: '', accent: '#cfe6a0', duration: 8600 },
  { id: 'br-attraction', name: 'Backrooms · Level 19', group: 'Backrooms', style: 'vhs', desc: 'The Attraction — a carnival that never closes', level: 'LEVEL 19', title: 'THE ATTRACTION', done: 'RIDE NEVER CLOSES', lines: ['carousel turning', 'ticket booth empty', 'lights chasing', 'a child laughs · alone', 'stay on the ride'], glyph: '', accent: '#c08a4a', duration: 8200 },
  { id: 'br-breakroom', name: 'Backrooms · Level 4.1', group: 'Backrooms', style: 'vhs', desc: 'The Break Room — clock frozen at 3:33, overtime forever', level: 'LEVEL 4.1', title: 'THE BREAK ROOM', done: 'DO NOT CLOCK OUT', lines: ['coffee · still hot', 'clock · 3:33 always', 'vending machine humming', 'a memo for you', 'do not clock out'], glyph: '', accent: '#c8b85a', duration: 8200 },
  { id: 'br-church', name: 'Backrooms · Level 41', group: 'Backrooms', style: 'vhs', desc: 'The Church — endless pews, an organ playing itself', level: 'LEVEL 41', title: 'THE CHURCH', done: 'SERMON ENDLESS', lines: ['pews · endless rows', 'organ · self-playing', 'candles never melt', 'kneel if you wish', 'the doors are sealed'], glyph: '', accent: '#c0b070', duration: 8400 },
  { id: 'br-shallows', name: 'Backrooms · Level 7.1', group: 'Backrooms', style: 'vhs', desc: 'The Shallows — warm saltwater with no shore', level: 'LEVEL 7.1', title: 'THE SHALLOWS', done: 'TIDE TURNING', lines: ['knee-deep saltwater', 'no shore in sight', 'gulls · unseen', 'the water warms', 'do not float away'], glyph: '', accent: '#3fa0c8', duration: 8200 },
  { id: 'br-servicehall', name: 'Backrooms · Level 5.5', group: 'Backrooms', style: 'vhs', desc: 'The Service Hall — staff-only corridors behind the hotel', level: 'LEVEL 5.5', title: 'THE SERVICE HALL', done: 'STAFF ONLY', lines: ['linens on carts', 'doors · numbered oddly', 'a bell rings once', 'keycard · expired', 'do not enter 5½B'], glyph: '', accent: '#9a9a6a', duration: 8200 },
  { id: 'br-pit', name: 'Backrooms · Level 116', group: 'Backrooms', style: 'vhs', desc: 'The Pit — a vast hole with warm air rising', level: 'LEVEL 116', title: 'THE PIT', done: 'NO BOTTOM', lines: ['a hole · vast', 'warm air rising', 'pebbles fall · silent', 'the edge crumbles', 'step back'], glyph: '', accent: '#6a6a52', duration: 8400 },
  { id: 'br-farmhouse', name: 'Backrooms · Level 24', group: 'Backrooms', style: 'vhs', desc: 'The Farmhouse — a kitchen set, footsteps upstairs', level: 'LEVEL 24', title: 'THE FARMHOUSE', done: 'YOU LIVE HERE NOW', lines: ['fields outside · wheat', 'kitchen · set', 'a kettle whistles', 'footsteps upstairs', 'you live here now'], glyph: '', accent: '#c0a060', duration: 8200 },
  { id: 'br-docks', name: 'Backrooms · Level 17', group: 'Backrooms', style: 'vhs', desc: 'The Docks — endless piers and rolling fog', level: 'LEVEL 17', title: 'THE DOCKS', done: 'FOG ROLLING IN', lines: ['wooden piers · endless', 'water lapping', 'a foghorn · low', 'ropes creak', 'the boat waits empty'], glyph: '', accent: '#5a8aa0', duration: 8200 },
  { id: 'br-radiotower', name: 'Backrooms · Level 250', group: 'Backrooms', style: 'vhs', desc: 'The Radio Tower — a frequency that counts you out', level: 'LEVEL 250', title: 'THE RADIO TOWER', done: 'FREQUENCY FOUND', lines: ['red light blinking', 'static resolving', 'a countdown begins', 'climb the ladder', 'almost through'], glyph: '', accent: '#c05a4a', duration: 8200 },
  { id: 'br-boiler', name: 'Backrooms · Level 6.6', group: 'Backrooms', style: 'vhs', desc: 'The Boiler Room — pressure climbing into the red', level: 'LEVEL 6.6', title: 'THE BOILER ROOM', done: 'PRESSURE CRITICAL', lines: ['pipes glowing hot', 'gauges in the red', 'steam screaming', 'valve · seized', 'get out now'], glyph: '', accent: '#c05a30', duration: 8000 },
  { id: 'br-infinite', name: 'Backrooms · Level ∞', group: 'Backrooms', style: 'vhs', desc: 'The Infinite — no walls, no floor, only the hum', level: 'LEVEL ∞', title: 'THE INFINITE', done: 'NO EXIT', lines: ['no walls · no floor', 'just the hum', 'time · meaningless', 'you are everywhere', 'and nowhere'], glyph: '', accent: '#b06bff', duration: 8800 },

  // ── Matrix variants (code rain) ──────────────────────────────────────────
  {
    id: 'matrix-classic', name: 'Matrix · Wake Up', group: 'Matrix', style: 'rain',
    desc: 'Classic green katakana — follow the white rabbit',
    title: '', sub: '', done: '◆ MAOWCORE',
    lines: ['> Wake up, operator…', '> The system has you.', '> Follow the white rabbit.', '> Knock, knock.'],
    glyph: '', accent: '#00ff41', duration: 6600,
  },
  {
    id: 'matrix-red', name: 'Matrix · Déjà Vu', group: 'Matrix', style: 'rain',
    desc: 'Red rain — a glitch in the Matrix, they changed something',
    title: '', sub: '', done: '◆ ANOMALY',
    lines: ['> Déjà vu detected.', '> They changed something.', '> Anomaly located.', '> Reloading the construct…'],
    glyph: '', accent: '#ff003c', duration: 6600,
  },
  {
    id: 'matrix-blue', name: 'Matrix · No Spoon', group: 'Matrix', style: 'rain',
    desc: 'Cyan digital rain — there is no spoon',
    title: '', sub: '', done: '◆ FREE YOUR MIND',
    lines: ['> Decrypting the construct.', '> Loading the load program.', '> There is no spoon.', '> Free your mind.'],
    glyph: '', accent: '#19a7ff', duration: 6600,
  },
  {
    id: 'matrix-binary', name: 'Matrix · Cascade', group: 'Matrix', style: 'rain',
    desc: 'Amber binary cascade — compiling reality',
    title: '', sub: '', done: '01001101 ◆',
    lines: ['> Compiling reality…', '> 0x4D 0x41 0x4F 0x57', '> Stack overflow averted.', '> Re-entering the source.'],
    glyph: '', accent: '#ffb000', duration: 6600,
  },
  {
    id: 'matrix-source', name: 'Matrix · The Source', group: 'Matrix', style: 'rain',
    desc: 'Gold rain — the Architect speaks, choice is an illusion',
    title: '', sub: '', done: '◆ THE SOURCE',
    lines: ['> Architect online.', '> The anomaly is systemic.', '> The function is to return.', '> Choice is an illusion.'],
    glyph: '', accent: '#e8c879', duration: 6600,
  },

  // ── Server / infra ───────────────────────────────────────────────────────
  {
    id: 'server-rack', name: 'Server · Rack POST', group: 'Server', style: 'log',
    desc: 'Dual-socket rack server BIOS power-on self test',
    title: 'RACK BOOT · BIOS POST', sub: 'NODE  MAOW-R740', done: 'ALL SLEDS NOMINAL',
    lines: ['CPU · 2× EPYC 64C/128T', 'MEM · 512GB ECC REG · OK', 'NVMe · 24 drives · online', 'NIC · 2× 100GbE · bonded', 'BMC · iDRAC reachable', 'Hypervisor · KVM ready', 'VM pool · 48 guests', 'Health · green across rack'],
    glyph: '[ OK ]', accent: '#00e676', accent2: '#00b8d4', duration: 7600,
  },
  {
    id: 'server-k8s', name: 'Server · Kubernetes', group: 'Server', style: 'log',
    desc: 'Cluster control-plane coming up, pods scheduling',
    title: 'KUBERNETES · CLUSTER UP', sub: 'CONTEXT  prod-maow', done: 'ROLLOUT COMPLETE · 6/6 READY',
    lines: ['etcd quorum · 3/3 healthy', 'kube-apiserver · listening', 'scheduler · leader elected', '12 nodes · Ready', 'deploy maowcore · 6/6 pods', 'service mesh · mTLS on', 'ingress · cert valid', 'HPA · autoscaling armed'],
    glyph: '▸', accent: '#326ce5', accent2: '#19a7ff', duration: 7600,
  },
  {
    id: 'server-mainframe', name: 'Server · Mainframe IPL', group: 'Server', style: 'log',
    desc: 'z/OS initial program load on green-screen iron',
    title: 'MAINFRAME · IPL', sub: 'SYSPLEX  MAOW01', done: 'READY.',
    lines: ['IPL FROM 0A82', 'LPAR · MAOW01 ACTIVATED', 'z/OS · NUCLEUS LOADED', 'JES2 · INITIALIZED', 'VTAM · MAJOR NODE ACTIVE', 'DB2 · SUBSYSTEM UP', 'CICS · REGION READY', 'TSO · ACCEPTING LOGONS'],
    glyph: '*', accent: '#33ff99', accent2: '#7dffc0', duration: 7800,
  },
  {
    id: 'server-storage', name: 'Server · Storage Array', group: 'Server', style: 'log',
    desc: 'Petabyte SAN spinning up, parity verified',
    title: 'STORAGE ARRAY · ONLINE', sub: 'POOL  tank0', done: '1.2 PB USABLE · ONLINE',
    lines: ['Enclosure · 60 bays', 'SMART scan · 60/60 pass', 'Parity check · 100%', 'Cache · BBU charged', 'Dedup · enabled', 'Snapshots · hourly', 'Replication · offsite linked', 'Scrub · no errors'],
    glyph: '[ OK ]', accent: '#00b8d4', accent2: '#19ffd0', duration: 7600,
  },
  {
    id: 'server-bios', name: 'Server · Legacy BIOS', group: 'Server', style: 'log',
    desc: 'Old-school AMI BIOS POST handing off to GRUB',
    title: 'POST · LEGACY BIOS', sub: 'AMIBIOS  v4.7', done: 'BOOTING vmlinuz…',
    lines: ['AMI BIOS · v4.7', 'Detecting drives…', 'Memory test · 65536MB OK', 'USB · 6 devices', 'CMOS · OK', 'Boot order · NVMe0', 'GRUB · stage 2', 'Loading kernel image'],
    glyph: '>', accent: '#cfd2d6', accent2: '#9aa0a6', duration: 7400,
  },

  // ── Hacker / intrusion (log style, distinct from the bespoke breach boot) ─
  {
    id: 'hack-breach', name: 'Hacker · Perimeter Breach', group: 'Hacker', style: 'log',
    desc: 'Recon → exploit → root → cover tracks → exfil',
    title: 'PERIMETER BREACH', sub: 'TARGET  10.0.0.0/8', done: 'EXFIL COMPLETE · GHOST',
    lines: ['nmap · 1000 ports scanned', '22/tcp open · ssh', 'exploit · CVE-2024-1337', 'reverse shell · established', 'privilege · root obtained', 'clearing logs · /var/log/*', 'persistence · cron implanted', 'exfil · 4.2GB tunneled'],
    glyph: '$', accent: '#00ff66', accent2: '#39ff14', duration: 8200,
  },
  {
    id: 'hack-ransom', name: 'Hacker · Payload Armed', group: 'Hacker', style: 'log',
    desc: 'Menacing… then a wink. MaowCore restores everything ♥',
    title: 'PAYLOAD ARMED', sub: 'KEY  AES-256-GCM', done: 'JUST KIDDING · RESTORED ♥',
    lines: ['enumerating shares', 'AES-256 keys generated', 'encrypting · 18,402 files', 'shadow copies · deleted', 'note dropped · README.txt', 'C2 beacon · check-in', '…just kidding · it\'s MaowCore', 'restoring everything ♥'],
    glyph: '!', accent: '#ff003c', accent2: '#ff6a3c', duration: 8400,
  },
  {
    id: 'hack-sniff', name: 'Hacker · Packet Intercept', group: 'Hacker', style: 'log',
    desc: 'Monitor mode, handshake capture, MITM',
    title: 'PACKET INTERCEPT', sub: 'IFACE  wlan0mon', done: 'SESSION HIJACKED',
    lines: ['monitor mode · wlan0', 'handshake captured', 'deauth · 3 clients', 'SSID · MAOW_5G', 'WPA2 · cracking…', 'key · recovered', 'MITM · arp poisoned', 'sslstrip · active'],
    glyph: '»', accent: '#39ff14', accent2: '#aaff00', duration: 8000,
  },
  {
    id: 'hack-blackice', name: 'Hacker · Black ICE', group: 'Hacker', style: 'log',
    desc: 'Cyberpunk netrun — jack in, break the ICE, grab paydata',
    title: 'BLACK ICE', sub: 'DECK  MAOW-7', done: 'FLATLINED THE ICE',
    lines: ['jacking in…', 'ICE detected · black', 'running icebreaker', 'node 0x7F · cracked', 'data fort · breached', 'paydata · located', 'trace · 14% · RUN', 'jacked out clean'],
    glyph: '◆', accent: '#bd00ff', accent2: '#00e5ff', duration: 8200,
  },
  {
    id: 'hack-quantum', name: 'Hacker · Quantum Decrypt', group: 'Hacker', style: 'log',
    desc: 'Shor\'s algorithm collapsing RSA-4096 to nothing',
    title: 'QUANTUM DECRYPT', sub: 'QPU  128 qubits', done: 'VAULT OPEN · KEYS YOURS',
    lines: ['qubits · 128 entangled', 'Shor\'s algorithm · running', 'factoring RSA-4096', 'superposition · stable', 'key collapse · imminent', 'decryption · 100%', 'vault · open', 'grabbing the keys'],
    glyph: '✦', accent: '#00e5ff', accent2: '#7df9ff', duration: 8200,
  },

  // ── Cinematic misc ───────────────────────────────────────────────────────
  {
    id: 'ai-core', name: 'A.I. Core · Wake', group: 'Cinematic', style: 'log',
    desc: 'A HAL/TARS-style sentient core coming online',
    title: 'A.I. CORE · WAKE SEQUENCE', sub: 'UNIT  MAOW-9000', done: '“Hello. I am MaowCore.”',
    lines: ['Cogito subsystem · online', 'Loading personality matrix', 'Humor setting · 75%', 'Ethics governor · engaged', 'Memory banks · 9000 PB', 'Voice synthesis · ready', 'Self-awareness · nominal', 'Sentience · achieved'],
    glyph: '◉', accent: '#ff5a3c', accent2: '#ffd23f', duration: 8000,
  },
  {
    id: 'nostromo', name: 'MOTHER · Interface 2037', group: 'Cinematic', style: 'log',
    desc: 'Alien — the Nostromo\'s ship computer waking up',
    title: 'MOTHER · INTERFACE 2037', sub: 'USCSS NOSTROMO  180924609', done: 'INTERFACE 2037 READY',
    lines: ['WEYLAND-YUTANI BIOS', 'CREW · 7 · IN STASIS', 'NAVIGATION · ONLINE', 'SPECIAL ORDER 937 · SEALED', 'LIFE SUPPORT · NOMINAL', 'PROXIMITY · UNKNOWN SIGNAL', 'SCIENCE OFFICER · OVERRIDE', 'MOTHER · READY'],
    glyph: '·', accent: '#3dff7a', accent2: '#aaffcc', duration: 8200,
  },
  {
    id: 'neural-net', name: 'Neural Net · Training', group: 'Cinematic', style: 'log',
    desc: 'A model training to convergence, then warming inference',
    title: 'NEURAL NET · TRAINING', sub: 'MODEL  maow-xl', done: 'INFERENCE · WARM',
    lines: ['Loading dataset · 1.2B tokens', 'Initializing 96 layers', 'Epoch 1/3 · loss 4.81', 'Epoch 2/3 · loss 1.92', 'Epoch 3/3 · loss 0.34', 'Backprop · converged', 'Weights · checkpointed', 'Serving · warmed up'],
    glyph: '▸', accent: '#a78bfa', accent2: '#22d3ee', duration: 8000,
  },
];

export const ALL_BOOTS: BootInfo[] = [...BUILTIN_BOOTS, ...CINE_BOOTS];
export const isCine = (id: string) => CINE_BOOTS.some((b) => b.id === id);
