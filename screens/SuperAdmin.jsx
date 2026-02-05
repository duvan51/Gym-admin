import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

const SuperAdmin = () => {
    const [activeTab, setActiveTab] = useState('gyms');
    const [showAddModal, setShowAddModal] = useState(false);

    // Configuración de Planes SaaS (lo que SuperAdmin cobra a los Gyms)
    const [saasPlans] = useState([
        { id: 1, name: "Basic", price: 450000, limit: "100 socios", duration: 30 },
        { id: 2, name: "Pro", price: 850000, limit: "500 socios", duration: 30 },
        { id: 3, name: "Enterprise", price: 1500000, limit: "Ilimitado", duration: 30 }
    ]);

    const [gyms, setGyms] = useState([
        { id: 1, name: "Central Iron Gym", owner: "Juan Pérez", status: "active", plan: "Enterprise", members: 842, startDate: "2024-01-12", endDate: "2025-01-12" },
        { id: 2, name: "Spartan Fitness", owner: "Maria Casallas", status: "active", plan: "Pro", members: 320, startDate: "2024-02-05", endDate: "2025-03-05" },
        { id: 3, name: "Yoga Flow Studio", owner: "Ricardo Sosa", status: "inactive", plan: "Basic", members: 45, startDate: "2023-11-20", endDate: "2023-12-20" },
    ]);

    // Estados para el nuevo gimnasio
    const today = new Date().toISOString().split('T')[0];
    const [newGymData, setNewGymData] = useState({
        name: '',
        owner: '',
        email: '', // Needed for auth
        password: '', // Needed for auth
        planId: '',
        startDate: today,
        endDate: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingGym, setEditingGym] = useState(null);
    const [metrics, setMetrics] = useState({
        mrr: 0,
        activeGyms: 0,
        totalAthletes: 0,
        projection: 0
    });
    const [payments, setPayments] = useState([]);



    // Fetch existing plans from Supabase
    const [plans, setPlans] = useState([]);
    useEffect(() => {
        const fetchInitialData = async () => {
            const { data: plansData } = await supabase.from('saas_plans').select('*');
            if (plansData) {
                setPlans(plansData);
                setNewGymData(prev => ({ ...prev, planId: plansData[0]?.id }));
            }
            await fetchGyms();
            await fetchMetrics();
            await fetchPayments();
        };
        fetchInitialData();
    }, []);

    const fetchPayments = async () => {
        const { data } = await supabase
            .from('gym_payments')
            .select('*, gyms(name), saas_plans(name)')
            .order('payment_date', { ascending: false });
        if (data) setPayments(data);
    };


    const fetchMetrics = async () => {
        try {
            // 1. Total Athletes
            const { count: athletesCount } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'user');

            // 2. Active Gyms & MRR
            const { data: activeGymsData } = await supabase
                .from('gyms')
                .select('plan_id, saas_plans(price_cop)')
                .eq('status', 'active');

            const mrr = activeGymsData?.reduce((acc, g) => acc + (Number(g.saas_plans?.price_cop) || 0), 0) || 0;

            setMetrics({
                mrr,
                activeGyms: activeGymsData?.length || 0,
                totalAthletes: athletesCount || 0,
                projection: mrr * 12
            });
        } catch (err) {
            console.error("Error fetching metrics:", err);
        }
    };


    const fetchGyms = async () => {
        const { data, error } = await supabase
            .from('gyms')
            .select(`
                *,
                saas_plans (id, name, price_cop)
            `)
            .order('created_at', { ascending: false });

        if (data) {
            // Fetch member counts and admin profile for each gym
            const gymsWithMembers = await Promise.all(data.map(async (g) => {
                const { count } = await supabase
                    .from('profiles')
                    .select('*', { count: 'exact', head: true })
                    .eq('gym_id', g.id)
                    .eq('role', 'user');

                // Get gym admin email and user_id
                const { data: adminProfile } = await supabase
                    .from('profiles')
                    .select('id, email')
                    .eq('gym_id', g.id)
                    .eq('role', 'admin')
                    .limit(1)
                    .single();

                return {
                    id: g.id,
                    name: g.name,
                    owner: g.owner_name,
                    status: g.status,
                    plan: g.saas_plans?.name || 'N/A',
                    plan_id: g.plan_id,
                    members: count || 0,
                    startDate: g.start_date,
                    endDate: g.end_date,
                    admin_id: adminProfile?.id,
                    admin_email: adminProfile?.email || ''
                };
            }));
            setGyms(gymsWithMembers);
        }
    };


    // Calcular fin de suscripción SaaS automáticamente
    useEffect(() => {
        if (newGymData.startDate && newGymData.planId && plans.length > 0) {
            const selectedPlan = plans.find(p => p.id === newGymData.planId);
            const duration = selectedPlan?.duration_days || 30;
            const start = new Date(newGymData.startDate);
            const end = new Date(start);
            end.setDate(start.getDate() + duration);
            setNewGymData(prev => ({ ...prev, endDate: end.toISOString().split('T')[0] }));
        }
    }, [newGymData.startDate, newGymData.planId, plans]);


    const formatCurrency = (val) => {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
    };

    const toggleGymStatus = async (id) => {
        const gym = gyms.find(g => g.id === id);
        const newStatus = gym.status === 'active' ? 'inactive' : 'active';

        const { error } = await supabase
            .from('gyms')
            .update({ status: newStatus })
            .eq('id', id);

        if (!error) {
            setGyms(gyms.map(g => g.id === id ? { ...g, status: newStatus } : g));
        }
    };

    const handleUpdateGym = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { error } = await supabase
                .from('gyms')
                .update({
                    name: editingGym.name,
                    owner_name: editingGym.owner,
                    plan_id: editingGym.plan_id,
                    start_date: editingGym.startDate,
                    end_date: editingGym.endDate,
                    status: editingGym.status
                })
                .eq('id', editingGym.id);

            if (error) throw error;

            // Update Auth Credentials if changed
            if (editingGym.admin_id) {
                const gymInList = gyms.find(g => g.id === editingGym.id);
                const emailChanged = editingGym.admin_email !== gymInList?.admin_email;
                const passwordProvided = editingGym.admin_new_password && editingGym.admin_new_password.length > 0;

                if (emailChanged || passwordProvided) {
                    const { data: resultData, error: fnError } = await supabase.functions.invoke('manage-user-auth', {
                        body: {
                            action: 'update_credentials',
                            userId: editingGym.admin_id,
                            email: emailChanged ? editingGym.admin_email : undefined,
                            password: passwordProvided ? editingGym.admin_new_password : undefined
                        }
                    });

                    if (fnError) throw new Error(fnError.message || 'Error al actualizar credenciales');

                    // Sync email in profiles if it changed
                    if (emailChanged) {
                        await supabase
                            .from('profiles')
                            .update({ email: editingGym.admin_email })
                            .eq('id', editingGym.admin_id);
                    }
                }
            }

            await fetchGyms();
            await fetchMetrics();
            setShowEditModal(false);
            setEditingGym(null);
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };


    const handleAddGym = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            // 1. Create the Gym Admin user in Supabase Auth using Edge Function to avoid logging out the SuperAdmin
            const { data: resultData, error: fnError } = await supabase.functions.invoke('manage-user-auth', {
                body: {
                    action: 'create_user',
                    email: newGymData.email,
                    password: newGymData.password,
                    full_name: newGymData.owner
                }
            });

            if (fnError) throw new Error(fnError.message || 'Error al crear administrador de gimnasio');

            const authUser = resultData.user;

            // 2. Create the Gym record
            const { data: gymData, error: gymError } = await supabase
                .from('gyms')
                .insert([{
                    name: newGymData.name,
                    owner_name: newGymData.owner,
                    plan_id: newGymData.planId,
                    start_date: newGymData.startDate,
                    end_date: newGymData.endDate,
                    status: 'active'
                }])
                .select()
                .single();

            if (gymError) throw gymError;

            // 3. Update the newly created profile with the gym_id and email
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    gym_id: gymData.id,
                    role: 'admin',
                    email: newGymData.email
                })
                .eq('id', authUser.id);

            if (profileError) throw profileError;

            // 4. Record Initial Payment
            const selectedPlan = plans.find(p => p.id === newGymData.planId);
            await supabase.from('gym_payments').insert([{
                gym_id: gymData.id,
                plan_id: selectedPlan.id,
                amount: selectedPlan.price_cop,
                status: 'completed'
            }]);

            // Success
            await fetchGyms();
            await fetchPayments();
            await fetchMetrics();
            setShowAddModal(false);
            setNewGymData({ name: '', owner: '', email: '', password: '', planId: plans[0]?.id, startDate: today });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };


    return (
        <div className="min-h-screen bg-background-dark text-white font-display flex flex-col">
            {/* SuperAdmin Header */}
            <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-background-dark/80 backdrop-blur-xl px-10 py-6 flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <div className="bg-primary-blue/20 p-3 rounded-2xl border border-primary-blue/30 shadow-[0_0_20px_rgba(25,127,230,0.2)]">
                        <span className="material-symbols-outlined text-primary-blue text-3xl font-black">admin_panel_settings</span>
                    </div>
                    <div>
                        <h1 className="text-2xl font-black uppercase italic tracking-tighter">Admin <span className="text-primary-blue">Central</span></h1>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Gestión de Ecosistema SaaS</p>
                    </div>
                </div>

                <nav className="flex items-center gap-2 bg-surface-dark p-1.5 rounded-2xl border border-white/5">
                    {[
                        { id: 'metrics', label: 'Métricas', icon: 'analytics' },
                        { id: 'gyms', label: 'Gimnasios', icon: 'domain' },
                        { id: 'payments', label: 'Pagos SaaS', icon: 'receipt_long' },
                        { id: 'pricing', label: 'Precios SaaS', icon: 'payments' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-primary-blue text-white shadow-lg shadow-primary-blue/30' : 'text-slate-500 hover:text-white'}`}
                        >
                            <span className="material-symbols-outlined text-sm">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}

                </nav>

                <Link to="/login" className="flex items-center gap-2 text-slate-500 hover:text-red-500 transition-colors font-black uppercase text-[10px] tracking-widest">
                    Cerrar Sesión <span className="material-symbols-outlined text-sm">logout</span>
                </Link>
            </header>

            <main className="flex-1 p-10 overflow-y-auto custom-scrollbar">
                {activeTab === 'metrics' && (
                    <div className="space-y-8 animate-fadeIn">
                        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {[
                                { label: 'MRR Global', value: formatCurrency(metrics.mrr), trend: '+12%', icon: 'account_balance_wallet', color: 'text-primary-blue' },
                                { label: 'Gimnasios Activos', value: metrics.activeGyms, trend: '+1', icon: 'store', color: 'text-primary' },
                                { label: 'Atletas Totales', value: metrics.totalAthletes.toLocaleString(), trend: '+8%', icon: 'groups', color: 'text-orange-500' },
                                { label: 'Proyección Anual', value: formatCurrency(metrics.projection), trend: 'Estable', icon: 'query_stats', color: 'text-purple-500' }
                            ].map((stat, i) => (

                                <div key={i} className="bg-surface-dark border border-border-dark p-8 rounded-[2.5rem] relative overflow-hidden group">
                                    <span className={`material-symbols-outlined absolute top-6 right-6 text-4xl opacity-10 ${stat.color}`}>{stat.icon}</span>
                                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">{stat.label}</p>
                                    <h3 className="text-3xl font-black italic">{stat.value}</h3>
                                    <p className={`text-[10px] font-bold mt-2 ${stat.trend.includes('+') ? 'text-primary' : 'text-slate-400'}`}>{stat.trend} este mes</p>
                                </div>
                            ))}
                        </section>

                        <div className="bg-surface-dark border border-border-dark rounded-[2.5rem] p-10">
                            <h3 className="text-xl font-black uppercase italic mb-8">Crecimiento Mensual Recurrente</h3>
                            <div className="h-64 flex items-end gap-4">
                                {[30, 45, 35, 70, 65, 80, 95, 100, 115, 130].map((h, i) => (
                                    <div key={i} className="flex-1 bg-primary-blue/20 rounded-t-xl relative group" style={{ height: `${h}%` }}>
                                        <div className="absolute inset-0 bg-primary-blue scale-y-0 group-hover:scale-y-100 transition-transform origin-bottom rounded-t-xl opacity-40"></div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between mt-4 text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">
                                <span>Nov</span><span>Dic</span><span>Ene</span><span>Feb</span><span>Mar</span><span>Abr</span><span>May</span><span>Jun</span><span>Jul</span><span>Ago</span>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'gyms' && (
                    <div className="space-y-8 animate-fadeIn">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-3xl font-black uppercase italic tracking-tight">Directorio de <span className="text-primary-blue">Negocios</span></h2>
                                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Control de licencias y suscripciones activas</p>
                            </div>
                            <div className="flex gap-4">
                                <button onClick={() => setShowAddModal(true)} className="bg-primary-blue text-white px-8 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-primary-blue/20 flex items-center gap-2 hover:scale-105 transition-transform">
                                    <span className="material-symbols-outlined text-lg">add_business</span>
                                    Registrar Gimnasio
                                </button>
                            </div>
                        </div>

                        <div className="bg-surface-dark border border-border-dark rounded-[2.5rem] overflow-hidden shadow-2xl">
                            <table className="w-full text-left">
                                <thead className="bg-background-dark/50 border-b border-border-dark">
                                    <tr>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Gimnasio / Dueño</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Plan SaaS</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Inicia</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-primary-blue tracking-widest">Vence el</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-center">Estado</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {gyms.map(gym => {
                                        const isExpired = new Date(gym.endDate) < new Date();
                                        return (
                                            <tr key={gym.id} className="hover:bg-white/[0.02] transition-colors group">
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`size-12 rounded-2xl ${gym.status === 'active' ? 'bg-primary-blue/10 text-primary-blue' : 'bg-red-500/10 text-red-500'} flex items-center justify-center border border-white/5 group-hover:border-primary-blue/30 transition-all`}>
                                                            <span className="material-symbols-outlined">{gym.status === 'active' ? 'store' : 'storefront'}</span>
                                                        </div>
                                                        <div>
                                                            <p className="font-black uppercase italic text-sm">{gym.name}</p>
                                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{gym.owner}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10 bg-white/5`}>
                                                        {gym.plan}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-6 font-bold text-sm text-slate-400">
                                                    {new Date(gym.startDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className={`flex items-center gap-2 font-black italic text-sm ${isExpired ? 'text-red-500' : 'text-white'}`}>
                                                        <span className="material-symbols-outlined text-xs">event</span>
                                                        {new Date(gym.endDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className={`flex items-center justify-center gap-2 ${gym.status === 'active' ? 'text-primary' : 'text-red-500'}`}>
                                                        <span className={`size-2 rounded-full ${gym.status === 'active' ? 'bg-primary shadow-[0_0_10px_rgba(13,242,89,0.5)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'}`}></span>
                                                        <span className="text-[10px] font-black uppercase italic tracking-widest">{gym.status === 'active' ? 'ACTIVO' : 'VENCIDO'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 text-right">
                                                    <div className="flex justify-end gap-3">
                                                        <button onClick={() => toggleGymStatus(gym.id)} className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-white transition-all">
                                                            <span className="material-symbols-outlined text-lg">{gym.status === 'active' ? 'pause_circle' : 'play_circle'}</span>
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setEditingGym({
                                                                    ...gym,
                                                                    admin_new_password: ''
                                                                });
                                                                setShowEditModal(true);
                                                            }}
                                                            className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-primary-blue transition-all"
                                                        >
                                                            <span className="material-symbols-outlined text-lg">edit_square</span>
                                                        </button>

                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}


                {activeTab === 'payments' && (
                    <div className="space-y-8 animate-fadeIn">
                        <div>
                            <h2 className="text-3xl font-black uppercase italic tracking-tight">Historial de <span className="text-primary-blue">Pagos SaaS</span></h2>
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Registro cronológico de ingresos por suscripciones</p>
                        </div>

                        <div className="bg-surface-dark border border-border-dark rounded-[2.5rem] overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-background-dark/50 border-b border-border-dark">
                                    <tr>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Gimnasio</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Plan</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Monto</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Fecha</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {payments.length === 0 ? (
                                        <tr>
                                            <td colSpan="5" className="px-8 py-20 text-center text-slate-500 font-bold uppercase tracking-widest">No hay pagos registrados</td>
                                        </tr>
                                    ) : payments.map(pay => (
                                        <tr key={pay.id} className="hover:bg-white/[0.02]">
                                            <td className="px-8 py-6 font-black uppercase italic text-sm text-white">{pay.gyms?.name}</td>
                                            <td className="px-8 py-6">
                                                <span className="bg-white/5 border border-white/10 px-3 py-1 rounded-lg text-[10px] font-black uppercase">{pay.saas_plans?.name}</span>
                                            </td>
                                            <td className="px-8 py-6 font-black text-primary-blue">{formatCurrency(pay.amount)}</td>
                                            <td className="px-8 py-6 text-slate-400 text-xs font-bold">
                                                {new Date(pay.payment_date).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="px-8 py-6 text-right">
                                                <span className="bg-primary/20 text-primary border border-primary/30 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-tighter">Completado</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                {activeTab === 'pricing' && (
                    <div className="space-y-12 animate-fadeIn max-w-6xl mx-auto">
                        <header className="text-center">
                            <h2 className="text-4xl font-black uppercase italic mb-4 tracking-tighter">Esquema de <span className="text-primary-blue">Tarifas SaaS</span></h2>
                            <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-sm">Define el costo de suscripción por gimnasio</p>
                        </header>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {saasPlans.map(plan => (
                                <div key={plan.id} className="bg-surface-dark border-2 border-border-dark rounded-[3rem] p-10 flex flex-col items-center text-center group hover:border-primary-blue/50 transition-all hover:-translate-y-2">
                                    <div className="size-16 rounded-3xl bg-white/5 flex items-center justify-center mb-6 group-hover:bg-primary-blue/20 group-hover:text-primary-blue transition-all">
                                        <span className="material-symbols-outlined text-3xl font-black">inventory_2</span>
                                    </div>
                                    <h3 className="text-2xl font-black uppercase italic mb-2 tracking-tight">{plan.name}</h3>
                                    <div className="text-3xl font-black text-white mb-4 italic">{formatCurrency(plan.price)}<span className="text-xs text-slate-500 font-bold uppercase tracking-widest not-italic ml-1">/mes</span></div>
                                    <div className="w-full h-px bg-white/5 mb-8"></div>
                                    <ul className="space-y-4 mb-10 text-xs font-bold uppercase tracking-widest text-slate-400">
                                        <li className="flex items-center gap-2 justify-center"><span className="material-symbols-outlined text-primary-blue text-lg">check_circle</span> {plan.limit}</li>
                                        <li className="flex items-center gap-2 justify-center"><span className="material-symbols-outlined text-primary-blue text-lg">check_circle</span> App iOS/Android</li>
                                        <li className="flex items-center gap-2 justify-center"><span className="material-symbols-outlined text-primary-blue text-lg">check_circle</span> Backend Cloud</li>
                                    </ul>
                                    <button className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-primary-blue hover:text-white transition-all">Editar Tarifario</button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {/* Modal: Registrar Gimnasio */}
            {showAddModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-background-dark/95 backdrop-blur-xl" onClick={() => setShowAddModal(false)}></div>
                    <div className="relative bg-surface-dark border border-border-dark w-full max-w-3xl rounded-[3rem] shadow-2xl overflow-hidden animate-fadeInUp">
                        <header className="bg-background-dark/50 p-10 border-b border-border-dark flex justify-between items-center">
                            <div>
                                <h3 className="text-3xl font-black italic uppercase tracking-tighter">Nuevo <span className="text-primary-blue">Gimnasio Partner</span></h3>
                                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">Configuración inicial de cuenta corporativa</p>
                            </div>
                            <button onClick={() => setShowAddModal(false)} className="text-slate-500 hover:text-white transition-colors"><span className="material-symbols-outlined text-4xl">close</span></button>
                        </header>

                        <form onSubmit={handleAddGym} className="p-10 space-y-8">
                            {error && (
                                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3">
                                    <span className="material-symbols-outlined text-red-500">error</span>
                                    <p className="text-red-500 text-xs font-bold uppercase tracking-widest">{error}</p>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre Comercial</label>
                                    <input
                                        required
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all"
                                        placeholder="Ej: Iron Fitness Center"
                                        value={newGymData.name}
                                        onChange={e => setNewGymData({ ...newGymData, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Dueño / Representante</label>
                                    <input
                                        required
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all"
                                        placeholder="Nombre del propietario"
                                        value={newGymData.owner}
                                        onChange={e => setNewGymData({ ...newGymData, owner: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Email de Acceso Gym</label>
                                    <input
                                        type="email"
                                        required
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all"
                                        placeholder="admin@gym.com"
                                        value={newGymData.email}
                                        onChange={e => setNewGymData({ ...newGymData, email: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Contraseña Provisional</label>
                                    <input
                                        type="password"
                                        required
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all"
                                        placeholder="••••••••"
                                        value={newGymData.password}
                                        onChange={e => setNewGymData({ ...newGymData, password: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha de Alta</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-white scheme-dark"
                                        value={newGymData.startDate}
                                        onChange={e => setNewGymData({ ...newGymData, startDate: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Suscripción SaaS</label>
                                    <select
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all appearance-none"
                                        value={newGymData.planId}
                                        onChange={e => setNewGymData({ ...newGymData, planId: e.target.value })}
                                    >
                                        {plans.map(p => (
                                            <option key={p.id} value={p.id}>{p.name} - {formatCurrency(p.price_cop)}/mes</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="bg-primary-blue/5 border border-primary-blue/20 rounded-3xl p-6 flex justify-between items-center text-center">
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Inicia</p>
                                    <p className="text-lg font-black italic">{new Date(newGymData.startDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'long' })}</p>
                                </div>
                                <div className="flex flex-col items-center">
                                    <span className="material-symbols-outlined text-primary-blue text-2xl">arrow_forward</span>
                                    <p className="text-[8px] font-black text-primary-blue uppercase tracking-widest">
                                        {plans.find(p => p.id === newGymData.planId)?.duration_days || 30} Días
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-primary-blue uppercase tracking-widest mb-1">Vence SaaS</p>
                                    <p className="text-lg font-black italic text-primary-blue">{new Date(newGymData.endDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                                </div>
                            </div>


                            <button type="submit" disabled={loading} className="w-full bg-primary-blue text-white font-black py-5 rounded-[2rem] uppercase tracking-widest hover:shadow-[0_0_40px_rgba(25,127,230,0.4)] transition-all flex items-center justify-center gap-3 active:scale-95 shadow-xl disabled:opacity-50 disabled:cursor-not-allowed">
                                {loading ? 'Procesando...' : 'Activar Licencia SaaS'}
                                <span className="material-symbols-outlined">{loading ? 'sync' : 'rocket_launch'}</span>
                            </button>
                        </form>
                    </div>
                </div>
            )}
            {/* Modal: Editar Gimnasio */}
            {showEditModal && editingGym && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-background-dark/95 backdrop-blur-xl" onClick={() => setShowEditModal(false)}></div>
                    <div className="relative bg-surface-dark border border-border-dark w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-fadeInUp">
                        <header className="bg-background-dark/50 p-10 border-b border-border-dark flex justify-between items-center">
                            <div>
                                <h3 className="text-3xl font-black italic uppercase tracking-tighter">Editar <span className="text-primary-blue">Gimnasio</span></h3>
                                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">ID: {editingGym.id}</p>
                            </div>
                            <button onClick={() => setShowEditModal(false)} className="text-slate-500 hover:text-white transition-colors"><span className="material-symbols-outlined text-4xl">close</span></button>
                        </header>

                        <form onSubmit={handleUpdateGym} className="p-10 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nombre del Negocio</label>
                                    <input
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all"
                                        value={editingGym.name}
                                        onChange={e => setEditingGym({ ...editingGym, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nombre del Dueño</label>
                                    <input
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all"
                                        value={editingGym.owner}
                                        onChange={e => setEditingGym({ ...editingGym, owner: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Plan SaaS Activo</label>
                                    <select
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all"
                                        value={editingGym.plan_id}
                                        onChange={e => setEditingGym({ ...editingGym, plan_id: e.target.value })}
                                    >
                                        {plans.map(p => (
                                            <option key={p.id} value={p.id}>{p.name} - {formatCurrency(p.price_cop)}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Estado</label>
                                    <select
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all"
                                        value={editingGym.status}
                                        onChange={e => setEditingGym({ ...editingGym, status: e.target.value })}
                                    >
                                        <option value="active">Activo</option>
                                        <option value="inactive">Inactivo</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Fecha Inicio</label>
                                    <input
                                        type="date"
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm text-white"
                                        value={editingGym.startDate}
                                        onChange={e => setEditingGym({ ...editingGym, startDate: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Fecha Vencimiento</label>
                                    <input
                                        type="date"
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm text-white"
                                        value={editingGym.endDate}
                                        onChange={e => setEditingGym({ ...editingGym, endDate: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Email de Acceso</label>
                                    <input
                                        type="email"
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all"
                                        value={editingGym.admin_email}
                                        onChange={e => setEditingGym({ ...editingGym, admin_email: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nueva Contraseña (Opcional)</label>
                                    <input
                                        type="password"
                                        className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-white"
                                        placeholder="Dejar vacío para no cambiar"
                                        value={editingGym.admin_new_password}
                                        onChange={e => setEditingGym({ ...editingGym, admin_new_password: e.target.value })}
                                    />
                                </div>
                            </div>

                            <button type="submit" disabled={loading} className="w-full bg-primary-blue text-white font-black py-5 rounded-[2rem] uppercase tracking-widest hover:shadow-[0_0_40px_rgba(25,127,230,0.4)] transition-all active:scale-95 shadow-xl disabled:opacity-50">
                                {loading ? 'Guardando...' : 'Actualizar Información'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
};

export default SuperAdmin;