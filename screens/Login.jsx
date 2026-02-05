import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

const Login = () => {
    const navigate = useNavigate();
    const [selectedSector, setSelectedSector] = useState(null);
    const [showLoginForm, setShowLoginForm] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const sectors = [
        {
            id: 'user',
            title: 'Atleta',
            subtitle: 'ALTO RENDIMIENTO',
            desc: 'Entrena con inteligencia artificial, sigue tus marcas y desbloquea insignias.',
            icon: 'fitness_center',
            color: 'primary',
            path: '/onboarding-1',
            image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1470&auto=format&fit=crop'
        },
        {
            id: 'admin',
            title: 'Gestión Gym',
            subtitle: 'OPERACIONES',
            desc: 'Control de socios, analíticas de retención y personalización de marca.',
            icon: 'dashboard',
            color: 'primary-blue',
            path: '/admin',
            image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1470&auto=format&fit=crop'
        },
        {
            id: 'saas',
            title: 'SaaS Admin',
            subtitle: 'ECOSISTEMA',
            desc: 'Control global de gimnasios, facturación SaaS y configuración global.',
            icon: 'admin_panel_settings',
            color: 'slate-400',
            path: '/superadmin',
            image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=1426&auto=format&fit=crop'
        }
    ];

    const handleSectorSelect = (sector) => {
        setSelectedSector(sector);
        setShowLoginForm(true);
        setError(null);
    };

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) throw authError;

            // Fetch profile to verify role, gym, and onboarding status
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('role, fitness_goals, activity_level')
                .eq('id', authData.user.id)
                .single();

            if (profileError) throw profileError;

            // Security check: Verify if the user's role matches the selected sector
            if (selectedSector.id === 'saas' && profile.role !== 'superadmin') {
                throw new Error('No tienes permisos de SuperAdmin para acceder a este portal.');
            }
            if (selectedSector.id === 'admin' && profile.role !== 'admin' && profile.role !== 'superadmin') {
                throw new Error('No tienes permisos de Administrador para acceder a este portal.');
            }

            // 3. Logic to skip onboarding if already completed
            let targetPath = selectedSector.path;
            if (selectedSector.id === 'user' && profile.activity_level) {
                targetPath = '/user-plan'; // Skip onboarding-1,2,3
            }

            // Success: Redirect to the sector path
            navigate(targetPath);
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setLoading(true);
        setError(null);
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin
                }
            });
            if (error) throw error;
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!email) {
            setError('Por favor, introduce tu email para recuperar la contraseña.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/#/reset-password`,
            });
            if (error) throw error;
            alert('Se ha enviado un enlace de recuperación a tu correo.');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background-dark flex flex-col items-center justify-center p-6 relative overflow-hidden font-display selection:bg-primary selection:text-black">
            {/* Background elements */}
            <div className="absolute top-[-15%] right-[-10%] size-[600px] bg-primary/10 blur-[140px] rounded-full animate-pulse"></div>
            <div className="absolute bottom-[-15%] left-[-10%] size-[600px] bg-primary-blue/10 blur-[140px] rounded-full animate-pulse" style={{ animationDelay: '2s' }}></div>

            <div className="z-10 w-full max-w-6xl">
                {!showLoginForm ? (
                    <>
                        <header className="flex flex-col items-center mb-16 text-center animate-fadeIn">
                            <div className="bg-primary/20 p-5 rounded-3xl mb-6 shadow-[0_0_50px_rgba(13,242,89,0.3)] border border-primary/30">
                                <span className="material-symbols-outlined text-primary text-6xl">fitness_center</span>
                            </div>
                            <h1 className="text-6xl md:text-8xl font-black text-white tracking-tighter uppercase leading-none">
                                Desarrollando <span className="text-primary italic">ando</span>
                            </h1>
                            <p className="text-slate-400 mt-6 text-xl font-medium tracking-widest uppercase opacity-70">
                                Selecciona tu perfil de acceso
                            </p>
                        </header>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {sectors.map((sector, index) => (
                                <div
                                    key={sector.id}
                                    onClick={() => handleSectorSelect(sector)}
                                    className="group relative h-[480px] bg-surface-dark border border-border-dark rounded-[2.5rem] overflow-hidden cursor-pointer transition-all duration-500 hover:border-primary/50 hover:-translate-y-4 hover:shadow-[0_30px_60px_rgba(0,0,0,0.8)] animate-fadeInUp"
                                    style={{ animationDelay: `${index * 0.1}s` }}
                                >
                                    <div
                                        className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 group-hover:scale-110"
                                        style={{ backgroundImage: `url('${sector.image}')` }}
                                    ></div>
                                    <div className="absolute inset-0 bg-gradient-to-t from-background-dark via-background-dark/80 to-transparent"></div>

                                    <div className="absolute top-8 left-8 p-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20">
                                        <span className="material-symbols-outlined text-white text-2xl group-hover:text-primary transition-colors">{sector.icon}</span>
                                    </div>

                                    <div className="absolute inset-0 p-10 flex flex-col justify-end">
                                        <div className="mb-4">
                                            <span className={`text-[10px] font-black tracking-[0.3em] uppercase px-4 py-1.5 rounded-full bg-white/10 text-white border border-white/20 backdrop-blur-sm`}>
                                                {sector.subtitle}
                                            </span>
                                        </div>
                                        <h3 className="text-4xl font-black text-white uppercase italic leading-tight group-hover:text-primary transition-colors duration-300">
                                            {sector.title}
                                        </h3>
                                        <p className="text-slate-300 text-base leading-relaxed mt-4 opacity-80 group-hover:opacity-100 transition-opacity duration-300">
                                            {sector.desc}
                                        </p>

                                        <div className="mt-8 flex items-center gap-3 text-primary font-black text-xs uppercase tracking-widest translate-y-6 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
                                            Entrar al Portal <span className="material-symbols-outlined text-sm font-black">arrow_right_alt</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="max-w-md mx-auto animate-fadeInUp">
                        <button
                            onClick={() => setShowLoginForm(false)}
                            className="flex items-center gap-2 text-slate-400 hover:text-primary mb-8 transition-colors group uppercase text-xs font-black tracking-widest"
                        >
                            <span className="material-symbols-outlined text-sm">arrow_back</span>
                            Volver a selección
                        </button>

                        <div className="bg-surface-dark border border-border-dark p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
                            <div className={`absolute top-0 right-0 p-6 opacity-20`}>
                                <span className="material-symbols-outlined text-8xl text-primary">{selectedSector.icon}</span>
                            </div>

                            <header className="relative z-10 mb-10">
                                <h2 className="text-4xl font-black text-white uppercase italic tracking-tight">
                                    Login <span className="text-primary">{selectedSector.title}</span>
                                </h2>
                                <p className="text-slate-400 mt-2 font-medium">Introduce tus credenciales de acceso</p>
                            </header>

                            {error && (
                                <div className="z-10 mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3 animate-shake">
                                    <span className="material-symbols-outlined text-red-500">error</span>
                                    <p className="text-red-500 text-xs font-bold uppercase tracking-widest">{error}</p>
                                </div>
                            )}

                            <form onSubmit={handleLoginSubmit} className="space-y-6 relative z-10">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Email Corporativo / Usuario</label>
                                    <div className="relative group">
                                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors">alternate_email</span>
                                        <input
                                            type="email"
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="ejemplo@gym.com"
                                            className="w-full bg-background-dark/50 border-2 border-border-dark rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:border-primary focus:ring-0 transition-all outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Contraseña</label>
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

                                <div className="flex items-center justify-between text-xs font-bold px-1">
                                    <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
                                        <input type="checkbox" className="rounded border-border-dark bg-background-dark text-primary focus:ring-0" />
                                        Recordarme
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleForgotPassword}
                                        className="text-primary hover:underline bg-transparent border-none cursor-pointer"
                                    >
                                        ¿Olvidaste tu acceso?
                                    </button>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-primary text-background-dark font-black py-4 rounded-2xl uppercase tracking-widest text-sm hover:shadow-[0_0_30px_rgba(13,242,89,0.4)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'Verificando...' : 'Acceder al Sistema'}
                                    <span className="material-symbols-outlined">{loading ? 'sync' : 'login'}</span>
                                </button>

                                <div className="relative py-4">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-border-dark"></div>
                                    </div>
                                    <div className="relative flex justify-center text-[10px] font-black uppercase tracking-widest">
                                        <span className="bg-surface-dark px-4 text-slate-500">O continuar con</span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleGoogleLogin}
                                    className="w-full bg-white/5 border border-white/10 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-white/10 transition-all uppercase tracking-widest text-xs"
                                >
                                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="size-5" alt="Google" />
                                    Google Account
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                <footer className="mt-20 text-center">
                    <div className="h-px w-32 bg-gradient-to-r from-transparent via-primary/30 to-transparent mx-auto mb-10"></div>
                    <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">
                        &copy; 2025 Desarrollando Ando Ecosystem. Propulsado por IA.
                    </p>
                </footer>
            </div>
        </div>
    );
};

export default Login;