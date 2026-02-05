import React, { useState, useEffect } from 'react';
import AdminSidebar from '../components/AdminSidebar';
import { supabase } from '../services/supabaseClient';

const BrandSettings = () => {
    const [isPaying, setIsPaying] = useState(false);
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


    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) setUserEmail(user.email);
                const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single();


                if (profile?.gym_id) {
                    const { data: gym } = await supabase.from('gyms').select('*').eq('id', profile.gym_id).single();
                    if (gym) {
                        setGymData({
                            name: gym.name || '',
                            avatar_url: gym.avatar_url || '',
                            email: gym.email || '',
                            address: gym.address || ''
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
                        // Default plans if none exist
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

        // Add to deleted track and remove from UI
        setDeletedPlanIds([...deletedPlanIds, id]);
        setPlans(plans.filter(p => p.id !== id));
    };



    const formatCurrency = (val) => {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
    };

    const handleSave = async () => {
        const btn = document.getElementById('save-btn');
        btn.innerHTML = 'Guardando...';
        btn.disabled = true;

        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: profile, error: profError } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single();

            if (profError) throw profError;

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

                // 1. Delete removed plans from DB
                if (deletedPlanIds.length > 0) {
                    const { error: delError } = await supabase
                        .from('gym_membership_plans')
                        .delete()
                        .in('id', deletedPlanIds);
                    if (delError) throw delError;
                }

                // 2. Sync remaining plans
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

                setDeletedPlanIds([]); // Reset deletions


                // Re-fetch to get real IDs
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
                btn.innerHTML = 'Actualizar Configuración';
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


    const handleSaaSPayment = async () => {
        setIsPaying(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

            const { data, error } = await supabase.functions.invoke('stripe-checkout', {
                body: {
                    planName: "Desarrollando Ando - Plan Administrador",
                    amount: 49000 * 100, // SaaS Monthly Price (example 49k COP)
                    successUrl: `${window.location.origin}/#/admin?success=true`,
                    cancelUrl: `${window.location.origin}/#/brand-settings`,
                    metadata: {
                        userId: user.id,
                        gymId: profile.gym_id,
                        type: 'saas_subscription'
                    }
                }
            });

            if (error) throw error;
            if (data?.url) window.location.href = data.url;
        } catch (err) {
            alert("Error al procesar pago: " + err.message);
        } finally {
            setIsPaying(false);
        }
    };

    const handleUploadLogo = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single();

            if (!profile?.gym_id) throw new Error("No gym found");

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

            // Also update DB immediately for convenience
            await supabase.from('gyms').update({ avatar_url: publicUrl }).eq('id', profile.gym_id);

        } catch (err) {
            alert("Error uploading image: " + err.message);
        } finally {
            setIsUploading(false);
        }
    };



    return (
        <div className="flex min-h-screen bg-background-dark text-white font-display">
            <AdminSidebar />
            <main className="flex-1 p-10 overflow-y-auto">
                <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                    <div>
                        <h1 className="text-5xl font-black uppercase italic tracking-tighter">
                            Identidad de <span className="text-primary-blue">Marca</span>
                        </h1>
                        <p className="text-slate-500 font-bold uppercase tracking-widest mt-2">Personaliza cómo te ven tus atletas</p>
                    </div>
                    <button
                        id="save-btn"
                        onClick={handleSave}
                        className="bg-primary text-background-dark font-black px-10 py-4 rounded-2xl uppercase tracking-widest text-sm hover:shadow-[0_0_30px_rgba(13,242,89,0.3)] transition-all active:scale-95"
                    >
                        Actualizar Configuración
                    </button>
                </header>

                {/* Gym Profile Section */}
                <div className="bg-surface-dark border border-white/5 rounded-[2.5rem] p-10 mb-12 grid grid-cols-1 lg:grid-cols-3 gap-10">
                    <div className="space-y-6">
                        <div className="relative group">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 block">Logo del Gimnasio</label>
                            <button
                                onClick={() => document.getElementById('logo-upload').click()}
                                disabled={isUploading}
                                className="w-full text-left bg-transparent border-none p-0"
                            >
                                <div className="size-48 rounded-[2rem] bg-background-dark border-2 border-dashed border-white/10 flex flex-col items-center justify-center overflow-hidden relative group-hover:border-primary/50 transition-all">
                                    {gymData.avatar_url ? (
                                        <img src={gymData.avatar_url} alt="Gym Logo" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="material-symbols-outlined text-5xl text-white/20 text-slate-500">storefront</span>
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
                            <p className="text-[10px] text-slate-500 mt-4 font-bold uppercase italic">Recomendado: 512x512px PNG/JPG</p>
                        </div>
                    </div>


                    <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Nombre del Gimnasio</label>
                            <input
                                type="text"
                                value={gymData.name}
                                onChange={(e) => setGymData({ ...gymData, name: e.target.value })}
                                className="w-full bg-background-dark/50 border-2 border-white/5 rounded-2xl py-4 px-6 text-xl font-black italic uppercase outline-none focus:border-primary transition-all"
                                placeholder="Nombre de tu Gym"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Correo de Contacto</label>
                            <input
                                type="email"
                                value={gymData.email}
                                onChange={(e) => setGymData({ ...gymData, email: e.target.value })}
                                className="w-full bg-background-dark/50 border-2 border-white/5 rounded-2xl py-4 px-6 text-xl font-black italic outline-none focus:border-primary transition-all text-primary-blue"
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
                                    className="w-full bg-background-dark/50 border-2 border-white/5 rounded-2xl py-4 px-6 text-lg font-bold outline-none focus:border-primary transition-all"
                                    placeholder="Calle 123 #45-67, Ciudad"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Correo de Cuenta (Login)</label>
                                <input
                                    type="text"
                                    value={userEmail}
                                    readOnly
                                    className="w-full bg-white/5 border-2 border-white/5 rounded-2xl py-4 px-6 text-lg font-bold outline-none cursor-not-allowed opacity-60"
                                />
                                <p className="text-[9px] text-slate-500 mt-1 font-bold uppercase italic">* Este es el correo con el que accedes al sistema</p>
                            </div>
                        </div>
                    </div>
                </div>


                <div className="mb-8 flex justify-between items-center">
                    <h2 className="text-2xl font-black uppercase italic">Configuración de <span className="text-primary">Membresías</span></h2>
                    <button
                        onClick={handleAddPlan}
                        className="bg-white/5 border border-white/10 text-white font-black px-6 py-2 rounded-xl text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined text-sm">add</span>
                        Agregar Plan
                    </button>
                </div>



                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                    {plans.map((plan) => (
                        <div key={plan.id} className={`bg-surface-dark border-2 ${plan.color} rounded-[2.5rem] p-8 space-y-6 relative overflow-hidden group`}>
                            <button
                                onClick={() => handleDeletePlan(plan.id)}
                                className="absolute top-6 right-6 z-20 text-slate-500/50 hover:text-red-500 transition-all hover:scale-125"
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
                                    className="w-full bg-background-dark/50 border-2 border-white/5 rounded-2xl py-4 px-6 text-xl font-black italic uppercase outline-none focus:border-primary transition-all"
                                    placeholder="Ej: Quincena"
                                />
                            </div>

                            <div className="relative z-10">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Costo en COP ($)</label>
                                <div className="relative">
                                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 font-black">$</span>
                                    <input
                                        type="number"
                                        value={plan.price}
                                        onChange={(e) => handleUpdatePlan(plan.id, 'price', e.target.value)}
                                        className="w-full bg-background-dark/50 border-2 border-white/5 rounded-2xl py-4 pl-12 pr-6 text-xl font-black outline-none focus:border-primary transition-all"
                                    />
                                </div>
                                <p className="text-[10px] text-slate-500 mt-2 font-bold uppercase italic">Visualización: {formatCurrency(plan.price || 0)}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 relative z-10">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Cantidad</label>
                                    <input
                                        type="number"
                                        value={plan.durationValue}
                                        onChange={(e) => handleUpdatePlan(plan.id, 'durationValue', e.target.value)}
                                        className="w-full bg-background-dark/50 border-2 border-white/5 rounded-2xl py-4 px-6 text-lg font-black outline-none focus:border-primary transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 block">Unidad</label>
                                    <select
                                        value={plan.durationUnit}
                                        onChange={(e) => handleUpdatePlan(plan.id, 'durationUnit', e.target.value)}
                                        className="w-full bg-background-dark/50 border-2 border-white/5 rounded-2xl py-4 px-4 text-sm font-black uppercase outline-none focus:border-primary transition-all appearance-none cursor-pointer"
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
                                    className="w-full bg-background-dark/50 border-2 border-white/5 rounded-2xl py-4 px-6 text-sm font-medium outline-none focus:border-primary transition-all resize-none"
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <section className="mt-12 bg-primary/5 border border-primary/20 p-10 rounded-[2.5rem] flex items-center justify-between">
                    <div>
                        <h3 className="text-2xl font-black uppercase italic">Suscripción del Gimnasio</h3>
                        <p className="text-slate-400 text-sm mt-1">Activa o renueva el acceso a todas las herramientas administrativas.</p>
                        <button
                            onClick={handleSaaSPayment}
                            disabled={isPaying}
                            className="mt-6 bg-primary text-background-dark font-black px-8 py-3 rounded-xl uppercase tracking-widest text-[10px] hover:scale-105 transition-all disabled:opacity-50"
                        >
                            {isPaying ? 'Procesando...' : 'Pagar Suscripción PRO'}
                        </button>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="bg-background-dark/80 px-8 py-4 rounded-2xl border border-white/5">
                            <span className="text-[10px] font-black text-slate-500 uppercase block mb-1">Estado de tu Gym</span>
                            <span className="text-2xl font-black text-primary uppercase">Activo</span>
                        </div>
                    </div>
                </section>
            </main>
        </div>

    );
};

export default BrandSettings;