import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer as createHttpServer } from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import cookieSession from "cookie-session";
import dotenv from "dotenv";
import { getDatabase, DB } from "./db.ts";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Database
console.log("Environment:", process.env.NODE_ENV || 'development');
const db = getDatabase();
console.log("Database type:", db.isMySQL ? "MySQL" : "SQLite");

async function initDB() {
  const autoIncrement = db.isMySQL ? "INT AUTO_INCREMENT PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT";
  const textType = db.isMySQL ? "VARCHAR(255)" : "TEXT"; 
  const longTextType = "TEXT";

  await db.run(`
    CREATE TABLE IF NOT EXISTS destajistas (
      id ${autoIncrement},
      nombre ${textType} NOT NULL UNIQUE
    );
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS actividades (
      id ${autoIncrement},
      nombre ${textType} NOT NULL UNIQUE,
      precio REAL NOT NULL
    );
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS ubicaciones (
      id ${autoIncrement},
      paquete ${textType} NOT NULL,
      manzana ${textType} NOT NULL,
      lote ${textType} NOT NULL,
      UNIQUE(paquete, manzana, lote)
    );
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS capturas (
      id ${autoIncrement},
      destajista_id INTEGER NOT NULL,
      actividad_id INTEGER NOT NULL,
      paquete ${textType} NOT NULL,
      manzana ${textType} NOT NULL,
      lotes ${longTextType} NOT NULL,
      semana INTEGER NOT NULL,
      cantidad INTEGER NOT NULL,
      usuario_nombre ${textType},
      usuario_avatar ${longTextType},
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (destajista_id) REFERENCES destajistas (id),
      FOREIGN KEY (actividad_id) REFERENCES actividades (id)
    );
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id ${autoIncrement},
      username ${textType} NOT NULL UNIQUE,
      password ${textType} NOT NULL,
      avatar ${longTextType},
      role ${textType} DEFAULT 'supervisor',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrations
  try {
    await db.run("ALTER TABLE capturas ADD COLUMN usuario_nombre " + textType);
  } catch (e) {}
  try {
    await db.run("ALTER TABLE capturas ADD COLUMN usuario_avatar " + longTextType);
  } catch (e) {}
  try {
    await db.run("ALTER TABLE users ADD COLUMN role " + textType + " DEFAULT 'supervisor'");
  } catch (e) {}

  await seedData();
}

async function seedData() {
  try {
    await db.run(`UPDATE destajistas SET nombre = UPPER(TRIM(nombre))`);
    
    if (db.isMySQL) {
       // MySQL delete duplicates
       try {
         await db.run(`
            DELETE t1 FROM destajistas t1
            INNER JOIN destajistas t2 
            WHERE t1.id > t2.id AND t1.nombre = t2.nombre
         `);
       } catch (e) { console.error("Error cleaning destajistas duplicates:", e); }
       
       try {
         await db.run(`
            DELETE t1 FROM actividades t1
            INNER JOIN actividades t2 
            WHERE t1.id > t2.id AND t1.nombre = t2.nombre
         `);
       } catch (e) { console.error("Error cleaning actividades duplicates:", e); }
    } else {
       // SQLite delete duplicates
       await db.run(`
          DELETE FROM destajistas 
          WHERE id NOT IN (
            SELECT MIN(id) 
            FROM destajistas 
            GROUP BY nombre
          )
       `);
       await db.run(`
          DELETE FROM actividades 
          WHERE id NOT IN (
            SELECT MIN(id) 
            FROM actividades 
            GROUP BY nombre
          )
       `);
    }

    try {
      await db.run(`CREATE UNIQUE INDEX idx_destajistas_nombre ON destajistas(nombre)`);
    } catch(e) {}
    try {
      await db.run(`CREATE UNIQUE INDEX idx_actividades_nombre ON actividades(nombre)`);
    } catch(e) {}

  } catch (e) {
    console.error("Error cleaning up master data:", e);
  }

  const insertIgnore = db.isMySQL ? "INSERT IGNORE" : "INSERT OR IGNORE";

  const destajistasList = [
    "FRANCISCO ZARRAZAGA CONTRERAS", "EMMANUEL ZARRAZAGA GAMAS", "FRANCISCO JAVIER ZARRAZAGA GAMAS",
    "MIGUEL ANGEL QUIROGA JIMENEZ", "FELIPE REYES JIMENEZ", "CECILIO FUENTE DE LA CRUZ",
    "ROGER ROSADO JIMENEZ", "BAIBY RUTH DE LA CRUZ GOMEZ", "JOSE EDUARDO HERNANDEZ ESCALANTE",
    "JUAN ENRIQUE VERA HERNANDEZ", "LUIS ALBERTO MAY PEREZ", "ELIAZAR CRUZ CRUZ",
    "JOSE A. OVANDO RICARDEZ", "FRANCISCO MACIEL MAGAÑA", "ALBERTO CRUZ HERNANDEZ",
    "MIGUEL ANGEL RAMIREZ JIMENEZ", "ROMEL PEREZ HERNANDEZ", "DANIEL MARQUEZ GIL",
    "VICTOR ALFONSO RODRIGUEZ VALDEZ", "VICTOR MANUEL CASTILLO"
  ].map(n => n.trim().toUpperCase());

  // Remove destajistas not in list (only if no captures)
  // This is tricky with async. Let's skip for now or implement carefully.
  // For seeding, maybe just inserting missing ones is enough.
  // The original code deleted ones not in list.
  // Let's keep it simple: just insert missing ones.
  for (const n of destajistasList) {
    await db.run(`${insertIgnore} INTO destajistas (nombre) VALUES (?)`, [n]);
  }

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
  for (const [n, p] of actividadesList) {
    await db.run(`${insertIgnore} INTO actividades (nombre, precio) VALUES (?, ?)`, [n.trim().toUpperCase(), p]);
  }

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
  for (const [p, m, l] of ubicacionesRaw) {
    await db.run(`${insertIgnore} INTO ubicaciones (paquete, manzana, lote) VALUES (?, ?, ?)`, [p, m, l]);
  }

  // Seed user
  await db.run(`${insertIgnore} INTO users (username, password, avatar, role) VALUES (?, ?, ?, ?)`, 
    ["ArmandoL", "rabito31", "https://api.dicebear.com/7.x/avataaars/svg?seed=ArmandoL", "supervisor"]);

  // Sample capture
  const countRes = await db.get("SELECT COUNT(*) as count FROM capturas");
  if (countRes && countRes.count === 0) {
    const d1 = await db.get("SELECT id FROM destajistas LIMIT 1");
    const a1 = await db.get("SELECT id FROM actividades LIMIT 1");
    if (d1 && a1) {
      await db.run(`
        INSERT INTO capturas (destajista_id, actividad_id, paquete, manzana, lotes, semana, cantidad)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [d1.id, a1.id, "E", "98", "1, 2", 1, 2]);
    }
  }
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1); // Trust Railway proxy for secure cookies
  const httpServer = createHttpServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  app.use(express.json());
  
  // Health check route - MUST be before other middlewares to be fast
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      env: process.env.NODE_ENV,
      db: db.isMySQL ? "MySQL" : "SQLite",
      time: new Date().toISOString()
    });
  });

  app.use(cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'default-secret'],
    maxAge: 30 * 24 * 60 * 60 * 1000,
    secure: true, // Required for SameSite=None
    sameSite: 'none', // Required for cross-origin iframe
    httpOnly: true
  }));

  // Auth Routes
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Usuario y contraseña son requeridos" });
    }
    
    try {
      const user = await db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password]);
      
      if (!user) {
        return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
      }

      if (req.session) {
        req.session.user = {
          name: user.username,
          avatar: user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`,
          role: user.role || 'supervisor'
        };
      }
      res.json({ success: true, user: req.session?.user });
    } catch (e) {
      res.status(500).json({ error: "Error de servidor" });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Usuario y contraseña son requeridos" });
    }

    try {
      const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
      const userRole = role || 'capturista';
      await db.run("INSERT INTO users (username, password, avatar, role) VALUES (?, ?, ?, ?)", [username, password, avatar, userRole]);
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

  // User Management
  app.get("/api/users", async (req, res) => {
    try {
      const rows = await db.query("SELECT id, username, avatar, role, created_at FROM users ORDER BY username");
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "Error al obtener usuarios" });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    const id = req.params.id;
    try {
      const userToDelete = await db.get("SELECT username FROM users WHERE id = ?", [id]);
      
      if (!userToDelete) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      if (userToDelete.username === 'ArmandoL') {
        return res.status(403).json({ error: "No se puede eliminar el usuario administrador principal" });
      }

      const result = await db.run("DELETE FROM users WHERE id = ?", [id]);
      if (result.changes > 0) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "No se pudo eliminar el usuario" });
      }
    } catch (e) {
      console.error("Error deleting user:", e);
      res.status(500).json({ error: "Error al eliminar el usuario" });
    }
  });

  // Socket.io
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  // API Routes
  app.get("/api/destajistas", async (req, res) => {
    try {
      const rows = await db.query("SELECT * FROM destajistas ORDER BY nombre");
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "Error al obtener destajistas" });
    }
  });

  app.post("/api/destajistas", async (req, res) => {
    const { nombre } = req.body;
    const normalizedNombre = nombre.trim().toUpperCase();
    try {
      const info = await db.run("INSERT INTO destajistas (nombre) VALUES (?)", [normalizedNombre]);
      io.emit("data_changed", { type: "destajistas" });
      res.json({ id: info.insertId });
    } catch (e) {
      res.status(400).json({ error: "El destajista ya existe" });
    }
  });

  app.put("/api/destajistas/:id", async (req, res) => {
    const { nombre } = req.body;
    const normalizedNombre = nombre.trim().toUpperCase();
    try {
      await db.run("UPDATE destajistas SET nombre = ? WHERE id = ?", [normalizedNombre, req.params.id]);
      io.emit("data_changed", { type: "destajistas" });
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Error al actualizar el destajista" });
    }
  });

  app.delete("/api/destajistas/:id", async (req, res) => {
    const id = req.params.id;
    try {
      await db.transaction(async (tx) => {
        await tx.run("DELETE FROM capturas WHERE destajista_id = ?", [id]);
        await tx.run("DELETE FROM destajistas WHERE id = ?", [id]);
      });
      
      io.emit("data_changed", { type: "destajistas" });
      res.json({ success: true });
    } catch (e) {
      console.error("Error deleting destajista:", e);
      res.status(500).json({ error: "Error al eliminar el destajista" });
    }
  });

  app.get("/api/actividades", async (req, res) => {
    try {
      const rows = await db.query("SELECT * FROM actividades ORDER BY nombre");
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "Error al obtener actividades" });
    }
  });

  app.post("/api/actividades", async (req, res) => {
    const { nombre, precio } = req.body;
    const normalizedNombre = nombre.trim().toUpperCase();
    try {
      const info = await db.run("INSERT INTO actividades (nombre, precio) VALUES (?, ?)", [normalizedNombre, precio]);
      io.emit("data_changed", { type: "actividades" });
      res.json({ id: info.insertId });
    } catch (e) {
      res.status(400).json({ error: "La actividad ya existe" });
    }
  });

  app.put("/api/actividades/:id", async (req, res) => {
    const { nombre, precio } = req.body;
    const normalizedNombre = nombre.trim().toUpperCase();
    try {
      await db.run("UPDATE actividades SET nombre = ?, precio = ? WHERE id = ?", [normalizedNombre, precio, req.params.id]);
      io.emit("data_changed", { type: "actividades" });
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Error al actualizar la actividad" });
    }
  });

  app.delete("/api/actividades/:id", async (req, res) => {
    const id = req.params.id;
    try {
      await db.transaction(async (tx) => {
        await tx.run("DELETE FROM capturas WHERE actividad_id = ?", [id]);
        await tx.run("DELETE FROM actividades WHERE id = ?", [id]);
      });
      
      io.emit("data_changed", { type: "actividades" });
      res.json({ success: true });
    } catch (e) {
      console.error("Error deleting actividad:", e);
      res.status(500).json({ error: "Error al eliminar la actividad" });
    }
  });

  app.get("/api/ubicaciones", async (req, res) => {
    try {
      const rows = await db.query("SELECT * FROM ubicaciones ORDER BY paquete, manzana, lote");
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "Error al obtener ubicaciones" });
    }
  });

  app.post("/api/ubicaciones", async (req, res) => {
    const data = req.body;
    try {
      const insertIgnore = db.isMySQL ? "INSERT IGNORE" : "INSERT OR IGNORE";
      const sql = `${insertIgnore} INTO ubicaciones (paquete, manzana, lote) VALUES (?, ?, ?)`;
      
      if (Array.isArray(data)) {
        await db.transaction(async (tx) => {
          for (const item of data) {
            await tx.run(sql, [item.paquete, item.manzana, item.lote]);
          }
        });
        io.emit("data_changed", { type: "ubicaciones" });
        res.json({ success: true, count: data.length });
      } else {
        const { paquete, manzana, lote } = data;
        const info = await db.run(sql, [paquete, manzana, lote]);
        io.emit("data_changed", { type: "ubicaciones" });
        res.json({ id: info.insertId });
      }
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete("/api/ubicaciones/:id", async (req, res) => {
    try {
      await db.run("DELETE FROM ubicaciones WHERE id = ?", [req.params.id]);
      io.emit("data_changed", { type: "ubicaciones" });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Error al eliminar ubicación" });
    }
  });

  app.get("/api/capturas", async (req, res) => {
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
    try {
      const rows = await db.query(query, params);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "Error al obtener capturas" });
    }
  });

  app.post("/api/capturas", async (req, res) => {
    const data = req.body;
    const user = req.session?.user;
    
    try {
      const checkDuplicate = async (tx: DB, destajista_id: number, actividad_id: number, paquete: string, manzana: string, lotes: string) => {
        const existing = await tx.query(`
          SELECT lotes FROM capturas 
          WHERE destajista_id = ? AND actividad_id = ? AND paquete = ? AND manzana = ?
        `, [destajista_id, actividad_id, paquete, manzana]) as { lotes: string }[];

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

      const insertSql = `
        INSERT INTO capturas (destajista_id, actividad_id, paquete, manzana, lotes, semana, cantidad, usuario_nombre, usuario_avatar)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      if (Array.isArray(data)) {
        await db.transaction(async (tx) => {
          for (const item of data) {
            const duplicateLote = await checkDuplicate(
              tx,
              item.destajista_id, 
              item.actividad_id, 
              item.paquete, 
              item.manzana, 
              item.lotes
            );

            if (duplicateLote) {
              throw new Error(`El lote ${duplicateLote} ya fue pagado para esta actividad a este destajista.`);
            }

            await tx.run(insertSql, [
              item.destajista_id, 
              item.actividad_id, 
              item.paquete, 
              item.manzana, 
              item.lotes, 
              item.semana, 
              item.cantidad,
              user?.name || 'Anónimo',
              user?.avatar || '👤'
            ]);
          }
        });
        io.emit("data_changed", { type: "capturas" });
        res.json({ success: true, count: data.length });
      } else {
        const { destajista_id, actividad_id, paquete, manzana, lotes, semana, cantidad } = data;
        
        const duplicateLote = await checkDuplicate(db, destajista_id, actividad_id, paquete, manzana, lotes);
        if (duplicateLote) {
          return res.status(400).json({ error: `El lote ${duplicateLote} ya fue pagado para esta actividad a este destajista.` });
        }

        const info = await db.run(insertSql, [
          destajista_id, 
          actividad_id, 
          paquete, 
          manzana, 
          lotes, 
          semana, 
          cantidad,
          user?.name || 'Anónimo',
          user?.avatar || '👤'
        ]);
        io.emit("data_changed", { type: "capturas" });
        res.json({ id: info.insertId });
      }
    } catch (error: any) {
      console.error("Error saving captures:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/capturas/:id", async (req, res) => {
    try {
      await db.run("DELETE FROM capturas WHERE id = ?", [req.params.id]);
      io.emit("data_changed", { type: "capturas" });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Error al eliminar captura" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    const indexPath = path.join(distPath, "index.html");
    
    console.log(`Production mode: serving static files from ${distPath}`);
    if (fs.existsSync(indexPath)) {
      console.log("index.html found in dist folder.");
    } else {
      console.error("CRITICAL: index.html NOT found in dist folder! Build might have failed.");
      // List files in dist to help debug
      if (fs.existsSync(distPath)) {
        console.log("Files in dist:", fs.readdirSync(distPath));
      } else {
        console.error("dist folder does not even exist!");
      }
    }

    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Application not built correctly. index.html missing.");
      }
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    
    // Initialize database AFTER server starts listening
    console.log("Initializing database in background...");
    initDB()
      .then(() => console.log("Database initialized successfully."))
      .catch(error => console.error("Failed to initialize database:", error));
  });
}

startServer();
