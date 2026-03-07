import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  Users, 
  User,
  Calendar, 
  Download, 
  LogOut, 
  Plus, 
  Trash2,
  ChevronRight,
  Search,
  FileSpreadsheet,
  AlertCircle,
  Sun,
  Moon,
  ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ExcelJS from 'exceljs';
import { generateWeeklySummary } from './services/geminiService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
interface Destajista {
  id: number;
  nombre: string;
}

interface Actividad {
  id: number;
  nombre: string;
  precio: number;
}

interface Captura {
  id: number;
  destajista_id: number;
  actividad_id: number;
  paquete: string;
  manzana: string;
  lotes: string;
  semana: number;
  cantidad: number;
  fecha_creacion: string;
  destajista_nombre: string;
  actividad_nombre: string;
  precio: number;
}

interface Ubicacion {
  id: number;
  paquete: string;
  manzana: string;
  lote: string;
}

interface AppUser {
  id: number;
  username: string;
  avatar: string;
  role: string;
  created_at: string;
}

type View = 'dashboard' | 'capture' | 'summary-destajista' | 'summary-weekly' | 'export' | 'manage-data' | 'delete-captures' | 'manage-users';

// Initial Seed Data
const INITIAL_DESTAJISTAS = [
  "FRANCISCO ZARRAZAGA CONTRERAS", "EMMANUEL ZARRAZAGA GAMAS", "FRANCISCO JAVIER ZARRAZAGA GAMAS",
  "MIGUEL ANGEL QUIROGA JIMENEZ", "FELIPE REYES JIMENEZ", "CECILIO FUENTE DE LA CRUZ",
  "ROGER ROSADO JIMENEZ", "BAIBY RUTH DE LA CRUZ GOMEZ", "JOSE EDUARDO HERNANDEZ ESCALANTE",
  "JUAN ENRIQUE VERA HERNANDEZ", "LUIS ALBERTO MAY PEREZ", "ELIAZAR CRUZ CRUZ",
  "JOSE A. OVANDO RICARDEZ", "FRANCISCO MACIEL MAGAÑA", "ALBERTO CRUZ HERNANDEZ",
  "MIGUEL ANGEL RAMIREZ JIMENEZ", "ROMEL PEREZ HERNANDEZ", "DANIEL MARQUEZ GIL",
  "VICTOR ALFONSO RODRIGUEZ VALDEZ", "VICTOR MANUEL CASTILLO"
].map((nombre, id) => ({ id: id + 1, nombre: nombre.toUpperCase() }));

const INITIAL_ACTIVIDADES = [
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
].map(([nombre, precio], id) => ({ id: id + 1, nombre: (nombre as string).toUpperCase(), precio: precio as number }));

