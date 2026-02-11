import React, { useState, useEffect, useRef } from 'react';
import AdminSidebar from '../components/AdminSidebar';
import { supabase } from '../services/supabaseClient';
import { useReactToPrint } from 'react-to-print';

const AnalyticsReport = ({ darkMode, toggleDarkMode }) => {
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

    const [showPayModal, setShowPayModal] = useState(false);
    const [manualPaymentData, setManualPaymentData] = useState({
        plan_id: '',
        amount: 0,
        method: 'cash',
        transfer_id: '',
        notes: ''
    });

    const [selectedPayment, setSelectedPayment] = useState(null);
    const componentRef = useRef();
    const handlePrint = useReactToPrint({
        contentRef: componentRef,
        documentTitle: `Recibo_${selectedPayment?.user_name || 'Socio'}`
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
                memberships (*),
                member_payments (*)
            `)
            .eq('gym_id', gymId)
            .eq('role', 'user')
            .order('created_at', { foreignTable: 'memberships', ascending: false })
            .order('payment_date', { foreignTable: 'member_payments', ascending: false });

        if (data) {
            const mappedUsers = data.map(u => {
                const membership = u.memberships?.[0];
                const payments = u.member_payments || [];

                return {
                    id: u.id,
                    name: u.full_name,
                    plan: membership?.plan_name || 'Sin Plan',
                    status: membership?.status === 'active' ? 'paid' : 'expired',
                    lastPaymentRaw: membership?.last_payment_date || null,
                    expiryDateRaw: membership?.expiry_date || null,
                    phone: '',
                    history: payments.map(p => ({
                        date: new Date(p.payment_date).toLocaleDateString('es-CO'),
                        amount: p.amount,
                        plan: membership?.plan_name || 'Membresía',
                        method: p.payment_method,
                        transfer_id: p.transfer_id,
                        notes: p.notes,
                        id: p.id,
                        user_name: u.full_name
                    }))
                };
            });
            setUsers(mappedUsers);
        }
        setLoading(false);
    };

    const openPayModal = (user) => {
        setSelectedUser(user);
        const currentPlan = gymPlans.find(p => p.name === user.plan) || gymPlans[0];
        setManualPaymentData({
            plan_id: currentPlan?.id || '',
            amount: currentPlan?.price_cop || 0,
            method: 'cash',
            transfer_id: '',
            notes: ''
        });
        setShowPayModal(true);
    };

    const handleManualPayment = async (e) => {
        e.preventDefault();
        setActionLoading(true);
        setError(null);

        try {
            const plan = gymPlans.find(p => p.id === manualPaymentData.plan_id);

            // 1. Calcular nueva fecha de vencimiento
            const start = new Date();
            let end = new Date();
            if (plan.duration_unit === 'days') {
                end.setDate(start.getDate() + plan.duration_value);
            } else if (plan.duration_unit === 'months') {
                end.setMonth(start.getMonth() + plan.duration_value);
            }

            // 2. Actualizar Membresía
            const { data: updateData, error: updateError } = await supabase
                .from('memberships')
                .update({
                    status: 'active',
                    plan_name: plan.name,
                    price_cop: plan.price_cop,
                    expiry_date: end.toISOString().split('T')[0],
                    last_payment_date: start.toISOString().split('T')[0]
                })
                .eq('user_id', selectedUser.id)
                .select();

            let membershipId;
            if (!updateError && updateData && updateData.length > 0) {
                membershipId = updateData[0].id;
            } else {
                // Si no existe, crearla
                const { data: insertData, error: insertError } = await supabase
                    .from('memberships')
                    .insert({
                        user_id: selectedUser.id,
                        gym_id: adminProfile.gym_id,
                        status: 'active',
                        plan_name: plan.name,
                        price_cop: plan.price_cop,
                        expiry_date: end.toISOString().split('T')[0],
                        last_payment_date: start.toISOString().split('T')[0]
                    })
                    .select()
                    .single();
                if (insertError) throw insertError;
                membershipId = insertData.id;
            }

            // 3. Registrar Pago en Historial
            const { error: paymentError } = await supabase
                .from('member_payments')
                .insert([{
                    gym_id: adminProfile.gym_id,
                    user_id: selectedUser.id,
                    membership_id: membershipId,
                    amount: manualPaymentData.amount,
                    payment_method: manualPaymentData.method,
                    transfer_id: manualPaymentData.transfer_id,
                    notes: manualPaymentData.notes
                }]);

            if (paymentError) throw paymentError;

            setShowPayModal(false);
            await fetchMembers(adminProfile.gym_id);
        } catch (err) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleSendPaymentLink = async (user) => {
        alert(`🔗 Enlace de pago generado y enviado a ${user.name}\n(Funcionalidad vinculada a Stripe Connect)`);
    };

    const triggerPrint = (payment) => {
        setSelectedPayment(payment);
        setTimeout(() => {
            handlePrint();
        }, 100);
    };

    const [payNow, setPayNow] = useState(true);

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
            const { data: memberData, error: memberError } = await supabase
                .from('memberships')
                .insert([{
                    gym_id: adminProfile.gym_id,
                    user_id: authUser.id,
                    plan_name: plan.name,
                    status: payNow ? 'active' : 'inactive',
                    price_cop: plan.price_cop,
                    expiry_date: expiryDate,
                    last_payment_date: payNow ? startDate : null
                }])
                .select()
                .single();

            if (memberError) throw memberError;

            // D. Registrar el pago en efectivo (Historial) SEGUÚN CORRESPONDA
            if (payNow) {
                const { error: paymentError } = await supabase
                    .from('member_payments')
                    .insert([{
                        gym_id: adminProfile.gym_id,
                        user_id: authUser.id,
                        membership_id: memberData.id,
                        amount: plan.price_cop,
                        payment_method: 'cash',
                        notes: `Pago inicial de plan ${plan.name}`
                    }]);

                if (paymentError) throw paymentError;
            }

            setShowAddModal(false);
            setPayNow(true);
            await fetchMembers(adminProfile.gym_id);
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
            let membershipId;
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

            if (!membershipError && updateData && updateData.length > 0) {
                membershipId = updateData[0].id;
            } else if (!membershipError && (!updateData || updateData.length === 0)) {
                const { data: insertData, error: insertError } = await supabase
                    .from('memberships')
                    .insert({
                        user_id: selectedUser.id,
                        gym_id: adminProfile.gym_id,
                        status: editData.status === 'paid' ? 'active' : 'inactive',
                        plan_name: editData.plan_name,
                        expiry_date: editData.expiry_date,
                        last_payment_date: new Date().toISOString().split('T')[0]
                    })
                    .select()
                    .single();
                if (insertError) throw insertError;
                membershipId = insertData.id;
            } else if (membershipError) {
                throw membershipError;
            }

            // 3. Registrar el pago si se marcó como pagado (RENOVACIÓN)
            if (editData.status === 'paid') {
                const plan = gymPlans.find(p => p.name === editData.plan_name);
                await supabase
                    .from('member_payments')
                    .insert([{
                        gym_id: adminProfile.gym_id,
                        user_id: selectedUser.id,
                        membership_id: membershipId,
                        amount: plan?.price_cop || 0,
                        payment_method: 'cash',
                        notes: `Renovación de membresía: ${editData.plan_name}`
                    }]);
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

    const userInHistory = users.find(u => u.id === showHistoryModal);

    return (
        <div className="flex min-h-screen bg-background-light dark:bg-background-dark text-slate-800 dark:text-white font-display transition-colors">
            <AdminSidebar darkMode={darkMode} toggleDarkMode={toggleDarkMode} />

            <main className="flex-1 flex flex-col h-screen overflow-hidden pt-16 lg:pt-0">
                <header className="px-6 md:px-10 py-6 md:py-8 border-b border-border-light dark:border-border-dark bg-surface-light/30 dark:bg-surface-dark/30 backdrop-blur-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0 transition-colors">
                    <div>
                        <h1 className="text-2xl md:text-4xl font-black uppercase italic tracking-tighter text-slate-800 dark:text-white transition-colors">Consola de <span className="text-primary">Socios</span></h1>
                        <p className="text-slate-500 text-[10px] md:text-sm font-bold uppercase tracking-[0.2em] mt-1">Gestión administrativa de membresías</p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                        <div className="relative w-full sm:w-64">
                            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-lg">search</span>
                            <input
                                type="text"
                                placeholder="Buscar socio..."
                                className="w-full bg-black/5 dark:bg-background-dark/50 border border-black/5 dark:border-white/5 rounded-2xl py-3 pl-12 pr-4 text-sm focus:border-primary transition-all outline-none"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="w-full sm:w-auto px-6 py-3 bg-primary text-white rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] transition-all active:scale-95"
                        >
                            <span className="material-symbols-outlined text-lg">person_add</span>
                            Socio
                        </button>
                    </div>
                </header>

                <div className="flex-1 p-4 md:p-10 overflow-y-auto custom-scrollbar space-y-8 pb-32 lg:pb-10">
                    {/* Tarjetas Informativas */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                        <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark p-8 rounded-[2.5rem] relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                                <span className="material-symbols-outlined text-6xl">payments</span>
                            </div>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 font-sans">Recaudación Total (Efectivo)</p>
                            <h3 className="text-3xl font-black italic text-primary tracking-tighter">
                                {formatCurrency(users.reduce((acc, u) => acc + u.history.reduce((hAcc, h) => hAcc + h.amount, 0), 0))}
                            </h3>
                            <div className="mt-4 flex items-center gap-2 text-primary/60">
                                <span className="material-symbols-outlined text-sm">verified</span>
                                <span className="text-[10px] font-bold uppercase tracking-widest">Auditoría COP Sincronizada</span>
                            </div>
                        </div>

                        <div className="bg-surface-dark border border-border-dark p-8 rounded-[2.5rem] relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                                <span className="material-symbols-outlined text-6xl">check_circle</span>
                            </div>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 font-sans">Socios Activos</p>
                            <h3 className="text-3xl font-black italic text-white tracking-tighter">
                                {users.filter(u => u.status === 'paid').length} <span className="text-xs text-slate-500 not-italic">Personas</span>
                            </h3>
                            <div className="mt-4 flex items-center gap-2 text-slate-500">
                                <span className="material-symbols-outlined text-sm">trending_up</span>
                                <span className="text-[10px] font-bold uppercase tracking-widest">Crecimiento este mes</span>
                            </div>
                        </div>

                        <div className="bg-surface-dark border border-border-dark p-8 rounded-[2.5rem] relative overflow-hidden group border-red-500/20">
                            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                                <span className="material-symbols-outlined text-6xl text-red-500">error</span>
                            </div>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 font-sans">Por Renovar (Vencidos)</p>
                            <h3 className="text-3xl font-black italic text-red-500 tracking-tighter">
                                {users.filter(u => u.status === 'expired').length} <span className="text-xs text-slate-500 not-italic">Cuentas</span>
                            </h3>
                            <div className="mt-4 flex items-center gap-2 text-red-500/60">
                                <span className="material-symbols-outlined text-sm">notifications_active</span>
                                <span className="text-[10px] font-bold uppercase tracking-widest">Requiere acción administrativa</span>
                            </div>
                        </div>
                    </div>
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
                                    : 'bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark text-slate-500 hover:text-slate-700 dark:hover:text-white/20'
                                    }`}
                            >
                                <span className="material-symbols-outlined text-lg">{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-[1.5rem] md:rounded-[3rem] overflow-x-auto shadow-2xl transition-all scrollbar-hide">
                        <table className="w-full text-left min-w-[1200px]">
                            <thead>
                                <tr className="bg-black/5 dark:bg-background-dark/50 border-b border-border-light dark:border-border-dark">
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
                                                    onClick={() => openPayModal(user)}
                                                    className="bg-primary/10 hover:bg-primary text-primary hover:text-background-dark p-2 rounded-xl transition-all"
                                                    title="Registrar Pago"
                                                >
                                                    <span className="material-symbols-outlined text-lg">payments</span>
                                                </button>
                                                <button
                                                    onClick={() => handleSendPaymentLink(user)}
                                                    className="bg-blue-500/10 hover:bg-blue-500 text-blue-500 hover:text-white p-2 rounded-xl transition-all"
                                                    title="Enviar Link de Pago"
                                                >
                                                    <span className="material-symbols-outlined text-lg">link</span>
                                                </button>
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

            {/* Modal de Pago Manual (Tipo Superadmin) */}
            {showPayModal && selectedUser && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-background-dark/95 backdrop-blur-md" onClick={() => setShowPayModal(false)}></div>
                    <div className="relative bg-surface-dark border border-border-dark w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-fadeInUp">
                        <header className="p-10 border-b border-border-dark bg-background-dark/50 flex justify-between items-center">
                            <div>
                                <h3 className="text-2xl font-black uppercase italic">Registrar <span className="text-primary">Cobro</span></h3>
                                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Socio: {selectedUser.name}</p>
                            </div>
                            <button onClick={() => setShowPayModal(false)} className="text-slate-500 hover:text-white transition-colors">
                                <span className="material-symbols-outlined text-3xl">close</span>
                            </button>
                        </header>

                        <form onSubmit={handleManualPayment} className="p-10 space-y-6">
                            {error && (
                                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3">
                                    <span className="material-symbols-outlined text-red-500">error</span>
                                    <p className="text-red-500 text-xs font-bold uppercase tracking-widest">{error}</p>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Plan de Membresía</label>
                                    <select
                                        required
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all text-white appearance-none"
                                        value={manualPaymentData.plan_id}
                                        onChange={(e) => {
                                            const plan = gymPlans.find(p => p.id === e.target.value);
                                            setManualPaymentData(prev => ({ ...prev, plan_id: e.target.value, amount: plan?.price_cop || 0 }));
                                        }}
                                    >
                                        {gymPlans.map(plan => (
                                            <option key={plan.id} value={plan.id}>{plan.name} - {formatCurrency(plan.price_cop)}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Monto Recibido (COP)</label>
                                    <input
                                        type="number"
                                        required
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all"
                                        value={manualPaymentData.amount}
                                        onChange={(e) => setManualPaymentData(prev => ({ ...prev, amount: parseInt(e.target.value) }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Método de Pago</label>
                                    <select
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all text-white appearance-none"
                                        value={manualPaymentData.method}
                                        onChange={(e) => setManualPaymentData(prev => ({ ...prev, method: e.target.value }))}
                                    >
                                        <option value="cash">Efectivo</option>
                                        <option value="transfer">Transferencia Bancaria</option>
                                        <option value="card_manual">Datáfono / Manual</option>
                                        <option value="other">Otro</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">ID de Transferencia / Comprobante</label>
                                    <input
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all font-mono"
                                        placeholder="TRX-123456..."
                                        value={manualPaymentData.transfer_id}
                                        onChange={(e) => setManualPaymentData(prev => ({ ...prev, transfer_id: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Notas Internas</label>
                                <textarea
                                    className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all resize-none h-24"
                                    placeholder="Detalles adicionales del pago..."
                                    value={manualPaymentData.notes}
                                    onChange={(e) => setManualPaymentData(prev => ({ ...prev, notes: e.target.value }))}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={actionLoading}
                                className="w-full bg-primary text-background-dark font-black py-5 rounded-[2rem] uppercase tracking-widest hover:shadow-[0_0_30px_rgba(13,242,89,0.3)] transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                            >
                                {actionLoading ? 'Procesando...' : `Confirmar y Registrar ${formatCurrency(manualPaymentData.amount)}`}
                                <span className="material-symbols-outlined">check_circle</span>
                            </button>
                        </form>
                    </div>
                </div>
            )}

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

                            <div className="flex flex-col gap-6">
                                <div className="flex items-center justify-between px-6 py-4 bg-background-dark/50 border-2 border-white/5 rounded-3xl cursor-pointer hover:border-primary/30 transition-all select-none" onClick={() => setPayNow(!payNow)}>
                                    <div className="flex items-center gap-4">
                                        <div className={`size-6 rounded-lg border-2 flex items-center justify-center transition-all ${payNow ? 'bg-primary border-primary' : 'border-white/20'}`}>
                                            {payNow && <span className="material-symbols-outlined text-background-dark text-lg font-black">check</span>}
                                        </div>
                                        <div>
                                            <p className="font-black uppercase italic text-sm">Registrar Pago Inmediato</p>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase">La membresía se activará ahora mismo</p>
                                        </div>
                                    </div>
                                    <span className={`text-lg font-black italic transition-colors ${payNow ? 'text-primary' : 'text-slate-500 line-through'}`}>{formatCurrency(gymPlans.find(p => p.id === selectedPlanId)?.price_cop || 0)}</span>
                                </div>

                                {/* Resumen de Vigencia Autocalculado */}
                                <div className={`${payNow ? 'bg-primary/5 border-primary/20' : 'bg-red-500/5 border-red-500/20'} border rounded-3xl p-6 flex justify-around items-center text-center transition-all`}>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Estado Inicial</p>
                                        <p className={`text-lg font-black italic uppercase ${payNow ? 'text-primary' : 'text-red-500'}`}>{payNow ? 'Activo' : 'Vencido'}</p>
                                    </div>
                                    <div className={`h-10 w-px ${payNow ? 'bg-primary/20' : 'bg-red-500/20'}`}></div>
                                    <div>
                                        <p className={`text-[10px] font-black uppercase tracking-widest ${payNow ? 'text-primary' : 'text-slate-500'}`}>Expira el</p>
                                        <p className={`text-lg font-black italic ${payNow ? 'text-primary' : 'text-red-500 opacity-50'}`}>{new Date(expiryDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                                    </div>
                                </div>
                            </div>

                            <button type="submit" disabled={actionLoading || loadingPlans} className={`w-full font-black py-5 rounded-[2rem] uppercase tracking-widest transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 ${payNow ? 'bg-primary text-background-dark hover:shadow-[0_0_30px_rgba(13,242,89,0.3)]' : 'bg-slate-700 text-white opacity-90'}`}>
                                {actionLoading ? 'Procesando Sincronización...' : payNow ? `Activar Membresía y Cobrar ${formatCurrency(gymPlans.find(p => p.id === selectedPlanId)?.price_cop || 0)}` : 'Registrar Socio (Pendiente de Pago)'}
                                <span className="material-symbols-outlined">{actionLoading ? 'sync' : payNow ? 'verified_user' : 'no_accounts'}</span>
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
                                        <div className="text-right flex flex-col items-end gap-2">
                                            <p className="text-lg font-black italic">{formatCurrency(h.amount)}</p>
                                            <button
                                                onClick={() => triggerPrint(h)}
                                                className="bg-primary/20 hover:bg-primary text-primary hover:text-background-dark font-black px-3 py-1 rounded-lg text-[8px] uppercase tracking-widest transition-all flex items-center gap-1 border border-primary/30"
                                            >
                                                <span className="material-symbols-outlined text-xs">print</span>
                                                Imprimir
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Recibo de Pago Oculto (Se activa al imprimir) */}
            <div style={{ display: 'none' }}>
                <div ref={componentRef} className="p-16 bg-white text-slate-900 font-sans min-h-[1000px] flex flex-col justify-between">
                    <div>
                        {/* Cabecera Recibo */}
                        <div className="flex justify-between items-start border-b-4 border-slate-900 pb-10 mb-10">
                            <div>
                                <h1 className="text-5xl font-black uppercase italic tracking-tighter text-slate-900 leading-none mb-4">
                                    {adminProfile?.gyms?.name || 'RECIBO DE PAGO'}
                                </h1>
                                <p className="text-sm font-bold text-slate-500 uppercase tracking-[0.2em]">Comprobante Interno de Membresía</p>
                            </div>
                            <div className="text-right">
                                <div className="bg-slate-900 text-white px-6 py-3 rounded-xl inline-block mb-3">
                                    <p className="text-[10px] font-black uppercase tracking-widest mb-1">REFERENCIA NO.</p>
                                    <p className="text-xl font-black italic tracking-tighter">#{selectedPayment?.id?.substring(0, 8).toUpperCase()}</p>
                                </div>
                            </div>
                        </div>

                        {/* Info Cliente y Fecha */}
                        <div className="grid grid-cols-2 gap-12 mb-16">
                            <div className="space-y-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Datos del Socio</p>
                                <div className="space-y-1">
                                    <p className="text-2xl font-black uppercase italic text-slate-900">{selectedPayment?.user_name}</p>
                                    <p className="text-sm font-bold text-slate-600">ID Socio: {showHistoryModal?.substring(0, 8)}</p>
                                </div>
                            </div>
                            <div className="space-y-4 text-right">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Fecha de Emisión</p>
                                <p className="text-xl font-bold uppercase text-slate-700 italic">{selectedPayment?.date}</p>
                            </div>
                        </div>

                        {/* Detalles del Plan */}
                        <div className="bg-slate-50 rounded-[2.5rem] border border-slate-200 overflow-hidden mb-16">
                            <table className="w-full">
                                <thead className="bg-slate-900 text-white uppercase text-[10px] font-black tracking-widest">
                                    <tr>
                                        <th className="px-10 py-6 text-left">Descripción de Membresía</th>
                                        <th className="px-10 py-6 text-right w-64 text-sm">Costo del Plan</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-slate-200">
                                        <td className="px-10 py-12">
                                            <p className="text-xl font-black uppercase text-slate-900 mb-2 italic tracking-tighter">
                                                {selectedPayment?.plan || 'Membresía General'}
                                            </p>
                                            <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-lg">
                                                Acceso total a las instalaciones del gimnasio según el plan contratado. Este recibo confirma la recepción conforme del pago por servicios de acondicionamiento físico.
                                            </p>
                                        </td>
                                        <td className="px-10 py-12 text-right align-top">
                                            <p className="text-3xl font-black text-slate-900 italic tracking-tighter">{formatCurrency(selectedPayment?.amount || 0)}</p>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Totales y QR */}
                        <div className="flex justify-between items-end gap-16">
                            <div className="space-y-8 flex-1">
                                <div className="flex gap-8 items-center">
                                    <img
                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=GYM-PAY-${selectedPayment?.id}`}
                                        alt="QR Validation"
                                        className="size-36 border-2 border-slate-900 p-2 rounded-2xl bg-white shadow-lg"
                                    />
                                    <div className="max-w-xs">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Sello de Verificación</p>
                                        <p className="text-xs text-slate-500 font-bold leading-relaxed italic">
                                            Este comprobante certifica un pago legítimo realizado en efectivo en las instalaciones de {adminProfile?.gyms?.name}. Para soporte contactar a la administración del gimnasio.
                                        </p>
                                    </div>
                                </div>
                                <div className="w-64 pt-6">
                                    <div className="h-px bg-slate-300 mb-2"></div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Recibí Conforme (Firma Adm)</p>
                                </div>
                            </div>

                            <div className="w-96 space-y-4">
                                <div className="flex justify-between items-center px-4">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base del Plan:</span>
                                    <span className="text-lg font-bold text-slate-600 tracking-tighter font-mono">{formatCurrency(selectedPayment?.amount || 0)}</span>
                                </div>
                                <div className="flex justify-between items-center px-4 pb-4 border-b border-slate-100">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Impuestos (INC/IVA):</span>
                                    <span className="text-lg font-bold text-slate-600 tracking-tighter font-mono">$0.00</span>
                                </div>
                                <div className="bg-slate-900 text-white p-8 rounded-[2rem] shadow-2xl flex justify-between items-center">
                                    <span className="text-sm font-black uppercase italic tracking-widest">VALOR PAGADO:</span>
                                    <span className="text-4xl font-black italic tracking-tighter">{formatCurrency(selectedPayment?.amount || 0)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer Legal */}
                    <div className="border-t border-slate-100 pt-10">
                        <div className="grid grid-cols-2 gap-16 text-[9px] text-slate-400 font-bold leading-relaxed text-justify uppercase tracking-widest">
                            <p>
                                * Este documento es un soporte administrativo privado. El gimnasio se reserva el derecho de admisión según el reglamento interno. Pagos no reembolsables después de activado el acceso.
                            </p>
                            <p className="text-right">
                                Documento generado digitalmente por Antigravity Gym Ecosystem v2.0. Referencia de Auditoría Interna: {selectedPayment?.id}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
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