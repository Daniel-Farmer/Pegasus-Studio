// ============================================================
// CONSTANTS — Dense urban canyon world data
// 3D world: 160x100m — Realistic urban style
// ============================================================

var XJ = {};

// --- Color palette (realistic, muted urban tones) ---
XJ.COLORS = {
  // Exterior
  ground:      0x9A9488,
  road:        0x3A3A3A,
  roadLine:    0xD0D0D0,
  sidewalk:    0xB0A898,
  sky:         0x7AAAC8,
  fog:         0x9AB0C0,
  // Shop exterior
  shopExt:     0xD8D0C0,
  shopInt:     0xE8E2DA,
  shopTrim:    0x5A4A38,
  // Room floors
  floorShowroom: 0x6B5540,
  floorWorkshop: 0x888880,
  floorStorage:  0x7A6A55,
  floorKitchen:  0xC8B898,
  floorToilet:   0xC0C0C0,
  // Furniture
  woodDark:    0x5A4530,
  woodLight:   0x9B8365,
  gold:        0xD4A828,
  glass:       0x88AACC,
  metal:       0x888888,
  window:      0x88AACC,
  // High-rises (5 realistic concrete/stone tones)
  hirise1:     0xB0A898,  // warm beige
  hirise2:     0x8A8A8A,  // concrete gray
  hirise3:     0xC0B8A8,  // sandstone
  hirise4:     0x787878,  // dark gray
  hirise5:     0xA09890,  // warm gray
  windowGlow:  0xFFEEBB,
  // Lighting
  sunColor:    0xFFF4E0,
  ambientColor:0x778899,
  warmLight:   0xFFE0BB,
  lampGlow:    0xFFEEBB
};

// --- Player constants ---
XJ.PLAYER = {
  height:     1.6,
  eyeHeight:  1.6,
  radius:     0.3,
  walkSpeed:  4.0,
  sprintSpeed:7.0
};

// --- World bounds ---
XJ.WORLD = {
  width:  160,
  depth:  100
};

// --- Shop layout (shrunk to ~1/4 size: 8m × 7m = 56 sq m) ---
// Shop building spans x:74-82, z:40-47
XJ.SHOP = {
  // Bounding box in meters
  minX: 74, minZ: 40, maxX: 82, maxZ: 47,
  wallHeight: 3.0,
  wallThick:  0.3,
  ceilingY:   3.2,

  rooms: [
    { id:'showroom',  name:'Showroom',  color: 0x6B5540,
      minX:74.3, minZ:43.8, maxX:81.7, maxZ:46.7 },
    { id:'workshop',  name:'Workshop',  color: 0x9A9A8A,
      minX:74.3, minZ:40.3, maxX:77.2, maxZ:43.2 },
    { id:'kitchen',   name:'Kitchen',   color: 0xE0C8A0,
      minX:77.8, minZ:40.3, maxX:79.7, maxZ:43.2 },
    { id:'toilet',    name:'Toilet',    color: 0xD0D0D0,
      minX:80.3, minZ:40.3, maxX:81.7, maxZ:43.2 }
  ],

  // Walls: from→to in meters, type ext/int
  walls: [
    // Exterior walls
    { ax:74, az:40, bx:82, bz:40, type:'ext' },   // North
    { ax:82, az:40, bx:82, bz:47, type:'ext' },   // East
    { ax:74, az:47, bx:82, bz:47, type:'ext' },   // South
    { ax:74, az:40, bx:74, bz:47, type:'ext' },   // West
    // Interior walls
    { ax:74, az:43.5, bx:82, bz:43.5, type:'int' },   // Back rooms|Showroom horizontal
    { ax:77.5, az:40, bx:77.5, bz:43.5, type:'int' },  // Workshop|Kitchen vertical
    { ax:80, az:40, bx:80, bz:43.5, type:'int' }        // Kitchen|Toilet vertical
  ],

  // Doors: position, width in meters, orientation h=horizontal wall / v=vertical wall
  doors: [
    // Workshop → Showroom (on horizontal wall at z=43.5)
    { x:76, z:43.5, w:1.4, orient:'h', type:'int' },
    // Workshop → Kitchen (on vertical wall at x=77.5)
    { x:77.5, z:42, w:1.4, orient:'v', type:'int' },
    // Kitchen → Toilet (on vertical wall at x=80)
    { x:80, z:42, w:1.4, orient:'v', type:'int' },
    // Main entrance (on south exterior wall at z=47)
    { x:78, z:47, w:1.6, orient:'h', type:'ext' },
    // Display window bays (south wall openings — see-through)
    { x:75.65, z:47, w:2.7, orient:'h', type:'win', winBot:0.45, winTop:2.73 },
    { x:80.35, z:47, w:2.7, orient:'h', type:'win', winBot:0.45, winTop:2.73 }
  ]
};

