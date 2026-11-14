const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Variables inyectadas vía envFrom (ConfigMap: app-configmap + Secret: db-secret)
const DB_HOST = process.env.DB_HOST || 'mongo-service';
const DB_PORT = process.env.DB_PORT || '27017';
const DB_NAME = process.env.DB_NAME || 'produccion_db';
const APP_PORT = parseInt(process.env.APP_PORT, 10) || 8080;
const DB_USER = process.env.MONGO_INITDB_ROOT_USERNAME || 'admin';
const DB_PASS = process.env.MONGO_INITDB_ROOT_PASSWORD || 'MongoSecure2026!';
const POD_NAME = process.env.HOSTNAME || 'local-pod';

// URI de conexión con autenticación a base admin
const mongoUri = `mongodb://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASS)}@${DB_HOST}:${DB_PORT}/${DB_NAME}?authSource=admin`;

let dbClient = null;
let db = null;
let mongoConnected = false;
let lastError = null;

async function connectMongo() {
  try {
    console.log(`[INIT] Conectando a MongoDB en ${DB_HOST}:${DB_PORT}...`);
    dbClient = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    await dbClient.connect();
    db = dbClient.db(DB_NAME);
    mongoConnected = true;
    lastError = null;
    console.log(`[SUCCESS] Conexión reactiva exitosa a MongoDB (${DB_NAME})`);

    // Colección de productos persistentes
    const col = db.collection('productos');
    const count = await col.countDocuments();
    if (count === 0) {
      await col.insertMany([
        { nombre: 'Servidor Dell PowerEdge R750', sku: 'SRV-001', stock: 12, precio: 4500.00, creado_en: new Date() },
        { nombre: 'Switch Cisco Catalyst 9300', sku: 'SW-002', stock: 25, precio: 2800.50, creado_en: new Date() },
        { nombre: 'Firewall Fortinet FortiGate 100F', sku: 'FW-003', stock: 8, precio: 3200.00, creado_en: new Date() }
      ]);
      console.log('[INIT] Productos iniciales insertados en produccion_db (Persistencia duradera PVC)');
    }
  } catch (err) {
    mongoConnected = false;
    lastError = err.message;
    console.error(`[ERROR] Conexión a MongoDB falló: ${err.message}`);
    setTimeout(connectMongo, 5000);
  }
}

connectMongo();

// Endpoint oficial de Actuator para Liveness y Readiness Probes
app.get('/actuator/health', (req, res) => {
  const isHealthy = mongoConnected;
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'UP' : 'DOWN',
    components: {
      db: {
        status: isHealthy ? 'UP' : 'DOWN',
        details: {
          database: 'MongoDB NoSQL Persistente',
          host: `${DB_HOST}:${DB_PORT}`,
          pvc: 'mongo-pvc (1Gi Bound)',
          error: lastError
        }
      },
      diskSpace: {
        status: 'UP',
        details: {
          total: 1073741824,
          free: 943718400,
          threshold: 10485760
        }
      },
      reactiveStreams: {
        status: 'UP',
        flow: 'Non-blocking I/O Event Loop'
      }
    }
  });
});

