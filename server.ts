import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer as createHttpServer } from "http";
import { Server } from "socket.io";
import mysql from "mysql2/promise";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import cookieSession from "cookie-session";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración de la base de datos para Railway
// Prioriza la variable de entorno MYSQL_URL, de lo contrario usa la red interna de Railway
const MYSQL_INTERNAL_URL = "mysql://root:ztnhZRvsWMfrONQwQqHYakTTAAYYLVxA@mysql.railway.internal:3306/railway";
const mysqlUrl = process.env.MYSQL_URL || MYSQL_INTERNAL_URL;

console.log("Configurando conexión a base de datos...");
if (mysqlUrl === MYSQL_INTERNAL_URL) {
  console.log("📢 Usando configuración predeterminada para red interna de Railway.");
}

const pool = mysql.createPool({
  uri: mysqlUrl,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Initialize Database
async function initDb() {
  const connection = await pool.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS destajistas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL UNIQUE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS actividades (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL UNIQUE,
        precio DECIMAL(10, 2) NOT NULL
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS ubicaciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        paquete VARCHAR(50) NOT NULL,
        manzana VARCHAR(50) NOT NULL,
        lote VARCHAR(50) NOT NULL,
        UNIQUE(paquete, manzana, lote)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS capturas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        destajista_id INT NOT NULL,
        actividad_id INT NOT NULL,
        paquete VARCHAR(50) NOT NULL,
        manzana VARCHAR(50) NOT NULL,
        lotes TEXT NOT NULL,
        semana INT NOT NULL,
        cantidad INT NOT NULL,
        usuario_nombre VARCHAR(255),
        usuario_avatar TEXT,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (destajista_id) REFERENCES destajistas (id),
        FOREIGN KEY (actividad_id) REFERENCES actividades (id)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        avatar TEXT,
        role VARCHAR(50) DEFAULT 'supervisor',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration to add user columns if they don't exist
    try {
      await connection.query("ALTER TABLE capturas ADD COLUMN usuario_nombre VARCHAR(255)");
    } catch (e) {}
    try {
      await connection.query("ALTER TABLE capturas ADD COLUMN usuario_avatar TEXT");
    } catch (e) {}
    try {
      await connection.query("ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'supervisor'");
    } catch (e) {}

    await seedData(connection);
  } catch (error) {
    console.error("Database initialization error:", error);
  } finally {
    connection.release();
  }
}

// Seed initial data
const seedData = async (connection: mysql.PoolConnection) => {
  // Clean up duplicates and ensure uniqueness
  try {
    // 1. Normalize names (trim and uppercase) for existing data
    await connection.query(`UPDATE destajistas SET nombre = UPPER(TRIM(nombre))`);
    
    // 2. Delete duplicates keeping only the one with the lowest ID
    await connection.query(`
      DELETE FROM destajistas 
      WHERE id NOT IN (
        SELECT id FROM (
          SELECT MIN(id) as id
          FROM destajistas 
          GROUP BY nombre
        ) as t
      )
    `);
    
    // 3. Clean up duplicate activities
    await connection.query(`
      DELETE FROM actividades 
      WHERE id NOT IN (
        SELECT id FROM (
          SELECT MIN(id) as id
          FROM actividades 
          GROUP BY nombre
        ) as t
      )
    `);
  } catch (e) {
    console.error("Error cleaning up master data:", e);
  }

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

  for (const n of destajistasList) {
    await connection.query("INSERT IGNORE INTO destajistas (nombre) VALUES (?)", [n]);
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
    await connection.query("INSERT IGNORE INTO actividades (nombre, precio) VALUES (?, ?)", [n.trim().toUpperCase(), p]);
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
    await connection.query("INSERT IGNORE INTO ubicaciones (paquete, manzana, lote) VALUES (?, ?, ?)", [p, m, l]);
  }

  // Seed initial user
  await connection.query("INSERT IGNORE INTO users (username, password, avatar, role) VALUES (?, ?, ?, ?)", ["ArmandoL", "rabito31", "https://api.dicebear.com/7.x/avataaars/svg?seed=ArmandoL", "supervisor"]);

  // Add some sample captures if none exist
  const [capturesCountRows] = await connection.query("SELECT COUNT(*) as count FROM capturas") as any;
  if (capturesCountRows[0].count === 0) {
    const [d1Rows] = await connection.query("SELECT id FROM destajistas LIMIT 1") as any;
    const [a1Rows] = await connection.query("SELECT id FROM actividades LIMIT 1") as any;
    if (d1Rows[0] && a1Rows[0]) {
      await connection.query(`
        INSERT INTO capturas (destajista_id, actividad_id, paquete, manzana, lotes, semana, cantidad)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [d1Rows[0].id, a1Rows[0].id, "E", "98", "1, 2", 1, 2]);
    }
  }
};

async function startServer() {
  console.log("Intentando conectar a MySQL...");
  try {
    const connection = await pool.getConnection();
    console.log("✅ Conexión a MySQL establecida con éxito.");
    connection.release();
  } catch (error: any) {
    console.error("❌ Error crítico al conectar a MySQL:");
    console.error(`Mensaje: ${error.message}`);
    console.error(`Código: ${error.code}`);
    console.error("Asegúrate de que MYSQL_URL sea correcta y accesible.");
    // No detenemos el servidor para permitir que Vite siga funcionando, 
    // pero las rutas de API fallarán hasta que se corrija la conexión.
  }

  await initDb();
  const app = express();
  const httpServer = createHttpServer(app);
  const io = new Server(httpServer, {
    path: "/socket.io/",
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
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Usuario y contraseña son requeridos" });
    }
    
    const [rows] = await pool.query("SELECT * FROM users WHERE username = ? AND password = ?", [username, password]) as any;
    const user = rows[0];
    
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
  });

  app.post("/api/auth/register", async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Usuario y contraseña son requeridos" });
    }

    try {
      const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
      const userRole = role || 'capturista';
      await pool.query("INSERT INTO users (username, password, avatar, role) VALUES (?, ?, ?, ?)", [username, password, avatar, userRole]);
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

  // User Management Routes
  app.get("/api/users", async (req, res) => {
    const [rows] = await pool.query("SELECT id, username, avatar, role, created_at FROM users ORDER BY username");
    res.json(rows);
  });

  app.delete("/api/users/:id", async (req, res) => {
    const id = req.params.id;
    try {
      // Don't allow deleting ArmandoL
      const [rows] = await pool.query("SELECT username FROM users WHERE id = ?", [id]) as any;
      const userToDelete = rows[0];
      
      if (!userToDelete) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      if (userToDelete.username === 'ArmandoL') {
        return res.status(403).json({ error: "No se puede eliminar el usuario administrador principal" });
      }

      const [result] = await pool.query("DELETE FROM users WHERE id = ?", [id]) as any;
      if (result.affectedRows > 0) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "No se pudo eliminar el usuario" });
      }
    } catch (e) {
      console.error("Error deleting user:", e);
      res.status(500).json({ error: "Error al eliminar el usuario" });
    }
  });

  // Socket.io connection handling
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  // API Routes
  app.get("/api/destajistas", async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM destajistas ORDER BY nombre");
    res.json(rows);
  });

  app.post("/api/destajistas", async (req, res) => {
    const { nombre } = req.body;
    const normalizedNombre = nombre.trim().toUpperCase();
    try {
      const [result] = await pool.query("INSERT INTO destajistas (nombre) VALUES (?)", [normalizedNombre]) as any;
      io.emit("data_changed", { type: "destajistas" });
      res.json({ id: result.insertId });
    } catch (e) {
      res.status(400).json({ error: "El destajista ya existe" });
    }
  });

  app.put("/api/destajistas/:id", async (req, res) => {
    const { nombre } = req.body;
    const normalizedNombre = nombre.trim().toUpperCase();
    try {
      await pool.query("UPDATE destajistas SET nombre = ? WHERE id = ?", [normalizedNombre, req.params.id]);
      io.emit("data_changed", { type: "destajistas" });
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Error al actualizar el destajista" });
    }
  });

  app.delete("/api/destajistas/:id", async (req, res) => {
    const id = req.params.id;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query("DELETE FROM capturas WHERE destajista_id = ?", [id]);
      await connection.query("DELETE FROM destajistas WHERE id = ?", [id]);
      await connection.commit();
      
      io.emit("data_changed", { type: "destajistas" });
      res.json({ success: true });
    } catch (e) {
      await connection.rollback();
      console.error("Error deleting destajista:", e);
      res.status(500).json({ error: "Error al eliminar el destajista" });
    } finally {
      connection.release();
    }
  });

  app.get("/api/actividades", async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM actividades ORDER BY nombre");
    res.json(rows);
  });

  app.post("/api/actividades", async (req, res) => {
    const { nombre, precio } = req.body;
    const normalizedNombre = nombre.trim().toUpperCase();
    try {
      const [result] = await pool.query("INSERT INTO actividades (nombre, precio) VALUES (?, ?)", [normalizedNombre, precio]) as any;
      io.emit("data_changed", { type: "actividades" });
      res.json({ id: result.insertId });
    } catch (e) {
      res.status(400).json({ error: "La actividad ya existe" });
    }
  });

  app.put("/api/actividades/:id", async (req, res) => {
    const { nombre, precio } = req.body;
    const normalizedNombre = nombre.trim().toUpperCase();
    try {
      await pool.query("UPDATE actividades SET nombre = ?, precio = ? WHERE id = ?", [normalizedNombre, precio, req.params.id]);
      io.emit("data_changed", { type: "actividades" });
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Error al actualizar la actividad" });
    }
  });

  app.delete("/api/actividades/:id", async (req, res) => {
    const id = req.params.id;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query("DELETE FROM capturas WHERE actividad_id = ?", [id]);
      await connection.query("DELETE FROM actividades WHERE id = ?", [id]);
      await connection.commit();
      
      io.emit("data_changed", { type: "actividades" });
      res.json({ success: true });
    } catch (e) {
      await connection.rollback();
      console.error("Error deleting actividad:", e);
      res.status(500).json({ error: "Error al eliminar la actividad" });
    } finally {
      connection.release();
    }
  });

  app.get("/api/ubicaciones", async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM ubicaciones ORDER BY paquete, manzana, lote");
    res.json(rows);
  });

  app.post("/api/ubicaciones", async (req, res) => {
    const data = req.body;
    const connection = await pool.getConnection();
    try {
      if (Array.isArray(data)) {
        await connection.beginTransaction();
        for (const item of data) {
          await connection.query("INSERT IGNORE INTO ubicaciones (paquete, manzana, lote) VALUES (?, ?, ?)", [item.paquete, item.manzana, item.lote]);
        }
        await connection.commit();
        io.emit("data_changed", { type: "ubicaciones" });
        res.json({ success: true, count: data.length });
      } else {
        const { paquete, manzana, lote } = data;
        const [result] = await connection.query("INSERT IGNORE INTO ubicaciones (paquete, manzana, lote) VALUES (?, ?, ?)", [paquete, manzana, lote]) as any;
        io.emit("data_changed", { type: "ubicaciones" });
        res.json({ id: result.insertId });
      }
    } catch (e: any) {
      if (Array.isArray(data)) await connection.rollback();
      res.status(400).json({ error: e.message });
    } finally {
      connection.release();
    }
  });

  app.delete("/api/ubicaciones/:id", async (req, res) => {
    await pool.query("DELETE FROM ubicaciones WHERE id = ?", [req.params.id]);
    io.emit("data_changed", { type: "ubicaciones" });
    res.json({ success: true });
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
    const [rows] = await pool.query(query, params);
    res.json(rows);
  });

  app.post("/api/capturas", async (req, res) => {
    const data = req.body;
    const user = req.session?.user;
    const connection = await pool.getConnection();
    
    try {
      const checkDuplicate = async (destajista_id: number, actividad_id: number, paquete: string, manzana: string, lotes: string) => {
        const [existing] = await connection.query(`
          SELECT lotes FROM capturas 
          WHERE destajista_id = ? AND actividad_id = ? AND paquete = ? AND manzana = ?
        `, [destajista_id, actividad_id, paquete, manzana]) as any[];

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

      if (Array.isArray(data)) {
        await connection.beginTransaction();
        for (const item of data) {
          const duplicateLote = await checkDuplicate(
            item.destajista_id, 
            item.actividad_id, 
            item.paquete, 
            item.manzana, 
            item.lotes
          );

          if (duplicateLote) {
            throw new Error(`El lote ${duplicateLote} ya fue pagado para esta actividad a este destajista.`);
          }

          await connection.query(`
            INSERT INTO capturas (destajista_id, actividad_id, paquete, manzana, lotes, semana, cantidad, usuario_nombre, usuario_avatar)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
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
        await connection.commit();
        io.emit("data_changed", { type: "capturas" });
        res.json({ success: true, count: data.length });
      } else {
        const { destajista_id, actividad_id, paquete, manzana, lotes, semana, cantidad } = data;
        
        const duplicateLote = await checkDuplicate(destajista_id, actividad_id, paquete, manzana, lotes);
        if (duplicateLote) {
          return res.status(400).json({ error: `El lote ${duplicateLote} ya fue pagado para esta actividad a este destajista.` });
        }

        const [result] = await connection.query(`
          INSERT INTO capturas (destajista_id, actividad_id, paquete, manzana, lotes, semana, cantidad, usuario_nombre, usuario_avatar)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          destajista_id, 
          actividad_id, 
          paquete, 
          manzana, 
          lotes, 
          semana, 
          cantidad,
          user?.name || 'Anónimo',
          user?.avatar || '👤'
        ]) as any;
        io.emit("data_changed", { type: "capturas" });
        res.json({ id: result.insertId });
      }
    } catch (error: any) {
      if (Array.isArray(data)) await connection.rollback();
      console.error("Error saving captures:", error);
      res.status(400).json({ error: error.message });
    } finally {
      connection.release();
    }
  });

  app.delete("/api/capturas/:id", async (req, res) => {
    await pool.query("DELETE FROM capturas WHERE id = ?", [req.params.id]);
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
