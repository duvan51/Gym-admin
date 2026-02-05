import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import UserHeader from '../components/UserHeader';
import { generateWorkoutPlan } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';
import { notificationService } from '../services/notificationService';

const UserPlan = () => {
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);
    const [membership, setMembership] = useState(null);
    const [plan, setPlan] = useState(null);
    const [todaySession, setTodaySession] = useState(null);
    const [progressStats, setProgressStats] = useState({ percent: 0, text: '', label: '' });
    const [nutritionStats, setNutritionStats] = useState({ percent: 0, text: '', label: '' });
    const [nutritionPreview, setNutritionPreview] = useState({ today: null, tomorrow: null });
    const [biometrics, setBiometrics] = useState(null);
    const [loading, setLoading] = useState(true);

    // Cálculos de vencimiento
    const [daysToExpiry, setDaysToExpiry] = useState(null);
    const isExpiringSoon = daysToExpiry !== null && daysToExpiry <= 5 && daysToExpiry > 0;

    useEffect(() => {
        const fetchUserDataAndPlan = async () => {
            try {
                // 1. Obtener Usuario Actual
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    navigate('/login');
                    return;
                }

                // 3. Traer Perfil, Membresía y Biométricos
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('*, memberships(*), biometrics(*), measurements_history(weight_kg, created_at)')
                    .eq('id', user.id)
                    .single();

                setProfile(profileData);

                // Priorizar el último peso del historial
                const latestWeight = profileData?.measurements_history?.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]?.weight_kg;
                const initialWeight = profileData?.biometrics?.[0]?.initial_weight_kg;

                setBiometrics({
                    ...profileData?.biometrics?.[0],
                    current_weight: latestWeight || initialWeight
                });
                const activeMembership = profileData?.memberships?.[0];
                setMembership(activeMembership);

                // 3. Calcular Días Restantes Membresía
                if (activeMembership?.expiry_date) {
                    const expiry = new Date(activeMembership.expiry_date);
                    const today = new Date();
                    const diffTime = expiry - today;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    setDaysToExpiry(diffDays);

                    // Trigger Priority Notification if expiring in <= 7 days
                    if (diffDays <= 7 && diffDays > 0) {
                        // Check if we already notified recently to avoid spam
                        const { data: existingNotif } = await supabase
                            .from('notifications')
                            .select('id')
                            .eq('user_id', user.id)
                            .eq('type', 'membership_expiry')
                            .eq('is_read', false)
                            .limit(1);

                        if (!existingNotif || existingNotif.length === 0) {
                            await notificationService.createNotification({
                                userId: user.id,
                                title: "¡Membresía por vencer!",
                                message: `Tu plan expira en ${diffDays} días. Renuévalo pronto para no perder tu progreso.`,
                                type: "membership_expiry",
                                priority: true
                            });
                        }
                    }
                }

                // 4. Obtener Plan de Entrenamiento Activo (Priorizando el más reciente)
                const { data: planData } = await supabase
                    .from('workout_plans')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('is_active', true)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (planData) {
                    setPlan(planData);

                    // 5. Obtener sesión de hoy
                    const todayStr = new Date().toISOString().split('T')[0];
                    const { data: sessionToday } = await supabase
                        .from('workout_sessions')
                        .select('*, session_completions(*)')
                        .eq('plan_id', planData.id)
                        .eq('session_date', todayStr)
                        .single();

                    setTodaySession(sessionToday);

                    // 6. Calcular PROGRESO REAL
                    // (completions + rest_days) / total_elapsed_days
                    const startDate = new Date(planData.start_date);
                    const todayDate = new Date();
                    todayDate.setHours(0, 0, 0, 0);

                    // Sesiones hasta hoy
                    const { data: elapsedSessions } = await supabase
                        .from('workout_sessions')
                        .select('id, session_type, session_completions(id)')
                        .eq('plan_id', planData.id)
                        .lte('session_date', todayStr);

                    if (elapsedSessions?.length > 0) {
                        const totalDays = elapsedSessions.length;
                        const validDays = elapsedSessions.filter(s =>
                            s.session_type === 'rest' || (s.session_completions && s.session_completions.length > 0)
                        ).length;

                        const percent = Math.round((validDays / totalDays) * 100);

                        let motivationalText = '';
                        if (percent >= 80) motivationalText = "¡Bien... Sigue así... Vas a ver resultados pronto!";
                        else if (percent >= 50) motivationalText = "¡Sigue así, vas a ver resultados muy pronto!";
                        else motivationalText = "¡No te rindas, cada pequeño paso cuenta!";

                        setProgressStats({
                            percent,
                            text: motivationalText,
                            label: `${validDays}/${totalDays}`
                        });
                    }
                }

                // 7. NEW: Fetch Nutrition Plan and calculate adherence
                const { data: nutritionPlan } = await supabase
                    .from('nutrition_plans')
                    .select('*, nutrition_weeks(*)')
                    .eq('user_id', user.id)
                    .eq('is_active', true)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (nutritionPlan && planData) {
                    // Fix: Ensure robust date parsing for start_date
                    const [year, month, day] = planData.start_date.split('-').map(Number);
                    const workoutStart = new Date(year, month - 1, day);
                    workoutStart.setHours(0, 0, 0, 0);

                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    // Calculate elapsed days since workout start to find current week/day
                    const diffTime = today - workoutStart;
                    const elapsedDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
                    const calculatedWeekNum = Math.floor(elapsedDays / 7) + 1;
                    const currentDayIdx = elapsedDays % 7;

                    // Try to find the calculated week, or fallback to the latest one
                    let currentWeekData = nutritionPlan.nutrition_weeks.find(w => w.week_number === calculatedWeekNum);

                    if (!currentWeekData && nutritionPlan.nutrition_weeks.length > 0) {
                        // Fallback: If the exact week isn't found (e.g., workout plan is very old),
                        // use the latest generated week.
                        currentWeekData = [...nutritionPlan.nutrition_weeks].sort((a, b) => b.week_number - a.week_number)[0];
                    }

                    if (currentWeekData) {
                        setNutritionPreview({
                            today: currentWeekData.daily_meals[currentDayIdx],
                            tomorrow: currentWeekData.daily_meals[currentDayIdx + 1] || null
                        });

                        // Calculate Adherence for the displayed week
                        const completed = currentWeekData.completed_days?.filter(d => d).length || 0;
                        const nutrPercent = Math.round((completed / 7) * 100);

                        setNutritionStats({
                            percent: nutrPercent,
                            label: `${completed}/7`,
                            text: nutrPercent >= 80 ? "¡Disciplina de acero! Tu cuerpo te lo agradecerá." :
                                nutrPercent >= 50 ? "Buen ritmo, mantén la consistencia." : "Cada comida cuenta, ¡no te desvíes!"
                        });
                    }
                }

            } catch (err) {
                console.error("Error cargando el plan:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchUserDataAndPlan();
    }, [navigate]);

    if (loading) {
        return (
            <div className="min-h-screen bg-background-dark flex items-center justify-center font-display">
                <div className="text-center">
                    <div className="size-20 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                    <p className="text-primary font-black animate-pulse uppercase tracking-[0.3em] text-sm">Calculando con IA...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background-dark text-white font-display selection:bg-primary selection:text-black">
            <UserHeader />
            <main className="max-w-[1200px] mx-auto px-4 md:px-6 py-10">

                {/* Banner de Alerta de Vencimiento */}
                {isExpiringSoon && (
                    <section className="mb-10 animate-fadeInDown bg-red-500/10 border border-red-500/30 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-[0_0_40px_rgba(239,68,68,0.1)]">
                        <div className="flex items-center gap-6">
                            <div className="size-14 rounded-2xl bg-red-500/20 text-red-500 flex items-center justify-center shrink-0 border border-red-500/20">
                                <span className="material-symbols-outlined text-3xl animate-pulse">warning</span>
                            </div>
                            <div>
                                <h4 className="text-lg font-black uppercase italic tracking-tight">Atención: Membresía por vencer</h4>
                                <p className="text-slate-400 text-sm font-medium">Tu plan actual expira en <span className="text-red-500 font-black">{daysToExpiry} días</span>. Renuévalo ahora para mantener tus estadísticas y racha actual.</p>
                            </div>
                        </div>
                        <Link
                            to="/user-profile"
                            className="bg-red-500 text-white px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 transition-all shadow-lg shadow-red-500/20 whitespace-nowrap"
                        >
                            Renovar Ahora
                        </Link>
                    </section>
                )}

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 animate-fadeIn">
                    <div className="flex flex-col gap-2 items-center md:items-start text-center md:text-left">
                        <span className="text-primary text-[10px] md:text-xs font-black uppercase tracking-[0.4em]">Bienvenido de nuevo, {profile?.full_name?.split(' ')[0] || 'Atleta'}</span>
                        <h1 className="text-4xl md:text-6xl font-black leading-tight tracking-tighter uppercase italic">
                            Tu Centro de <span className="text-primary">Poder</span>
                        </h1>
                    </div>
                    <div className="w-full md:w-auto bg-surface-dark border border-white/10 rounded-2xl px-6 py-4 flex flex-col items-center md:items-end">
                        <span className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">Hoy</span>
                        <span className="text-base md:text-xl font-black italic text-white text-center md:text-right">
                            {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                    {/* Main Training Plan */}
                    <div className="lg:col-span-8 space-y-8 animate-fadeInUp">
                        <section className="group relative overflow-hidden rounded-[2.5rem] bg-surface-dark border border-border-dark transition-all hover:border-primary/40">
                            <div className="absolute inset-0 bg-gradient-to-t from-background-dark via-transparent to-transparent z-10"></div>
                            <div className="w-full bg-center bg-no-repeat aspect-[21/9] bg-cover transition-transform duration-1000 group-hover:scale-105" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1470&auto=format&fit=crop')" }}></div>

                            <div className="p-10 relative z-20 -mt-20">
                                <div className="inline-flex items-center gap-2 bg-primary text-background-dark px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-6 mx-auto md:mx-0">
                                    <span className="material-symbols-outlined text-sm">bolt</span> Plan Activo
                                </div>
                                <h2 className="text-2xl md:text-4xl font-black uppercase italic mb-4 text-center md:text-left balance">{plan?.title || 'Generando Plan...'}</h2>
                                <p className="text-slate-400 text-sm md:text-lg leading-relaxed max-w-xl mb-8 text-center md:text-left">
                                    {plan?.description || 'Estamos preparando tu rutina personalizada con IA.'}
                                </p>

                                {todaySession ? (
                                    <div className="mb-8 p-6 bg-white/5 border border-white/10 rounded-2xl">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-[10px] font-black text-primary uppercase tracking-widest">Sesión de Hoy</span>
                                            <span className="text-[10px] font-bold text-slate-500">{todaySession.session_type.toUpperCase()}</span>
                                        </div>
                                        <h4 className="text-xl font-black italic uppercase">{todaySession.title}</h4>
                                        <p className="text-sm text-slate-400 mt-1">{todaySession.description}</p>
                                    </div>
                                ) : (
                                    <div className="mb-8 p-6 bg-white/5 border border-white/10 rounded-2xl">
                                        <p className="text-sm text-slate-400 italic">No hay sesión programada para hoy. ¡Disfruta tu descanso!</p>
                                    </div>
                                )}

                                <button
                                    onClick={() => navigate('/routine', { state: { session: todaySession } })}
                                    disabled={!todaySession || todaySession.session_type === 'rest'}
                                    className="flex items-center justify-center gap-3 bg-white text-background-dark font-black px-10 py-4 rounded-2xl uppercase tracking-widest text-sm hover:bg-primary transition-all active:scale-95 shadow-[0_10px_30px_rgba(255,255,255,0.1)] hover:shadow-primary/30 group disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {todaySession?.session_type === 'rest' ? 'Día de Descanso' : 'Iniciar Sesión Hoy'}
                                    <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">play_arrow</span>
                                </button>
                            </div>
                        </section>

                        {/* Quick Training Stats */}
                        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-surface-dark border border-border-dark p-8 rounded-[2rem] hover:border-primary-blue/30 transition-all">
                                <span className="material-symbols-outlined text-primary-blue text-4xl mb-4">fitness_center</span>
                                <h3 className="text-xl font-black uppercase italic mb-2">Fuerza</h3>
                                <p className="text-slate-400 text-sm">{plan?.strengthFrequency} sesiones por semana recomendadas.</p>
                            </div>
                            <div className="bg-surface-dark border border-border-dark p-8 rounded-[2rem] hover:border-primary/30 transition-all">
                                <span className="material-symbols-outlined text-primary text-4xl mb-4">favorite</span>
                                <h3 className="text-xl font-black uppercase italic mb-2">Cardio</h3>
                                <p className="text-slate-400 text-sm">{plan?.cardioFrequency} sesiones por semana para salud metabólica.</p>
                            </div>
                        </section>

                        {/* NEW: Nutrition Preview Section */}
                        <section className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-black uppercase italic tracking-tight">Tu Alimentación</h2>
                                <Link to="/user-nutrition" className="text-primary text-[10px] font-black uppercase tracking-widest hover:underline flex items-center gap-1">
                                    Ver Mi Plan Completo <span className="material-symbols-outlined text-sm">arrow_forward</span>
                                </Link>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Today's Meal Card */}
                                <div className="bg-surface-dark border border-white/5 rounded-[2rem] p-8 group hover:border-primary/20 transition-all relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:scale-110 transition-transform">
                                        <span className="material-symbols-outlined text-6xl">today</span>
                                    </div>
                                    <span className="text-[10px] font-black text-primary uppercase tracking-widest mb-4 block">Hoy</span>
                                    {nutritionPreview.today ? (
                                        <div className="space-y-4">
                                            <div>
                                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block">Almuerzo</span>
                                                <p className="text-sm text-slate-200 font-bold leading-snug line-clamp-2">{nutritionPreview.today.meals.almuerzo}</p>
                                            </div>
                                            <div>
                                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block">Cena</span>
                                                <p className="text-sm text-slate-200 font-bold leading-snug line-clamp-2">{nutritionPreview.today.meals.cena}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-500 italic">No hay plan generado para hoy.</p>
                                    )}
                                </div>

                                {/* Tomorrow's Meal Card */}
                                <div className="bg-surface-dark border border-white/5 rounded-[2rem] p-8 group hover:border-primary-blue/20 transition-all opacity-80 hover:opacity-100 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:scale-110 transition-transform">
                                        <span className="material-symbols-outlined text-6xl">calendar_month</span>
                                    </div>
                                    <span className="text-[10px] font-black text-primary-blue uppercase tracking-widest mb-4 block">Mañana</span>
                                    {nutritionPreview.tomorrow ? (
                                        <div className="space-y-4">
                                            <div>
                                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block">Almuerzo</span>
                                                <p className="text-sm text-slate-200 font-bold leading-snug line-clamp-2">{nutritionPreview.tomorrow.meals.almuerzo}</p>
                                            </div>
                                            <div>
                                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block">Cena</span>
                                                <p className="text-sm text-slate-200 font-bold leading-snug line-clamp-2">{nutritionPreview.tomorrow.meals.cena}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-500 italic">Planifica tu mañana pronto.</p>
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Sidebar: Social & Stats */}
                    <div className="lg:col-span-4 space-y-8 animate-fadeInUp" style={{ animationDelay: '0.2s' }}>
                        {/* Community Preview */}
                        <section className="bg-surface-dark border border-border-dark rounded-[2.5rem] p-8">
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-xl font-black uppercase italic tracking-tight">Comunidad</h3>
                                <Link to="/community" className="text-primary text-[10px] font-black uppercase tracking-widest hover:underline">Ver Todo</Link>
                            </div>
                            <div className="space-y-6">
                                {[
                                    { user: "Carlos R.", status: "Subió 5kg en Sentadilla", avatar: "https://i.pravatar.cc/150?u=carlos" },
                                    { user: "Elena M.", status: "Completó desafío 7 días", avatar: "https://i.pravatar.cc/150?u=elena" }
                                ].map((item, i) => (
                                    <div key={i} className="flex items-center gap-4 group cursor-pointer">
                                        <div className="size-10 rounded-full border border-primary/20 p-0.5">
                                            <div className="size-full rounded-full bg-cover bg-center" style={{ backgroundImage: `url('${item.avatar}')` }}></div>
                                        </div>
                                        <div>
                                            <p className="text-sm font-black uppercase italic group-hover:text-primary transition-colors">{item.user}</p>
                                            <p className="text-slate-500 text-xs">{item.status}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <Link to="/community" className="mt-8 w-full block text-center py-4 bg-white/5 border border-white/10 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">
                                Unirse a la Charla
                            </Link>
                        </section>

                        {/* Quick Stats */}
                        <section className="bg-primary/5 border border-primary/20 rounded-[2.5rem] p-8 space-y-10">
                            <div>
                                <h3 className="text-xl font-black uppercase italic tracking-tight mb-6 text-primary">Tu Progreso</h3>
                                <div className="space-y-6">
                                    <div>
                                        <div className="flex justify-between text-xs font-black uppercase tracking-widest mb-2 text-slate-400">
                                            <span>Adherencia al Plan</span>
                                            <span className="text-primary">{progressStats.label}</span>
                                        </div>
                                        <div className="h-4 w-full bg-background-dark rounded-full overflow-hidden border border-white/5">
                                            <div className="h-full bg-primary shadow-[0_0_20px_rgba(13,242,89,0.5)] transition-all duration-1000" style={{ width: `${progressStats.percent}%` }}></div>
                                        </div>
                                        <p className="mt-4 text-[11px] font-black italic text-white leading-tight">
                                            "{progressStats.text}"
                                        </p>
                                    </div>
                                    <div className="flex items-center justify-between bg-background-dark/50 p-4 rounded-2xl">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Racha Actual</span>
                                            <span className="text-2xl font-black italic text-primary">{profile?.streak || 0} Días</span>
                                        </div>
                                        <span className="text-3xl">🔥</span>
                                    </div>
                                </div>
                            </div>

                            {/* NEW: Nutrition Adherence Stats */}
                            <div className="pt-8 border-t border-white/5">
                                <h3 className="text-xl font-black uppercase italic tracking-tight mb-6 text-primary-blue">Plan Alimenticio</h3>
                                <div className="space-y-6">
                                    <div>
                                        <div className="flex justify-between text-xs font-black uppercase tracking-widest mb-2 text-slate-400">
                                            <span>Adherencia Nutritiva</span>
                                            <span className="text-primary-blue">{nutritionStats.label}</span>
                                        </div>
                                        <div className="h-4 w-full bg-background-dark rounded-full overflow-hidden border border-white/5">
                                            <div className="h-full bg-primary-blue shadow-[0_0_20px_rgba(59,130,246,0.5)] transition-all duration-1000" style={{ width: `${nutritionStats.percent}%` }}></div>
                                        </div>
                                        <p className="mt-4 text-[11px] font-black italic text-white leading-tight">
                                            "{nutritionStats.text}"
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Personal Data Widget */}
                        <section className="bg-surface-dark border border-white/10 rounded-[2.5rem] p-8">
                            <h3 className="text-xl font-black uppercase italic tracking-tight mb-8">Datos Personales</h3>
                            <div className="grid grid-cols-2 gap-4 mb-8">
                                <div className="bg-background-dark p-4 rounded-2xl">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Peso Actual</span>
                                    <span className="text-2xl font-black italic text-white">{biometrics?.current_weight || '--'} <small className="text-[10px] not-italic text-slate-500">KG</small></span>
                                </div>
                                <div className="bg-background-dark p-4 rounded-2xl">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Altura</span>
                                    <span className="text-2xl font-black italic text-white">{biometrics?.height_cm || '--'} <small className="text-[10px] not-italic text-slate-500">CM</small></span>
                                </div>
                            </div>
                            <button
                                onClick={() => navigate('/user-progress')}
                                className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                            >
                                <span className="material-symbols-outlined text-sm">history</span>
                                Actualizar Historial
                            </button>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default UserPlan;