const INITIAL_UBICACIONES = [
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
].map(([p, m, l], id) => ({ id: id + 1, paquete: p, manzana: m, lote: l }));

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') as 'light' | 'dark' || 'light';
    }
    return 'light';
  });
  const [destajistas, setDestajistas] = useState<Destajista[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [capturas, setCapturas] = useState<Captura[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<{ name: string; avatar: string; role: string } | null>(null);
  const [loginData, setLoginData] = useState({ username: '', password: '', role: 'capturista' });
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; type: 'captura' | 'destajista' | 'actividad' | 'ubicacion' | 'user' } | null>(null);
  const [showAdminPassModal, setShowAdminPassModal] = useState(false);
  const [adminPassInput, setAdminPassInput] = useState('');

  // Form states
  const [formData, setFormData] = useState({
    destajista_id: '',
    paquete: '',
    manzana: '',
    lotes: '',
    semana: '',
  });

  const [currentActivity, setCurrentActivity] = useState({
    actividad_id: '',
    cantidad: ''
  });

  const [addedActivities, setAddedActivities] = useState<{actividad_id: string, cantidad: string, nombre: string}[]>([]);

  // Filter states
  const [filterDestajista, setFilterDestajista] = useState('');
  const [filterSemana, setFilterSemana] = useState('1');

  // Management states
  const [editingDestajista, setEditingDestajista] = useState<Destajista | null>(null);
  const [editingActividad, setEditingActividad] = useState<Actividad | null>(null);
  const [newDestajistaName, setNewDestajistaName] = useState('');
  const [newActividad, setNewActividad] = useState({ nombre: '', precio: '' });
  const [newUbicacion, setNewUbicacion] = useState({ paquete: '', manzana: '', lote: '' });

  // Export states
  const [exportSemana, setExportSemana] = useState('1');
  const [exportDestajista, setExportDestajista] = useState('');
  const [previewData, setPreviewData] = useState<Captura[]>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const weeks = Array.from({ length: 52 }, (_, i) => (i + 1).toString());

  // Initialize Local Storage
  useEffect(() => {
    const initStorage = () => {
      if (!localStorage.getItem('destajistas')) localStorage.setItem('destajistas', JSON.stringify(INITIAL_DESTAJISTAS));
      if (!localStorage.getItem('actividades')) localStorage.setItem('actividades', JSON.stringify(INITIAL_ACTIVIDADES));
      if (!localStorage.getItem('ubicaciones')) localStorage.setItem('ubicaciones', JSON.stringify(INITIAL_UBICACIONES));
      if (!localStorage.getItem('capturas')) localStorage.setItem('capturas', JSON.stringify([]));
      if (!localStorage.getItem('users')) {
        localStorage.setItem('users', JSON.stringify([
          { id: 1, username: 'ArmandoL', password: 'password', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ArmandoL', role: 'supervisor', created_at: new Date().toISOString() }
        ]));
      }
      loadData();
    };
    initStorage();
  }, []);

  const loadData = () => {
    setDestajistas(JSON.parse(localStorage.getItem('destajistas') || '[]'));
    setActividades(JSON.parse(localStorage.getItem('actividades') || '[]'));
    setUbicaciones(JSON.parse(localStorage.getItem('ubicaciones') || '[]'));
    setCapturas(JSON.parse(localStorage.getItem('capturas') || '[]'));
    setUsers(JSON.parse(localStorage.getItem('users') || '[]'));
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const allUsers = JSON.parse(localStorage.getItem('users') || '[]');
    const foundUser = allUsers.find((u: any) => u.username === loginData.username && u.password === loginData.password);
    
    if (foundUser) {
      const userData = { name: foundUser.username, avatar: foundUser.avatar, role: foundUser.role };
      setUser(userData);
      localStorage.setItem('currentUser', JSON.stringify(userData));
      showNotification('Bienvenido de nuevo');
    } else {
      showNotification('Usuario o contraseña incorrectos', 'error');
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('currentUser');
    setCurrentView('dashboard');
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  const handleSaveUbicacion = (e: React.FormEvent) => {
    e.preventDefault();
    const lotes = newUbicacion.lote.split(',').map(l => l.trim()).filter(l => l !== '');
    const currentUbicaciones = JSON.parse(localStorage.getItem('ubicaciones') || '[]');
    
    const newItems = lotes.map((l, i) => ({
      id: Date.now() + i,
      paquete: newUbicacion.paquete,
      manzana: newUbicacion.manzana,
      lote: l
    }));

    const updated = [...currentUbicaciones, ...newItems];
    localStorage.setItem('ubicaciones', JSON.stringify(updated));
    setUbicaciones(updated);
    setNewUbicacion({ paquete: '', manzana: '', lote: '' });
    showNotification('Ubicaciones agregadas con éxito');
  };

  const handleDeleteUbicacion = (id: number) => {
    const updated = ubicaciones.filter(u => u.id !== id);
    localStorage.setItem('ubicaciones', JSON.stringify(updated));
    setUbicaciones(updated);
    showNotification('Ubicación eliminada');
    setConfirmDelete(null);
  };

  const handleSaveDestajista = (e: React.FormEvent) => {
    e.preventDefault();
    const current = JSON.parse(localStorage.getItem('destajistas') || '[]');
    let updated;
    if (editingDestajista) {
      updated = current.map((d: any) => d.id === editingDestajista.id ? { ...d, nombre: newDestajistaName.toUpperCase() } : d);
    } else {
      updated = [...current, { id: Date.now(), nombre: newDestajistaName.toUpperCase() }];
    }
    localStorage.setItem('destajistas', JSON.stringify(updated));
    setDestajistas(updated);
    setNewDestajistaName('');
    setEditingDestajista(null);
    showNotification(editingDestajista ? 'Destajista actualizado' : 'Destajista agregado');
  };

  const handleSaveActividad = (e: React.FormEvent) => {
    e.preventDefault();
    const current = JSON.parse(localStorage.getItem('actividades') || '[]');
    let updated;
    if (editingActividad) {
      updated = current.map((a: any) => a.id === editingActividad.id ? { ...a, nombre: newActividad.nombre.toUpperCase(), precio: parseFloat(newActividad.precio) } : a);
    } else {
      updated = [...current, { id: Date.now(), nombre: newActividad.nombre.toUpperCase(), precio: parseFloat(newActividad.precio) }];
    }
    localStorage.setItem('actividades', JSON.stringify(updated));
    setActividades(updated);
    setNewActividad({ nombre: '', precio: '' });
    setEditingActividad(null);
    showNotification(editingActividad ? 'Actividad actualizada' : 'Actividad agregada');
  };

  const handleDeleteDestajista = (id: number) => {
    const updated = destajistas.filter(d => d.id !== id);
    localStorage.setItem('destajistas', JSON.stringify(updated));
    setDestajistas(updated);
    showNotification('Destajista eliminado');
    setConfirmDelete(null);
  };

  const handleDeleteActividad = (id: number) => {
    const updated = actividades.filter(a => a.id !== id);
    localStorage.setItem('actividades', JSON.stringify(updated));
    setActividades(updated);
    showNotification('Actividad eliminada');
    setConfirmDelete(null);
  };

  const handleCaptureSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (addedActivities.length === 0) {
      showNotification('Agrega al menos una actividad', 'error');
      return;
    }

    const currentCapturas = JSON.parse(localStorage.getItem('capturas') || '[]');
    const destajista = destajistas.find(d => d.id === parseInt(formData.destajista_id));
    
    const newCapturas = addedActivities.map((a, i) => {
      const actividad = actividades.find(act => act.id === parseInt(a.actividad_id));
      return {
        id: Date.now() + i,
        destajista_id: parseInt(formData.destajista_id),
        actividad_id: parseInt(a.actividad_id),
        paquete: formData.paquete,
        manzana: formData.manzana,
        lotes: formData.lotes,
        semana: parseInt(formData.semana),
        cantidad: parseFloat(a.cantidad),
        fecha_creacion: new Date().toISOString(),
        destajista_nombre: destajista?.nombre || '',
        actividad_nombre: a.nombre,
        precio: actividad?.precio || 0
      };
    });

    const updated = [...currentCapturas, ...newCapturas];
    localStorage.setItem('capturas', JSON.stringify(updated));
    setCapturas(updated);
    setFormData({
      destajista_id: '',
      paquete: '',
      manzana: '',
      lotes: '',
      semana: formData.semana,
    });
    setAddedActivities([]);
    setCurrentActivity({ actividad_id: '', cantidad: '' });
    showNotification('Destajos capturados con éxito');
  };

  const addActivityToList = () => {
    if (!currentActivity.actividad_id || !currentActivity.cantidad) {
      showNotification('Selecciona actividad y cantidad', 'error');
      return;
    }
    const actividad = actividades.find(a => a.id === parseInt(currentActivity.actividad_id));
    if (!actividad) return;

    setAddedActivities([...addedActivities, {
      actividad_id: currentActivity.actividad_id,
      cantidad: currentActivity.cantidad,
      nombre: actividad.nombre
    }]);
    setCurrentActivity({ actividad_id: '', cantidad: '' });
  };

  const removeActivityFromList = (index: number) => {
    setAddedActivities(addedActivities.filter((_, i) => i !== index));
  };

  const handleDeleteCaptura = (id: number) => {
    const updated = capturas.filter(c => c.id !== id);
    localStorage.setItem('capturas', JSON.stringify(updated));
    setCapturas(updated);
    showNotification('Captura eliminada');
    setConfirmDelete(null);
  };

  const handleEnterUserManagement = () => {
    setShowAdminPassModal(true);
  };

  const handleAdminPassSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassInput === 'rabito31') {
      setCurrentView('manage-users');
      setShowAdminPassModal(false);
      setAdminPassInput('');
    } else {
      showNotification('Contraseña incorrecta', 'error');
    }
  };

  const handleDeleteUser = (id: number) => {
    const current = JSON.parse(localStorage.getItem('users') || '[]');
    const updated = current.filter((u: any) => u.id !== id);
    localStorage.setItem('users', JSON.stringify(updated));
    setUsers(updated);
    showNotification('Usuario eliminado');
    setConfirmDelete(null);
  };

  const exportToExcel = async (data: Captura[], filename: string) => {
    const workbook = new ExcelJS.Workbook();
    const groupedData: Record<string, Captura[]> = data.reduce((acc, curr) => {
      if (!acc[curr.destajista_nombre]) acc[curr.destajista_nombre] = [];
      acc[curr.destajista_nombre].push(curr);
      return acc;
    }, {} as Record<string, Captura[]>);

    for (const [destajistaName, workerData] of Object.entries(groupedData)) {
      let sheetName = destajistaName.split(' ').slice(0, 2).join(' ').substring(0, 31);
      const worksheet = workbook.addWorksheet(sheetName || 'Reporte');
      
      worksheet.columns = [
        { header: 'PAQUETE', key: 'paquete', width: 10 },
        { header: 'MZA', key: 'manzana', width: 10 },
        { header: 'LOTE', key: 'lotes', width: 15 },
        { header: 'ACTIVIDAD', key: 'actividad', width: 30 },
        { header: 'CANTIDAD', key: 'cantidad', width: 10 },
        { header: 'PRECIO', key: 'precio', width: 12 },
        { header: 'TOTAL', key: 'total', width: 12 }
      ];

      workerData.forEach(c => {
        worksheet.addRow({
          paquete: c.paquete,
          manzana: c.manzana,
          lotes: c.lotes,
          actividad: c.actividad_nombre,
          cantidad: c.cantidad,
          precio: c.precio,
          total: c.cantidad * c.precio
        });
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  const handleGenerateAiSummary = async () => {
    if (previewData.length === 0) return;
    setAiLoading(true);
    try {
      const summary = await generateWeeklySummary(previewData, exportSemana);
      setAiSummary(summary || 'No se pudo generar el resumen.');
    } catch (error) {
      showNotification('Error al generar resumen IA', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  // Helper Components
  const DashboardCard = ({ icon, title, description, onClick, className = "" }: { icon: React.ReactNode, title: string, description: string, onClick: () => void, className?: string }) => (
    <motion.button
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 text-left transition-all hover:shadow-md group",
        className
      )}
    >
      <div className="w-12 h-12 rounded-xl bg-gray-50 dark:bg-zinc-800 flex items-center justify-center mb-4 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed">{description}</p>
    </motion.button>
  );

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#86b347] via-[#a3cc6b] to-[#c5e39e] p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-[2rem] shadow-2xl p-10 w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-[#4a7c1a] mb-2">VIVE POMOCA</h1>
            <p className="text-sm text-gray-500 uppercase tracking-widest">Reporte de Destajos</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="text" placeholder="Usuario" className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" value={loginData.username} onChange={e => setLoginData({...loginData, username: e.target.value})} required />
            <input type="password" placeholder="Contraseña" className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" value={loginData.password} onChange={e => setLoginData({...loginData, password: e.target.value})} required />
            <button type="submit" className="w-full py-3 bg-[#2b87e3] text-white font-bold rounded-xl hover:bg-blue-600 transition-all">Entrar</button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black transition-colors font-sans text-gray-900 dark:text-zinc-100">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-950 border-b border-gray-200 dark:border-zinc-900 sticky top-0 z-30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-2xl font-black tracking-tighter text-blue-600 dark:text-blue-500">
              POM<span className="text-green-600 dark:text-green-500">OCA</span>
            </div>
            <div className="h-6 w-px bg-gray-200 dark:bg-zinc-800 hidden sm:block" />
            <h1 className="text-sm font-semibold text-gray-500 dark:text-zinc-400 hidden sm:block uppercase tracking-widest">
              {currentView === 'dashboard' ? 'Dashboard' : currentView.replace('-', ' ')}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggleTheme} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors">
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
            <div className="flex items-center gap-3 pl-3 border-l border-gray-200 dark:border-zinc-800">
              <div className="text-right hidden xs:block">
                <p className="text-sm font-bold leading-none mb-1">{user.name}</p>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">{user.role}</p>
              </div>
              <button onClick={handleLogout} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-colors">
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {currentView === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <DashboardCard icon={<Plus className="text-blue-600" />} title="Capturar Destajo" description="Registra nuevas actividades realizadas por los trabajadores" onClick={() => setCurrentView('capture')} />
            <DashboardCard icon={<FileText className="text-emerald-600" />} title="Resumen por Destajista" description="Consulta el historial de pagos de un trabajador específico" onClick={() => setCurrentView('summary-destajista')} />
            <DashboardCard icon={<Calendar className="text-orange-600" />} title="Resumen Semanal" description="Visualiza todas las capturas realizadas en una semana" onClick={() => setCurrentView('summary-weekly')} />
            <DashboardCard icon={<Download className="text-purple-600" />} title="Exportar Reportes" description="Genera archivos Excel y resúmenes con IA para administración" onClick={() => setCurrentView('export')} />
            <DashboardCard icon={<FileSpreadsheet className="text-indigo-600" />} title="Maestros de Datos" description="Gestiona destajistas, actividades y ubicaciones del sistema" onClick={() => setCurrentView('manage-data')} />
            <DashboardCard icon={<Trash2 className="text-red-600" />} title="Eliminar Capturas" description="Corrige errores eliminando registros de destajos" onClick={() => setCurrentView('delete-captures')} />
            <DashboardCard icon={<User className="text-gray-600" />} title="Usuarios" description="Administra accesos al sistema" onClick={handleEnterUserManagement} />
          </div>
        )}

        {currentView !== 'dashboard' && (
          <div className="space-y-6">
            <button onClick={() => setCurrentView('dashboard')} className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-blue-600 transition-colors">
              <ArrowLeft size={16} /> VOLVER AL DASHBOARD
            </button>
            
            {currentView === 'capture' && (
              <div className="bg-white dark:bg-zinc-950 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-zinc-900">
                <h2 className="text-2xl font-bold mb-6">Nueva Captura</h2>
                <form onSubmit={handleCaptureSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <label className="block text-sm font-bold text-gray-700 dark:text-zinc-400 uppercase tracking-wider">Destajista</label>
                    <select className="w-full p-3 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl" value={formData.destajista_id} onChange={e => setFormData({...formData, destajista_id: e.target.value})} required>
                      <option value="">Seleccionar...</option>
                      {destajistas.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                    </select>
                  </div>
                  <div className="space-y-4">
                    <label className="block text-sm font-bold text-gray-700 dark:text-zinc-400 uppercase tracking-wider">Semana</label>
                    <select className="w-full p-3 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl" value={formData.semana} onChange={e => setFormData({...formData, semana: e.target.value})} required>
                      {weeks.map(w => <option key={w} value={w}>Semana {w}</option>)}
                    </select>
                  </div>
                  <div className="space-y-4">
                    <label className="block text-sm font-bold text-gray-700 dark:text-zinc-400 uppercase tracking-wider">Ubicación (P-M-L)</label>
                    <div className="grid grid-cols-3 gap-2">
                      <input type="text" placeholder="Paq" className="p-3 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl" value={formData.paquete} onChange={e => setFormData({...formData, paquete: e.target.value.toUpperCase()})} required />
                      <input type="text" placeholder="Mza" className="p-3 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl" value={formData.manzana} onChange={e => setFormData({...formData, manzana: e.target.value})} required />
                      <input type="text" placeholder="Lotes" className="p-3 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl" value={formData.lotes} onChange={e => setFormData({...formData, lotes: e.target.value})} required />
                    </div>
                  </div>
                  <div className="md:col-span-2 border-t border-gray-100 dark:border-zinc-900 pt-6">
                    <h3 className="font-bold mb-4">Actividades</h3>
                    <div className="flex gap-4 mb-4">
                      <select className="flex-1 p-3 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl" value={currentActivity.actividad_id} onChange={e => setCurrentActivity({...currentActivity, actividad_id: e.target.value})}>
                        <option value="">Seleccionar Actividad...</option>
                        {actividades.map(a => <option key={a.id} value={a.id}>{a.nombre} (${a.precio})</option>)}
                      </select>
                      <input type="number" placeholder="Cant" className="w-24 p-3 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl" value={currentActivity.cantidad} onChange={e => setCurrentActivity({...currentActivity, cantidad: e.target.value})} />
                      <button type="button" onClick={addActivityToList} className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700"><Plus size={20} /></button>
                    </div>
                    <div className="space-y-2">
                      {addedActivities.map((a, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-zinc-900 rounded-xl">
                          <span>{a.nombre} (x{a.cantidad})</span>
                          <button type="button" onClick={() => removeActivityFromList(i)} className="text-red-500"><Trash2 size={16} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button type="submit" className="md:col-span-2 py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 shadow-lg shadow-blue-200 dark:shadow-none mt-4">GUARDAR CAPTURA</button>
                </form>
              </div>
            )}

            {currentView === 'summary-weekly' && (
              <div className="space-y-6">
                <div className="flex items-center gap-4 bg-white dark:bg-zinc-950 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-zinc-900">
                  <Calendar className="text-blue-600" />
                  <select className="p-2 bg-transparent border-none font-bold text-lg outline-none" value={filterSemana} onChange={e => setFilterSemana(e.target.value)}>
                    {weeks.map(w => <option key={w} value={w}>Semana {w}</option>)}
                  </select>
                </div>
                <div className="bg-white dark:bg-zinc-950 rounded-3xl shadow-sm border border-gray-100 dark:border-zinc-900 overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 dark:bg-zinc-900 text-[10px] uppercase tracking-widest font-bold text-gray-500">
                      <tr>
                        <th className="px-6 py-4">Destajista</th>
                        <th className="px-6 py-4">Ubicación</th>
                        <th className="px-6 py-4">Actividad</th>
                        <th className="px-6 py-4 text-right">Cantidad</th>
                        <th className="px-6 py-4 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-zinc-900">
                      {capturas.filter(c => c.semana === parseInt(filterSemana)).map(c => (
                        <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-zinc-900/50 transition-colors">
                          <td className="px-6 py-4 font-bold text-sm">{c.destajista_nombre}</td>
                          <td className="px-6 py-4 text-sm">{c.paquete}-{c.manzana}-{c.lotes}</td>
                          <td className="px-6 py-4 text-sm">{c.actividad_nombre}</td>
                          <td className="px-6 py-4 text-right text-sm">{c.cantidad}</td>
                          <td className="px-6 py-4 text-right font-bold text-sm text-blue-600">${(c.cantidad * c.precio).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Other views would be implemented similarly using localStorage */}
            <div className="p-12 text-center text-gray-400 italic">
              Vista {currentView} simplificada para LocalStorage.
            </div>
          </div>
        )}
      </main>

      {/* Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className={cn("fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-xl font-medium z-50", notification.type === 'success' ? "bg-emerald-600 text-white" : "bg-red-600 text-white")}>
            {notification.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Pass Modal */}
      <AnimatePresence>
        {showAdminPassModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white dark:bg-zinc-900 rounded-2xl p-8 max-w-sm w-full shadow-2xl">
              <h3 className="text-xl font-bold mb-4">Acceso Restringido</h3>
              <form onSubmit={handleAdminPassSubmit} className="space-y-4">
                <input autoFocus required type="password" placeholder="Contraseña" className="w-full p-3 border rounded-xl outline-none" value={adminPassInput} onChange={e => setAdminPassInput(e.target.value)} />
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowAdminPassModal(false)} className="flex-1 py-3 bg-gray-100 rounded-xl">Cancelar</button>
                  <button type="submit" className="flex-1 py-3 bg-blue-600 text-white rounded-xl">Entrar</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
