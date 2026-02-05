import React, { useState, useEffect } from 'react';
import AdminSidebar from '../components/AdminSidebar';
import { supabase } from '../services/supabaseClient';

const AnalyticsReport = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(null);
    const [selectedPlanId, setSelectedPlanId] = useState(null);
    const [gymPlans, setGymPlans] = useState([]);
    const [loadingPlans, setLoadingPlans] = useState(true);

    const [adminProfile, setAdminProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState(null);
    const [users, setUsers] = useState([]);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [editData, setEditData] = useState({
        name: '',
        status: '',
        plan_name: '',
        expiry_date: ''
    });

    // Recalcular vencimiento en el modal de edición cuando cambie el plan
    useEffect(() => {
        if (!showEditModal) return;
        const plan = gymPlans.find(p => p.name === editData.plan_name);
        if (!plan) return;

        const start = new Date(); // Al editar/renovar, calculamos desde hoy por defecto
        let end = new Date();

        if (plan.duration_unit === 'days') {
            end.setDate(start.getDate() + plan.duration_value);
        } else if (plan.duration_unit === 'months') {
            end.setMonth(start.getMonth() + plan.duration_value);
        }

        setEditData(prev => ({ ...prev, expiry_date: end.toISOString().split('T')[0] }));
    }, [editData.plan_name, showEditModal, gymPlans]);

    // Fechas para el registro
    const today = new Date().toISOString().split('T')[0];
    const [startDate, setStartDate] = useState(today);
    const [expiryDate, setExpiryDate] = useState('');

    // Available plans will be fetched from the database

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
    };

    // Calcular fecha de vencimiento automáticamente
    useEffect(() => {
        const plan = gymPlans.find(p => p.id === selectedPlanId);
        if (!plan || !startDate) return;

        const start = new Date(startDate);
        let end = new Date(startDate);

        if (plan.duration_unit === 'days') {
            end.setDate(start.getDate() + plan.duration_value);
        } else if (plan.duration_unit === 'months') {
            end.setMonth(start.getMonth() + plan.duration_value);
        }

        setExpiryDate(end.toISOString().split('T')[0]);
    }, [selectedPlanId, startDate, gymPlans]);

    const filteredUsers = users.filter(user => {
        const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = filterStatus === 'all' || user.status === filterStatus;
        return matchesSearch && matchesFilter;
    });

    // 1. Obtener el perfil del Admin y su gym_id
    useEffect(() => {
        const getAdminData = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*, gyms(name)')
                    .eq('id', user.id)
                    .single();
                setAdminProfile(profile);
                if (profile?.gym_id) {
                    fetchMembers(profile.gym_id);
                    fetchGymPlans(profile.gym_id);
                }
            }
        };
        getAdminData();
    }, []);

    const fetchGymPlans = async (gymId) => {
        try {
            const { data, error } = await supabase
                .from('gym_membership_plans')
                .select('*')
                .eq('gym_id', gymId)
                .eq('is_active', true)
                .order('created_at', { ascending: true });

            if (error) throw error;

            if (data && data.length > 0) {
                setGymPlans(data);
                setSelectedPlanId(data[0].id);
            } else {
                // Fallback a planes por defecto si no hay configurados
                const defaults = [
                    { id: 'def-1', name: "Pase Diario", price_cop: 15000, duration_value: 1, duration_unit: 'days' },
                    { id: 'def-2', name: "Mensualidad", price_cop: 95000, duration_value: 1, duration_unit: 'months' },
                    { id: 'def-3', name: "Trimestre Pro", price_cop: 250000, duration_value: 3, duration_unit: 'months' }
                ];
                setGymPlans(defaults);
                setSelectedPlanId(defaults[0].id);
            }
        } catch (err) {
            console.error("Error fetching gym plans:", err);
        } finally {
            setLoadingPlans(false);
        }
    };

    // 2. Traer socios vinculados a este Gimnasio
    const fetchMembers = async (gymId) => {
        setLoading(true);
        const { data, error } = await supabase
            .from('profiles')
            .select(`
                id, 
                full_name, 
                role,
                memberships (*)
            `)
            .eq('gym_id', gymId)
            .eq('role', 'user')
            .order('created_at', { foreignTable: 'memberships', ascending: false });

        if (data) {
            const mappedUsers = data.map(u => {
                const membership = u.memberships?.[0];
                return {
                    id: u.id,
                    name: u.full_name,
                    plan: membership?.plan_name || 'Sin Plan',
                    status: membership?.status === 'active' ? 'paid' : 'expired',
                    lastPaymentRaw: membership?.last_payment_date || null,
                    expiryDateRaw: membership?.expiry_date || null,
                    phone: '',
                    history: []
                };
            });
            setUsers(mappedUsers);
        }
        setLoading(false);
    };

    const handleAddUser = async (e) => {
        e.preventDefault();
        setActionLoading(true);
        setError(null);

        const formData = new FormData(e.target);
        const plan = gymPlans.find(p => p.id === selectedPlanId);
        const email = formData.get('email');
        const password = formData.get('password') || 'socio123'; // Clave por defecto si no se pide

        try {
            // A. Crear usuario en Auth (Socio del Gimnasio) usando Edge Function para evitar cerrar sesión del Admin
            const { data: resultData, error: fnError } = await supabase.functions.invoke('manage-user-auth', {
                body: {
                    action: 'create_user',
                    email,
                    password,
                    full_name: formData.get('name')
                }
            });

            if (fnError) throw new Error(fnError.message || 'Error al crear socio');

            const authUser = resultData.user;

            // B. Actualizar perfil con el gym_id del admin automáticamente
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    gym_id: adminProfile.gym_id,
                    role: 'user',
                    email: email
                })
                .eq('id', authUser.id);

            if (profileError) throw profileError;

            // C. Crear la membresía vinculada
            const { error: memberError } = await supabase
                .from('memberships')
                .insert([{
                    gym_id: adminProfile.gym_id,
                    user_id: authUser.id,
                    plan_name: plan.name,
                    status: 'active',
                    price_cop: plan.price_cop,
                    expiry_date: expiryDate,
                    last_payment_date: startDate
                }]);

            if (memberError) throw memberError;

            // D. Refrescar lista
            await fetchMembers(adminProfile.gym_id);
            setShowAddModal(false);
        } catch (err) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleEditUser = async (e) => {
        e.preventDefault();
        setActionLoading(true);
        setError(null);

        try {
            // 1. Actualizar perfil (nombre)
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    full_name: editData.name
                })
                .eq('id', selectedUser.id);

            if (profileError) throw profileError;

            // 2. Actualizar o CREAR membresía (status, plan, expiry)
            // Intentar actualizar primero
            const { data: updateData, error: membershipError } = await supabase
                .from('memberships')
                .update({
                    status: editData.status === 'paid' ? 'active' : 'inactive',
                    plan_name: editData.plan_name,
                    expiry_date: editData.expiry_date,
                    last_payment_date: new Date().toISOString().split('T')[0]
                })
                .eq('user_id', selectedUser.id)
                .select();

            // Si no hay nada que actualizar, insertar uno nuevo
            if (!membershipError && (!updateData || updateData.length === 0)) {
                const { error: insertError } = await supabase
                    .from('memberships')
                    .insert({
                        user_id: selectedUser.id,
                        gym_id: adminProfile.gym_id,
                        status: editData.status === 'paid' ? 'active' : 'inactive',
                        plan_name: editData.plan_name,
                        expiry_date: editData.expiry_date,
                        last_payment_date: new Date().toISOString().split('T')[0]
                    });
                if (insertError) throw insertError;
            } else if (membershipError) {
                throw membershipError;
            }

            // Success
            await fetchMembers(adminProfile.gym_id);
            setShowEditModal(false);
        } catch (err) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const openEditModal = (user) => {
        setSelectedUser(user);

        // Usar la fecha raw directamente o la de hoy
        const formattedDate = user.expiryDateRaw
            ? new Date(user.expiryDateRaw).toISOString().split('T')[0]
            : today;

        setEditData({
            name: user.name,
            status: user.status,
            plan_name: user.plan,
            expiry_date: formattedDate
        });
        setShowEditModal(true);
    };

    return (
        <div className="flex min-h-screen bg-background-dark text-white font-display">
            <AdminSidebar />

            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <header className="px-10 py-8 flex items-center justify-between border-b border-border-dark bg-surface-dark/50 backdrop-blur-md">
                    <div>
                        <h1 className="text-4xl font-black uppercase italic tracking-tighter">
                            Panel de <span className="text-primary">Socios</span>
                        </h1>
                        <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-1">Gestión administrativa y auditoría COP</p>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="relative group">
                            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors">search</span>
                            <input
                                type="text"
                                placeholder="Nombre, email o teléfono..."
                                className="bg-background-dark/50 border-2 border-border-dark rounded-2xl py-3 pl-12 pr-6 text-sm w-80 focus:border-primary transition-all outline-none"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="bg-primary text-background-dark font-black px-8 py-3.5 rounded-2xl uppercase tracking-widest text-xs hover:shadow-[0_0_30px_rgba(13,242,89,0.3)] transition-all flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined text-lg">person_add</span>
                            Vincular Socio
                        </button>
                    </div>
                </header>

                <div className="flex-1 p-10 overflow-y-auto custom-scrollbar space-y-8">
                    <div className="flex gap-4">
                        {[
                            { id: 'all', label: 'Todos los Socios', icon: 'groups' },
                            { id: 'paid', label: 'Membresías Activas', icon: 'check_circle' },
                            { id: 'expired', label: 'Socios Vencidos', icon: 'money_off' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setFilterStatus(tab.id)}
                                className={`flex items-center gap-3 px-6 py-3 rounded-2xl border transition-all uppercase text-[10px] font-black tracking-widest ${filterStatus === tab.id
                                    ? 'bg-primary/10 border-primary text-primary'
                                    : 'bg-surface-dark border-border-dark text-slate-500 hover:text-white/20'
                                    }`}
                            >
                                <span className="material-symbols-outlined text-lg">{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="bg-surface-dark border border-border-dark rounded-[2.5rem] overflow-hidden shadow-2xl">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-background-dark/50 border-b border-border-dark">
                                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Socio</th>
                                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Membresía</th>
                                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Fecha Registro</th>
                                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-primary">Vence el</th>
                                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 text-center">Estado</th>
                                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 text-right">Auditoría</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {loading ? (
                                    <tr>
                                        <td colSpan="6" className="px-8 py-20 text-center text-slate-500 font-bold uppercase tracking-widest animate-pulse">
                                            Sincronizando con base de datos...
                                        </td>
                                    </tr>
                                ) : filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="px-8 py-20 text-center text-slate-500 font-bold uppercase tracking-widest">
                                            No se encontraron socios
                                        </td>
                                    </tr>
                                ) : filteredUsers.map((user) => (
                                    <tr key={user.id} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-4">
                                                <div className="size-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-primary/40 transition-all">
                                                    <span className="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors">person</span>
                                                </div>
                                                <div>
                                                    <p className="font-black uppercase italic text-sm">{user.name}</p>
                                                    <p className="text-xs text-slate-500 font-bold">{user.phone}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <span className="bg-white/5 px-4 py-1.5 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-slate-300">
                                                {user.plan}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6 font-bold text-sm text-slate-400">
                                            {user.lastPaymentRaw ? new Date(user.lastPaymentRaw).toLocaleDateString('es-CO') : 'N/A'}
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-primary text-sm">schedule</span>
                                                <span className={`font-black text-sm italic ${user.status === 'expired' ? 'text-red-500' : 'text-white'}`}>
                                                    {user.expiryDateRaw ? new Date(user.expiryDateRaw).toLocaleDateString('es-CO') : 'N/A'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className={`flex items-center justify-center gap-2 ${user.status === 'paid' ? 'text-primary' : 'text-red-500'}`}>
                                                <span className={`size-2 rounded-full ${user.status === 'paid' ? 'bg-primary shadow-[0_0_10px_#0df259]' : 'bg-red-500 shadow-[0_0_10px_#ef4444]'}`}></span>
                                                <span className="text-[10px] font-black uppercase italic tracking-widest">{user.status === 'paid' ? 'ACTIVO' : 'VENCIDO'}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => openEditModal(user)}
                                                    className="bg-white/5 hover:bg-primary/10 hover:text-primary p-2 rounded-xl transition-all"
                                                    title="Editar Socio"
                                                >
                                                    <span className="material-symbols-outlined text-lg">edit</span>
                                                </button>
                                                <button
                                                    onClick={() => setShowHistoryModal(user.id)}
                                                    className="bg-white/5 hover:bg-primary/10 hover:text-primary px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                                >
                                                    Historial
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* Modal de Registro con Autocalculado de Fechas */}
            {showAddModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-background-dark/95 backdrop-blur-md" onClick={() => setShowAddModal(false)}></div>
                    <div className="relative bg-surface-dark border border-border-dark w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden animate-fadeInUp">
                        <header className="bg-background-dark/50 p-10 border-b border-border-dark flex justify-between items-center">
                            <div>
                                <h3 className="text-3xl font-black italic uppercase">Alta <span className="text-primary">Socio Nuevo</span></h3>
                                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Sincronización automática de vigencia</p>
                            </div>
                            <button onClick={() => setShowAddModal(false)} className="text-slate-500 hover:text-white transition-colors"><span className="material-symbols-outlined text-4xl">close</span></button>
                        </header>

                        <form onSubmit={handleAddUser} className="p-10 space-y-8">
                            {error && (
                                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3">
                                    <span className="material-symbols-outlined text-red-500">error</span>
                                    <p className="text-red-500 text-xs font-bold uppercase tracking-widest">{error}</p>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre Completo</label>
                                    <input required name="name" className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all" placeholder="Nombre completo" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Teléfono</label>
                                    <input required name="phone" className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all" placeholder="+57 300..." />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Correo Electrónico (Login)</label>
                                    <input required type="email" name="email" className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all" placeholder="Email" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Contraseña Temporal</label>
                                    <input required type="password" name="password" className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all" placeholder="••••••••" defaultValue="socio123" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha de Ingreso</label>
                                    <input
                                        type="date"
                                        required
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all text-white scheme-dark"
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 text-center block">Seleccionar Plan</label>
                                <div className="grid grid-cols-3 gap-4">
                                    {gymPlans.map((plan) => (
                                        <div
                                            key={plan.id}
                                            onClick={() => setSelectedPlanId(plan.id)}
                                            className={`p-6 rounded-[2rem] border-2 transition-all cursor-pointer text-center relative ${selectedPlanId === plan.id ? 'bg-primary/10 border-primary shadow-[0_0_20px_rgba(13,242,89,0.1)]' : 'bg-background-dark/50 border-white/5 grayscale opacity-50'}`}
                                        >
                                            <h4 className="font-black uppercase italic text-sm">{plan.name}</h4>
                                            <div className="text-xl font-black mt-1">{formatCurrency(plan.price_cop)}</div>
                                            <p className="text-[10px] font-bold text-slate-500 mt-2 uppercase">Duración: {plan.duration_value} {plan.duration_unit === 'days' ? 'Día' : 'Mes'}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Resumen de Vigencia Autocalculado */}
                            <div className="bg-primary/5 border border-primary/20 rounded-3xl p-6 flex justify-around items-center text-center">
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Inicia el</p>
                                    <p className="text-lg font-black italic">{new Date(startDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                                </div>
                                <div className="h-10 w-px bg-primary/20"></div>
                                <div>
                                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">Vencimiento (Auto)</p>
                                    <p className="text-lg font-black italic text-primary">{new Date(expiryDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                                </div>
                            </div>

                            <button type="submit" disabled={actionLoading || loadingPlans} className="w-full bg-primary text-background-dark font-black py-5 rounded-[2rem] uppercase tracking-widest hover:shadow-[0_0_30px_rgba(13,242,89,0.3)] transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50">
                                {actionLoading ? 'Procesando Sincronización...' : `Activar Membresía y Cobrar ${formatCurrency(gymPlans.find(p => p.id === selectedPlanId)?.price_cop || 0)}`}
                                <span className="material-symbols-outlined">{actionLoading ? 'sync' : 'verified_user'}</span>
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Historial */}
            {showHistoryModal && userInHistory && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-background-dark/95 backdrop-blur-md" onClick={() => setShowHistoryModal(null)}></div>
                    <div className="relative bg-surface-dark border border-border-dark w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-fadeInUp">
                        <header className="p-10 border-b border-border-dark bg-background-dark/50 flex justify-between items-center">
                            <div>
                                <h3 className="text-2xl font-black uppercase italic">Historial: <span className="text-primary">{userInHistory.name}</span></h3>
                                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Registro de pagos y vencimientos</p>
                            </div>
                            <button onClick={() => setShowHistoryModal(null)} className="text-slate-500 hover:text-white transition-colors">
                                <span className="material-symbols-outlined text-3xl">close</span>
                            </button>
                        </header>
                        <div className="p-10 max-h-[60vh] overflow-y-auto custom-scrollbar">
                            <div className="space-y-6">
                                {userInHistory.history.map((h, i) => (
                                    <div key={i} className="p-6 rounded-2xl bg-background-dark/50 border border-white/5 flex justify-between items-center">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-500 uppercase">Transacción</p>
                                            <p className="font-bold">{h.date}</p>
                                            {h.expires && <p className="text-[10px] font-black text-primary uppercase mt-1">Expira: {h.expires}</p>}
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-black italic">{formatCurrency(h.amount)}</p>
                                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{h.plan}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de Edición de Socio */}
            {showEditModal && selectedUser && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-background-dark/95 backdrop-blur-md" onClick={() => setShowEditModal(false)}></div>
                    <div className="relative bg-surface-dark border border-border-dark w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-fadeInUp">
                        <header className="bg-background-dark/50 p-10 border-b border-border-dark flex justify-between items-center">
                            <div>
                                <h3 className="text-3xl font-black italic uppercase">Editar <span className="text-primary">Socio</span></h3>
                                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">ID: {selectedUser.id.substring(0, 8)}...</p>
                            </div>
                            <button onClick={() => setShowEditModal(false)} className="text-slate-500 hover:text-white transition-colors"><span className="material-symbols-outlined text-4xl">close</span></button>
                        </header>

                        <form onSubmit={handleEditUser} className="p-10 space-y-8">
                            {error && (
                                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3">
                                    <span className="material-symbols-outlined text-red-500">error</span>
                                    <p className="text-red-500 text-xs font-bold uppercase tracking-widest">{error}</p>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre Completo</label>
                                    <input
                                        required
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all"
                                        value={editData.name}
                                        onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Estado de Membresía</label>
                                    <select
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all appearance-none"
                                        value={editData.status}
                                        onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                                    >
                                        <option value="paid">Activo (Pagado)</option>
                                        <option value="expired">Inactivo (Vencido)</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Plan Actual</label>
                                    <select
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all appearance-none"
                                        value={editData.plan_name}
                                        onChange={(e) => setEditData({ ...editData, plan_name: e.target.value })}
                                    >
                                        {gymPlans.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha de Vencimiento</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full bg-background-dark border-2 border-primary/30 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all text-white scheme-dark"
                                        value={editData.expiry_date}
                                        onChange={(e) => setEditData({ ...editData, expiry_date: e.target.value })}
                                    />
                                    <p className="text-[9px] text-primary font-bold uppercase mt-1 ml-1 opacity-70 italic">* Se autocalcula al cambiar el plan</p>
                                </div>
                            </div>

                            <button type="submit" disabled={actionLoading} className="w-full bg-primary text-background-dark font-black py-5 rounded-[2rem] uppercase tracking-widest hover:shadow-[0_0_30px_rgba(13,242,89,0.3)] transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50">
                                {actionLoading ? 'Guardando Cambios...' : 'Actualizar Datos del Socio'}
                                <span className="material-symbols-outlined">{actionLoading ? 'sync' : 'save'}</span>
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AnalyticsReport;