import React, { useState, useEffect } from 'react';
import AdminSidebar from '../components/AdminSidebar';
import { supabase } from '../services/supabaseClient';

const BrandSettings = ({ darkMode, toggleDarkMode }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [userEmail, setUserEmail] = useState('');

    const [gymData, setGymData] = useState({
        name: '',
        avatar_url: '',
        email: '',
        address: ''
    });

    const [plans, setPlans] = useState([]);
    const [deletedPlanIds, setDeletedPlanIds] = useState([]);
    const [currentGymStatus, setCurrentGymStatus] = useState(null);
    const [stripeAccountStatus, setStripeAccountStatus] = useState({
        isOnboarded: false,
        accountId: null,
        loading: false
    });

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) setUserEmail(user.email);
                const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single();

                if (profile?.gym_id) {
                    const { data: gym } = await supabase.from('gyms').select('*, saas_plans(*)').eq('id', profile.gym_id).single();
                    if (gym) {
                        setGymData({
                            name: gym.name || '',
                            avatar_url: gym.avatar_url || '',
                            email: gym.email || '',
                            address: gym.address || ''
                        });
                        setCurrentGymStatus(gym);
                        setStripeAccountStatus({
                            isOnboarded: !!(gym.stripe_account_id && gym.stripe_onboarding_complete),
                            accountId: gym.stripe_account_id,
                            loading: false
                        });
                    }

                    const { data: gymPlans } = await supabase
                        .from('gym_membership_plans')
                        .select('*')
                        .eq('gym_id', profile.gym_id)
                        .order('created_at', { ascending: true });

                    if (gymPlans && gymPlans.length > 0) {
                        setPlans(gymPlans.map(p => ({
                            ...p,
                            price: p.price_cop.toString(),
                            durationValue: p.duration_value.toString(),
                            durationUnit: p.duration_unit,
                            services: p.features ? p.features.join(', ') : '',
                            color: p.duration_unit === 'months' ? 'border-primary' : 'border-slate-500'
                        })));
                    } else {
                        setPlans([
                            { id: 'temp-1', name: "Pase Diario", price: "15000", durationValue: "1", durationUnit: "days", services: "Acceso único, ducha, casillero", color: "border-slate-500", is_new: true },
                            { id: 'temp-2', name: "Mensualidad Pro", price: "95000", durationValue: "1", durationUnit: "months", services: "Acceso 24/7, Clases Grupales, IA Trainer", color: "border-primary", is_new: true },
                            { id: 'temp-3', name: "Anualidad Elite", price: "850000", durationValue: "12", durationUnit: "months", services: "Todo Incluido, Sauna, 2 meses gratis", color: "border-primary-blue", is_new: true }
                        ]);
                    }
                }
            } catch (err) {
                console.error("Error fetching data:", err);
            } finally {
                setLoading(false);
            }
        };

        const params = new URLSearchParams(window.location.search);
        if (params.get('stripe') === 'success') {
            window.history.replaceState({}, document.title, "/brand-settings");
        }

        fetchData();
    }, []);

    const handleUpdatePlan = (id, field, value) => {
        setPlans(plans.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    const handleAddPlan = () => {
        const newPlan = {
            id: `temp-${Date.now()}`,
            name: "Nuevo Plan",
            price: "50000",
            durationValue: "1",
            durationUnit: "months",
            services: "Descripción de servicios...",
            color: "border-primary",
            is_new: true
        };
        setPlans([...plans, newPlan]);
    };

    const handleDeletePlan = async (id) => {
        if (typeof id === 'string' && id.startsWith('temp-')) {
            setPlans(plans.filter(p => p.id !== id));
            return;
        }

        if (!confirm('¿Estás seguro de eliminar este plan? Esto no afectará a los usuarios que ya lo tengan activo.')) return;

        setDeletedPlanIds([...deletedPlanIds, id]);
        setPlans(plans.filter(p => p.id !== id));
    };

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
    };

    const handleSave = async () => {
        const btn = document.getElementById('save-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = 'Guardando...';
        btn.disabled = true;

        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single();

            if (profile?.gym_id) {
                const { error: gymError } = await supabase
                    .from('gyms')
                    .update({
                        name: gymData.name,
                        avatar_url: gymData.avatar_url,
                        email: gymData.email,
                        address: gymData.address
                    })
                    .eq('id', profile.gym_id);

                if (gymError) throw gymError;

                if (deletedPlanIds.length > 0) {
                    const { error: delError } = await supabase
                        .from('gym_membership_plans')
                        .delete()
                        .in('id', deletedPlanIds);
                    if (delError) throw delError;
                }

                for (const plan of plans) {
                    const planPayload = {
                        gym_id: profile.gym_id,
                        name: plan.name,
                        price_cop: parseFloat(plan.price || 0),
                        duration_value: parseInt(plan.durationValue || 1),
                        duration_unit: plan.durationUnit,
                        features: plan.services.split(',').map(s => s.trim()).filter(s => s !== ''),
                        is_active: true
                    };

                    if (plan.is_new || (typeof plan.id === 'string' && plan.id.startsWith('temp-'))) {
                        const { error: insError } = await supabase.from('gym_membership_plans').insert([planPayload]);
                        if (insError) throw insError;
                    } else {
                        const { error: updError } = await supabase.from('gym_membership_plans').update(planPayload).eq('id', plan.id);
                        if (updError) throw updError;
                    }
                }

                setDeletedPlanIds([]);

                const { data: freshPlans } = await supabase.from('gym_membership_plans').select('*').eq('gym_id', profile.gym_id).order('created_at', { ascending: true });
                if (freshPlans) {
                    setPlans(freshPlans.map(p => ({
                        ...p,
                        price: p.price_cop.toString(),
                        durationValue: p.duration_value.toString(),
                        durationUnit: p.duration_unit,
                        services: p.features ? p.features.join(', ') : '',
                        color: p.duration_unit === 'months' ? 'border-primary' : 'border-slate-500'
                    })));
                }
            }

            btn.innerHTML = '¡Cambios Guardados!';
            btn.classList.add('bg-green-600');
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.classList.remove('bg-green-600');
                btn.disabled = false;
            }, 2000);
        } catch (err) {
            console.error(err);
            alert("Error al guardar: " + err.message);
            btn.innerHTML = 'Reintentar';
            btn.disabled = false;
        }
    };

    const handleConnectStripe = async () => {
        setStripeAccountStatus(prev => ({ ...prev, loading: true }));
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single();

            if (!profile?.gym_id) throw new Error("Gimnasio no encontrado");

            const { data, error } = await supabase.functions.invoke('stripe-connect-onboarding', {
                body: { gym_id: profile.gym_id }
            });

            if (error) throw error;
            if (data?.url) window.location.href = data.url;

        } catch (err) {
            console.error("Error connecting to Stripe:", err);
            alert("⚠️ " + err.message);
        } finally {
            setStripeAccountStatus(prev => ({ ...prev, loading: false }));
        }
    };

    const handleUploadLogo = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single();

            const fileExt = file.name.split('.').pop();
            const fileName = `${profile.gym_id}/logo-${Math.random()}.${fileExt}`;
            const filePath = `logos/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('gym-logos')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('gym-logos')
                .getPublicUrl(filePath);

            setGymData({ ...gymData, avatar_url: publicUrl });
            await supabase.from('gyms').update({ avatar_url: publicUrl }).eq('id', profile.gym_id);

        } catch (err) {
            alert("Error uploading image: " + err.message);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="flex min-h-screen bg-background-light dark:bg-background-dark text-slate-800 dark:text-white font-display transition-colors">
            <AdminSidebar darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
            <main className="flex-1 flex flex-col h-screen overflow-hidden pt-16 lg:pt-0">
                <header className="px-6 md:px-10 py-6 md:py-8 border-b border-border-light dark:border-border-dark bg-surface-light/30 dark:bg-surface-dark/30 backdrop-blur-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0 transition-colors">
                    <div>
                        <h1 className="text-2xl md:text-4xl font-black uppercase italic tracking-tighter text-slate-800 dark:text-white transition-colors">Configuración de <span className="text-primary-blue">Marca</span></h1>
                        <p className="text-slate-500 text-[10px] md:text-sm font-bold uppercase tracking-[0.2em] mt-1">Identidad visual y planes de membresía</p>
                    </div>
                    <button
                        id="save-btn"
                        onClick={handleSave}
                        className="w-full md:w-auto px-8 py-4 bg-primary text-white rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 hover:shadow-[0_0_30px_rgba(13,242,89,0.3)] transition-all active:scale-95 shadow-xl"
                    >
                        Actualizar Configuración
                    </button>
                </header>

                <div className="flex-1 p-6 md:p-10 overflow-y-auto pb-32">
                    {/* Gym Profile Section */}
                    <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-[2.5rem] p-10 mb-12 grid grid-cols-1 lg:grid-cols-3 gap-10 shadow-sm transition-colors">
                        <div className="space-y-6">
                            <div className="relative group">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 block">Logo del Gimnasio</label>
                                <button
                                    onClick={() => document.getElementById('logo-upload').click()}
                                    disabled={isUploading}
                                    className="w-full text-left bg-transparent border-none p-0"
                                >
                                    <div className="size-48 rounded-[2rem] bg-white dark:bg-background-dark border-2 border-dashed border-black/10 dark:border-white/10 flex flex-col items-center justify-center overflow-hidden relative group-hover:border-primary/50 transition-all shadow-inner">
                                        {gymData.avatar_url ? (
                                            <img src={gymData.avatar_url} alt="Gym Logo" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-500">storefront</span>
                                        )}
                                        <div className="absolute inset-0 bg-primary/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center backdrop-blur-sm">
                                            <span className="material-symbols-outlined text-white text-3xl animate-bounce">upload</span>
                                            <span className="text-[10px] font-black text-white uppercase mt-2 tracking-widest">
                                                {isUploading ? 'Subiendo...' : 'Cambiar Logo'}
                                            </span>
                                        </div>
                                    </div>
                                </button>
                                <input
                                    id="logo-upload"
                                    type="file"
                                    accept="image/*"
                                    onChange={handleUploadLogo}
                                    className="hidden"
                                />
                                <p className="text-[10px] text-slate-500 mt-4 font-bold uppercase italic transition-colors">Recomendado: 512x512px PNG/JPG</p>
                            </div>
                        </div>

                        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Nombre del Gimnasio</label>
                                <input
                                    type="text"
                                    value={gymData.name}
                                    onChange={(e) => setGymData({ ...gymData, name: e.target.value })}
                                    className="w-full bg-white/50 dark:bg-background-dark/50 border-2 border-black/5 dark:border-white/5 rounded-2xl py-4 px-6 text-xl font-black italic uppercase outline-none focus:border-primary transition-all text-slate-800 dark:text-white shadow-sm"
                                    placeholder="Nombre de tu Gym"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Correo de Contacto</label>
                                <input
                                    type="email"
                                    value={gymData.email}
                                    onChange={(e) => setGymData({ ...gymData, email: e.target.value })}
                                    className="w-full bg-white/50 dark:bg-background-dark/50 border-2 border-black/5 dark:border-white/5 rounded-2xl py-4 px-6 text-xl font-black italic outline-none focus:border-primary transition-all text-primary-blue shadow-sm"
                                    placeholder="info@gym.com"
                                />
                            </div>

                            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Dirección Principal</label>
                                    <input
                                        type="text"
                                        value={gymData.address}
                                        onChange={(e) => setGymData({ ...gymData, address: e.target.value })}
                                        className="w-full bg-white/50 dark:bg-background-dark/50 border-2 border-black/5 dark:border-white/5 rounded-2xl py-4 px-6 text-lg font-bold outline-none focus:border-primary transition-all text-slate-700 dark:text-slate-200 shadow-sm"
                                        placeholder="Calle 123 #45-67, Ciudad"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Correo de Cuenta (Login)</label>
                                    <input
                                        type="text"
                                        value={userEmail}
                                        readOnly
                                        className="w-full bg-black/5 dark:bg-white/5 border-2 border-black/5 dark:border-white/5 rounded-2xl py-4 px-6 text-lg font-bold outline-none cursor-not-allowed opacity-60 text-slate-500 transition-colors"
                                    />
                                    <p className="text-[9px] text-slate-500 mt-1 font-bold uppercase italic transition-colors">* Este es el correo con el que accedes al sistema</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sección de Pagos Stripe Connect */}
                    <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 mb-12 relative overflow-hidden group shadow-2xl transition-colors">
                        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                            <span className="material-symbols-outlined text-[12rem]">payments</span>
                        </div>

                        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                            <div className="space-y-6">
                                <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full">
                                    <span className={`size-2 rounded-full ${stripeAccountStatus.isOnboarded ? 'bg-primary animate-pulse' : 'bg-yellow-500'}`}></span>
                                    <span className="text-[10px] font-black text-primary uppercase tracking-widest">
                                        {stripeAccountStatus.isOnboarded ? 'Pagos Habilitados' : 'Configuración Pendiente'}
                                    </span>
                                </div>

                                <h2 className="text-2xl md:text-4xl font-black uppercase italic text-white leading-tight">
                                    Cobra a tus socios <br />
                                    <span className="text-primary italic">Automáticamente</span>
                                </h2>

                                <p className="text-slate-400 font-bold text-sm leading-relaxed max-w-md uppercase tracking-tight">
                                    Conecta tu cuenta bancaria y empieza a recibir pagos por tarjeta de crédito o débito de forma segura. Sin cobros ocultos, directo a tu banco.
                                </p>

                                <div className="flex flex-wrap gap-4 pt-4">
                                    <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-5 py-3 rounded-2xl">
                                        <span className="material-symbols-outlined text-primary text-xl">verified</span>
                                        <span className="text-[10px] font-black text-white uppercase">Checkout Seguro</span>
                                    </div>
                                    <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-5 py-3 rounded-2xl">
                                        <span className="material-symbols-outlined text-primary text-xl">bolt</span>
                                        <span className="text-[10px] font-black text-white uppercase">Depósitos 24h</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-background-dark/50 backdrop-blur-sm border border-white/10 rounded-[2rem] p-8 flex flex-col items-center text-center space-y-6">
                                {stripeAccountStatus.isOnboarded ? (
                                    <>
                                        <div className="size-20 bg-primary/20 rounded-full flex items-center justify-center border-4 border-primary/40 shadow-[0_0_40px_rgba(13,242,89,0.2)]">
                                            <span className="material-symbols-outlined text-primary text-4xl font-black">check</span>
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black uppercase text-white">¡Tu cuenta está lista!</h3>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">ID: {stripeAccountStatus.accountId}</p>
                                        </div>
                                        <button
                                            onClick={() => window.open('https://dashboard.stripe.com', '_blank')}
                                            className="w-full bg-white/5 hover:bg-white/10 text-white font-black py-4 rounded-xl text-[10px] uppercase tracking-widest transition-all border border-white/10"
                                        >
                                            Ir a mi Dashboard de Stripe
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <div className="size-20 bg-primary/10 rounded-full flex items-center justify-center border-4 border-white/5">
                                            <span className="material-symbols-outlined text-slate-500 text-4xl font-black">account_balance</span>
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black uppercase text-white tracking-tighter">Vincula tu Banco</h3>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Stripe procesará tus cobros de forma segura</p>
                                        </div>
                                        <button
                                            onClick={handleConnectStripe}
                                            disabled={stripeAccountStatus.loading}
                                            className="w-full bg-primary text-background-dark font-black py-4 rounded-xl text-xs uppercase tracking-widest hover:shadow-[0_0_30px_rgba(13,242,89,0.3)] transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                                        >
                                            {stripeAccountStatus.loading ? (
                                                <span className="material-symbols-outlined animate-spin text-lg">sync</span>
                                            ) : (
                                                <span className="material-symbols-outlined text-lg">electric_bolt</span>
                                            )}
                                            {stripeAccountStatus.loading ? 'Conectando...' : 'Configurar Pagos Bancarios'}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Membresías Section */}
                    <div>
                        <div className="mb-8 flex justify-between items-center">
                            <h2 className="text-2xl font-black uppercase italic text-slate-800 dark:text-white transition-colors">Planes de <span className="text-primary">Membresía</span></h2>
                            <button
                                onClick={handleAddPlan}
                                className="bg-primary/10 border border-primary/20 text-primary font-black px-6 py-2 rounded-xl text-[10px] uppercase tracking-widest hover:bg-primary/20 transition-all flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined text-sm">add</span>
                                Agregar Plan
                            </button>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                            {plans.map((plan) => (
                                <div key={plan.id} className={`bg-surface-light dark:bg-surface-dark border-2 ${plan.color} rounded-[2.5rem] p-8 space-y-6 relative overflow-hidden group shadow-sm transition-all`}>
                                    <button
                                        onClick={() => handleDeletePlan(plan.id)}
                                        className="absolute top-6 right-6 z-20 text-slate-400 hover:text-red-500 transition-all hover:scale-125"
                                    >
                                        <span className="material-symbols-outlined">delete</span>
                                    </button>
                                    <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                                        <span className="material-symbols-outlined text-9xl">payments</span>
                                    </div>

                                    <div className="relative z-10">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Nombre del Paquete</label>
                                        <input
                                            type="text"
                                            value={plan.name}
                                            onChange={(e) => handleUpdatePlan(plan.id, 'name', e.target.value)}
                                            className="w-full bg-white/50 dark:bg-background-dark/50 border-2 border-black/5 dark:border-white/5 rounded-2xl py-4 px-6 text-xl font-black italic uppercase outline-none focus:border-primary transition-all text-slate-800 dark:text-white shadow-sm"
                                            placeholder="Ej: Quincena"
                                        />
                                    </div>

                                    <div className="relative z-10">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Costo en COP ($)</label>
                                        <div className="relative">
                                            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-black">$</span>
                                            <input
                                                type="number"
                                                value={plan.price}
                                                onChange={(e) => handleUpdatePlan(plan.id, 'price', e.target.value)}
                                                className="w-full bg-white/50 dark:bg-background-dark/50 border-2 border-black/5 dark:border-white/5 rounded-2xl py-4 pl-12 pr-6 text-xl font-black outline-none focus:border-primary transition-all text-slate-800 dark:text-white shadow-sm"
                                            />
                                        </div>
                                        <p className="text-[10px] text-slate-500 mt-2 font-bold uppercase italic transition-colors">Visualización: {formatCurrency(plan.price || 0)}</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 relative z-10">
                                        <div>
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Cantidad</label>
                                            <input
                                                type="number"
                                                value={plan.durationValue}
                                                onChange={(e) => handleUpdatePlan(plan.id, 'durationValue', e.target.value)}
                                                className="w-full bg-white/50 dark:bg-background-dark/50 border-2 border-black/5 dark:border-white/5 rounded-2xl py-4 px-6 text-lg font-black outline-none focus:border-primary transition-all text-slate-800 dark:text-white shadow-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Unidad</label>
                                            <select
                                                value={plan.durationUnit}
                                                onChange={(e) => handleUpdatePlan(plan.id, 'durationUnit', e.target.value)}
                                                className="w-full bg-white/50 dark:bg-background-dark/50 border-2 border-black/5 dark:border-white/5 rounded-2xl py-4 px-4 text-sm font-black uppercase outline-none focus:border-primary transition-all appearance-none cursor-pointer text-slate-700 dark:text-slate-200"
                                            >
                                                <option value="days">Días</option>
                                                <option value="months">Meses</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="relative z-10">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Beneficios Incluidos</label>
                                        <textarea
                                            value={plan.services}
                                            onChange={(e) => handleUpdatePlan(plan.id, 'services', e.target.value)}
                                            rows="3"
                                            className="w-full bg-white/50 dark:bg-background-dark/50 border-2 border-black/5 dark:border-white/5 rounded-2xl py-4 px-6 text-sm font-medium outline-none focus:border-primary transition-all resize-none text-slate-600 dark:text-slate-300 shadow-sm"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default BrandSettings;