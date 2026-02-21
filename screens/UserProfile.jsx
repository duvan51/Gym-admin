import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import UserHeader from '../components/UserHeader';
import { supabase } from '../services/supabaseClient';

const UserProfile = () => {
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);
    const [gym, setGym] = useState(null);
    const [memberships, setMemberships] = useState([]);
    const [loading, setLoading] = useState(true);
    const [availablePlans, setAvailablePlans] = useState([]);
    const [showPlanModal, setShowPlanModal] = useState(false);
    const [isPaying, setIsPaying] = useState(false);
    const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);

    useEffect(() => {
        const query = new URLSearchParams(window.location.search);
        if (query.get('success') === 'true') {
            setShowPaymentSuccess(true);
            // Clean URL after detection
            window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
            setTimeout(() => setShowPaymentSuccess(false), 5000);
        }
    }, []);


    useEffect(() => {
        const fetchAllUserData = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    navigate('/login');
                    return;
                }

                const { data, error } = await supabase
                    .from('profiles')
                    .select('*, gyms(*), memberships(*)')
                    .eq('id', user.id)
                    .single();

                if (error) throw error;

                setProfile(data);
                setGym(data.gyms);
                // Ordenar membresías por fecha de creación descendente
                const sortedMemberships = (data.memberships || []).sort((a, b) =>
                    new Date(b.created_at) - new Date(a.created_at)
                );
                setMemberships(sortedMemberships);

                // Fetch gym plans if gym_id exists
                if (data.gym_id) {
                    const { data: plans, error: planError } = await supabase
                        .from('gym_membership_plans')
                        .select('*')
                        .eq('gym_id', data.gym_id)
                        .eq('is_active', true);

                    if (!planError) setAvailablePlans(plans || []);
                }
            } catch (err) {
                console.error("Error al cargar perfil:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchAllUserData();
    }, [navigate]);

    const activeMembership = memberships?.[0] || null;

    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.href = '#/login';
        window.location.reload();
    };

    const handleStripePayment = async (plan) => {
        if (!plan || !profile) return;
        setIsPaying(true);
        try {
            const { data, error } = await supabase.functions.invoke('stripe-checkout', {
                body: {
                    planName: plan.name || plan.plan_name || "Membresía Gym",
                    amount: (plan.price_cop) * 100, // Stripe expects cents
                    successUrl: `${window.location.origin}/#/user-profile?session_id={CHECKOUT_SESSION_ID}&success=true`,
                    cancelUrl: `${window.location.origin}/#/user-profile`,
                    metadata: {
                        userId: profile.id,
                        planId: plan.id,
                        gymId: profile.gym_id,
                        type: 'membership_renewal'
                    }
                }
            });

            if (error) throw error;
            if (data?.url) window.location.href = data.url;
        } catch (err) {
            alert("Error al iniciar pago: " + err.message);
        } finally {
            setIsPaying(false);
        }
    };


    if (loading) {
        return (
            <div className="min-h-screen bg-background-dark flex items-center justify-center font-display">
                <div className="text-center">
                    <div className="size-20 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                    <p className="text-primary font-black animate-pulse uppercase tracking-[0.3em] text-sm">Sincronizando Perfil...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background-dark text-white font-display pb-20">
            <UserHeader />

            <main className="max-w-[1200px] mx-auto px-6 py-10 pb-32">
                {/* Success Notification Overlay */}
                {showPaymentSuccess && (
                    <div className="mb-10 bg-primary/20 border border-primary/30 p-8 rounded-[2.5rem] flex items-center justify-between animate-fadeInDown shadow-[0_0_50px_rgba(13,242,89,0.1)]">
                        <div className="flex items-center gap-6">
                            <div className="size-14 rounded-2xl bg-primary/20 text-primary flex items-center justify-center border border-primary/20">
                                <span className="material-symbols-outlined text-4xl">check_circle</span>
                            </div>
                            <div>
                                <h4 className="text-xl font-black uppercase italic tracking-tight text-white">¡Membresía Activada!</h4>
                                <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mt-1">El pago fue exitoso y tu acceso ha sido renovado. ¡A darle con toda!</p>
                            </div>
                        </div>
                        <button onClick={() => setShowPaymentSuccess(false)} className="text-slate-500 hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-2xl">close</span>
                        </button>
                    </div>
                )}

                {/* Header Perfil */}
                <header className="flex flex-col md:flex-row items-center justify-between gap-8 mb-12 animate-fadeIn">
                    <div className="flex flex-col md:flex-row items-center gap-8">
                        <div className="relative group">
                            <div className="size-32 rounded-full border-4 border-primary p-1 shadow-[0_0_30px_rgba(13,242,89,0.3)] group-hover:shadow-primary/50 transition-all duration-500">
                                <div className="size-full rounded-full bg-cover bg-center" style={{ backgroundImage: "url('https://picsum.photos/seed/user/200')" }}></div>
                            </div>
                            <button className="absolute bottom-0 right-0 bg-primary text-background-dark size-10 rounded-full flex items-center justify-center border-4 border-background-dark hover:scale-110 transition-transform">
                                <span className="material-symbols-outlined text-xl">edit</span>
                            </button>
                        </div>
                        <div className="text-center md:text-left">
                            <h1 className="text-5xl font-black italic uppercase tracking-tighter leading-none mb-2">
                                {profile?.full_name || "Atleta"}
                            </h1>
                            <div className="flex flex-wrap justify-center md:justify-start gap-3 items-center">
                                <span className="bg-primary/20 text-primary text-[10px] font-black px-3 py-1 rounded-full border border-primary/30 uppercase tracking-widest">
                                    {profile?.role === 'admin' ? 'Administrador' : 'Atleta Pro'}
                                </span>
                                <span className="text-slate-500 text-sm font-bold uppercase tracking-widest">Nivel {profile?.level || 1}</span>
                                <span className="text-slate-500">•</span>
                                <span className="text-slate-500 text-sm font-bold uppercase tracking-widest">{profile?.streak || 0} Días de Racha</span>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                    {/* Columna Izquierda: Membresía y QR */}
                    <div className="lg:col-span-4 space-y-8 animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
                        {/* QR Access Card */}
                        <section className="bg-white p-8 rounded-[2.5rem] flex flex-col items-center justify-center text-center shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                            <h3 className="text-background-dark font-black uppercase italic text-xl mb-4 tracking-tight">Acceso Digital</h3>
                            <div className="bg-slate-100 p-4 rounded-3xl mb-4">
                                <img
                                    src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=USER_ALEX_GARCIA_ELITE"
                                    alt="QR Access"
                                    className="size-40"
                                />
                            </div>
                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Escanea en la recepción</p>
                            <div className={`mt-6 flex items-center gap-2 font-black uppercase text-[10px] tracking-widest px-4 py-2 rounded-full border ${activeMembership?.status === 'active' ? 'text-primary bg-primary/10 border-primary/20' : 'text-red-500 bg-red-500/10 border-red-500/20'}`}>
                                <span className={`size-2 rounded-full ${activeMembership?.status === 'active' ? 'bg-primary animate-ping' : 'bg-red-500'}`}></span>
                                {activeMembership?.status === 'active' ? 'Membresía Activa' : 'Membresía Vencida'}
                            </div>
                        </section>

                        {/* Gym Info Card */}
                        <section className="bg-surface-dark border border-border-dark rounded-[2.5rem] overflow-hidden group">
                            <div className="h-32 bg-cover bg-center transition-transform duration-700 group-hover:scale-110" style={{ backgroundImage: `url('${gym?.avatar_url || 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?q=80&w=1470&auto=format&fit=crop'}')` }}></div>
                            <div className="p-8">
                                <div className="flex items-center gap-2 text-primary mb-2">
                                    <span className="material-symbols-outlined text-sm">location_on</span>
                                    <span className="text-[10px] font-black uppercase tracking-widest">Mi Sede</span>
                                </div>
                                <h4 className="text-xl font-black uppercase italic">{gym?.name || "Mi Gimnasio"}</h4>
                                <p className="text-slate-400 text-sm mt-1">{gym?.address || "Ubicación pendiente"}</p>
                                <button className="w-full mt-6 text-xs font-black uppercase tracking-widest py-3 border border-white/10 rounded-xl hover:bg-white/5 transition-colors">
                                    Ver Horarios
                                </button>
                            </div>
                        </section>
                    </div>

                    {/* Columna Derecha: Pagos y Detalles del Plan */}
                    <div className="lg:col-span-8 space-y-8 animate-fadeInUp" style={{ animationDelay: '0.2s' }}>
                        {/* Membership Details */}
                        <section className="bg-surface-dark border border-border-dark rounded-[2.5rem] p-10 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-8 opacity-5">
                                <span className="material-symbols-outlined text-9xl">card_membership</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 relative z-10">
                                <div>
                                    <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Plan Actual</span>
                                    <h3 className="text-3xl font-black italic uppercase text-primary mt-1">{activeMembership?.plan_name || 'Sin Plan Activo'}</h3>
                                    <p className="text-slate-300 mt-4 leading-relaxed">
                                        {activeMembership?.status === 'active'
                                            ? 'Disfrutas de acceso completo a nuestras instalaciones y servicios premium.'
                                            : 'Tu plan ha expirado. Renueva para seguir disfrutando de los beneficios.'}
                                    </p>
                                </div>
                                <div className="flex flex-col justify-between">
                                    <div className="bg-background-dark/50 p-6 rounded-3xl border border-white/5">
                                        <div className="flex justify-between items-center mb-4">
                                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Próximo Cobro/Vencimiento</span>
                                            <span className="text-white font-black">{activeMembership?.price_cop ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(activeMembership.price_cop) : '--'}</span>
                                        </div>
                                        <div className="text-2xl font-black italic">
                                            {activeMembership?.expiry_date ? new Date(activeMembership.expiry_date).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/A'}
                                        </div>
                                    </div>
                                    <div className="flex gap-4 mt-6">
                                        <button
                                            onClick={() => setShowPlanModal(true)}
                                            className="flex-1 bg-white text-background-dark font-black py-3 rounded-xl uppercase tracking-widest text-xs hover:bg-primary transition-all shadow-[0_10px_30px_rgba(255,255,255,0.1)] hover:shadow-primary/30"
                                        >
                                            Renovar Ahora
                                        </button>
                                        <button className="flex-1 border border-white/10 font-black py-3 rounded-xl uppercase tracking-widest text-xs hover:bg-white/5 transition-all">Soporte</button>
                                    </div>

                                </div>
                            </div>
                        </section>

                        {/* Payment History */}
                        <section className="bg-surface-dark border border-border-dark rounded-[2.5rem] p-10">
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-2xl font-black uppercase italic tracking-tight">Historial de Pagos</h3>
                                <span className="material-symbols-outlined text-slate-500">receipt_long</span>
                            </div>

                            <div className="space-y-4">
                                {memberships.length === 0 ? (
                                    <p className="text-slate-500 text-sm font-bold uppercase tracking-widest text-center py-10 italic">No hay registros de pagos previos.</p>
                                ) : memberships.map((item, i) => (
                                    <div key={i} className="flex items-center justify-between p-5 rounded-2xl bg-background-dark/30 border border-white/5 hover:border-primary/20 transition-all group">
                                        <div className="flex items-center gap-4">
                                            <div className={`size-10 rounded-full flex items-center justify-center ${item.status === 'active' ? 'text-primary bg-primary/10' : 'text-slate-500 bg-white/5'}`}>
                                                <span className="material-symbols-outlined">{item.status === 'active' ? 'check_circle' : 'history'}</span>
                                            </div>
                                            <div>
                                                <div className="font-bold text-sm uppercase">{item.plan_name}</div>
                                                <div className="text-[10px] text-slate-500 font-black tracking-widest">
                                                    Adquirido: {new Date(item.last_payment_date || item.created_at).toLocaleDateString()}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-8">
                                            <span className="font-black italic text-lg">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(item.price_cop || 0)}</span>
                                            <button className="text-slate-500 hover:text-primary transition-colors">
                                                <span className="material-symbols-outlined">download</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Logout Section */}
                        <section className="pt-10 flex justify-center md:justify-end">
                            <button
                                onClick={handleLogout}
                                className="flex items-center gap-3 px-10 py-4 rounded-2xl border border-red-500/30 text-red-500 font-black uppercase tracking-widest text-xs hover:bg-red-500/10 hover:border-red-500 transition-all group active:scale-95"
                            >
                                <span className="material-symbols-outlined group-hover:rotate-12 transition-transform">logout</span>
                                Cerrar Sesión Segura
                            </button>
                        </section>
                    </div>
                </div>
            </main>

            {/* Plan Selection Modal */}
            {showPlanModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-fadeIn">
                    <div className="absolute inset-0 bg-background-dark/95 backdrop-blur-md" onClick={() => setShowPlanModal(false)}></div>
                    <div className="relative bg-surface-dark border border-white/10 w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-[3rem] p-8 md:p-12 shadow-[0_50px_100px_rgba(0,0,0,0.8)]">
                        <button
                            onClick={() => setShowPlanModal(false)}
                            className="absolute top-8 right-8 text-slate-500 hover:text-white transition-colors"
                        >
                            <span className="material-symbols-outlined text-3xl">close</span>
                        </button>

                        <div className="text-center mb-12">
                            <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter mb-4">
                                Elige tu <span className="text-primary">Evolución</span>
                            </h2>
                            <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">Planes exclusivos de {gym?.name}</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {availablePlans.length === 0 ? (
                                <div className="col-span-3 py-20 text-center">
                                    <span className="material-symbols-outlined text-6xl text-slate-800 mb-4">upcoming</span>
                                    <p className="text-slate-500 font-black uppercase tracking-widest italic">El gimnasio no ha publicado planes aún.</p>
                                </div>
                            ) : availablePlans.map((plan) => (
                                <div
                                    key={plan.id}
                                    className="bg-background-dark/50 border border-white/5 rounded-[2rem] p-8 flex flex-col hover:border-primary/50 transition-all duration-500 group relative overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                        <span className="material-symbols-outlined text-7xl">bolt</span>
                                    </div>

                                    <div className="relative z-10 flex-1">
                                        <h3 className="text-xl font-black uppercase italic text-white mb-2 group-hover:text-primary transition-colors">{plan.name}</h3>
                                        <div className="flex items-baseline gap-1 mb-6">
                                            <span className="text-2xl font-black">$</span>
                                            <span className="text-4xl font-black tracking-tighter">
                                                {new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(plan.price_cop)}
                                            </span>
                                            <span className="text-slate-500 text-[10px] font-black uppercase">/ {plan.duration_value} {plan.duration_unit === 'months' ? 'Mes' : 'Día'}{plan.duration_value > 1 ? 's' : ''}</span>
                                        </div>

                                        <ul className="space-y-4 mb-10">
                                            {plan.features?.map((feature, i) => (
                                                <li key={i} className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                                                    <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                                                    {feature}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>

                                    <button
                                        onClick={() => handleStripePayment(plan)}
                                        disabled={isPaying}
                                        className="w-full bg-white text-background-dark font-black py-4 rounded-2xl uppercase tracking-widest text-xs hover:bg-primary transition-all relative z-10 disabled:opacity-50"
                                    >
                                        {isPaying ? 'Procesando...' : 'Seleccionar Plan'}
                                    </button>
                                </div>
                            ))}
                        </div>

                        <p className="text-center mt-12 text-[9px] text-slate-600 font-black uppercase tracking-[0.2em] italic">
                            * Los pagos son procesados de forma segura por Stripe
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserProfile;