import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { completeSession } from '../services/workoutPlanService';
import UserHeader from '../components/UserHeader';

const RoutineInProgress = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [session, setSession] = useState(location.state?.session || null);
    const [userProfile, setUserProfile] = useState(null);
    const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
    const [currentSet, setCurrentSet] = useState(1);
    const [isResting, setIsResting] = useState(false);
    const [restTimer, setRestTimer] = useState(0);
    const [sessionStartTime, setSessionStartTime] = useState(Date.now());
    const [completedExercises, setCompletedExercises] = useState([]);
    const [notes, setNotes] = useState('');

    useEffect(() => {
        fetchUserProfile();
        if (!session) {
            fetchTodaySession();
        }
    }, []);

    useEffect(() => {
        let interval;
        if (isResting && restTimer > 0) {
            interval = setInterval(() => setRestTimer(prev => prev - 1), 1000);
        } else if (restTimer === 0 && isResting) {
            setIsResting(false);
            // Play sound or notification
        }
        return () => clearInterval(interval);
    }, [isResting, restTimer]);

    const fetchUserProfile = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            setUserProfile(profile);
        }
    };

    const fetchTodaySession = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const today = new Date().toISOString().split('T')[0];
            const { data: todaySession } = await supabase
                .from('workout_sessions')
                .select('*')
                .eq('user_id', user.id)
                .eq('session_date', today)
                .single();

            if (todaySession) {
                setSession(todaySession);
            } else {
                alert('No hay sesión programada para hoy');
                navigate('/user-progress');
            }
        } catch (error) {
            console.error('Error fetching today session:', error);
        }
    };

    const handleCompleteSet = () => {
        const currentExercise = session.exercises[currentExerciseIndex];

        if (currentSet < currentExercise.sets) {
            // Start rest timer
            setIsResting(true);
            setRestTimer(currentExercise.rest_sec || 60);
            setCurrentSet(currentSet + 1);
        } else {
            // Move to next exercise
            setCompletedExercises([...completedExercises, currentExerciseIndex]);
            if (currentExerciseIndex < session.exercises.length - 1) {
                setCurrentExerciseIndex(currentExerciseIndex + 1);
                setCurrentSet(1);
            } else {
                // Session complete!
                handleCompleteSession();
            }
        }
    };

    const handleCompleteSession = async () => {
        try {
            const durationMin = Math.floor((Date.now() - sessionStartTime) / 60000);

            const result = await completeSession(
                session.id,
                userProfile.id,
                durationMin,
                notes,
                true // auto_marked
            );

            alert(`🎉 ¡Sesión completada!\n\n+${result.xp_earned} XP\nNivel: ${result.new_level}\nRacha: ${result.streak} días 🔥`);

            navigate('/user-progress');
        } catch (error) {
            console.error('Error completing session:', error);
            alert('Error al completar sesión: ' + error.message);
        }
    };

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    if (!session) {
        return (
            <div className="min-h-screen bg-background-dark flex items-center justify-center">
                <div className="size-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (session.session_type === 'rest') {
        return (
            <div className="min-h-screen bg-background-dark text-white font-display">
                <UserHeader />
                <div className="max-w-2xl mx-auto py-20 px-6 text-center">
                    <span className="material-symbols-outlined text-6xl text-primary mb-6">hotel</span>
                    <h2 className="text-3xl font-black uppercase italic mb-4">Día de <span className="text-primary">Descanso</span></h2>
                    <p className="text-slate-500 mb-8">Tu cuerpo necesita recuperarse. Disfruta tu día libre.</p>
                    <button
                        onClick={() => navigate('/user-progress')}
                        className="bg-surface-dark border border-white/10 text-white font-black px-8 py-4 rounded-2xl uppercase tracking-widest text-xs hover:border-primary transition-all"
                    >
                        Volver al Calendario
                    </button>
                </div>
            </div>
        );
    }

    const currentExercise = session.exercises[currentExerciseIndex];
    const progress = ((currentExerciseIndex + (currentSet / currentExercise.sets)) / session.exercises.length) * 100;

    return (
        <div className="min-h-screen bg-background-dark text-white font-display">
            <UserHeader />

            <main className="max-w-4xl mx-auto py-10 px-6 pb-32">
                {/* Session Header */}
                <header className="mb-10">
                    <div className="flex items-center justify-between mb-4">
                        <button
                            onClick={() => navigate('/user-progress')}
                            className="text-slate-500 hover:text-white transition-colors"
                        >
                            <span className="material-symbols-outlined">arrow_back</span>
                        </button>
                        <span className="text-xs font-black uppercase tracking-widest text-slate-600">
                            {session.estimated_duration_min} min
                        </span>
                    </div>
                    <h1 className="text-4xl font-black uppercase italic tracking-tighter mb-2">
                        {session.title}
                    </h1>
                    <p className="text-slate-500 font-bold">{session.description}</p>

                    {/* Progress Bar */}
                    <div className="mt-6 bg-background-dark rounded-full h-3 overflow-hidden">
                        <div
                            className="bg-primary h-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                    <p className="text-xs font-black text-slate-600 mt-2">
                        Ejercicio {currentExerciseIndex + 1} de {session.exercises.length}
                    </p>
                </header>

                {/* Rest Timer Overlay */}
                {isResting && (
                    <div className="fixed inset-0 z-50 bg-background-dark/95 backdrop-blur-xl flex items-center justify-center">
                        <div className="text-center">
                            <span className="material-symbols-outlined text-6xl text-primary mb-6 animate-pulse">timer</span>
                            <h2 className="text-2xl font-black uppercase italic mb-4 text-slate-500">Descansando</h2>
                            <div className="text-8xl font-black italic text-primary mb-8">
                                {formatTime(restTimer)}
                            </div>
                            <button
                                onClick={() => {
                                    setIsResting(false);
                                    setRestTimer(0);
                                }}
                                className="bg-surface-dark border border-white/10 text-white font-black px-8 py-4 rounded-2xl uppercase tracking-widest text-xs hover:border-primary transition-all"
                            >
                                Saltar Descanso
                            </button>
                        </div>
                    </div>
                )}

                {/* Current Exercise */}
                <div className="bg-surface-dark border border-white/10 rounded-[2.5rem] p-10 mb-6">
                    <div className="flex items-start justify-between mb-6">
                        <div>
                            <h2 className="text-3xl font-black uppercase italic mb-2">
                                {currentExercise.name}
                            </h2>
                            <p className="text-slate-500 text-sm">{currentExercise.notes}</p>
                        </div>
                        <div className={`size-16 rounded-2xl flex items-center justify-center border-2 ${session.session_type === 'strength' ? 'border-primary bg-primary/10' : 'border-primary-blue bg-primary-blue/10'
                            }`}>
                            <span className={`material-symbols-outlined text-3xl ${session.session_type === 'strength' ? 'text-primary' : 'text-primary-blue'
                                }`}>
                                {session.session_type === 'strength' ? 'fitness_center' : 'directions_run'}
                            </span>
                        </div>
                    </div>

                    {/* Sets & Reps */}
                    <div className="grid grid-cols-3 gap-4 mb-8">
                        <div className="bg-background-dark rounded-2xl p-6 text-center">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-2">Serie</p>
                            <p className="text-4xl font-black italic text-primary">{currentSet}</p>
                            <p className="text-xs font-bold text-slate-600 mt-1">de {currentExercise.sets}</p>
                        </div>
                        <div className="bg-background-dark rounded-2xl p-6 text-center">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-2">Reps</p>
                            <p className="text-4xl font-black italic text-white">{currentExercise.reps}</p>
                        </div>
                        <div className="bg-background-dark rounded-2xl p-6 text-center">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-2">Descanso</p>
                            <p className="text-4xl font-black italic text-slate-500">{currentExercise.rest_sec}s</p>
                        </div>
                    </div>

                    {/* Complete Set Button */}
                    <button
                        onClick={handleCompleteSet}
                        className="w-full bg-primary text-background-dark font-black py-6 rounded-2xl uppercase tracking-widest text-sm hover:shadow-[0_0_30px_rgba(13,242,89,0.3)] transition-all flex items-center justify-center gap-2"
                    >
                        <span className="material-symbols-outlined">check_circle</span>
                        {currentSet < currentExercise.sets ? 'Completar Serie' :
                            currentExerciseIndex < session.exercises.length - 1 ? 'Siguiente Ejercicio' : 'Finalizar Sesión'}
                    </button>
                </div>

                {/* Exercise List */}
                <div className="bg-surface-dark border border-white/10 rounded-[2.5rem] p-8">
                    <h3 className="text-xl font-black uppercase italic mb-6">Ejercicios de Hoy</h3>
                    <div className="space-y-3">
                        {session.exercises.map((exercise, index) => (
                            <div
                                key={index}
                                className={`flex items-center justify-between p-4 rounded-xl transition-all ${index === currentExerciseIndex ? 'bg-primary/10 border border-primary/30' :
                                        completedExercises.includes(index) ? 'bg-primary/5 opacity-50' :
                                            'bg-background-dark'
                                    }`}
                            >
                                <div className="flex items-center gap-4">
                                    {completedExercises.includes(index) ? (
                                        <span className="material-symbols-outlined text-primary fill-1">check_circle</span>
                                    ) : index === currentExerciseIndex ? (
                                        <span className="material-symbols-outlined text-primary animate-pulse">play_circle</span>
                                    ) : (
                                        <span className="material-symbols-outlined text-slate-600">radio_button_unchecked</span>
                                    )}
                                    <div>
                                        <p className="font-black text-sm">{exercise.name}</p>
                                        <p className="text-xs text-slate-600">{exercise.sets} × {exercise.reps}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Notes Section */}
                <div className="mt-6 bg-surface-dark border border-white/10 rounded-[2.5rem] p-8">
                    <h3 className="text-xl font-black uppercase italic mb-4">Notas de la Sesión</h3>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="¿Cómo te sentiste? ¿Alguna observación?"
                        className="w-full bg-background-dark border border-white/10 rounded-xl p-4 text-sm focus:border-primary outline-none resize-none h-24"
                    ></textarea>
                </div>
            </main>
        </div>
    );
};

export default RoutineInProgress;
