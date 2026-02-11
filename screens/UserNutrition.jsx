import React, { useState, useEffect } from 'react';
import UserHeader from '../components/UserHeader';
import { supabase } from '../services/supabaseClient';
import { getActiveNutritionPlan, generateNextWeeklyPlan, createAnnualNutritionPlan, toggleDayCompletion } from '../services/nutritionService';

const UserNutrition = () => {
    const [loading, setLoading] = useState(true);
    const [plan, setPlan] = useState(null);
    const [currentWeek, setCurrentWeek] = useState(null);
    const [biometrics, setBiometrics] = useState(null);
    const [workoutStartDate, setWorkoutStartDate] = useState(null);
    const [generating, setGenerating] = useState(false);
    const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

    const showMessage = (message, type = 'info') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'info' }), 4000);
    };

    useEffect(() => {
        const fetchNutrition = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                // Fetch Biometrics for context
                const { data: bioData } = await supabase
                    .from('biometrics')
                    .select('*')
                    .eq('user_id', user.id)
                    .single();
                setBiometrics(bioData);

                const activePlan = await getActiveNutritionPlan(user.id);
                if (activePlan) {
                    setPlan(activePlan);
                    // Set latest week as default
                    const latestWeek = activePlan.nutrition_weeks.reduce((prev, current) => (prev.week_number > current.week_number) ? prev : current, activePlan.nutrition_weeks[0]);
                    setCurrentWeek(latestWeek);
                }

                // Fetch workout plan start date
                const { data: workoutPlan } = await supabase
                    .from('workout_plans')
                    .select('start_date')
                    .eq('user_id', user.id)
                    .eq('is_active', true)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (workoutPlan) {
                    setWorkoutStartDate(new Date(workoutPlan.start_date));
                }
            } catch (err) {
                console.error("Error fetching nutrition data:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchNutrition();
    }, []);

    const handleToggleDay = async (dayIndex) => {
        if (!currentWeek) return;

        // Safety check: Cannot complete future days
        if (!isDayClickable(currentWeek.week_number, dayIndex)) {
            showMessage("⏳ No puedes marcar un día antes de que ocurra. ¡Sigue el plan paso a paso!", "warning");
            return;
        }

        try {
            const updatedWeek = await toggleDayCompletion(
                currentWeek.id,
                dayIndex,
                currentWeek.completed_days || [false, false, false, false, false, false, false]
            );
            setCurrentWeek(updatedWeek);

            // Sync with plan state
            const updatedWeeks = plan.nutrition_weeks.map(w => w.id === updatedWeek.id ? updatedWeek : w);
            setPlan({ ...plan, nutrition_weeks: updatedWeeks });
        } catch (err) {
            console.error("Error toggling completion:", err);
        }
    };

    const getCompletedCount = () => {
        if (!currentWeek?.completed_days) return 0;
        return currentWeek.completed_days.filter(d => d).length;
    };

    const isNextWeekLocked = () => {
        // Find if this is the latest week
        const latestWeekNum = Math.max(...plan.nutrition_weeks.map(w => w.week_number));
        if (currentWeek?.week_number < latestWeekNum) return false; // Can navigate between past weeks

        return getCompletedCount() < 5;
    };

    const getDayInfo = (weekNumber, dayIdx) => {
        if (!workoutStartDate) {
            const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
            return { dateStr: `Día ${dayIdx + 1}`, dayName: days[dayIdx] };
        }

        const date = new Date(workoutStartDate);
        // Add weeks
        date.setDate(date.getDate() + (weekNumber - 1) * 7);
        // Add days
        date.setDate(date.getDate() + dayIdx);

        const dayName = date.toLocaleDateString('es-ES', { weekday: 'long' });
        const dateStr = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

        // Capitalize day name
        return {
            dateStr,
            dayName: dayName.charAt(0).toUpperCase() + dayName.slice(1)
        };
    };

    const isDayClickable = (weekNumber, dayIdx) => {
        if (!workoutStartDate) return true;
        const date = new Date(workoutStartDate);
        date.setDate(date.getDate() + (weekNumber - 1) * 7);
        date.setDate(date.getDate() + dayIdx);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        date.setHours(0, 0, 0, 0);

        return date <= today;
    };

    const handleUnlockNextWeek = async () => {
        // If we already have a week, enforce the 5-day rule. 
        // If there are NO weeks yet (currentWeek is null), allow generating Week 1 always.
        if (currentWeek && isNextWeekLocked()) {
            showMessage("🔒 Completa al menos 5 días de la semana actual para desbloquear la siguiente.", "warning");
            return;
        }
        setGenerating(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const nextWeekNum = (currentWeek?.week_number || 0) + 1;

            const userProfile = {
                biometrics: biometrics,
                fitness_goals: JSON.parse(localStorage.getItem('onboarding_fitness_goals') || '["Salud General"]')
            };

            const nextWeek = await generateNextWeeklyPlan(userProfile, plan.id, user.id, nextWeekNum);
            setCurrentWeek(nextWeek);
            // Refresh plan to include new week
            const updatedPlan = await getActiveNutritionPlan(user.id);
            setPlan(updatedPlan);
        } catch (err) {
            alert("Error al generar la siguiente semana: " + err.message);
        } finally {
            setGenerating(false);
        }
    };

    const handleInitialGeneration = async () => {
        setGenerating(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const userProfile = {
                biometrics: biometrics,
                fitness_goals: ["Salud General", "Rendimiento"] // Default goals if not in localStorage
            };

            const newPlan = await createAnnualNutritionPlan(userProfile, user.id);
            setPlan(newPlan);

            // Refresh to get the first week
            const updatedPlan = await getActiveNutritionPlan(user.id);
            setPlan(updatedPlan);
            if (updatedPlan.nutrition_weeks?.length > 0) {
                setCurrentWeek(updatedPlan.nutrition_weeks[0]);
            }
            showMessage("¡Tu plan nutricional ha sido generado exitosamente! 🎉", "success");
        } catch (err) {
            showMessage("Error al generar el plan: " + err.message, "error");
        } finally {
            setGenerating(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-background-dark flex items-center justify-center">
            <div className="size-16 relative">
                <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        </div>
    );

    if (!plan) return (
        <div className="min-h-screen bg-background-dark text-white font-display">
            <UserHeader />
            <main className="max-w-4xl mx-auto p-10 pt-20 text-center space-y-8">
                <div className="size-24 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-10 border border-primary/20">
                    <span className="material-symbols-outlined text-5xl text-primary">restaurant_menu</span>
                </div>
                <div>
                    <h2 className="text-4xl font-black uppercase italic tracking-tight">Tu Ecosistema <span className="text-primary">Nutricional</span></h2>
                    <p className="text-slate-400 mt-4 text-lg max-w-xl mx-auto">
                        Genera tu guía de alimentación personalizada basada en tus objetivos físicos, ubicación y hábitos.
                    </p>
                </div>

                <div className="bg-surface-dark border border-white/5 rounded-3xl p-8 max-w-lg mx-auto text-left space-y-4">
                    <div className="flex items-center gap-4">
                        <span className="material-symbols-outlined text-primary">check_circle</span>
                        <span className="text-sm font-bold text-slate-300">Plan semanal dinámico</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="material-symbols-outlined text-primary">check_circle</span>
                        <span className="text-sm font-bold text-slate-300">Recetas con ingredientes locales</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="material-symbols-outlined text-primary">check_circle</span>
                        <span className="text-sm font-bold text-slate-300">Ajustado a tus objetivos de peso</span>
                    </div>
                </div>

                <button
                    disabled={generating}
                    onClick={handleInitialGeneration}
                    className="group relative px-10 py-5 bg-primary text-background-dark font-black uppercase italic tracking-widest rounded-2xl hover:scale-105 transition-all shadow-[0_0_30px_rgba(13,242,89,0.3)] disabled:opacity-50 disabled:scale-100"
                >
                    <div className="flex items-center gap-3">
                        {generating ? (
                            <>
                                <div className="size-4 border-2 border-background-dark border-t-transparent rounded-full animate-spin"></div>
                                Generando Plan con IA...
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined font-black">bolt</span>
                                Generar Mi Plan Ahora
                            </>
                        )}
                    </div>
                </button>

                {generating && (
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] animate-pulse">
                        Esto puede tomar unos 20-30 segundos...
                    </p>
                )}
            </main>
        </div>
    );

    return (
        <div className="min-h-screen bg-background-dark text-white font-display pb-20">
            <UserHeader />

            <main className="max-w-[1400px] mx-auto p-6 md:p-10 pb-32 space-y-10">
                {/* Annual Goal Banner */}
                <section className="bg-primary/10 border border-primary/20 rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-110 transition-transform">
                        <span className="material-symbols-outlined text-9xl">restaurant</span>
                    </div>
                    <div className="relative z-10 max-w-2xl">
                        <span className="text-[10px] font-black text-primary uppercase tracking-[0.4em] mb-4 block">Meta Anual de Nutrición</span>
                        <h1 className="text-2xl md:text-5xl font-black uppercase italic tracking-tighter leading-none mb-6">
                            {plan.annual_goal}
                        </h1>
                        <div className="flex items-center gap-4">
                            <div className="bg-background-dark/50 backdrop-blur px-4 py-2 rounded-xl text-[10px] font-black border border-white/5 uppercase tracking-widest">
                                Estrategia: {biometrics?.target_weight_kg < biometrics?.initial_weight_kg ? 'Déficit' : 'Superávit'}
                            </div>
                            <div className="bg-background-dark/50 backdrop-blur px-4 py-2 rounded-xl text-[10px] font-black border border-white/5 uppercase tracking-widest text-primary">
                                Semana {currentWeek?.week_number} de 52
                            </div>
                        </div>
                    </div>
                </section>

                {/* Week Navigation */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-black uppercase italic tracking-tight">Plan de la <span className="text-primary-blue">Semana {currentWeek?.week_number}</span></h2>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Comidas personalizadas con IA</p>
                    </div>
                    <div className="flex gap-2">
                        {plan.nutrition_weeks.sort((a, b) => a.week_number - b.week_number).map(w => (
                            <button
                                key={w.id}
                                onClick={() => setCurrentWeek(w)}
                                className={`size-10 rounded-xl font-black text-[10px] transition-all border ${currentWeek?.id === w.id ? 'bg-primary text-background-dark border-primary' : 'bg-surface-dark border-white/5 text-slate-400 hover:border-primary/50'}`}
                            >
                                {w.week_number}
                            </button>
                        ))}
                        <button
                            disabled={generating}
                            onClick={handleUnlockNextWeek}
                            className="h-10 px-4 rounded-xl bg-primary-blue text-white font-black text-[10px] uppercase tracking-widest hover:brightness-110 transition-all ml-2 flex items-center gap-2 disabled:opacity-50"
                        >
                            {generating ? 'Generando...' : <><span className="material-symbols-outlined text-sm">lock_open</span> Desbloquear Semana {(plan.nutrition_weeks.length + 1)}</>}
                        </button>
                    </div>
                </div>

                {/* Meals Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {currentWeek?.daily_meals?.map((dayData, idx) => {
                        const isCompleted = currentWeek.completed_days?.[idx];
                        const { dateStr, dayName } = getDayInfo(currentWeek.week_number, idx);
                        const isAvailable = isDayClickable(currentWeek.week_number, idx);

                        return (
                            <div
                                key={idx}
                                className={`bg-surface-dark border rounded-[2rem] p-6 transition-all group relative overflow-hidden
                                    ${isCompleted ? 'border-primary/50' : 'border-white/5 hover:border-primary/30'}
                                    ${!isAvailable ? 'opacity-40 grayscale-[0.5]' : ''}
                                `}
                            >
                                {isCompleted && (
                                    <div className="absolute -top-4 -right-4 size-16 bg-primary/20 rounded-full blur-2xl animate-pulse"></div>
                                )}

                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex flex-col">
                                        <span className={`text-lg font-black uppercase italic ${isCompleted ? 'text-primary' : 'text-slate-200'}`}>
                                            {dayName}
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{dateStr}</span>
                                    </div>
                                    <button
                                        onClick={() => isAvailable && handleToggleDay(idx)}
                                        className={`size-10 rounded-xl flex items-center justify-center transition-all
                                            ${isCompleted ? 'bg-primary text-background-dark' : 'bg-white/5 text-slate-500 hover:text-white'}
                                            ${!isAvailable ? 'cursor-not-allowed' : 'hover:scale-110'}
                                        `}
                                    >
                                        <span className="material-symbols-outlined text-sm font-black">
                                            {!isAvailable ? 'lock' : isCompleted ? 'task_alt' : 'circle'}
                                        </span>
                                    </button>
                                </div>

                                <div className={`space-y-6 transition-opacity ${isCompleted ? 'opacity-50' : 'opacity-100'}`}>
                                    <div>
                                        <span className="text-[8px] font-black text-primary-light uppercase tracking-widest block mb-2">Desayuno</span>
                                        <p className="text-sm text-slate-300 leading-relaxed">{dayData.meals.desayuno}</p>
                                    </div>
                                    <div className="pt-4 border-t border-white/5">
                                        <span className="text-[8px] font-black text-primary-light uppercase tracking-widest block mb-2">Almuerzo</span>
                                        <p className="text-sm text-slate-300 leading-relaxed">{dayData.meals.almuerzo}</p>
                                    </div>
                                    <div className="pt-4 border-t border-white/5">
                                        <span className="text-[8px] font-black text-primary-light uppercase tracking-widest block mb-2">Cena</span>
                                        <p className="text-sm text-slate-300 leading-relaxed">{dayData.meals.cena}</p>
                                    </div>
                                    <div className="pt-4 border-t border-white/5">
                                        <span className="text-[8px] font-black text-primary-light uppercase tracking-widest block mb-2">Snacks</span>
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {dayData.meals.snacks.map((snack, sIdx) => (
                                                <span key={sIdx} className="px-2 py-1 bg-background-dark rounded-lg text-[9px] font-bold text-slate-400 border border-white/5 italic">
                                                    {snack}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* Motivational Cards */}
                    <div className="bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 rounded-[2rem] p-8 flex flex-col justify-between group">
                        <span className="material-symbols-outlined text-primary text-4xl mb-6 group-hover:scale-110 transition-transform">verified</span>
                        <div>
                            <h3 className="text-xl font-black uppercase italic tracking-tight mb-2">Plan Estricto</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Recuerda que la constancia en el plan nutritivo es el 70% de tus resultados físicos.
                            </p>
                        </div>
                        <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Progreso Semana</span>
                            <span className="text-xl font-black italic text-primary">{getCompletedCount()}/7</span>
                        </div>
                    </div>

                    <div className="bg-surface-dark border border-white/5 rounded-[2rem] p-8 flex flex-col justify-between hover:border-primary-blue/30 transition-all cursor-default">
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black text-primary-blue uppercase tracking-widest">Enfoque Semanal</span>
                            <h3 className="text-2xl font-black uppercase italic tracking-tighter">Máxima Adherencia</h3>
                        </div>
                        <p className="text-[11px] text-slate-500 italic mt-4 leading-relaxed">
                            "Si quieres ver cambios que otros no ven, debes hacer sacrificios que otros no hacen."
                        </p>
                        <div className="mt-6 flex gap-1">
                            {[...Array(7)].map((_, i) => (
                                <div
                                    key={i}
                                    className={`h-1.5 flex-1 rounded-full transition-all ${currentWeek?.completed_days?.[i] ? 'bg-primary' : 'bg-white/5'}`}
                                ></div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Recommendations */}
                <section className="bg-surface-dark border border-white/5 rounded-[2.5rem] p-8 md:p-12">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="size-12 rounded-2xl bg-primary/20 text-primary flex items-center justify-center">
                            <span className="material-symbols-outlined">lightbulb</span>
                        </div>
                        <div>
                            <h3 className="text-xl font-black uppercase italic tracking-tight">Recomendaciones de la semana</h3>
                            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Consejos personalizados de tu Nutricionista IA</p>
                        </div>
                    </div>

                    <div className="prose prose-invert max-w-none">
                        <p className="text-slate-400 leading-relaxed whitespace-pre-line">
                            {currentWeek?.recommendations}
                        </p>
                    </div>

                    {biometrics?.habits?.includes('Azúcar') && (
                        <div className="mt-10 p-6 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-4">
                            <span className="material-symbols-outlined text-red-500">warning</span>
                            <div>
                                <p className="text-xs font-black text-red-500 uppercase tracking-widest mb-1">Nota Médica Importante</p>
                                <p className="text-xs text-slate-400">Consulta a tu médico para un seguimiento profesional sobre tu consumo de azúcar y cómo este plan nutricional se adapta a tus necesidades clínicas específicas.</p>
                            </div>
                        </div>
                    )}
                </section>
            </main>

            {/* Custom Aesthetic Toast */}
            {toast.show && (
                <div className="fixed top-24 md:top-auto md:bottom-10 left-1/2 -translate-x-1/2 z-[110] animate-in slide-in-from-top-2 md:slide-in-from-bottom-5 duration-300 w-[calc(100%-2rem)] md:w-auto max-w-md">
                    <div className={`
                        flex items-center gap-4 px-6 py-4 rounded-2xl backdrop-blur-xl border shadow-2xl
                        ${toast.type === 'success' ? 'bg-primary/20 border-primary/30 text-primary' :
                            toast.type === 'warning' ? 'bg-orange-500/20 border-orange-500/30 text-orange-400' :
                                toast.type === 'error' ? 'bg-red-500/20 border-red-500/30 text-red-400' :
                                    'bg-surface-dark/80 border-white/10 text-slate-300'}
                    `}>
                        <span className="material-symbols-outlined text-2xl shrink-0">
                            {toast.type === 'success' ? 'check_circle' :
                                toast.type === 'warning' ? 'warning' :
                                    toast.type === 'error' ? 'error' : 'info'}
                        </span>
                        <p className="font-bold text-sm tracking-tight leading-snug">
                            {toast.message}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserNutrition;