// --- Buildings: continuous terraces + background fills (14 total) ---
XJ.HIGHRISES = [
  // North terrace (z=34-48, brick, 3 buildings flanking shop at x:74-82)
  // London stock yellow-buff, with soot weathering variation
  { x:56,  z:34, w:18, d:14, h:16, color:0xC8B080, shopFace:'front', brick:true },
  { x:74,  z:34, w:8,  d:14, h:13, color:0xC8B080, yBase:3.4, brick:true },
  { x:82,  z:34, w:22, d:14, h:18, color:0xB0A070, shopFace:'front', brick:true },

  // South terrace (z=55-68, brick, 5 shops)
  // Mix of stock yellow, weathered buff, grey-brown
  { x:56,  z:55, w:10, d:13, h:15, color:0xC0A878, shopFace:'back', brick:true },
  { x:66,  z:55, w:10, d:13, h:17, color:0xA09068, shopFace:'back', brick:true },
  { x:76,  z:55, w:10, d:13, h:14, color:0xB8A878, shopFace:'back', brick:true },
  { x:86,  z:55, w:9,  d:13, h:16, color:0xA89870, shopFace:'back', brick:true },
  { x:95,  z:55, w:9,  d:13, h:15, color:0x989078, shopFace:'back', brick:true },

  // Background north (z=0-34, 3 blocks)
  { x:0,   z:0,  w:56, d:34, h:28, color:0x787878 },
  { x:56,  z:0,  w:48, d:34, h:32, color:0xA09890 },
  { x:104, z:0,  w:56, d:34, h:25, color:0xB0A898 },

  // West/East caps (z=34-68, filling sides of street)
  { x:0,   z:34, w:56, d:34, h:24, color:0xC0B8A8 },
  { x:104, z:34, w:56, d:34, h:26, color:0x787878 },

  // Background south (z=68-100, 2 blocks)
  { x:0,   z:68, w:80, d:32, h:30, color:0x8A8A8A },
  { x:80,  z:68, w:80, d:32, h:28, color:0xA09890 }
];

// --- Shop fronts (ground-floor retail on both sides of street) ---
XJ.SHOPFRONTS = [
  // North side (z=48, facing south into street)
  { x:56,  z:48, w:7,  name:'Coffee House',  color:0x884422, face:'s' },
  { x:63,  z:48, w:7,  name:"McDougal's",     color:0xCC0000, face:'s', style:'fastfood' },
  { x:70,  z:48, w:4,  name:'TO LET',         color:0x999988, face:'s', style:'empty' },
  // gap x:74-82 = jewellery shop
  { x:82,  z:48, w:4,  name:'Hope & Heart',   color:0x664488, face:'s', style:'charity' },
  { x:86,  z:48, w:9,  name:'Lucky Spins',    color:0x220044, face:'s', style:'slots' },
  { x:95,  z:48, w:9,  name:'Card Shop',      color:0xAA3366, face:'s' },

  // South side (z=55, facing north into street)
  { x:56,  z:55, w:10, name:'The Bakery',     color:0xCC8833, face:'n' },
  { x:66,  z:55, w:10, name:'Fashion Outlet',  color:0x993366, face:'n' },
  { x:76,  z:55, w:10, name:'Phone Repairs',   color:0x336699, face:'n' },
  { x:86,  z:55, w:9,  name:'The Chippy',     color:0x448844, face:'n' },
  { x:95,  z:55, w:9,  name:'Charity Shop',   color:0x886644, face:'n' }
];

// --- Road (single E-W road, centered between building faces z:48-55) ---
XJ.ROADS = [
  { x:56, z:49.5, w:48, d:4, label:'Main Street' }
];

// --- Paths (sidewalks on both sides of road, 1.5m each) ---
XJ.PATH = [
  { x:56, z:48, w:48, d:1.5 },
  { x:56, z:53.5, w:48, d:1.5 }
];

// --- Lamp posts (6 per side of road, 12 total) ---
XJ.LAMPS = [
  // North sidewalk
  {x:60, z:49}, {x:68, z:49}, {x:76, z:49},
  {x:84, z:49}, {x:92, z:49}, {x:100, z:49},
  // South sidewalk
  {x:60, z:54}, {x:68, z:54}, {x:76, z:54},
  {x:84, z:54}, {x:92, z:54}, {x:100, z:54}
];

// --- Spawn point (middle of road, facing shop) ---
XJ.SPAWN = { x: 78, z: 51.5, rot: 0 };
