import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { getMonthlyProgress } from '../services/workoutPlanService';
import UserHeader from '../components/UserHeader';

const UserProgress = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [userProfile, setUserProfile] = useState(null);
    const [workoutPlan, setWorkoutPlan] = useState(null);
    const [sessions, setSessions] = useState([]);
    const [completions, setCompletions] = useState([]);
    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [monthlyStats, setMonthlyStats] = useState(null);
    const [measurements, setMeasurements] = useState([]);
    const [viewMode, setViewMode] = useState('month'); // 'year', 'month', 'week'
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (userProfile) {
            fetchMonthlyData();
        }
    }, [currentMonth, currentYear, userProfile]);

    const fetchData = async () => {
        // Removed loading check to allow initial fetch since loading starts as true
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No session found");

            // Fetch user profile
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            setUserProfile(profile);

            // Fetch active workout plan (Prioritize most recent)
            const { data: plan } = await supabase
                .from('workout_plans')
                .select('*')
                .eq('user_id', user.id)
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            setWorkoutPlan(plan);

            // Fetch all completions
            const { data: completionsData } = await supabase
                .from('session_completions')
                .select('*')
                .eq('user_id', user.id);

            setCompletions(completionsData || []);

            // Fetch measurement history
            const { data: measurementsData } = await supabase
                .from('measurements_history')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            setMeasurements(measurementsData || []);

        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchMonthlyData = async () => {
        try {
            // Fetch sessions for current month
            const startDate = new Date(currentYear, currentMonth - 1, 1);
            const endDate = new Date(currentYear, currentMonth, 0);

            const { data: sessionsData } = await supabase
                .from('workout_sessions')
                .select('*, session_completions(*)')
                .eq('user_id', userProfile.id)
                .gte('session_date', startDate.toISOString().split('T')[0])
                .lte('session_date', endDate.toISOString().split('T')[0])
                .order('session_date', { ascending: true });

            setSessions(sessionsData || []);

            // Fetch monthly stats
            const stats = await getMonthlyProgress(userProfile.id, currentMonth, currentYear);
            setMonthlyStats(stats);

        } catch (error) {
            console.error('Error fetching monthly data:', error);
        }
    };

    const isSessionCompleted = (sessionId) => {
        return completions.some(c => c.session_id === sessionId);
    };

    const handleManualComplete = async (sessionId) => {
        try {
            const { error } = await supabase
                .from('session_completions')
                .insert([{
                    session_id: sessionId,
                    user_id: userProfile.id,
                    xp_earned: 50,
                    auto_marked: false
                }]);

            if (error) throw error;

            // Refresh data
            fetchData();
            fetchMonthlyData();

        } catch (error) {
            console.error('Error marking session:', error);
            alert('Error al marcar sesión: ' + error.message);
        }
    };

    const getDaysInMonth = (month, year) => {
        return new Date(year, month, 0).getDate();
    };

    const getFirstDayOfMonth = (month, year) => {
        return new Date(year, month - 1, 1).getDay();
    };

    const renderCalendar = () => {
        const daysInMonth = getDaysInMonth(currentMonth, currentYear);
        const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
        const days = [];

        // Empty cells for days before month starts
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className="aspect-square"></div>);
        }

        // Days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(currentYear, currentMonth - 1, day);
            const dateStr = date.toISOString().split('T')[0];
            const session = sessions.find(s => s.session_date === dateStr);
            const isCompleted = session && isSessionCompleted(session.id);
            const isToday = dateStr === new Date().toISOString().split('T')[0];
            const isPast = date < new Date(new Date().setHours(0, 0, 0, 0));

            days.push(
                <div
                    key={day}
                    onClick={() => session && navigate('/routine', { state: { session } })}
                    className={`aspect-square rounded-2xl border p-2 flex flex-col items-center justify-center cursor-pointer transition-all
                        ${isToday ? 'border-primary bg-primary/10 ring-2 ring-primary/30' : 'border-white/10'}
                        ${isCompleted ? 'bg-primary/20 border-primary/50' : ''}
                        ${session && !isCompleted && !isPast ? 'hover:border-primary/50 hover:bg-surface-dark' : ''}
                        ${!session ? 'opacity-30' : ''}
                    `}
                >
                    <span className={`text-[10px] md:text-sm font-black ${isToday ? 'text-primary' : 'text-slate-400'}`}>{day}</span>
                    {session && (
                        <div className="mt-1 flex flex-col items-center gap-1 md:gap-2">
                            {session.session_type === 'rest' ? (
                                <span className="material-symbols-outlined text-slate-600 text-base md:text-2xl">hotel</span>
                            ) : isCompleted ? (
                                <span className="material-symbols-outlined text-primary text-base md:text-2xl fill-1">check_circle</span>
                            ) : (
                                <span className={`material-symbols-outlined text-sm md:text-xl ${isPast ? 'text-red-500' : 'text-slate-500'}`}>
                                    {session.session_type === 'strength' ? 'fitness_center' : 'directions_run'}
                                </span>
                            )}
                            <span className="text-[7px] md:text-[10px] font-bold text-slate-600 text-center line-clamp-1">{session.title.split(' ')[0]}</span>
                        </div>
                    )}
                </div>
            );
        }

        return days;
    };

    const renderYearView = () => {
        const months = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];

        return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {months.map((month, index) => (
                    <div
                        key={index}
                        onClick={() => {
                            setCurrentMonth(index + 1);
                            setViewMode('month');
                        }}
                        className="bg-surface-dark border border-white/10 rounded-2xl p-6 cursor-pointer hover:border-primary/50 transition-all group"
                    >
                        <h4 className="font-black uppercase text-sm mb-2 group-hover:text-primary transition-colors">{month}</h4>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 bg-background-dark rounded-full h-2 overflow-hidden">
                                <div className="bg-primary h-full" style={{ width: `${Math.random() * 100}%` }}></div>
                            </div>
                            <span className="text-[10px] font-black text-slate-500">{Math.floor(Math.random() * 100)}%</span>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background-dark flex items-center justify-center">
                <div className="size-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!workoutPlan) {
        return (
            <div className="min-h-screen bg-background-dark text-white font-display">
                <UserHeader />
                <div className="max-w-2xl mx-auto py-20 px-6 text-center">
                    <span className="material-symbols-outlined text-6xl text-slate-700 mb-6">calendar_today</span>
                    <h2 className="text-3xl font-black uppercase italic mb-4">No tienes un plan activo</h2>
                    <p className="text-slate-500 mb-8">Completa el onboarding para generar tu plan personalizado</p>
                    <button
                        onClick={() => navigate('/onboarding-1')}
                        className="bg-primary text-background-dark font-black px-8 py-4 rounded-2xl uppercase tracking-widest text-xs hover:shadow-[0_0_30px_rgba(13,242,89,0.3)] transition-all"
                    >
                        Ir al Onboarding
                    </button>
                </div>
            </div>
        );
    }

    const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    return (
        <div className="min-h-screen bg-background-dark text-white font-display">
            <UserHeader />

            <main className="max-w-7xl mx-auto py-10 px-6 pb-32">
                {/* Header */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
                    <div>
                        <h1 className="text-5xl font-black uppercase italic tracking-tighter">
                            Mi <span className="text-primary">Progreso</span>
                        </h1>
                        <p className="text-slate-400 font-bold uppercase tracking-widest mt-2 text-sm">
                            {workoutPlan.title}
                        </p>
                    </div>

                    {/* View Mode Toggle */}
                    <div className="flex gap-2 bg-surface-dark border border-white/10 rounded-2xl p-1">
                        <button
                            onClick={() => setViewMode('year')}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'year' ? 'bg-primary text-background-dark' : 'text-slate-500 hover:text-white'}`}
                        >
                            Año
                        </button>
                        <button
                            onClick={() => setViewMode('month')}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'month' ? 'bg-primary text-background-dark' : 'text-slate-500 hover:text-white'}`}
                        >
                            Mes
                        </button>
                    </div>
                </header>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                    <div className="bg-surface-dark border border-white/10 rounded-2xl p-6">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Racha Actual</p>
                        <div className="flex items-center gap-2">
                            <span className="text-3xl font-black italic text-primary">{userProfile?.streak || 0}</span>
                            <span className="text-2xl">🔥</span>
                        </div>
                    </div>
                    <div className="bg-surface-dark border border-white/10 rounded-2xl p-6">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Nivel</p>
                        <div className="flex items-center gap-2">
                            <span className="text-3xl font-black italic text-primary-blue">{userProfile?.level || 1}</span>
                            <span className="text-xs font-bold text-slate-600">{userProfile?.xp || 0} XP</span>
                        </div>
                    </div>
                    <div className="bg-surface-dark border border-white/10 rounded-2xl p-6">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Este Mes</p>
                        <div className="flex items-center gap-2">
                            <span className="text-3xl font-black italic text-white">{monthlyStats?.completed_sessions || 0}</span>
                            <span className="text-xs font-bold text-slate-600">/ {monthlyStats?.total_sessions || 0}</span>
                        </div>
                    </div>
                    <div className="bg-surface-dark border border-white/10 rounded-2xl p-6">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Adherencia</p>
                        <span className="text-3xl font-black italic text-primary">{monthlyStats?.completion_rate || 0}%</span>
                    </div>
                </div>

                {/* Calendar View */}
                {viewMode === 'year' ? (
                    renderYearView()
                ) : (
                    <div className="bg-surface-dark border border-white/10 rounded-[2.5rem] p-8">
                        {/* Month Navigation */}
                        <div className="flex items-center justify-between mb-8">
                            <button
                                onClick={() => {
                                    if (currentMonth === 1) {
                                        setCurrentMonth(12);
                                        setCurrentYear(currentYear - 1);
                                    } else {
                                        setCurrentMonth(currentMonth - 1);
                                    }
                                }}
                                className="text-slate-500 hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined">chevron_left</span>
                            </button>

                            <h2 className="text-2xl font-black uppercase italic">
                                {monthNames[currentMonth - 1]} <span className="text-primary">{currentYear}</span>
                            </h2>

                            <button
                                onClick={() => {
                                    if (currentMonth === 12) {
                                        setCurrentMonth(1);
                                        setCurrentYear(currentYear + 1);
                                    } else {
                                        setCurrentMonth(currentMonth + 1);
                                    }
                                }}
                                className="text-slate-500 hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined">chevron_right</span>
                            </button>
                        </div>

                        {/* Calendar Grid */}
                        <div className="grid grid-cols-7 gap-2 mb-4">
                            {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
                                <div key={day} className="text-center text-[10px] font-black uppercase tracking-widest text-slate-600 py-2">
                                    {day}
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-7 gap-2">
                            {renderCalendar()}
                        </div>

                        <div className="flex flex-wrap items-center gap-6 mt-8 pt-6 border-t border-white/10">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-sm fill-1">check_circle</span>
                                <span className="text-xs font-bold text-slate-500">Completado</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-slate-500 text-sm">fitness_center</span>
                                <span className="text-xs font-bold text-slate-500">Pendiente</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-red-500 text-sm">fitness_center</span>
                                <span className="text-xs font-bold text-slate-500">Perdido</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-slate-600 text-sm">hotel</span>
                                <span className="text-xs font-bold text-slate-500">Descanso</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Measurements Form Section */}
                <section className="mt-10 animate-fadeInUp">
                    <div className="bg-surface-dark border border-white/10 rounded-[2.5rem] p-8 md:p-12">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
                            <div>
                                <h3 className="text-2xl font-black uppercase italic tracking-tight mb-2">Historial de <span className="text-primary-blue">Medidas</span></h3>
                                <p className="text-slate-400 text-sm">Registra tu progreso físico semanalmente para ver tu evolución.</p>
                            </div>
                            <button
                                onClick={() => {
                                    const weight = prompt("Ingresa tu peso actual (kg):");
                                    if (weight && !isNaN(weight)) {
                                        supabase.from('measurements_history').insert([{
                                            user_id: userProfile.id,
                                            weight_kg: parseFloat(weight)
                                        }]).then(() => fetchData());
                                    }
                                }}
                                className="bg-primary-blue text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined text-sm">add_circle</span>
                                Registrar Peso
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-background-dark/50 border border-white/5 p-6 rounded-2xl flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Último Peso</p>
                                        <p className="text-3xl font-black italic">
                                            {measurements[0]?.weight_kg || '--'}
                                            <small className="text-xs not-italic text-slate-600 ml-1">KG</small>
                                        </p>
                                    </div>
                                    <div className="size-12 rounded-xl bg-primary-blue/10 text-primary-blue flex items-center justify-center">
                                        <span className="material-symbols-outlined">monitor_weight</span>
                                    </div>
                                </div>
                                <div className="bg-background-dark/50 border border-white/5 p-6 rounded-2xl flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Variación</p>
                                        <p className={`text-3xl font-black italic ${measurements.length > 1 && measurements[0].weight_kg < measurements[1].weight_kg ? 'text-primary' : 'text-primary-blue'}`}>
                                            {measurements.length > 1
                                                ? (measurements[0].weight_kg - measurements[1].weight_kg).toFixed(1)
                                                : '0.0'}
                                            <small className="text-xs not-italic text-slate-600 ml-1">KG</small>
                                        </p>
                                    </div>
                                    <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                                        <span className="material-symbols-outlined">
                                            {measurements.length > 1 && measurements[0].weight_kg < measurements[1].weight_kg ? 'trending_down' : 'trending_up'}
                                        </span>
                                    </div>
                                </div>
                                <div className="bg-background-dark/50 border border-white/5 p-6 rounded-2xl flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Fecha</p>
                                        <p className="text-lg font-black italic">
                                            {measurements[0]
                                                ? new Date(measurements[0].created_at).toLocaleDateString()
                                                : '--'}
                                        </p>
                                    </div>
                                    <div className="size-12 rounded-xl bg-white/5 text-slate-500 flex items-center justify-center">
                                        <span className="material-symbols-outlined">calendar_today</span>
                                    </div>
                                </div>
                            </div>

                            {measurements.length > 0 && (
                                <button
                                    onClick={() => setShowHistoryModal(true)}
                                    className="mt-8 w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 hover:text-primary-blue transition-all flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">list_alt</span>
                                    Ver Historial Completo
                                </button>
                            )}
                        </div>
                    </div>
                </section>

                {/* History Modal */}
                {showHistoryModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-fadeIn">
                        <div
                            className="absolute inset-0 bg-background-dark/80 backdrop-blur-md"
                            onClick={() => setShowHistoryModal(false)}
                        ></div>
                        <div className="relative w-full max-w-xl bg-surface-dark border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden animate-scaleIn">
                            <div className="p-8 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                                <div>
                                    <h3 className="text-xl font-black uppercase italic italic tracking-tight">Historial de <span className="text-primary-blue">Pesajes</span></h3>
                                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Registros guardados</p>
                                </div>
                                <button
                                    onClick={() => setShowHistoryModal(false)}
                                    className="size-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all"
                                >
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
                                <div className="space-y-4">
                                    {measurements.length === 0 ? (
                                        <p className="text-center text-slate-500 py-10 italic">No hay registros aún.</p>
                                    ) : (
                                        measurements.map((m, idx) => (
                                            <div key={m.id} className="bg-background-dark/50 p-6 rounded-2xl border border-white/5 flex items-center justify-between group hover:border-primary-blue/30 transition-all">
                                                <div className="flex items-center gap-4">
                                                    <div className="size-10 rounded-xl bg-primary-blue/10 text-primary-blue flex items-center justify-center shrink-0">
                                                        <span className="material-symbols-outlined text-sm">calendar_month</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-white">{new Date(m.created_at).toLocaleDateString()}</p>
                                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                            {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="text-right">
                                                        <p className="text-xl font-black italic text-white">{m.weight_kg} <small className="text-[10px] not-italic text-slate-500 ml-1">KG</small></p>
                                                        {idx < measurements.length - 1 && (
                                                            <p className={`text-[10px] font-bold uppercase ${m.weight_kg < measurements[idx + 1].weight_kg ? 'text-primary' : 'text-primary-blue'}`}>
                                                                {m.weight_kg < measurements[idx + 1].weight_kg ? '↓' : '↑'} {Math.abs(m.weight_kg - measurements[idx + 1].weight_kg).toFixed(1)} kg
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="p-8 bg-white/[0.02] border-t border-white/10">
                                <button
                                    onClick={() => setShowHistoryModal(false)}
                                    className="w-full py-4 bg-primary-blue text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all"
                                >
                                    Cerrar Historial
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default UserProgress;