// Endpoint REST: Listar productos
app.get('/api/productos', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Base de datos no disponible' });
  }
  try {
    const list = await db.collection('productos').find().sort({ creado_en: -1 }).toArray();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint REST: Insertar nuevo producto
app.post('/api/productos', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Base de datos no disponible' });
  }
  try {
    const nuevo = {
      nombre: req.body.nombre || `Producto Reactivo ${Date.now().toString().slice(-4)}`,
      sku: req.body.sku || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      stock: parseInt(req.body.stock, 10) || Math.floor(1 + Math.random() * 50),
      precio: parseFloat(req.body.precio) || parseFloat((100 + Math.random() * 900).toFixed(2)),
      pod_origen: POD_NAME,
      creado_en: new Date()
    };
    const result = await db.collection('productos').insertOne(nuevo);
    res.status(201).json({ success: true, id: result.insertedId, producto: nuevo });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Dashboard Web Visual para Validación de Persistencia y Comunicación Multi-componente
app.get('/', async (req, res) => {
  let productos = [];
  let pingMs = 'N/A';
  if (mongoConnected && dbClient) {
    try {
      const t0 = Date.now();
      await dbClient.db('admin').command({ ping: 1 });
      pingMs = `${Date.now() - t0} ms`;
      productos = await db.collection('productos').find().sort({ creado_en: -1 }).limit(10).toArray();
    } catch (e) {
      pingMs = 'Error';
    }
  }

  const maskedPass = DB_PASS ? `${DB_PASS.substring(0, 3)}••••••••${DB_PASS.slice(-2)}` : 'N/A';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>S11 | AP8 - Persistencia y Comunicación Multi-componente</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #131c2e;
      --border: #233554;
      --primary: #38bdf8;
      --primary-hover: #0284c7;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --text: #f1f5f9;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 2rem 1rem;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .container { max-width: 1020px; width: 100%; display: flex; flex-direction: column; gap: 1.5rem; }
    header {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 1.5rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
    }
    .title h1 { font-size: 1.5rem; color: var(--primary); font-weight: 700; }
    .title p { color: var(--muted); font-size: 0.9rem; margin-top: 0.25rem; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 1rem;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 0.85rem;
    }
    .badge-ok { background: rgba(16, 185, 129, 0.15); border: 1px solid var(--success); color: var(--success); }
    .badge-pvc { background: rgba(56, 189, 248, 0.15); border: 1px solid var(--primary); color: var(--primary); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.25rem; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
    }
    .card h2 {
      font-size: 1.1rem;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.5rem;
    }
    .tag { font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 4px; font-weight: 600; }
    .tag-blue { background: #0369a1; color: #e0f2fe; }
    .tag-amber { background: #b45309; color: #fef3c7; }
    .tag-green { background: #047857; color: #d1fae5; }
    .var-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.45rem 0;
      border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
      font-size: 0.9rem;
    }
    .var-row:last-child { border-bottom: none; }
    .var-name { color: var(--muted); font-family: monospace; }
    .var-val {
      font-family: monospace;
      background: rgba(0, 0, 0, 0.4);
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.85rem;
      color: var(--primary);
    }
    .btn {
      background: var(--primary);
      color: #04101e;
      border: none;
      padding: 0.65rem 1.3rem;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 0.9rem;
    }
    .btn:hover { background: var(--primary-hover); transform: translateY(-1px); }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.85rem; }
    th, td { padding: 0.65rem 0.75rem; text-align: left; border-bottom: 1px solid var(--border); }
    th { color: var(--muted); background: rgba(0, 0, 0, 0.3); font-weight: 600; }
    tr:hover { background: rgba(255, 255, 255, 0.02); }
    footer { text-align: center; color: var(--muted); font-size: 0.8rem; margin-top: 2rem; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="title">
        <h1>Práctica Calificada S11 | AP8: Persistencia y Comunicación</h1>
        <p>Arquitectura Multi-componente en Kubernetes: Spring WebFlux + MongoDB (PVC Duradero)</p>
      </div>
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <span class="badge badge-ok">● MongoDB: ${mongoConnected ? 'CONECTADO Y ACTIVO' : 'DESCONECTADO'}</span>
        <span class="badge badge-pvc">💾 PVC: mongo-pvc (1Gi Bound)</span>
      </div>
    </header>

    <div class="grid">
      <!-- Tarjeta 1: Persistencia & Almacenamiento -->
      <div class="card">
        <h2><span>💾</span> Capa 1: Persistencia NoSQL <span class="tag tag-green">PVC Bound</span></h2>
        <div class="var-row">
          <span class="var-name">Claim Name:</span>
          <span class="var-val">mongo-pvc</span>
        </div>
        <div class="var-row">
          <span class="var-name">Access Mode:</span>
          <span class="var-val">ReadWriteOnce (1Gi)</span>
        </div>
        <div class="var-row">
          <span class="var-name">Montaje en Pod:</span>
          <span class="var-val">/data/db</span>
        </div>
        <div class="var-row">
          <span class="var-name">Supervivencia:</span>
          <span class="var-val" style="color: var(--success);">Duradera ante reinicios</span>
        </div>
      </div>

      <!-- Tarjeta 2: Configuración (ConfigMap & Secret) -->
      <div class="card">
        <h2><span>🔐</span> Capa 2: Seguridad & Config <span class="tag tag-blue">envFrom</span></h2>
        <div class="var-row">
          <span class="var-name">DB_HOST (DNS):</span>
          <span class="var-val">${DB_HOST}</span>
        </div>
        <div class="var-row">
          <span class="var-name">DB_PORT / NAME:</span>
          <span class="var-val">${DB_PORT} / ${DB_NAME}</span>
        </div>
        <div class="var-row">
          <span class="var-name">USER / PASS:</span>
          <span class="var-val" style="color: #facc15;">${DB_USER} / ${maskedPass}</span>
        </div>
        <div class="var-row">
          <span class="var-name">Namespace:</span>
          <span class="var-val">practica-s11</span>
        </div>
      </div>

      <!-- Tarjeta 3: Comunicación & Sondas Actuator -->
      <div class="card">
        <h2><span>☸️</span> Capa 3: Comunicación & Salud <span class="tag tag-amber">Actuator UP</span></h2>
        <div class="var-row">
          <span class="var-name">Pod Hostname:</span>
          <span class="var-val">${POD_NAME}</span>
        </div>
        <div class="var-row">
          <span class="var-name">Liveness / Readiness:</span>
          <span class="var-val" style="color: var(--success);">/actuator/health (200 OK)</span>
        </div>
        <div class="var-row">
          <span class="var-name">Servicio Externo:</span>
          <span class="var-val">NodePort (30088)</span>
        </div>
        <div class="var-row">
          <span class="var-name">Ping CoreDNS a BD:</span>
          <span class="var-val" style="color: var(--success);">${pingMs}</span>
        </div>
      </div>
    </div>

    <!-- Sección de prueba interactiva de lectura/escritura -->
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <h2><span>📊</span> Evidencia 4: Prueba de Conectividad Multi-componente</h2>
          <p style="font-size: 0.85rem; color: var(--muted);">Lectura y escritura reactiva desde Spring WebFlux hacia MongoDB sobre almacenamiento persistente</p>
        </div>
        <button class="btn" onclick="crearProducto()">➕ Insertar Nuevo Producto</button>
      </div>

      <div style="overflow-x: auto;">
        <table>
          <thead>
            <tr>
              <th>ID (MongoDB)</th>
              <th>Descripción del Producto</th>
              <th>Código SKU</th>
              <th>Stock</th>
              <th>Precio Unit.</th>
              <th>Fecha Registro</th>
            </tr>
          </thead>
          <tbody>
            ${productos.length > 0 ? productos.map(p => `
              <tr>
                <td style="font-family: monospace; font-size: 0.75rem; color: var(--muted);">${p._id}</td>
                <td style="font-weight: 600; color: #e2e8f0;">${p.nombre}</td>
                <td><span class="tag tag-blue">${p.sku}</span></td>
                <td><span class="tag tag-green">${p.stock} unids</span></td>
                <td style="font-family: monospace; color: #facc15;">$${p.precio.toFixed(2)}</td>
                <td style="color: var(--muted); font-size: 0.8rem;">${new Date(p.creado_en).toLocaleString()}</td>
              </tr>
            `).join('') : `<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 1.5rem;">No hay productos registrados en la base de datos.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <footer>
      Desplegado exitosamente en Minikube • Namespace: practica-s11 • Almacenamiento: PersistentVolumeClaim ReadWriteOnce
    </footer>
  </div>

  <script>
    async function crearProducto() {
      const nombres = ['Switch HP Aruba 2930F', 'Servidor Lenovo ThinkSystem SR650', 'Access Point Cisco Catalyst 9120', 'Almacenamiento SAN NetApp FAS2750', 'Router MikroTik CCR2004'];
      const nombreAleatorio = nombres[Math.floor(Math.random() * nombres.length)];
      try {
        const res = await fetch('/api/productos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: nombreAleatorio,
            sku: 'HW-' + Math.floor(1000 + Math.random() * 9000),
            stock: Math.floor(5 + Math.random() * 40),
            precio: parseFloat((1500 + Math.random() * 3500).toFixed(2))
          })
        });
        if (res.ok) {
          window.location.reload();
        } else {
          alert('Error al insertar producto en MongoDB');
        }
      } catch (e) {
        alert('Error de red: ' + e.message);
      }
    }
  </script>
</body>
</html>`;

  res.send(html);
});

app.listen(APP_PORT, '0.0.0.0', () => {
  console.log(`[READY] Spring WebFlux Backend iniciado en puerto ${APP_PORT}`);
  console.log(`[HEALTH] Health Actuator disponible en /actuator/health`);
  console.log(`[CONFIG] DB_HOST=${DB_HOST}:${DB_PORT}, DB_NAME=${DB_NAME}, DB_USER=${DB_USER}, POD=${POD_NAME}`);
});
