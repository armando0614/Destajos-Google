import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  Users, 
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
import { io } from 'socket.io-client';

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

type View = 'dashboard' | 'capture' | 'summary-destajista' | 'summary-weekly' | 'export' | 'manage-data' | 'delete-captures' | 'manage-users';

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
  const [users, setUsers] = useState<{id: number, username: string, avatar: string, created_at: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<{ name: string; avatar: string } | null>(null);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; type: 'captura' | 'destajista' | 'actividad' | 'ubicacion' } | null>(null);
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

  // Refs to keep track of current state for socket listeners
  const currentViewRef = useRef(currentView);
  const filterDestajistaRef = useRef(filterDestajista);
  const filterSemanaRef = useRef(filterSemana);
  const exportSemanaRef = useRef(exportSemana);
  const exportDestajistaRef = useRef(exportDestajista);

  useEffect(() => { currentViewRef.current = currentView; }, [currentView]);
  useEffect(() => { filterDestajistaRef.current = filterDestajista; }, [filterDestajista]);
  useEffect(() => { filterSemanaRef.current = filterSemana; }, [filterSemana]);
  useEffect(() => { exportSemanaRef.current = exportSemana; }, [exportSemana]);
  useEffect(() => { exportDestajistaRef.current = exportDestajista; }, [exportDestajista]);

  // Socket.io connection
  useEffect(() => {
    const socket = io(window.location.origin, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log('Connected to real-time server');
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    socket.on('data_changed', (data) => {
      console.log('Data changed:', data.type);
      
      const currentView = currentViewRef.current;
      const filterDestajista = filterDestajistaRef.current;
      const filterSemana = filterSemanaRef.current;
      const exportSemana = exportSemanaRef.current;
      const exportDestajista = exportDestajistaRef.current;

      // Refresh data based on what changed
      if (data.type === 'destajistas' || data.type === 'actividades' || data.type === 'ubicaciones') {
        fetchInitialData();
      }
      
      if (data.type === 'capturas') {
        // Refresh captures if we are in a view that shows them
        if (currentView === 'summary-destajista' && filterDestajista) {
          fetchCapturas({ destajista_id: filterDestajista });
        } else if (currentView === 'summary-weekly' && filterSemana) {
          fetchCapturas({ semana: filterSemana });
        } else if (currentView === 'delete-captures') {
          fetchCapturas({ semana: filterSemana, destajista_id: filterDestajista });
        } else if (currentView === 'export') {
          // Re-trigger the export preview fetch
          const url = exportDestajista 
            ? `/api/capturas?semana=${exportSemana}&destajista_id=${exportDestajista}`
            : `/api/capturas?semana=${exportSemana}`;
          fetch(url).then(res => res.json()).then(data => setPreviewData(data));
        }
      }
    });

    return () => {
      if (socket.connected) {
        socket.disconnect();
      }
    };
  }, []); // Stable connection

  const weeks = Array.from({ length: 52 }, (_, i) => (i + 1).toString());

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

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [dRes, aRes, uRes] = await Promise.all([
        fetch('/api/destajistas'),
        fetch('/api/actividades'),
        fetch('/api/ubicaciones')
      ]);
      
      if (!dRes.ok || !aRes.ok || !uRes.ok) {
        throw new Error('Error al cargar datos iniciales');
      }

      const dData = await dRes.json();
      const aData = await aRes.json();
      const uData = await uRes.json();
      setDestajistas(Array.isArray(dData) ? dData : []);
      setActividades(Array.isArray(aData) ? aData : []);
      setUbicaciones(Array.isArray(uData) ? uData : []);
    } catch (error) {
      console.error('Error fetching initial data:', error);
      showNotification('Error al cargar datos del servidor', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchCapturas = async (params: { semana?: string; destajista_id?: string }) => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (params.semana) query.append('semana', params.semana);
      if (params.destajista_id) query.append('destajista_id', params.destajista_id);
      const res = await fetch(`/api/capturas?${query.toString()}`);
      if (!res.ok) {
        throw new Error('Error al cargar capturas');
      }
      const data = await res.json();
      setCapturas(data);
    } catch (error) {
      console.error('Error fetching capturas:', error);
      showNotification('Error al cargar capturas del servidor', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchInitialData();
    }
  }, [user]);

  useEffect(() => {
    if (user && currentView === 'manage-data') {
      fetchInitialData();
    }
  }, [currentView, user]);

  useEffect(() => {
    if (user) {
      if (currentView === 'summary-destajista' && filterDestajista) {
        fetchCapturas({ destajista_id: filterDestajista });
      } else if (currentView === 'summary-weekly') {
        fetchCapturas({ semana: filterSemana });
      } else if (currentView === 'delete-captures') {
        fetchCapturas({ semana: filterSemana, destajista_id: filterDestajista });
      }
    }
  }, [currentView, filterDestajista, filterSemana, user]);

  useEffect(() => {
    if (user && currentView === 'export') {
      const fetchPreview = async () => {
        const url = exportDestajista 
          ? `/api/capturas?semana=${exportSemana}&destajista_id=${exportDestajista}`
          : `/api/capturas?semana=${exportSemana}`;
        const res = await fetch(url);
        const data = await res.json();
        setPreviewData(data);
      };
      fetchPreview();
    }
  }, [currentView, exportSemana, exportDestajista, user]);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data) setUser(data);
    } catch (e) {
      console.error("Auth check failed", e);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        setNotification({ message: 'Bienvenido de nuevo', type: 'success' });
      } else {
        setNotification({ message: data.error || 'Error al iniciar sesión', type: 'error' });
      }
    } catch (e) {
      setNotification({ message: 'Error de conexión', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setCurrentView('dashboard');
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  const renderLogin = () => {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-[#86b347] via-[#a3cc6b] to-[#c5e39e]">
        {/* Wavy Background Elements */}
        <div className="absolute inset-0 z-0 opacity-30">
          <svg className="absolute bottom-0 left-0 w-full h-auto" viewBox="0 0 1440 320" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" fill="#ffffff" />
          </svg>
          <svg className="absolute top-0 left-0 w-full h-auto rotate-180" viewBox="0 0 1440 320" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" fill="#ffffff" />
          </svg>
        </div>

        <div className="z-10 text-center mb-8">
          <h1 className="text-3xl font-bold text-[#4a7c1a] tracking-widest mb-1">VIVE POMOCA S.A. DE C.V.</h1>
          <p className="text-sm font-medium text-[#4a7c1a] opacity-80 tracking-[0.2em]">"REPORTE DE DESTAJOS"</p>
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-[2rem] shadow-2xl p-10 w-full max-w-md z-10 mx-4"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="flex items-center gap-2 mb-6">
              <div className="text-[#2b87e3] font-black text-4xl tracking-tighter flex items-baseline">
                POM<span className="text-[#4a7c1a]">OCA</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Poblaciones Modernas de Calidad</p>
          </div>

          <h2 className="text-xl font-bold text-gray-600 text-center mb-8">
            Iniciar sesión
          </h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <input 
                type="text"
                placeholder="Usuario"
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all text-gray-700"
                value={loginData.username}
                onChange={e => setLoginData({...loginData, username: e.target.value})}
                required
              />
            </div>
            <div className="relative">
              <input 
                type="password"
                placeholder="Contraseña"
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all text-gray-700"
                value={loginData.password}
                onChange={e => setLoginData({...loginData, password: e.target.value})}
                required
              />
            </div>
            <button 
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#2b87e3] text-white font-bold rounded-lg hover:bg-blue-600 transition-all shadow-lg shadow-blue-200 disabled:opacity-50"
            >
              {loading ? 'Cargando...' : 'Entrar'}
            </button>
          </form>
        </motion.div>

        <div className="mt-12 z-10 text-[#4a7c1a] font-medium opacity-60">
          ©2026
        </div>

        {/* Notification in Login */}
        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={cn(
                "fixed bottom-8 px-6 py-3 rounded-xl shadow-xl font-medium z-50",
                notification.type === 'success' ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
              )}
            >
              {notification.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const handleSaveUbicacion = async (e: React.FormEvent) => {
    e.preventDefault();
    const lotes = newUbicacion.lote.split(',').map(l => l.trim()).filter(l => l !== '');
    
    const payload = lotes.map(l => ({
      paquete: newUbicacion.paquete,
      manzana: newUbicacion.manzana,
      lote: l
    }));

    const res = await fetch('/api/ubicaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      setNewUbicacion({ paquete: '', manzana: '', lote: '' });
      showNotification('Ubicaciones agregadas con éxito');
      fetchInitialData();
    } else {
      const data = await res.json();
      showNotification(data.error || 'Error al guardar ubicación', 'error');
    }
  };

  const handleDeleteUbicacion = async (id: number) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/ubicaciones/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification('Ubicación eliminada');
        fetchInitialData();
      } else {
        showNotification('Error al eliminar ubicación', 'error');
      }
    } catch (error) {
      showNotification('Error de conexión', 'error');
    } finally {
      setLoading(false);
      setConfirmDelete(null);
    }
  };

  const handleSaveDestajista = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = editingDestajista ? 'PUT' : 'POST';
    const url = editingDestajista ? `/api/destajistas/${editingDestajista.id}` : '/api/destajistas';
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: newDestajistaName })
      });
      if (res.ok) {
        showNotification(editingDestajista ? 'Destajista actualizado' : 'Destajista agregado');
        setNewDestajistaName('');
        setEditingDestajista(null);
        fetchInitialData();
      } else {
        const data = await res.json();
        showNotification(data.error || 'Error al guardar destajista', 'error');
      }
    } catch (error) {
      showNotification('Error de conexión', 'error');
    }
  };

  const handleSaveActividad = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = editingActividad ? 'PUT' : 'POST';
    const url = editingActividad ? `/api/actividades/${editingActividad.id}` : '/api/actividades';
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: newActividad.nombre, precio: parseFloat(newActividad.precio) })
      });
      if (res.ok) {
        showNotification(editingActividad ? 'Actividad actualizada' : 'Actividad agregada');
        setNewActividad({ nombre: '', precio: '' });
        setEditingActividad(null);
        fetchInitialData();
      } else {
        const data = await res.json();
        showNotification(data.error || 'Error al guardar actividad', 'error');
      }
    } catch (error) {
      showNotification('Error de conexión', 'error');
    }
  };

  const handleDeleteDestajista = async (id: number) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/destajistas/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification('Destajista eliminado');
        fetchInitialData();
      } else {
        showNotification('Error al eliminar destajista', 'error');
      }
    } catch (error) {
      showNotification('Error de conexión', 'error');
    } finally {
      setLoading(false);
      setConfirmDelete(null);
    }
  };

  const handleDeleteActividad = async (id: number) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/actividades/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification('Actividad eliminada');
        fetchInitialData();
      } else {
        showNotification('Error al eliminar actividad', 'error');
      }
    } catch (error) {
      showNotification('Error de conexión', 'error');
    } finally {
      setLoading(false);
      setConfirmDelete(null);
    }
  };

  const handleCaptureSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (addedActivities.length === 0) {
      showNotification('Agrega al menos una actividad', 'error');
      return;
    }

    // Lote validation
    const lotesDisponibles = ubicaciones
      .filter(u => u.paquete === formData.paquete && u.manzana === formData.manzana)
      .map(u => u.lote.toString());
    
    const lotesIngresados = formData.lotes.split(',').map(l => l.trim()).filter(l => l !== '');
    const lotesInvalidos = lotesIngresados.filter(l => !lotesDisponibles.includes(l));

    if (lotesInvalidos.length > 0) {
      showNotification(`Los lotes ${lotesInvalidos.join(', ')} no pertenecen a la manzana ${formData.manzana}`, 'error');
      return;
    }

    setLoading(true);
    try {
      const payload = addedActivities.map(a => ({
        ...formData,
        actividad_id: parseInt(a.actividad_id),
        cantidad: parseFloat(a.cantidad),
        semana: parseInt(formData.semana)
      }));

      const res = await fetch('/api/capturas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showNotification('Destajos capturados con éxito');
        setFormData({
          destajista_id: '',
          paquete: '',
          manzana: '',
          lotes: '',
          semana: formData.semana, // Keep week for convenience
        });
        setAddedActivities([]);
        setCurrentActivity({ actividad_id: '', cantidad: '' });
      } else {
        const err = await res.json();
        showNotification(err.error || 'Error al guardar capturas', 'error');
      }
    } catch (error) {
      console.error('Error saving captura:', error);
      showNotification('Error de conexión', 'error');
    } finally {
      setLoading(false);
    }
  };

  const addActivityToList = () => {
    if (!currentActivity.actividad_id || !currentActivity.cantidad) {
      showNotification('Selecciona actividad y cantidad', 'error');
      return;
    }

    const lotesArray = formData.lotes.split(',').map(l => l.trim()).filter(l => l !== '');
    const numLotes = lotesArray.length;
    const cantidadIngresada = parseFloat(currentActivity.cantidad);

    if (numLotes === 0) {
      showNotification('Debes ingresar los lotes primero', 'error');
      return;
    }

    // Validar que los lotes pertenezcan a la manzana (para evitar agregar si hay errores previos)
    const lotesValidosManzana = ubicaciones
      .filter(u => u.paquete === formData.paquete && u.manzana === formData.manzana)
      .map(u => u.lote.toString());
    
    const tieneLotesInvalidos = lotesArray.some(l => !lotesValidosManzana.includes(l));
    if (tieneLotesInvalidos) {
      showNotification('No puedes agregar actividades si hay lotes inválidos para esta manzana', 'error');
      return;
    }

    if (cantidadIngresada !== numLotes) {
      showNotification(`La cantidad (${cantidadIngresada}) debe ser igual al número de lotes seleccionados (${numLotes})`, 'error');
      return;
    }

    const actividad = actividades.find(a => a.id === parseInt(currentActivity.actividad_id));
    if (!actividad) return;

    // Check if activity is already in the list
    if (addedActivities.some(a => a.actividad_id === currentActivity.actividad_id)) {
      showNotification('Esta actividad ya está en la lista', 'error');
      return;
    }

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

  const handleDeleteCaptura = async (id: number) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/capturas/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCapturas(prev => prev.filter(c => c.id !== id));
        showNotification('Captura eliminada correctamente');
      } else {
        const err = await res.json();
        showNotification(err.error || 'Error al eliminar la captura', 'error');
      }
    } catch (error) {
      console.error('Error deleting captura:', error);
      showNotification('Error de conexión al eliminar', 'error');
    } finally {
      setLoading(false);
      setConfirmDelete(null);
    }
  };

  const exportToExcel = async (data: Captura[], filename: string) => {
    const workbook = new ExcelJS.Workbook();

    // Group data by destajista
    const groupedData: Record<string, Captura[]> = data.reduce((acc, curr) => {
      if (!acc[curr.destajista_nombre]) {
        acc[curr.destajista_nombre] = [];
      }
      acc[curr.destajista_nombre].push(curr);
      return acc;
    }, {} as Record<string, Captura[]>);

    for (const [destajistaName, workerData] of Object.entries(groupedData)) {
      // Create sheet name: first and second name/surname, max 31 chars, clean invalid chars
      let sheetName = destajistaName
        .split(' ')
        .filter(part => part.trim().length > 0)
        .slice(0, 2)
        .join(' ')
        .replace(/[\\\/*?:\[\]]/g, '')
        .substring(0, 31);
      
      if (!sheetName) sheetName = 'Reporte';

      const worksheet = workbook.addWorksheet(sheetName);
      const semana = workerData.length > 0 ? workerData[0].semana : 'N/A';

      // Row 1: Header
      worksheet.mergeCells('A1:F1');
      const destajistaCell = worksheet.getCell('A1');
      destajistaCell.value = `DESTAJISTA: ${destajistaName.toUpperCase()}`;
      destajistaCell.font = { bold: true, size: 12 };
      destajistaCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF4B084' } // Orange
      };
      destajistaCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      destajistaCell.alignment = { vertical: 'middle', horizontal: 'left' };

      const semanaLabelCell = worksheet.getCell('G1');
      semanaLabelCell.value = 'SEMANA:';
      semanaLabelCell.font = { bold: true };
      semanaLabelCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF4B084' }
      };
      semanaLabelCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      semanaLabelCell.alignment = { vertical: 'middle', horizontal: 'center' };

      const semanaValueCell = worksheet.getCell('H1');
      semanaValueCell.value = semana;
      semanaValueCell.font = { bold: true };
      semanaValueCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF4B084' }
      };
      semanaValueCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      semanaValueCell.alignment = { vertical: 'middle', horizontal: 'center' };

      // Row 3: Table Headers
      const headers = ['PAQUETE', 'MZA', 'LOTE', 'ACTIVIDAD', 'CANTIDAD', 'PRECIO', 'TOTAL', 'SUMATORIA INFOTOOLS'];
      const headerRow = worksheet.getRow(3);
      headers.forEach((h, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = h;
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFC6E0B4' } // Green
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      // Data Rows
      let totalImporte = 0;
      workerData.forEach((c, index) => {
        const rowNum = index + 4;
        const row = worksheet.getRow(rowNum);
        const importe = c.cantidad * c.precio;
        totalImporte += importe;

        row.getCell(1).value = c.paquete;
        row.getCell(2).value = c.manzana;
        row.getCell(3).value = c.lotes;
        row.getCell(4).value = c.actividad_nombre;
        row.getCell(5).value = c.cantidad;
        row.getCell(6).value = c.precio;
        row.getCell(7).value = importe;
        row.getCell(8).value = ''; // SUMATORIA INFOTOOLS

        for (let i = 1; i <= 8; i++) {
          row.getCell(i).border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          if (i === 5 || i === 6 || i === 7) {
            row.getCell(i).alignment = { horizontal: 'right' };
          } else {
            row.getCell(i).alignment = { horizontal: 'center' };
          }
        }
      });

      // Total Row
      const lastDataRow = workerData.length + 4;
      const totalCell = worksheet.getCell(`G${lastDataRow}`);
      totalCell.value = totalImporte;
      totalCell.font = { bold: true };
      totalCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF00' } // Yellow
      };
      totalCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      totalCell.alignment = { horizontal: 'right' };

      // Column widths
      worksheet.getColumn(1).width = 12; // PAQUETE
      worksheet.getColumn(2).width = 8;  // MZA
      worksheet.getColumn(3).width = 15; // LOTE
      worksheet.getColumn(4).width = 45; // ACTIVIDAD
      worksheet.getColumn(5).width = 12; // CANTIDAD
      worksheet.getColumn(6).width = 12; // PRECIO
      worksheet.getColumn(7).width = 15; // TOTAL
      worksheet.getColumn(8).width = 25; // SUMATORIA INFOTOOLS
    }

    // Generate buffer and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${filename}.xlsx`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  const handleGenerateAiSummary = async () => {
    if (capturas.length === 0) return;
    setAiLoading(true);
    try {
      const summary = await generateWeeklySummary(capturas, filterSemana);
      setAiSummary(summary || 'No se pudo generar el resumen.');
    } catch (error) {
      showNotification('Error al generar resumen con IA', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Error al cargar usuarios');
      const data = await res.json();
      setUsers(data);
    } catch (error) {
      console.error('Error fetching users:', error);
      showNotification('Error al cargar usuarios', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (id: number) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification('Usuario eliminado');
        fetchUsers();
      } else {
        showNotification('Error al eliminar usuario', 'error');
      }
    } catch (error) {
      showNotification('Error de conexión', 'error');
    } finally {
      setLoading(false);
      setConfirmDelete(null);
    }
  };

  const handleEnterUserManagement = () => {
    showNotification('Solicitando acceso de administrador...');
    setShowAdminPassModal(true);
    setAdminPassInput('');
  };

  const handleAdminPassSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassInput === 'rabito31') {
      setShowAdminPassModal(false);
      setCurrentView('manage-users');
    } else {
      showNotification('Contraseña incorrecta', 'error');
    }
  };

  useEffect(() => {
    if (user && currentView === 'manage-users') {
      fetchUsers();
    }
  }, [currentView, user]);

  const renderManageUsers = () => (
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-4">
        <button 
          onClick={() => setCurrentView('dashboard')}
          className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md flex items-center justify-center"
          title="Volver"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Gestión de Usuarios</h2>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 p-8">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2 dark:text-white">
          <Plus className="text-blue-600 dark:text-blue-400" /> Registrar Nuevo Usuario
        </h2>
        <form onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          try {
            const res = await fetch('/api/auth/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(loginData)
            });
            const data = await res.json();
            if (res.ok) {
              showNotification('Usuario registrado con éxito');
              setLoginData({ username: '', password: '' });
              fetchUsers();
            } else {
              showNotification(data.error || 'Error al registrar usuario', 'error');
            }
          } catch (e) {
            showNotification('Error de conexión', 'error');
          } finally {
            setLoading(false);
          }
        }} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input 
            required
            type="text"
            placeholder="Nombre de usuario"
            className="p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            value={loginData.username}
            onChange={e => setLoginData({...loginData, username: e.target.value})}
          />
          <input 
            required
            type="password"
            placeholder="Contraseña"
            className="p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            value={loginData.password}
            onChange={e => setLoginData({...loginData, password: e.target.value})}
          />
          <button type="submit" className="py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors">
            Registrar Usuario
          </button>
        </form>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-zinc-800">
          <h3 className="font-bold text-gray-900 dark:text-white">Usuarios Registrados</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-zinc-800/50">
                <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase">Usuario</th>
                <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase">Fecha Registro</th>
                <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                  <td className="p-4 flex items-center gap-3">
                    <img src={u.avatar} alt={u.username} className="w-8 h-8 rounded-full" />
                    <span className="text-sm font-medium dark:text-zinc-200">{u.username}</span>
                  </td>
                  <td className="p-4 text-sm text-gray-500 dark:text-zinc-400">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => {
                        const pass = prompt('Ingresa la contraseña de administrador para eliminar este usuario:');
                        if (pass === 'rabito31') {
                          handleDeleteUser(u.id);
                        } else if (pass !== null) {
                          showNotification('Contraseña incorrecta', 'error');
                        }
                      }}
                      className="text-red-600 dark:text-red-400 hover:underline text-sm font-medium"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
      <DashboardCard 
        icon={<FileText className="text-blue-600 dark:text-blue-400" />}
        title="Captura de Destajos"
        description="Registra nuevos destajos completados por los destajistas"
        onClick={() => setCurrentView('capture')}
      />
      <DashboardCard 
        icon={<Users className="text-green-600 dark:text-green-400" />}
        title="Resumen por Destajista"
        description="Consulta destajos capturados para un destajista específico"
        onClick={() => setCurrentView('summary-destajista')}
      />
      <DashboardCard 
        icon={<Calendar className="text-purple-600 dark:text-purple-400" />}
        title="Resumen Semanal"
        description="Consulta todos los destajos capturados en una semana"
        onClick={() => setCurrentView('summary-weekly')}
      />
      <DashboardCard 
        icon={<Trash2 className="text-red-600 dark:text-red-400" />}
        title="Eliminar Capturas"
        description="Busca y elimina capturas que contengan errores"
        onClick={() => setCurrentView('delete-captures')}
      />
      <DashboardCard 
        icon={<Download className="text-orange-600 dark:text-orange-400" />}
        title="Exportar Reportes"
        description="Genera y descarga reportes en formato Excel"
        onClick={() => setCurrentView('export')}
      />
      <DashboardCard 
        icon={<Plus className="text-gray-600 dark:text-zinc-400" />}
        title="Configuración"
        description="Edita los datos maestros (Destajistas, Actividades, etc.)"
        onClick={() => setCurrentView('manage-data')}
      />
      <DashboardCard 
        icon={<Users className="text-indigo-600 dark:text-indigo-400" />}
        title="Usuarios"
        description="Administra los usuarios que tienen acceso al sistema"
        onClick={handleEnterUserManagement}
      />
    </div>
  );

  const renderCaptureForm = () => {
    const paquetes = Array.from(new Set(ubicaciones.map(u => u.paquete)));
    const manzanas = Array.from(new Set(ubicaciones.filter(u => u.paquete === formData.paquete).map(u => u.manzana)));
    const lotesDisponibles = ubicaciones.filter(u => u.paquete === formData.paquete && u.manzana === formData.manzana).map(u => u.lote);
    const detectedLotesCount = formData.lotes.split(',').map(l => l.trim()).filter(l => l !== '').length;

    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => setCurrentView('dashboard')}
            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md flex items-center justify-center"
            title="Volver"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Nueva Captura</h2>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 p-8">
            <h2 className="text-xl font-semibold mb-2 dark:text-white">Datos Generales</h2>
            <p className="text-gray-500 dark:text-zinc-400 text-sm mb-8">Información del destajista y ubicación</p>
            
            <div className="space-y-6">
              <FormField label="Destajista *">
                <select 
                  required
                  className="w-full p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                  value={formData.destajista_id}
                  onChange={e => setFormData({...formData, destajista_id: e.target.value})}
                >
                  <option value="">Selecciona un destajista</option>
                  {destajistas.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </FormField>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Paquete *">
                  <select 
                    required
                    className="w-full p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                    value={formData.paquete}
                    onChange={e => setFormData({...formData, paquete: e.target.value, manzana: '', lotes: ''})}
                  >
                    <option value="">Selecciona un paquete</option>
                    {paquetes.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </FormField>
                <FormField label="Manzana *">
                  <select 
                    required
                    disabled={!formData.paquete}
                    className="w-full p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-50 dark:text-white"
                    value={formData.manzana}
                    onChange={e => setFormData({...formData, manzana: e.target.value, lotes: ''})}
                  >
                    <option value="">Selecciona una manzana</option>
                    {manzanas.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </FormField>
              </div>

              <FormField label={`Lotes (separados por coma) ${detectedLotesCount > 0 ? `[${detectedLotesCount} detectados]` : ''} *`}>
                <input 
                  required
                  type="text"
                  placeholder="Ej: 1, 2, 3"
                  className={`w-full p-3 bg-gray-50 dark:bg-zinc-800 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white ${
                    formData.lotes && formData.lotes.split(',').map(l => l.trim()).filter(l => l !== '').some(l => !ubicaciones.filter(u => u.paquete === formData.paquete && u.manzana === formData.manzana).map(u => u.lote.toString()).includes(l))
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-zinc-700'
                  }`}
                  value={formData.lotes}
                  onChange={e => setFormData({...formData, lotes: e.target.value})}
                />
                {formData.lotes && formData.lotes.split(',').map(l => l.trim()).filter(l => l !== '').some(l => !ubicaciones.filter(u => u.paquete === formData.paquete && u.manzana === formData.manzana).map(u => u.lote.toString()).includes(l)) && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium flex items-center gap-1">
                    <AlertCircle size={12} /> Algunos lotes no pertenecen a esta manzana
                  </p>
                )}
                <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">Lotes disponibles: {lotesDisponibles.join(', ') || 'Selecciona manzana'}</p>
              </FormField>

              <FormField label="Semana *">
                <select 
                  required
                  className="w-full p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                  value={formData.semana}
                  onChange={e => setFormData({...formData, semana: e.target.value})}
                >
                  <option value="">Semana</option>
                  {weeks.map(w => <option key={w} value={w}>Semana {w}</option>)}
                </select>
              </FormField>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 p-8">
            <h2 className="text-xl font-semibold mb-2 dark:text-white">Resumen de Captura</h2>
            <p className="text-gray-500 dark:text-zinc-400 text-sm mb-8">Lista de actividades a registrar</p>

            <div className="space-y-4 mb-8">
              <FormField label="Actividad *">
                <select 
                  className="w-full p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                  value={currentActivity.actividad_id}
                  onChange={e => setCurrentActivity({...currentActivity, actividad_id: e.target.value})}
                >
                  <option value="">Selecciona una actividad</option>
                  {actividades.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.nombre} - ${a.precio.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </option>
                  ))}
                </select>
              </FormField>
              
              <div className="flex gap-4">
                <div className="flex-1">
                  <FormField label={`Cantidad ${detectedLotesCount > 0 ? `(Debe ser ${detectedLotesCount})` : ''} *`}>
                    <input 
                      type="number"
                      placeholder="Cantidad"
                      className={`w-full p-3 bg-gray-50 dark:bg-zinc-800 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white ${
                        currentActivity.cantidad && detectedLotesCount > 0 && parseFloat(currentActivity.cantidad) !== detectedLotesCount
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-zinc-700'
                      }`}
                      value={currentActivity.cantidad}
                      onChange={e => setCurrentActivity({...currentActivity, cantidad: e.target.value})}
                    />
                    {currentActivity.cantidad && detectedLotesCount > 0 && parseFloat(currentActivity.cantidad) !== detectedLotesCount && (
                      <p className="text-[10px] text-red-600 dark:text-red-400 mt-1 font-medium">
                        Debe coincidir con los {detectedLotesCount} lotes
                      </p>
                    )}
                  </FormField>
                </div>
                <div className="flex items-end">
                  <button 
                    type="button"
                    onClick={addActivityToList}
                    disabled={!currentActivity.actividad_id || !currentActivity.cantidad || (detectedLotesCount > 0 && parseFloat(currentActivity.cantidad) !== detectedLotesCount)}
                    className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus size={24} />
                  </button>
                </div>
              </div>
            </div>

            <div className="border border-gray-100 dark:border-zinc-800 rounded-xl overflow-hidden mb-8">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-zinc-800/50">
                  <tr>
                    <th className="p-3 font-semibold text-gray-500 dark:text-zinc-400">Actividad</th>
                    <th className="p-3 font-semibold text-gray-500 dark:text-zinc-400 text-right">Cant.</th>
                    <th className="p-3 font-semibold text-gray-500 dark:text-zinc-400 text-right">Subtotal</th>
                    <th className="p-3 font-semibold text-gray-500 dark:text-zinc-400 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                  {addedActivities.map((a, i) => {
                    const activityObj = actividades.find(act => act.id === parseInt(a.actividad_id));
                    const subtotal = activityObj ? activityObj.precio * parseFloat(a.cantidad) : 0;
                    return (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors">
                        <td className="p-3 font-medium dark:text-zinc-200">{a.nombre}</td>
                        <td className="p-3 text-right font-bold text-blue-600 dark:text-blue-400">{a.cantidad}</td>
                        <td className="p-3 text-right font-medium text-gray-600 dark:text-zinc-400">
                          ${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-center">
                          <button 
                            type="button"
                            onClick={() => removeActivityFromList(i)} 
                            className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {addedActivities.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-gray-400 dark:text-zinc-600 italic">No hay actividades agregadas</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <button 
              type="button"
              onClick={handleCaptureSubmit}
              disabled={
                addedActivities.length === 0 || 
                !formData.destajista_id || 
                !formData.paquete || 
                !formData.manzana || 
                !formData.lotes || 
                !formData.semana ||
                formData.lotes.split(',').map(l => l.trim()).filter(l => l !== '').some(l => !ubicaciones.filter(u => u.paquete === formData.paquete && u.manzana === formData.manzana).map(u => u.lote.toString()).includes(l))
              }
              className="w-full py-4 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 dark:shadow-none disabled:opacity-50 disabled:shadow-none"
            >
              Guardar Captura Completa
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderManageData = () => {
    return (
      <div className="p-6 space-y-8 max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-4">
          <button 
            onClick={() => setCurrentView('dashboard')}
            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md flex items-center justify-center"
            title="Volver"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Configuración de Datos Maestros</h2>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 p-8">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2 dark:text-white">
            <Users className="text-blue-600 dark:text-blue-400" /> Gestionar Destajistas
          </h2>
          <form onSubmit={handleSaveDestajista} className="flex gap-4 mb-6">
            <input 
              required
              type="text"
              placeholder="Nombre del destajista"
              className="flex-1 p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
              value={newDestajistaName}
              onChange={e => setNewDestajistaName(e.target.value)}
            />
            <button type="submit" className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors">
              {editingDestajista ? 'Actualizar' : 'Agregar'}
            </button>
            {editingDestajista && (
              <button type="button" onClick={() => {setEditingDestajista(null); setNewDestajistaName('');}} className="px-6 py-3 bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-zinc-300 font-semibold rounded-xl">
                Cancelar
              </button>
            )}
          </form>
          <div className="max-h-64 overflow-y-auto border border-gray-100 dark:border-zinc-800 rounded-xl">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-zinc-800/50 sticky top-0">
                <tr>
                  <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase">Nombre</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                {(destajistas || []).map(d => (
                  <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                    <td className="p-4 text-sm dark:text-zinc-300">{d.nombre}</td>
                    <td className="p-4 text-right space-x-2">
                      <button onClick={() => {setEditingDestajista(d); setNewDestajistaName(d.nombre);}} className="text-blue-600 dark:text-blue-400 hover:underline text-sm">Editar</button>
                      <button onClick={() => setConfirmDelete({ id: d.id, type: 'destajista' })} className="text-red-600 dark:text-red-400 hover:underline text-sm">Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 p-8">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2 dark:text-white">
            <FileText className="text-green-600 dark:text-green-400" /> Gestionar Actividades
          </h2>
          <form onSubmit={handleSaveActividad} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <input 
              required
              type="text"
              placeholder="Nombre de la actividad"
              className="md:col-span-1 p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
              value={newActividad.nombre}
              onChange={e => setNewActividad({...newActividad, nombre: e.target.value})}
            />
            <input 
              required
              type="number"
              step="0.01"
              placeholder="Precio"
              className="p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
              value={newActividad.precio}
              onChange={e => setNewActividad({...newActividad, precio: e.target.value})}
            />
            <div className="flex gap-2">
              <button type="submit" className="flex-1 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors">
                {editingActividad ? 'Actualizar' : 'Agregar'}
              </button>
              {editingActividad && (
                <button type="button" onClick={() => {setEditingActividad(null); setNewActividad({nombre:'', precio:''});}} className="px-4 py-3 bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-zinc-300 font-semibold rounded-xl">
                  X
                </button>
              )}
            </div>
          </form>
          <div className="max-h-64 overflow-y-auto border border-gray-100 dark:border-zinc-800 rounded-xl">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-zinc-800/50 sticky top-0">
                <tr>
                  <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase">Actividad</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase text-right">Precio</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                {(actividades || []).map(a => (
                  <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                    <td className="p-4 text-sm dark:text-zinc-300">{a.nombre}</td>
                    <td className="p-4 text-sm text-right dark:text-zinc-300">${a.precio.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    <td className="p-4 text-right space-x-2">
                      <button onClick={() => {setEditingActividad(a); setNewActividad({nombre: a.nombre, precio: a.precio.toString()});}} className="text-blue-600 dark:text-blue-400 hover:underline text-sm">Editar</button>
                      <button onClick={() => setConfirmDelete({ id: a.id, type: 'actividad' })} className="text-red-600 dark:text-red-400 hover:underline text-sm">Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 p-8">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2 dark:text-white">
            <Plus className="text-purple-600 dark:text-purple-400" /> Gestionar Ubicaciones
          </h2>
          <form onSubmit={handleSaveUbicacion} className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <input 
              required
              type="text"
              placeholder="Paquete"
              className="p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
              value={newUbicacion.paquete}
              onChange={e => setNewUbicacion({...newUbicacion, paquete: e.target.value})}
            />
            <input 
              required
              type="text"
              placeholder="Manzana"
              className="p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
              value={newUbicacion.manzana}
              onChange={e => setNewUbicacion({...newUbicacion, manzana: e.target.value})}
            />
            <input 
              required
              type="text"
              placeholder="Lote"
              className="p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
              value={newUbicacion.lote}
              onChange={e => setNewUbicacion({...newUbicacion, lote: e.target.value})}
            />
            <button type="submit" className="py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors">
              Agregar Ubicación
            </button>
          </form>
          <div className="max-h-64 overflow-y-auto border border-gray-100 dark:border-zinc-800 rounded-xl">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-zinc-800/50 sticky top-0">
                <tr>
                  <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase">Paquete</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase">Manzana</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase">Lote</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                {(ubicaciones || []).map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                    <td className="p-4 text-sm dark:text-zinc-300">{u.paquete}</td>
                    <td className="p-4 text-sm dark:text-zinc-300">{u.manzana}</td>
                    <td className="p-4 text-sm dark:text-zinc-300">{u.lote}</td>
                    <td className="p-4 text-right">
                      <button onClick={() => setConfirmDelete({ id: u.id, type: 'ubicacion' })} className="text-red-600 dark:text-red-400 hover:underline text-sm">Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderDeleteCaptures = () => (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4 mb-4">
        <button 
          onClick={() => setCurrentView('dashboard')}
          className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md flex items-center justify-center"
          title="Volver"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-2xl font-bold text-red-600 dark:text-red-400">Eliminar Capturas Erróneas</h2>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 p-6">
        <p className="text-gray-500 dark:text-zinc-400 text-sm mb-6">Busca capturas por semana y destajista para eliminarlas permanentemente.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Semana">
            <select 
              className="w-full p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-red-500 dark:text-white"
              value={filterSemana}
              onChange={e => setFilterSemana(e.target.value)}
            >
              <option value="">Todas las semanas</option>
              {weeks.map(w => <option key={w} value={w}>Semana {w}</option>)}
            </select>
          </FormField>
          <FormField label="Destajista (Opcional)">
            <select 
              className="w-full p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-red-500 dark:text-white"
              value={filterDestajista}
              onChange={e => setFilterDestajista(e.target.value)}
            >
              <option value="">Todos</option>
              {destajistas.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </FormField>
          <div className="flex items-end">
            <button onClick={() => fetchCapturas({ semana: filterSemana, destajista_id: filterDestajista })} className="w-full py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors">
              Buscar Capturas
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 dark:bg-zinc-800/50">
            <tr>
              <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase">Destajista</th>
              <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase">Actividad</th>
              <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase">Ubicación</th>
              <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase text-right">Cantidad</th>
              <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase text-center">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
            {capturas.map(c => (
              <tr key={c.id} className="hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
                <td className="p-4 text-sm dark:text-zinc-300">{c.destajista_nombre}</td>
                <td className="p-4 text-sm dark:text-zinc-300">{c.actividad_nombre}</td>
                <td className="p-4 text-sm dark:text-zinc-300">{c.paquete}-{c.manzana}-{c.lotes}</td>
                <td className="p-4 text-sm text-right dark:text-zinc-300">{c.cantidad}</td>
                <td className="p-4 text-center">
                  <button onClick={() => setConfirmDelete({ id: c.id, type: 'captura' })} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
            {capturas.length === 0 && (
              <tr>
                <td colSpan={5} className="p-12 text-center text-gray-500 dark:text-zinc-600">No se encontraron capturas con los filtros seleccionados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSummaryDestajista = () => {
    const totalCantidad = capturas.reduce((acc, curr) => acc + curr.cantidad, 0);
    const totalMonto = capturas.reduce((acc, curr) => acc + (curr.cantidad * curr.precio), 0);
    const selectedDestajista = destajistas.find(d => d.id === parseInt(filterDestajista))?.nombre;

    return (
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-4">
          <button 
            onClick={() => setCurrentView('dashboard')}
            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md flex items-center justify-center"
            title="Volver"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Resumen por Destajista</h2>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 p-6">
          <h2 className="text-lg font-semibold mb-4 dark:text-white">Seleccionar Destajista</h2>
          <select 
            className="w-full md:w-64 p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
            value={filterDestajista}
            onChange={e => setFilterDestajista(e.target.value)}
          >
            <option value="">Selecciona un destajista</option>
            {destajistas.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
        </div>

        {filterDestajista && (
          <>
            <div className="bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/20 p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white uppercase">{selectedDestajista}</h3>
              </div>
              <div className="flex gap-12">
                <div>
                  <p className="text-gray-500 dark:text-zinc-400 text-sm mb-1">Total Cantidad</p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{totalCantidad}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-zinc-400 text-sm mb-1">Total Monto</p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">${totalMonto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-zinc-800/50 border-bottom border-gray-100 dark:border-zinc-800">
                    <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Paquete</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Manzana</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Lotes</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Actividad</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider text-right">Cantidad</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider text-right">Precio</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider text-right">Importe</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                  {capturas.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors">
                      <td className="p-4 text-sm dark:text-zinc-300">{c.paquete}</td>
                      <td className="p-4 text-sm dark:text-zinc-300">{c.manzana}</td>
                      <td className="p-4 text-sm dark:text-zinc-300">{c.lotes}</td>
                      <td className="p-4 text-sm font-medium dark:text-zinc-200">{c.actividad_nombre}</td>
                      <td className="p-4 text-sm text-right dark:text-zinc-300">{c.cantidad}</td>
                      <td className="p-4 text-sm text-right dark:text-zinc-300">${c.precio.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                      <td className="p-4 text-sm font-bold text-right dark:text-zinc-200">${(c.cantidad * c.precio).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                      <td className="p-4 text-center">
                        <button 
                          onClick={() => setConfirmDelete({ id: c.id, type: 'captura' })}
                          className="p-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {capturas.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-gray-500 dark:text-zinc-600">No hay capturas registradas para este destajista.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderSummaryWeekly = () => {
    // Group capturas by destajista
    const grouped: Record<string, { items: Captura[], totalCantidad: number, totalMonto: number }> = capturas.reduce((acc, curr) => {
      if (!acc[curr.destajista_nombre]) {
        acc[curr.destajista_nombre] = {
          items: [],
          totalCantidad: 0,
          totalMonto: 0
        };
      }
      acc[curr.destajista_nombre].items.push(curr);
      acc[curr.destajista_nombre].totalCantidad += curr.cantidad;
      acc[curr.destajista_nombre].totalMonto += (curr.cantidad * curr.precio);
      return acc;
    }, {} as Record<string, { items: Captura[], totalCantidad: number, totalMonto: number }>);

    return (
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-4">
          <button 
            onClick={() => setCurrentView('dashboard')}
            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md flex items-center justify-center"
            title="Volver"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Resumen Semanal</h2>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-lg font-semibold mb-4 dark:text-white">Filtrar por Semana</h2>
              <div className="flex gap-4">
                <select 
                  className="flex-1 max-w-xs p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                  value={filterSemana}
                  onChange={e => {
                    setFilterSemana(e.target.value);
                    setAiSummary(null);
                  }}
                >
                  <option value="">Todas las semanas</option>
                  {weeks.map(w => <option key={w} value={w}>Semana {w}</option>)}
                </select>
                <button className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors">
                  Buscar
                </button>
              </div>
            </div>
            
            {capturas.length > 0 && (
              <button 
                onClick={handleGenerateAiSummary}
                disabled={aiLoading}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md disabled:opacity-50"
              >
                {aiLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Sun size={20} className="text-yellow-300" />
                )}
                {aiLoading ? 'Generando...' : 'Resumen con IA'}
              </button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {aiSummary && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 rounded-2xl p-6 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Sun size={80} className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="relative z-10">
                <h3 className="text-indigo-900 dark:text-indigo-300 font-bold flex items-center gap-2 mb-3">
                  <Sun size={18} className="text-yellow-500" /> Análisis Inteligente (Gemini Flash)
                </h3>
                <div className="text-indigo-800 dark:text-indigo-200 text-sm leading-relaxed whitespace-pre-wrap">
                  {aiSummary}
                </div>
                <button 
                  onClick={() => setAiSummary(null)}
                  className="mt-4 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                >
                  Cerrar resumen
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {Object.entries(grouped).map(([nombre, data]) => (
          <div key={nombre} className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden">
            <div className="p-6 border-b border-gray-100 dark:border-zinc-800">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white uppercase mb-1">{nombre}</h3>
              <p className="text-gray-500 dark:text-zinc-400 text-sm">Total: {data.totalCantidad} unidades | Monto: ${data.totalMonto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-zinc-800/50">
                    <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Paquete</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Manzana</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Lotes</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Actividad</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider text-right">Cantidad</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider text-right">Precio</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider text-right">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                  {data.items.map(c => (
                    <tr key={c.id}>
                      <td className="p-4 text-sm dark:text-zinc-300">{c.paquete}</td>
                      <td className="p-4 text-sm dark:text-zinc-300">{c.manzana}</td>
                      <td className="p-4 text-sm dark:text-zinc-300">{c.lotes}</td>
                      <td className="p-4 text-sm dark:text-zinc-300">{c.actividad_nombre}</td>
                      <td className="p-4 text-sm text-right dark:text-zinc-300">{c.cantidad}</td>
                      <td className="p-4 text-sm text-right dark:text-zinc-300">${c.precio.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                      <td className="p-4 text-sm font-bold text-right dark:text-zinc-200">${(c.cantidad * c.precio).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {Object.keys(grouped).length === 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-12 text-center text-gray-500 dark:text-zinc-600 border border-gray-100 dark:border-zinc-800">
            No hay capturas para la semana seleccionada.
          </div>
        )}
      </div>
    );
  };

  const renderExport = () => {
    const handleExport = () => {
      if (previewData.length === 0) return alert('No hay datos para exportar en el filtro seleccionado');
      
      const filename = exportDestajista 
        ? `Reporte_${destajistas.find(d => d.id === parseInt(exportDestajista))?.nombre}_Semana_${exportSemana}`
        : `Reporte_General_Semana_${exportSemana}`;
        
      exportToExcel(previewData, filename);
    };

    return (
      <div className="p-6 max-w-6xl mx-auto space-y-8">
        <div className="flex items-center gap-4 mb-4">
          <button 
            onClick={() => setCurrentView('dashboard')}
            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md flex items-center justify-center"
            title="Volver"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Exportar Reportes</h2>
            <p className="text-gray-500 dark:text-zinc-400">Genera archivos Excel de las capturas realizadas</p>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
            <FormField label="Semana">
              <select 
                className="w-full p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                value={exportSemana}
                onChange={e => setExportSemana(e.target.value)}
              >
                <option value="">Todas las semanas</option>
                {weeks.map(w => <option key={w} value={w}>Semana {w}</option>)}
              </select>
            </FormField>

            <FormField label="Destajista (Opcional)">
              <select 
                className="w-full p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                value={exportDestajista}
                onChange={e => setExportDestajista(e.target.value)}
              >
                <option value="">Todos los destajistas</option>
                {destajistas.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            </FormField>

            <button 
              onClick={handleExport}
              className="w-full py-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-100 dark:shadow-none"
            >
              <Download size={20} />
              Descargar Excel ({previewData.length})
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/50">
            <h3 className="font-bold text-gray-900 dark:text-white">Vista Previa de Datos</h3>
            <p className="text-sm text-gray-500 dark:text-zinc-400">Se exportarán {previewData.length} registros</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-zinc-800/50">
                  <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase">Destajista</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase">Ubicación</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase">Actividad</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase text-right">Cant.</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase text-right">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                {previewData.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                    <td className="p-4 text-sm font-medium dark:text-zinc-200">{c.destajista_nombre}</td>
                    <td className="p-4 text-sm text-gray-600 dark:text-zinc-400">{c.paquete}-{c.manzana}-{c.lotes}</td>
                    <td className="p-4 text-sm text-gray-600 dark:text-zinc-400">{c.actividad_nombre}</td>
                    <td className="p-4 text-sm text-right dark:text-zinc-300">{c.cantidad}</td>
                    <td className="p-4 text-sm text-right font-semibold dark:text-zinc-200">${(c.cantidad * c.precio).toLocaleString('es-MX')}</td>
                  </tr>
                ))}
                {previewData.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-gray-500 dark:text-zinc-600 italic">
                      No hay capturas registradas para los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  if (!user) return renderLogin();

  return (
    <div className="min-h-screen transition-colors duration-300">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentView('dashboard')}>
          <div className="w-10 h-10 bg-white dark:bg-zinc-800 rounded-xl flex items-center justify-center shadow-sm border border-gray-100 dark:border-zinc-700">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-black dark:text-white">
              <path d="M12 2L3.5 7V17L12 22L20.5 17V7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="9" y="9" width="6" height="6" fill="currentColor" transform="rotate(45 12 12)"/>
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight dark:text-white">Sistema de Captura de Destajos</h1>
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-500 dark:text-zinc-400">Bienvenido, {user.name}</p>
              <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
              <button onClick={handleLogout} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 mr-4 bg-gray-50 dark:bg-zinc-800 px-3 py-1.5 rounded-xl border border-gray-100 dark:border-zinc-700">
            <img src={user.avatar} alt={user.name} className="w-6 h-6 rounded-full" />
            <span className="text-sm font-medium dark:text-zinc-200">{user.name}</span>
          </div>
          <button 
            onClick={toggleTheme}
            className="p-2 text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-xl transition-colors border border-gray-200 dark:border-zinc-700"
            title={theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-8 relative">
        {/* Notifications */}
        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ opacity: 0, y: -20, x: '-50%' }}
              animate={{ opacity: 1, y: 20, x: '-50%' }}
              exit={{ opacity: 0, y: -20, x: '-50%' }}
              className={cn(
                "fixed top-4 left-1/2 z-[100] px-6 py-3 rounded-xl shadow-2xl font-medium flex items-center gap-3 min-w-[300px] justify-center",
                notification.type === 'success' ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
              )}
            >
              {notification.type === 'success' ? (
                <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">✓</div>
              ) : (
                <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">!</div>
              )}
              {notification.message}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Confirmation Modal */}
        <AnimatePresence>
          {confirmDelete !== null && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-sm">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white dark:bg-zinc-900 rounded-2xl p-8 max-w-sm w-full shadow-2xl"
              >
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  {confirmDelete.type === 'captura' ? '¿Eliminar captura?' : 
                   confirmDelete.type === 'destajista' ? '¿Eliminar destajista?' :
                   confirmDelete.type === 'actividad' ? '¿Eliminar actividad?' :
                   '¿Eliminar ubicación?'}
                </h3>
                <p className="text-gray-500 dark:text-zinc-400 mb-6">
                  {confirmDelete.type === 'destajista' || confirmDelete.type === 'actividad' 
                    ? 'Esta acción eliminará también todas las capturas asociadas. ¿Estás seguro?' 
                    : 'Esta acción no se puede deshacer. ¿Estás seguro?'}
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setConfirmDelete(null)}
                    className="flex-1 py-3 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={() => {
                      if (confirmDelete.type === 'captura') handleDeleteCaptura(confirmDelete.id);
                      else if (confirmDelete.type === 'destajista') handleDeleteDestajista(confirmDelete.id);
                      else if (confirmDelete.type === 'actividad') handleDeleteActividad(confirmDelete.id);
                      else if (confirmDelete.type === 'ubicacion') handleDeleteUbicacion(confirmDelete.id);
                    }}
                    className="flex-1 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200 dark:shadow-none"
                  >
                    Eliminar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {loading && (
          <div className="absolute inset-0 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-sm z-50 flex items-center justify-center rounded-3xl">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-blue-600 dark:text-blue-400 font-medium">Cargando datos...</p>
            </div>
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {currentView === 'dashboard' && renderDashboard()}
            {currentView === 'capture' && renderCaptureForm()}
            {currentView === 'summary-destajista' && renderSummaryDestajista()}
            {currentView === 'summary-weekly' && renderSummaryWeekly()}
            {currentView === 'export' && renderExport()}
            {currentView === 'manage-data' && renderManageData()}
            {currentView === 'delete-captures' && renderDeleteCaptures()}
            {currentView === 'manage-users' && renderManageUsers()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating Action Button for Dashboard */}
      {currentView !== 'dashboard' && (
        <button 
          onClick={() => setCurrentView('dashboard')}
          className="fixed bottom-8 right-8 w-14 h-14 bg-white dark:bg-zinc-900 shadow-2xl rounded-full flex items-center justify-center text-gray-600 dark:text-zinc-400 border border-gray-200 dark:border-zinc-800 hover:scale-110 transition-transform z-20"
        >
          <LayoutDashboard size={24} />
        </button>
      )}

      {/* Admin Password Modal */}
      <AnimatePresence>
        {showAdminPassModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-sm">
            <motion.div 
              key="admin-pass-modal"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl p-8 max-w-sm w-full shadow-2xl"
            >
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Acceso Restringido
              </h3>
              <p className="text-gray-500 dark:text-zinc-400 mb-6 text-sm">
                Ingresa la contraseña de administrador para gestionar usuarios.
              </p>
              <form onSubmit={handleAdminPassSubmit} className="space-y-4">
                <input 
                  autoFocus
                  required
                  type="password"
                  placeholder="Contraseña"
                  className="w-full p-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  value={adminPassInput}
                  onChange={e => setAdminPassInput(e.target.value)}
                />
                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setShowAdminPassModal(false)}
                    className="flex-1 py-3 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 dark:shadow-none"
                  >
                    Entrar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Sub-components
function DashboardCard({ icon, title, description, onClick }: { icon: React.ReactNode, title: string, description: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm hover:shadow-xl dark:hover:shadow-zinc-900/50 hover:-translate-y-1 transition-all text-left flex flex-col h-full group cursor-pointer"
    >
      <div className="w-14 h-14 bg-gray-50 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
        {React.cloneElement(icon as React.ReactElement, { size: 28 })}
      </div>
      <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">{title}</h3>
      <p className="text-gray-500 dark:text-zinc-400 text-sm leading-relaxed mb-6">{description}</p>
      <div className="mt-auto flex items-center text-blue-600 dark:text-blue-400 font-semibold text-sm">
        Ingresar <ChevronRight size={16} className="ml-1" />
      </div>
    </button>
  );
}

function FormField({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-gray-700 dark:text-zinc-300">{label}</label>
      {children}
    </div>
  );
}
