import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer as createHttpServer } from "http";
import { Server } from "socket.io";
import { Pool } from "pg";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import cookieSession from "cookie-session";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Database
const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS destajistas (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS actividades (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL UNIQUE,
      precio REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ubicaciones (
      id SERIAL PRIMARY KEY,
      paquete TEXT NOT NULL,
      manzana TEXT NOT NULL,
      lote TEXT NOT NULL,
      UNIQUE(paquete, manzana, lote)
    );

    CREATE TABLE IF NOT EXISTS capturas (
      id SERIAL PRIMARY KEY,
      destajista_id INTEGER NOT NULL,
      actividad_id INTEGER NOT NULL,
      paquete TEXT NOT NULL,
      manzana TEXT NOT NULL,
      lotes TEXT NOT NULL,
      semana INTEGER NOT NULL,
      cantidad INTEGER NOT NULL,
      usuario_nombre TEXT,
      usuario_avatar TEXT,
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (destajista_id) REFERENCES destajistas (id),
      FOREIGN KEY (actividad_id) REFERENCES actividades (id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      avatar TEXT,
      role TEXT DEFAULT 'supervisor',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
};
initDb();

// Migration to add user columns if they don't exist
const runMigrations = async () => {
  try {
    await pool.query("ALTER TABLE capturas ADD COLUMN IF NOT EXISTS usuario_nombre TEXT");
    await pool.query("ALTER TABLE capturas ADD COLUMN IF NOT EXISTS usuario_avatar TEXT");
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'supervisor'");
  } catch (e) {
    console.error("Migration error:", e);
  }
};
runMigrations();

// Seed initial data
const seedData = async () => {
  try {
    // 1. Normalize names (trim and uppercase) for existing data
    await pool.query(`UPDATE destajistas SET nombre = UPPER(TRIM(nombre))`);
    
    // 2. Delete duplicates keeping only the one with the lowest ID
    await pool.query(`
      DELETE FROM destajistas 
      WHERE id NOT IN (
        SELECT MIN(id) 
        FROM destajistas 
        GROUP BY nombre
      )
    `);
    
    // 3. Create a unique index if it doesn't exist
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_destajistas_nombre ON destajistas(nombre)`);

    // 4. Clean up duplicate activities
    await pool.query(`
      DELETE FROM actividades 
      WHERE id NOT IN (
        SELECT MIN(id) 
        FROM actividades 
        GROUP BY nombre
      )
    `);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_actividades_nombre ON actividades(nombre)`);
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

  for (const nombre of destajistasList) {
    await pool.query("INSERT INTO destajistas (nombre) VALUES ($1) ON CONFLICT(nombre) DO NOTHING", [nombre]);
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
    await pool.query("INSERT INTO actividades (nombre, precio) VALUES ($1, $2) ON CONFLICT(nombre) DO NOTHING", [n.trim().toUpperCase(), p]);
  }

  // Seed initial user
  await pool.query("INSERT INTO users (username, password, avatar, role) VALUES ($1, $2, $3, $4) ON CONFLICT(username) DO NOTHING", 
    ["ArmandoL", "rabito31", "https://api.dicebear.com/7.x/avataaars/svg?seed=ArmandoL", "supervisor"]);
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
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Usuario y contraseña son requeridos" });
    }
    
    const result = await pool.query("SELECT * FROM users WHERE username = $1 AND password = $2", [username, password]);
    const user = result.rows[0];
    
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
      await pool.query("INSERT INTO users (username, password, avatar, role) VALUES ($1, $2, $3, $4)", [username, password, avatar, userRole]);
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
    const result = await pool.query("SELECT id, username, avatar, role, created_at FROM users ORDER BY username");
    res.json(result.rows);
  });

  app.delete("/api/users/:id", async (req, res) => {
    const id = req.params.id;
    try {
      // Don't allow deleting ArmandoL
      const userToDeleteResult = await pool.query("SELECT username FROM users WHERE id = $1", [id]);
      const userToDelete = userToDeleteResult.rows[0];
      
      if (!userToDelete) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      if (userToDelete.username === 'ArmandoL') {
        return res.status(403).json({ error: "No se puede eliminar el usuario administrador principal" });
      }

      const result = await pool.query("DELETE FROM users WHERE id = $1", [id]);
      if (result.rowCount && result.rowCount > 0) {
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
    const result = await pool.query("SELECT * FROM destajistas ORDER BY nombre");
    res.json(result.rows);
  });

  app.post("/api/destajistas", async (req, res) => {
    const { nombre } = req.body;
    const normalizedNombre = nombre.trim().toUpperCase();
    try {
      const result = await pool.query("INSERT INTO destajistas (nombre) VALUES ($1) RETURNING id", [normalizedNombre]);
      io.emit("data_changed", { type: "destajistas" });
      res.json({ id: result.rows[0].id });
    } catch (e) {
      res.status(400).json({ error: "El destajista ya existe" });
    }
  });

  app.put("/api/destajistas/:id", async (req, res) => {
    const { nombre } = req.body;
    const normalizedNombre = nombre.trim().toUpperCase();
    try {
      await pool.query("UPDATE destajistas SET nombre = $1 WHERE id = $2", [normalizedNombre, req.params.id]);
      io.emit("data_changed", { type: "destajistas" });
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Error al actualizar el destajista" });
    }
  });

  app.delete("/api/destajistas/:id", async (req, res) => {
    const id = req.params.id;
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM capturas WHERE destajista_id = $1", [id]);
        await client.query("DELETE FROM destajistas WHERE id = $1", [id]);
        await client.query("COMMIT");
        io.emit("data_changed", { type: "destajistas" });
        res.json({ success: true });
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      console.error("Error deleting destajista:", e);
      res.status(500).json({ error: "Error al eliminar el destajista" });
    }
  });

  app.get("/api/actividades", async (req, res) => {
    const result = await pool.query("SELECT * FROM actividades ORDER BY nombre");
    res.json(result.rows);
  });

  app.post("/api/actividades", async (req, res) => {
    const { nombre, precio } = req.body;
    const normalizedNombre = nombre.trim().toUpperCase();
    try {
      const result = await pool.query("INSERT INTO actividades (nombre, precio) VALUES ($1, $2) RETURNING id", [normalizedNombre, precio]);
      io.emit("data_changed", { type: "actividades" });
      res.json({ id: result.rows[0].id });
    } catch (e) {
      res.status(400).json({ error: "La actividad ya existe" });
    }
  });

  app.put("/api/actividades/:id", async (req, res) => {
    const { nombre, precio } = req.body;
    const normalizedNombre = nombre.trim().toUpperCase();
    try {
      await pool.query("UPDATE actividades SET nombre = $1, precio = $2 WHERE id = $3", [normalizedNombre, precio, req.params.id]);
      io.emit("data_changed", { type: "actividades" });
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Error al actualizar la actividad" });
    }
  });

  app.delete("/api/actividades/:id", async (req, res) => {
    const id = req.params.id;
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM capturas WHERE actividad_id = $1", [id]);
        await client.query("DELETE FROM actividades WHERE id = $1", [id]);
        await client.query("COMMIT");
        io.emit("data_changed", { type: "actividades" });
        res.json({ success: true });
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      console.error("Error deleting actividad:", e);
      res.status(500).json({ error: "Error al eliminar la actividad" });
    }
  });

  app.get("/api/ubicaciones", async (req, res) => {
    const result = await pool.query("SELECT * FROM ubicaciones ORDER BY paquete, manzana, lote");
    res.json(result.rows);
  });

  app.post("/api/ubicaciones", async (req, res) => {
    const data = req.body;
    try {
      if (Array.isArray(data)) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          for (const item of data) {
            await client.query("INSERT INTO ubicaciones (paquete, manzana, lote) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [item.paquete, item.manzana, item.lote]);
          }
          await client.query("COMMIT");
          io.emit("data_changed", { type: "ubicaciones" });
          res.json({ success: true, count: data.length });
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      } else {
        const { paquete, manzana, lote } = data;
        const result = await pool.query("INSERT INTO ubicaciones (paquete, manzana, lote) VALUES ($1, $2, $3) RETURNING id", [paquete, manzana, lote]);
        io.emit("data_changed", { type: "ubicaciones" });
        res.json({ id: result.rows[0].id });
      }
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete("/api/ubicaciones/:id", async (req, res) => {
    await pool.query("DELETE FROM ubicaciones WHERE id = $1", [req.params.id]);
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
    let paramCount = 1;

    if (semana) {
      query += ` AND c.semana = $${paramCount++}`;
      params.push(semana);
    }
    if (destajista_id) {
      query += ` AND c.destajista_id = $${paramCount++}`;
      params.push(destajista_id);
    }

    query += " ORDER BY c.fecha_creacion DESC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  });

  app.post("/api/capturas", async (req, res) => {
    const data = req.body;
    const user = req.session?.user;
    
    try {
      const checkDuplicate = async (destajista_id: number, actividad_id: number, paquete: string, manzana: string, lotes: string) => {
        const result = await pool.query(`
          SELECT lotes FROM capturas 
          WHERE destajista_id = $1 AND actividad_id = $2 AND paquete = $3 AND manzana = $4
        `, [destajista_id, actividad_id, paquete, manzana]);

        const newLotes = lotes.split(',').map(l => l.trim()).filter(l => l !== "");
        
        for (const row of result.rows) {
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
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
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

            await client.query(`
              INSERT INTO capturas (destajista_id, actividad_id, paquete, manzana, lotes, semana, cantidad, usuario_nombre, usuario_avatar)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
          await client.query("COMMIT");
          io.emit("data_changed", { type: "capturas" });
          res.json({ success: true, count: data.length });
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      } else {
        const { destajista_id, actividad_id, paquete, manzana, lotes, semana, cantidad } = data;
        
        const duplicateLote = await checkDuplicate(destajista_id, actividad_id, paquete, manzana, lotes);
        if (duplicateLote) {
          return res.status(400).json({ error: `El lote ${duplicateLote} ya fue pagado para esta actividad a este destajista.` });
        }

        const result = await pool.query(`
          INSERT INTO capturas (destajista_id, actividad_id, paquete, manzana, lotes, semana, cantidad, usuario_nombre, usuario_avatar)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id
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
        ]);
        io.emit("data_changed", { type: "capturas" });
        res.json({ id: result.rows[0].id });
      }
    } catch (error: any) {
      console.error("Error saving captures:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/capturas/:id", async (req, res) => {
    await pool.query("DELETE FROM capturas WHERE id = $1", [req.params.id]);
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
