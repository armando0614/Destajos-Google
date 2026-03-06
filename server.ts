import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer as createHttpServer } from "http";
import { Server } from "socket.io";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import cookieSession from "cookie-session";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists for persistent volumes
const dbDir = process.env.NODE_ENV === "production" ? "/app/data" : __dirname;
if (process.env.NODE_ENV === "production" && !fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, "destajos.db");
const db = new Database(dbPath);

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS destajistas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS actividades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    precio REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ubicaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paquete TEXT NOT NULL,
    manzana TEXT NOT NULL,
    lote TEXT NOT NULL,
    UNIQUE(paquete, manzana, lote)
  );

  CREATE TABLE IF NOT EXISTS capturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    destajista_id INTEGER NOT NULL,
    actividad_id INTEGER NOT NULL,
    paquete TEXT NOT NULL,
    manzana TEXT NOT NULL,
    lotes TEXT NOT NULL,
    semana INTEGER NOT NULL,
    cantidad INTEGER NOT NULL,
    usuario_nombre TEXT,
    usuario_avatar TEXT,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (destajista_id) REFERENCES destajistas (id),
    FOREIGN KEY (actividad_id) REFERENCES actividades (id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migration to add user columns if they don't exist
try {
  db.exec("ALTER TABLE capturas ADD COLUMN usuario_nombre TEXT");
} catch (e) {}
try {
  db.exec("ALTER TABLE capturas ADD COLUMN usuario_avatar TEXT");
} catch (e) {}

// Seed initial data
const seedData = () => {
  // Clean up duplicates and ensure uniqueness
  try {
    // 1. Normalize names (trim and uppercase) for existing data
    db.exec(`UPDATE destajistas SET nombre = UPPER(TRIM(nombre))`);
    
    // 2. Delete duplicates keeping only the one with the lowest ID
    db.exec(`
      DELETE FROM destajistas 
      WHERE id NOT IN (
        SELECT MIN(id) 
        FROM destajistas 
        GROUP BY nombre
      )
    `);
    
    // 3. Create a unique index if it doesn't exist to prevent future duplicates
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_destajistas_nombre ON destajistas(nombre)`);

    // 4. Clean up duplicate activities
    db.exec(`
      DELETE FROM actividades 
      WHERE id NOT IN (
        SELECT MIN(id) 
        FROM actividades 
        GROUP BY nombre
      )
    `);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_actividades_nombre ON actividades(nombre)`);
  } catch (e) {
    console.error("Error cleaning up master data:", e);
  }

  const insertDestajista = db.prepare("INSERT OR IGNORE INTO destajistas (nombre) VALUES (?)");
  const destajistasList = [
    "FRANCISCO ZARRAZAGA CONTRERAS",
    "EMMANUEL ZARRAZAGA GAMAS",
    "FRANCISCO JAVIER ZARRAZAGA GAMAS",
    "MIGUEL ANGEL QUIROGA JIMENEZ",
    "FELIPE REYES JIMENEZ",
    "CECILIO FUENTE DE LA CRUZ",
    "ROGER ROSADO JIMENEZ",
    "BAIBY RUTH DE LA CRUZ GOMEZ",
    "JOSE EDUARDO HERNANDEZ ESCALANTE",
    "JUAN ENRIQUE VERA HERNANDEZ",
    "LUIS ALBERTO MAY PEREZ",
    "ELIAZAR CRUZ CRUZ",
    "JOSE A. OVANDO RICARDEZ",
    "FRANCISCO MACIEL MAGAÑA",
    "ALBERTO CRUZ HERNANDEZ",
    "MIGUEL ANGEL RAMIREZ JIMENEZ",
    "ROMEL PEREZ HERNANDEZ",
    "DANIEL MARQUEZ GIL",
    "VICTOR ALFONSO RODRIGUEZ VALDEZ",
    "VICTOR MANUEL CASTILLO"
  ].map(n => n.trim().toUpperCase());

  // Remove destajistas not in the official list (only if they don't have captures to avoid errors)
  const existingDestajistas = db.prepare("SELECT id, nombre FROM destajistas").all() as { id: number, nombre: string }[];
  existingDestajistas.forEach(d => {
    if (!destajistasList.includes(d.nombre)) {
      try {
        db.prepare("DELETE FROM destajistas WHERE id = ?").run(d.id);
      } catch (e) {
        // Probably has captures, keep it
        console.log(`Keeping destajista ${d.nombre} because it has associated data`);
      }
    }
  });

  destajistasList.forEach(n => insertDestajista.run(n));

  const insertActividad = db.prepare("INSERT OR IGNORE INTO actividades (nombre, precio) VALUES (?, ?)");
  const actividadesList: [string, number][] = [
    ["ACCESO HUELLAS", 1800.00], ["ACCESORIOS DE BAÑO P.B Y P.A", 600.00], ["ACCESORIOS PA", 500.00],
    ["ACCESORIOS PB", 500.00], ["ACERO LOSA AZOTEA", 5600.00], ["ACERO LOSA DE ENTREPISO", 6900.00],
    ["ACERO MURO PLANTA ALTA", 4200.00], ["ACERO MURO PLANTA BAJA", 3800.00],
    ["ACERO, CIMBRA Y COLADO DE ESCALERA", 6500.00], ["ACERO, CIMBRA Y COLADO DE PRETIL", 4700.00],
    ["AJUSTE 200XMOLDERO PB", 3200.00], ["AJUSTE 200XMOLDERO PA", 3400.00],
    ["AJUSTE COMIDA (16 MOLDEROS) PB", 320.00], ["AJUSTE COMIDA (17 MOLDEROS) PA", 340.00],
    ["AJUSTE MOLDE PA", 6736.00], ["AJUSTE MOLDE PB", 3200.00], ["ARMADO DE CIMENTACION", 22348.00],
    ["AZULEJO PA", 2100.00], ["AZULEJO PB", 2100.00], ["BARDA MEDIANERA", 3000.00],
    ["BASE DE TINACO", 2800.00], ["CABLEADO ACOMETIDA P.A", 300.00], ["CABLEADO ACOMETIDA P.B", 300.00],
    ["CABLEADO DE VIVIENDA PA", 1900.00], ["CABLEADO DE VIVIENDA PB", 1900.00],
    ["CHAROLA SANITARIA PB", 500.00], ["CINTA MULTISEAL", 550.00], ["EMBOQUILLADO EN PRETIL", 1200.00],
    ["EMBOQUILLADO PA", 4742.59], ["EMBOQUILLADO PB", 4128.96], ["ENCHALUPADO MURO P.A", 1800.00],
    ["ENCHALUPADO P.B", 1800.00], ["ENMASILLADO EN MURO INTERIOR PB 01", 9111.21],
    ["ENMASILLADO EN MURO INTERIOR PA 01", 9353.92],
    ["ENMASILLADO EN MURO INTERIOR PA 02 (LIBERACION DE RETENCION DE MASILLA INTERIOR)", 1800.00],
    ["ENMASILLADO EN MURO INTERIOR PB 02 (LIBERACION DE RETENCION DE MASILLA INTERIOR)", 1800.00],
    ["ENMASILLADO EN PRETIL", 1500.00], ["ENTORTADO Y CHAFLAN", 2500.00], ["FIRME NIV PA", 2100.00],
    ["FIRME NIV PB", 1900.00], ["FIRMES PATIO PA", 600.00], ["FIRMES PATIO PB", 500.00],
    ["IMPER CHAROLA", 100.00], ["INSTALACION CLIMA PA", 1200.00], ["INSTALACION CLIMA PB", 1200.00],
    ["INSTALACION EN CIMENTACION", 3500.00], ["INSTALACION LOSA ENTREPISO", 2800.00],
    ["LECHEREADO EN PISO", 130.00], ["LIBERACION PINTURA INT PA 2DA MANO", 2600.00],
    ["MASILLA BAÑOS", 500.00], ["MASILLA MURO EXT PA", 3627.26], ["MASILLA MURO EXT PB", 3262.64],
    ["MOLD P. ALTA", 22753.64], ["MOLD P. BAJA", 22572.00], ["MOLDE PA", 22753.64],
    ["MURETE PA", 500.00], ["MURETE PB", 500.00], ["PINTURA EXT PA 2DA MANO", 1300.00],
    ["PINTURA EXTERIOR PA 2DA MANO", 1300.00], ["PINTURA EXTERIOR PA 1RA MANO", 1300.00],
    ["PINTURA EXTERIOR PB 1RA MANO", 1100.00], ["PINTURA EXTERIORPA 2DA MANO", 1300.00],
    ["PINTURA EXTERIORPB 2DA MANO", 1100.00], ["PINTURA INT PA 2DA MANO", 2600.00],
    ["PINTURA INTERIOR PA 1RA MANO", 2600.00], ["PINTURA INTERIOR PB 1RA MANO", 2500.00],
    ["PINTURA INTERIOR PB 2DA MANO", 2500.00], ["PINTURA POSTERIOR", 1156.00],
    ["PLANTILLA", 1200.00], ["PROLONGACION PLUVIAL PB", 600.00], ["PUERTAS Y VENTANAS", 7000.00],
    ["REGISTROS SANITARIOS", 5100.00], ["ROTULOS DE LOTE", 50.00], ["ROTULOS DE VIVIENDA", 240.00],
    ["SARDINEL", 400.00], ["TAQUETEO", 1500.00], ["TINACO PA", 600.00], ["TINACO PB", 600.00],
    ["ACARREO DE BLOCK", 150.00], ["ASENTADO DE BLOCK", 450.00], ["CASTILLOS", 300.00],
    ["CADENAS", 350.00], ["CERRAMIENTOS", 400.00], ["RANURADO", 120.00], ["LIMPIEZA", 200.00],
    ["COLADO DE CASTILLOS", 250.00], ["COLADO DE CADENAS", 280.00], ["HABILITADO DE ACERO", 500.00],
    ["CIMBRA EN MUROS", 600.00], ["DESMOLDE", 150.00], ["CURADO DE CONCRETO", 100.00]
  ];
  actividadesList.forEach(([n, p]) => insertActividad.run(n.trim().toUpperCase(), p));

  const insertUbicacion = db.prepare("INSERT OR IGNORE INTO ubicaciones (paquete, manzana, lote) VALUES (?, ?, ?)");
  const ubicacionesRaw = [
    ["E", "98", "1"], ["E", "98", "2"], ["E", "98", "3"], ["E", "98", "4"], ["E", "98", "5"], ["E", "98", "6"], ["E", "98", "7"], ["E", "98", "8"], ["E", "98", "9"], ["E", "98", "10"], ["E", "98", "11"], ["E", "98", "12"], ["E", "98", "13"], ["E", "98", "14"],
    ["E", "99", "1"], ["E", "99", "2"], ["E", "99", "3"], ["E", "99", "4"], ["E", "99", "5"], ["E", "99", "6"], ["E", "99", "7"], ["E", "99", "8"], ["E", "99", "9"], ["E", "99", "10"], ["E", "99", "11"], ["E", "99", "12"], ["E", "99", "13"], ["E", "99", "14"],
    ["F", "100", "1"], ["F", "100", "2"], ["F", "100", "3"], ["F", "100", "4"], ["F", "100", "5"], ["F", "100", "6"], ["F", "100", "7"], ["F", "100", "8"], ["F", "100", "9"], ["F", "100", "10"], ["F", "100", "11"], ["F", "100", "12"], ["F", "100", "13"], ["F", "100", "14"],
    ["F", "101", "1"], ["F", "101", "2"], ["F", "101", "3"], ["F", "101", "4"], ["F", "101", "5"],
    ["F", "102", "1"], ["F", "102", "2"], ["F", "102", "3"], ["F", "102", "4"], ["F", "102", "5"], ["F", "102", "6"],
    ["G", "102", "7"], ["G", "102", "8"], ["G", "102", "9"], ["G", "102", "10"],
    ["G", "93", "1"], ["G", "93", "2"], ["G", "93", "3"], ["G", "93", "4"], ["G", "93", "5"], ["G", "93", "6"], ["G", "93", "7"], ["G", "93", "8"], ["G", "93", "9"], ["G", "93", "10"],
    ["G", "94", "1"], ["G", "94", "2"], ["G", "94", "3"], ["G", "94", "4"], ["G", "94", "5"], ["G", "94", "6"], ["G", "94", "7"], ["G", "94", "8"], ["G", "94", "9"], ["G", "94", "10"],
    ["G", "95", "1"], ["G", "95", "2"], ["G", "95", "3"], ["G", "95", "4"], ["G", "95", "5"], ["G", "95", "6"], ["G", "95", "7"], ["G", "95", "8"], ["G", "95", "9"], ["G", "95", "10"],
    ["H", "88", "1"], ["H", "88", "2"], ["H", "88", "3"], ["H", "88", "4"], ["H", "88", "5"], ["H", "88", "6"], ["H", "88", "7"], ["H", "88", "8"], ["H", "88", "9"], ["H", "88", "10"],
    ["H", "89", "1"], ["H", "89", "2"], ["H", "89", "3"], ["H", "89", "4"], ["H", "89", "5"], ["H", "89", "6"], ["H", "89", "7"], ["H", "89", "8"], ["H", "89", "9"], ["H", "89", "10"],
    ["H", "96", "1"], ["H", "96", "2"], ["H", "96", "3"], ["H", "96", "4"], ["H", "96", "5"], ["H", "96", "6"], ["H", "96", "7"], ["H", "96", "8"], ["H", "96", "9"], ["H", "96", "10"],
    ["I", "90", "1"], ["I", "90", "2"], ["I", "90", "3"], ["I", "90", "4"], ["I", "90", "5"], ["I", "90", "6"], ["I", "90", "7"], ["I", "90", "8"], ["I", "90", "9"], ["I", "90", "10"],
    ["I", "91", "1"], ["I", "91", "2"], ["I", "91", "3"], ["I", "91", "4"], ["I", "91", "5"], ["I", "91", "6"], ["I", "91", "7"], ["I", "91", "8"], ["I", "91", "9"], ["I", "91", "10"],
    ["I", "92", "1"], ["I", "92", "2"], ["I", "92", "3"], ["I", "92", "4"], ["I", "92", "5"], ["I", "92", "9"],
    ["K", "103", "1"], ["K", "103", "2"], ["K", "103", "3"], ["K", "103", "4"], ["K", "103", "5"], ["K", "103", "6"], ["K", "103", "7"], ["K", "103", "8"], ["K", "103", "9"], ["K", "103", "10"], ["K", "103", "11"], ["K", "103", "12"], ["K", "103", "13"], ["K", "103", "14"], ["K", "103", "15"], ["K", "103", "16"], ["K", "103", "17"], ["K", "103", "18"], ["K", "103", "19"], ["K", "103", "20"], ["K", "103", "21"], ["K", "103", "22"], ["K", "103", "23"], ["K", "103", "24"], ["K", "103", "25"], ["K", "103", "26"],
    ["O", "46", "3"], ["O", "46", "4"], ["O", "46", "5"], ["O", "46", "6"], ["O", "46", "7"], ["O", "46", "8"], ["O", "46", "9"],
    ["O", "49", "1"], ["O", "49", "2"], ["O", "49", "3"], ["O", "49", "4"], ["O", "49", "5"], ["O", "49", "6"], ["O", "49", "7"], ["O", "49", "8"],
    ["O", "50", "1"], ["O", "50", "2"], ["O", "50", "3"], ["O", "50", "4"], ["O", "50", "5"], ["O", "50", "6"], ["O", "50", "7"], ["O", "50", "8"],
    ["O", "51", "1"], ["O", "51", "2"], ["O", "51", "3"], ["O", "51", "4"], ["O", "51", "10"], ["O", "51", "11"], ["O", "51", "12"], ["O", "51", "13"],
    ["P", "47", "1"], ["P", "47", "2"], ["P", "47", "3"], ["P", "47", "4"], ["P", "47", "5"], ["P", "47", "6"], ["P", "47", "7"], ["P", "47", "8"],
    ["P", "48", "1"], ["P", "48", "2"], ["P", "48", "3"], ["P", "48", "4"], ["P", "48", "5"], ["P", "48", "6"], ["P", "48", "7"], ["P", "48", "8"],
    ["P", "54", "1"], ["P", "54", "2"], ["P", "54", "3"], ["P", "54", "4"], ["P", "54", "5"], ["P", "54", "6"], ["P", "54", "7"], ["P", "54", "8"], ["P", "54", "9"], ["P", "54", "10"],
    ["P", "55", "1"], ["P", "55", "2"], ["P", "55", "3"], ["P", "55", "4"], ["P", "55", "5"], ["P", "55", "6"], ["P", "55", "7"], ["P", "55", "8"], ["P", "55", "9"], ["P", "55", "10"],
    ["P", "56", "1"], ["P", "56", "2"], ["P", "56", "3"], ["P", "56", "4"], ["P", "56", "5"], ["P", "56", "6"], ["P", "56", "7"], ["P", "56", "8"], ["P", "56", "9"], ["P", "56", "10"],
    ["Q", "52", "1"], ["Q", "52", "2"], ["Q", "52", "3"], ["Q", "52", "4"], ["Q", "52", "5"], ["Q", "52", "6"], ["Q", "52", "7"], ["Q", "52", "8"], ["Q", "52", "9"], ["Q", "52", "10"],
    ["Q", "53", "1"], ["Q", "53", "2"], ["Q", "53", "3"], ["Q", "53", "4"], ["Q", "53", "5"], ["Q", "53", "6"], ["Q", "53", "7"], ["Q", "53", "8"], ["Q", "53", "9"], ["Q", "53", "10"],
    ["Q", "60", "1"], ["Q", "60", "2"], ["Q", "60", "3"], ["Q", "60", "4"], ["Q", "60", "5"], ["Q", "60", "6"], ["Q", "60", "7"], ["Q", "60", "8"], ["Q", "60", "9"], ["Q", "60", "10"], ["Q", "60", "11"], ["Q", "60", "12"],
    ["Q", "61", "1"], ["Q", "61", "2"], ["Q", "61", "3"], ["Q", "61", "4"], ["Q", "61", "5"], ["Q", "61", "6"], ["Q", "61", "7"], ["Q", "61", "8"], ["Q", "61", "9"], ["Q", "61", "10"], ["Q", "61", "11"], ["Q", "61", "12"]
  ];
  ubicacionesRaw.forEach(([p, m, l]) => insertUbicacion.run(p, m, l));

  // Seed initial user
  const insertUser = db.prepare("INSERT OR IGNORE INTO users (username, password, avatar) VALUES (?, ?, ?)");
  insertUser.run("ArmandoL", "rabito31", "https://api.dicebear.com/7.x/avataaars/svg?seed=ArmandoL");

  // Add some sample captures if none exist
  const capturesCount = db.prepare("SELECT COUNT(*) as count FROM capturas").get() as { count: number };
  if (capturesCount.count === 0) {
    const d1 = db.prepare("SELECT id FROM destajistas LIMIT 1").get() as { id: number };
    const a1 = db.prepare("SELECT id FROM actividades LIMIT 1").get() as { id: number };
    if (d1 && a1) {
      db.prepare(`
        INSERT INTO capturas (destajista_id, actividad_id, paquete, manzana, lotes, semana, cantidad)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(d1.id, a1.id, "E", "98", "1, 2", 1, 2);
    }
  }
};

seedData();

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  app.use(express.json());
  app.use(cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'default-secret'],
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    secure: false, // Set to false for easier local dev/preview if not on https
    sameSite: 'lax',
    httpOnly: true
  }));

  // Auth Routes
  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Usuario y contraseña son requeridos" });
    }
    
    const user = db.prepare("SELECT * FROM users WHERE username = ? AND password = ?").get(username, password) as any;
    
    if (!user) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    }

    if (req.session) {
      req.session.user = {
        name: user.username,
        avatar: user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`
      };
    }
    res.json({ success: true, user: req.session?.user });
  });

  app.post("/api/auth/register", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Usuario y contraseña son requeridos" });
    }

    try {
      const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
      db.prepare("INSERT INTO users (username, password, avatar) VALUES (?, ?, ?)").run(username, password, avatar);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "El usuario ya existe" });
    }
  });

  app.get("/api/auth/me", (req, res) => {
    res.json(req.session?.user || null);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session = null;
    res.json({ success: true });
  });

  // Socket.io connection handling
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  // API Routes
  app.get("/api/destajistas", (req, res) => {
    const rows = db.prepare("SELECT * FROM destajistas ORDER BY nombre").all();
    res.json(rows);
  });

  app.post("/api/destajistas", (req, res) => {
    const { nombre } = req.body;
    const normalizedNombre = nombre.trim().toUpperCase();
    try {
      const info = db.prepare("INSERT INTO destajistas (nombre) VALUES (?)").run(normalizedNombre);
      io.emit("data_changed", { type: "destajistas" });
      res.json({ id: info.lastInsertRowid });
    } catch (e) {
      res.status(400).json({ error: "El destajista ya existe" });
    }
  });

  app.put("/api/destajistas/:id", (req, res) => {
    const { nombre } = req.body;
    const normalizedNombre = nombre.trim().toUpperCase();
    try {
      db.prepare("UPDATE destajistas SET nombre = ? WHERE id = ?").run(normalizedNombre, req.params.id);
      io.emit("data_changed", { type: "destajistas" });
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Error al actualizar el destajista" });
    }
  });

  app.delete("/api/destajistas/:id", (req, res) => {
    const id = req.params.id;
    try {
      const deleteCapturas = db.prepare("DELETE FROM capturas WHERE destajista_id = ?");
      const deleteDestajista = db.prepare("DELETE FROM destajistas WHERE id = ?");
      
      const transaction = db.transaction(() => {
        deleteCapturas.run(id);
        deleteDestajista.run(id);
      });
      
      transaction();
      io.emit("data_changed", { type: "destajistas" });
      res.json({ success: true });
    } catch (e) {
      console.error("Error deleting destajista:", e);
      res.status(500).json({ error: "Error al eliminar el destajista" });
    }
  });

  app.get("/api/actividades", (req, res) => {
    const rows = db.prepare("SELECT * FROM actividades ORDER BY nombre").all();
    res.json(rows);
  });

  app.post("/api/actividades", (req, res) => {
    const { nombre, precio } = req.body;
    const normalizedNombre = nombre.trim().toUpperCase();
    try {
      const info = db.prepare("INSERT INTO actividades (nombre, precio) VALUES (?, ?)").run(normalizedNombre, precio);
      io.emit("data_changed", { type: "actividades" });
      res.json({ id: info.lastInsertRowid });
    } catch (e) {
      res.status(400).json({ error: "La actividad ya existe" });
    }
  });

  app.put("/api/actividades/:id", (req, res) => {
    const { nombre, precio } = req.body;
    const normalizedNombre = nombre.trim().toUpperCase();
    try {
      db.prepare("UPDATE actividades SET nombre = ?, precio = ? WHERE id = ?").run(normalizedNombre, precio, req.params.id);
      io.emit("data_changed", { type: "actividades" });
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Error al actualizar la actividad" });
    }
  });

  app.delete("/api/actividades/:id", (req, res) => {
    const id = req.params.id;
    try {
      const deleteCapturas = db.prepare("DELETE FROM capturas WHERE actividad_id = ?");
      const deleteActividad = db.prepare("DELETE FROM actividades WHERE id = ?");
      
      const transaction = db.transaction(() => {
        deleteCapturas.run(id);
        deleteActividad.run(id);
      });
      
      transaction();
      io.emit("data_changed", { type: "actividades" });
      res.json({ success: true });
    } catch (e) {
      console.error("Error deleting actividad:", e);
      res.status(500).json({ error: "Error al eliminar la actividad" });
    }
  });

  app.get("/api/ubicaciones", (req, res) => {
    const rows = db.prepare("SELECT * FROM ubicaciones ORDER BY paquete, manzana, lote").all();
    res.json(rows);
  });

  app.post("/api/ubicaciones", (req, res) => {
    const data = req.body;
    try {
      const insert = db.prepare("INSERT OR IGNORE INTO ubicaciones (paquete, manzana, lote) VALUES (?, ?, ?)");
      
      if (Array.isArray(data)) {
        const transaction = db.transaction((items) => {
          for (const item of items) {
            insert.run(item.paquete, item.manzana, item.lote);
          }
        });
        transaction(data);
        io.emit("data_changed", { type: "ubicaciones" });
        res.json({ success: true, count: data.length });
      } else {
        const { paquete, manzana, lote } = data;
        const info = insert.run(paquete, manzana, lote);
        io.emit("data_changed", { type: "ubicaciones" });
        res.json({ id: info.lastInsertRowid });
      }
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete("/api/ubicaciones/:id", (req, res) => {
    db.prepare("DELETE FROM ubicaciones WHERE id = ?").run(req.params.id);
    io.emit("data_changed", { type: "ubicaciones" });
    res.json({ success: true });
  });

  app.get("/api/capturas", (req, res) => {
    const { semana, destajista_id } = req.query;
    let query = `
      SELECT c.*, d.nombre as destajista_nombre, a.nombre as actividad_nombre, a.precio
      FROM capturas c
      JOIN destajistas d ON c.destajista_id = d.id
      JOIN actividades a ON c.actividad_id = a.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (semana) {
      query += " AND c.semana = ?";
      params.push(semana);
    }
    if (destajista_id) {
      query += " AND c.destajista_id = ?";
      params.push(destajista_id);
    }

    query += " ORDER BY c.fecha_creacion DESC";
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  });

  app.post("/api/capturas", (req, res) => {
    const data = req.body;
    const user = req.session?.user;
    
    try {
      const checkDuplicate = (destajista_id: number, actividad_id: number, paquete: string, manzana: string, lotes: string) => {
        const existing = db.prepare(`
          SELECT lotes FROM capturas 
          WHERE destajista_id = ? AND actividad_id = ? AND paquete = ? AND manzana = ?
        `).all(destajista_id, actividad_id, paquete, manzana) as { lotes: string }[];

        const newLotes = lotes.split(',').map(l => l.trim()).filter(l => l !== "");
        
        for (const row of existing) {
          const existingLotes = row.lotes.split(',').map(l => l.trim()).filter(l => l !== "");
          for (const nl of newLotes) {
            if (existingLotes.includes(nl)) {
              return nl;
            }
          }
        }
        return null;
      };

      const insert = db.prepare(`
        INSERT INTO capturas (destajista_id, actividad_id, paquete, manzana, lotes, semana, cantidad, usuario_nombre, usuario_avatar)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      if (Array.isArray(data)) {
        const transaction = db.transaction((items) => {
          for (const item of items) {
            const duplicateLote = checkDuplicate(
              item.destajista_id, 
              item.actividad_id, 
              item.paquete, 
              item.manzana, 
              item.lotes
            );

            if (duplicateLote) {
              throw new Error(`El lote ${duplicateLote} ya fue pagado para esta actividad a este destajista.`);
            }

            insert.run(
              item.destajista_id, 
              item.actividad_id, 
              item.paquete, 
              item.manzana, 
              item.lotes, 
              item.semana, 
              item.cantidad,
              user?.name || 'Anónimo',
              user?.avatar || '👤'
            );
          }
        });
        transaction(data);
        io.emit("data_changed", { type: "capturas" });
        res.json({ success: true, count: data.length });
      } else {
        const { destajista_id, actividad_id, paquete, manzana, lotes, semana, cantidad } = data;
        
        const duplicateLote = checkDuplicate(destajista_id, actividad_id, paquete, manzana, lotes);
        if (duplicateLote) {
          return res.status(400).json({ error: `El lote ${duplicateLote} ya fue pagado para esta actividad a este destajista.` });
        }

        const info = insert.run(
          destajista_id, 
          actividad_id, 
          paquete, 
          manzana, 
          lotes, 
          semana, 
          cantidad,
          user?.name || 'Anónimo',
          user?.avatar || '👤'
        );
        io.emit("data_changed", { type: "capturas" });
        res.json({ id: info.lastInsertRowid });
      }
    } catch (error: any) {
      console.error("Error saving captures:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/capturas/:id", (req, res) => {
    db.prepare("DELETE FROM capturas WHERE id = ?").run(req.params.id);
    io.emit("data_changed", { type: "capturas" });
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
