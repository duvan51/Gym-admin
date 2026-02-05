import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

const ResetPassword = () => {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                console.log('Recovery session detected');
                setError(null);
            } else if (!session && event !== 'INITIAL_SESSION') {
                // Si no hay sesión y no estamos terminando de cargar la inicial
                // setError("La sesión de recuperación ha expirado o es inválida.");
            }
        });

        // Verificación inicial con un pequeño delay para dar tiempo a Supabase de procesar la URL
        const timer = setTimeout(async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setError("No se detectó una sesión activa. Asegúrate de venir desde el enlace de tu correo.");
            }
        }, 1000);

        return () => {
            subscription.unsubscribe();
            clearTimeout(timer);
        };
    }, []);

    const handleResetSubmit = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setError("Las contraseñas no coinciden.");
            return;
        }
        if (password.length < 6) {
            setError("La contraseña debe tener al menos 6 caracteres.");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.updateUser({
                password: password
            });

            if (error) throw error;

            setSuccess(true);
            setTimeout(() => {
                navigate('/login');
            }, 3000);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background-dark flex flex-col items-center justify-center p-6 relative overflow-hidden font-display">
            <div className="absolute top-[-15%] right-[-10%] size-[600px] bg-primary/10 blur-[140px] rounded-full"></div>

            <div className="z-10 w-full max-w-md">
                <div className="bg-surface-dark border border-border-dark p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
                    <header className="mb-10 text-center">
                        <div className="bg-primary/20 size-16 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-primary/30">
                            <span className="material-symbols-outlined text-primary text-3xl">lock_reset</span>
                        </div>
                        <h2 className="text-3xl font-black text-white uppercase italic tracking-tight">
                            Nueva <span className="text-primary">Contraseña</span>
                        </h2>
                        <p className="text-slate-400 mt-2 font-medium">Establece tus nuevas credenciales de acceso</p>
                    </header>

                    {error && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3 animate-shake">
                            <span className="material-symbols-outlined text-red-500">error</span>
                            <p className="text-red-500 text-xs font-bold uppercase tracking-widest">{error}</p>
                        </div>
                    )}

                    {success ? (
                        <div className="text-center space-y-4 py-6">
                            <div className="size-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto border border-primary/30 shadow-[0_0_30px_rgba(13,242,89,0.2)]">
                                <span className="material-symbols-outlined text-primary text-5xl animate-bounce">check_circle</span>
                            </div>
                            <h3 className="text-xl font-black text-white uppercase italic">¡Contraseña Actualizada!</h3>
                            <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Redirigiendo al login...</p>
                        </div>
                    ) : (
                        <form onSubmit={handleResetSubmit} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1 text-left block">Nueva Contraseña</label>
                                <div className="relative group">
                                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors">lock</span>
                                    <input
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full bg-background-dark/50 border-2 border-border-dark rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:border-primary focus:ring-0 transition-all outline-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1 text-left block">Confirmar Contraseña</label>
                                <div className="relative group">
                                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors">verified</span>
                                    <input
                                        type="password"
                                        required
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full bg-background-dark/50 border-2 border-border-dark rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:border-primary focus:ring-0 transition-all outline-none"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-primary text-background-dark font-black py-4 rounded-2xl uppercase tracking-widest text-sm hover:shadow-[0_0_30px_rgba(13,242,89,0.4)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Actualizando...' : 'Cambiar Contraseña'}
                                <span className="material-symbols-outlined">{loading ? 'sync' : 'key_visualizer'}</span>
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ResetPassword;
