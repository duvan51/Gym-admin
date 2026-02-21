import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

const Login = () => {
    const navigate = useNavigate();
    const [selectedSector, setSelectedSector] = useState(null);
    const [showLoginForm, setShowLoginForm] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(true); // Start with true to check session
    const [error, setError] = useState(null);

    const [diagMsg, setDiagMsg] = useState('Iniciando...');
    const location = useLocation();
    const isHandlingState = React.useRef(false);

    // OAuth Hash Recovery - Specifically for HashRouter double-hash issue
    useEffect(() => {
        const recoverHash = async () => {
            const rawHash = window.location.hash;
            // Check if we have the "double hash" pattern: #/login#access_token=...
            if (rawHash.includes('access_token=') && rawHash.includes('#/login#')) {
                console.log("Rescatando llaves de acceso del fragmento URL...");
                setDiagMsg("Validando llaves de Google...");

                // Extract everything after the double hash #/login#
                const hashPart = rawHash.substring(rawHash.lastIndexOf('#') + 1);
                const params = new URLSearchParams(hashPart);

                const accessToken = params.get('access_token');
                const refreshToken = params.get('refresh_token');

                if (accessToken) {
                    try {
                        const { data, error } = await supabase.auth.setSession({
                            access_token: accessToken,
                            refresh_token: refreshToken
                        });

                        if (!error && data.session) {
                            console.log("Sesión rescatada con éxito.");
                            // Clean URL immediately to avoid re-parsing
                            window.history.replaceState(null, null, window.location.origin + window.location.pathname + '#/login');
                            // The onAuthStateChange will take it from here
                        }
                    } catch (e) {
                        console.error("Error setting sessions manual:", e);
                    }
                }
            }
        };
        recoverHash();
    }, []);

    // Unified Session & Redirection Logic - High Resilience
    useEffect(() => {
        const processSession = async (session) => {
            if (isHandlingState.current) return;
            isHandlingState.current = true;

            try {
                if (!session) {
                    setLoading(false);
                    isHandlingState.current = false;
                    return;
                }

                setLoading(true);
                setDiagMsg(`Sincronizando: ${session.user.email}...`);

                // Fetch profile with direct query
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('role, activity_level')
                    .eq('id', session.user.id)
                    .maybeSingle();

                if (profileError) {
                    console.error("Profile query error:", profileError);
                    setDiagMsg(`Error de perfil: ${profileError.message}`);
                    setLoading(false);
                    isHandlingState.current = false;
                    return;
                }

                if (!profile) {
                    // This is a critical state: User exists in Auth but not in Profiles
                    setDiagMsg('Perfil nuevo detectado. Vinculando...');
                    // We wait a bit for the trigger, or we could force a profile here
                    // For now, retry once
                    await new Promise(r => setTimeout(r, 1500));
                    const { data: retryProfile } = await supabase
                        .from('profiles')
                        .select('role')
                        .eq('id', session.user.id)
                        .maybeSingle();

                    if (!retryProfile) {
                        setDiagMsg('No se encontró el perfil. Reintenta login.');
                        setLoading(false);
                        isHandlingState.current = false;
                        return;
                    }
                    profile = retryProfile;
                }

                let targetPath = null;
                const role = profile.role?.toLowerCase();

                if (role === 'superadmin') targetPath = '/superadmin';
                else if (role === 'admin') targetPath = '/admin';
                else if (role === 'agent') targetPath = '/agent-dashboard';
                else targetPath = profile.activity_level ? '/user-plan' : '/onboarding-1';

                // Navigation Logic
                if (targetPath) {
                    // Check if we already ARE where we need to be
                    if (location.pathname === targetPath) {
                        setLoading(false);
                        setShowLoginForm(false);
                    } else {
                        setDiagMsg(`Entrando a ${targetPath}...`);
                        // Keep loading = true during navigation
                        navigate(targetPath, { replace: true });
                    }
                } else {
                    setDiagMsg('Error: Rol no identificado.');
                    setLoading(false);
                }
            } catch (err) {
                console.error('Session processing failed:', err);
                setDiagMsg('Error de conexión.');
                setLoading(false);
            } finally {
                isHandlingState.current = false;
            }
        };

        // Initial check combined with listener
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) processSession(session);
            else {
                // Check if we are in the middle of an OAuth redirect (even with double hash)
                if (!window.location.hash.includes('access_token')) {
                    setLoading(false);
                }
            }
        };
        init();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            console.log("Auth Event:", event);
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                if (session) processSession(session);
            } else if (event === 'SIGNED_OUT') {
                setLoading(false);
                setShowLoginForm(false);
            }
        });

        return () => subscription.unsubscribe();
    }, [navigate, location.pathname]);

    const sectors = [
        {
            id: 'user',
            title: 'Atleta',
            subtitle: 'ALTO RENDIMIENTO',
            desc: 'Entrena con inteligencia artificial, sigue tus marcas y desbloquea insignias.',
            icon: 'fitness_center',
            color: 'primary',
            path: '/onboarding-1',
            image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=60&w=800&auto=format&fit=crop'
        },
        {
            id: 'admin',
            title: 'Gestión Gym',
            subtitle: 'OPERACIONES',
            desc: 'Control de socios, analíticas de retención y personalización de marca.',
            icon: 'dashboard',
            color: 'primary-blue',
            path: '/admin',
            image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=60&w=800&auto=format&fit=crop'
        },
        {
            id: 'saas',
            title: 'SaaS Admin',
            subtitle: 'ECOSISTEMA',
            desc: 'Control global de gimnasios, facturación SaaS y configuración global.',
            icon: 'admin_panel_settings',
            color: 'slate-400',
            path: '/superadmin',
            image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=60&w=800&auto=format&fit=crop'
        }
    ];

    const handleSectorSelect = (sector) => {
        setSelectedSector(sector);
        localStorage.setItem('preferred_sector', JSON.stringify(sector));
        setShowLoginForm(true);
        setError(null);
    };

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) throw authError;

            // We don't navigate here anymore. 
            // The useEffect with onAuthStateChange will pick up the 'SIGNED_IN' event
            // and perform the profile check and redirection logic consistently.
            // If it takes too long, we show the "Sincronizando" screen.
            setShowLoginForm(false);
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        try {
            setLoading(true);
            setDiagMsg('Conectando con Google...');
            localStorage.setItem('preferred_sector', JSON.stringify(selectedSector));

            // Explicitly redirect to the hash path for HashRouter compatibility
            const redirectUrl = window.location.origin + '/#/login';

            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: redirectUrl,
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent',
                    },
                },
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

    if (loading && !showLoginForm) {
        return (
            <div className="min-h-screen bg-background-light dark:bg-background-dark flex flex-col items-center justify-center font-display transition-colors">
                <div className="relative">
                    <div className="size-24 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary text-3xl animate-pulse">lock</span>
                    </div>
                </div>
                <div className="mt-8 text-center animate-in fade-in zoom-in duration-700">
                    <h2 className="text-slate-900 dark:text-white font-black uppercase italic tracking-widest text-sm mb-2 transition-colors">Sincronizando Acceso</h2>
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.3em] mb-4">Preparando tu ecosistema personal...</p>
                    <div className="flex justify-center gap-1.5">
                        <div className="size-1 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="size-1 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="size-1 bg-primary rounded-full animate-bounce"></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark flex flex-col items-center justify-center p-6 relative overflow-hidden font-display selection:bg-primary selection:text-black transition-colors">
            {/* Background elements */}
            <div className="absolute top-[-15%] right-[-10%] size-[600px] bg-primary/10 blur-[140px] rounded-full animate-pulse"></div>
            <div className="absolute bottom-[-15%] left-[-10%] size-[600px] bg-primary-blue/10 blur-[140px] rounded-full animate-pulse" style={{ animationDelay: '2s' }}></div>

            <div className="z-10 w-full max-w-6xl">
                {!showLoginForm ? (
                    <>
                        <header className="flex flex-col items-center mb-16 text-center animate-fadeIn">
                            <div className="bg-primary/20 p-5 rounded-3xl mb-6 shadow-[0_0_50px_rgba(13,242,89,0.3)] border border-primary/30">
                                <img src="/andoGymLogo.png" alt="andoGym Logo" className="size-16 object-contain" />
                            </div>
                            <h1 className="text-6xl md:text-8xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none transition-colors">
                                ando<span className="text-primary italic">Gym</span>
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
                                    className="group relative h-[480px] bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-[2.5rem] overflow-hidden cursor-pointer transition-all duration-500 hover:border-primary/50 hover:-translate-y-4 hover:shadow-[0_30px_60px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_30px_60px_rgba(0,0,0,0.8)] animate-fadeInUp"
                                    style={{ animationDelay: `${index * 0.1}s` }}
                                >
                                    <div
                                        className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 group-hover:scale-110"
                                        style={{ backgroundImage: `url('${sector.image}')` }}
                                    ></div>
                                    <div className="absolute inset-0 bg-gradient-to-t from-background-light/90 dark:from-background-dark/95 via-background-light/40 dark:via-background-dark/80 to-transparent transition-colors"></div>

                                    <div className="absolute top-8 left-8 p-3 rounded-2xl bg-black/5 dark:bg-white/10 backdrop-blur-md border border-black/10 dark:border-white/20 transition-colors">
                                        <span className="material-symbols-outlined text-slate-900 dark:text-white text-2xl group-hover:text-primary transition-colors">{sector.icon}</span>
                                    </div>

                                    <div className="absolute inset-0 p-10 flex flex-col justify-end">
                                        <div className="mb-4">
                                            <span className={`text-[10px] font-black tracking-[0.3em] uppercase px-4 py-1.5 rounded-full bg-black/5 dark:bg-white/10 text-slate-900 dark:text-white border border-black/10 dark:border-white/20 backdrop-blur-sm transition-colors`}>
                                                {sector.subtitle}
                                            </span>
                                        </div>
                                        <h3 className="text-4xl font-black text-slate-900 dark:text-white uppercase italic leading-tight group-hover:text-primary transition-colors duration-300">
                                            {sector.title}
                                        </h3>
                                        <p className="text-slate-600 dark:text-slate-300 text-base leading-relaxed mt-4 opacity-80 group-hover:opacity-100 transition-opacity duration-300">
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

                        <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden transition-colors">
                            <div className={`absolute top-0 right-0 p-6 opacity-20`}>
                                <span className="material-symbols-outlined text-8xl text-primary">{selectedSector.icon}</span>
                            </div>

                            <header className="relative z-10 mb-10">
                                <h2 className="text-4xl font-black text-slate-900 dark:text-white uppercase italic tracking-tight transition-colors">
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
                                            className="w-full bg-black/5 dark:bg-background-dark/50 border-2 border-border-light dark:border-border-dark rounded-2xl py-4 pl-12 pr-4 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:border-primary focus:ring-0 transition-all outline-none"
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
                                            className="w-full bg-black/5 dark:bg-background-dark/50 border-2 border-border-light dark:border-border-dark rounded-2xl py-4 pl-12 pr-4 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:border-primary focus:ring-0 transition-all outline-none"
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
                                        <span className="bg-surface-light dark:bg-surface-dark px-4 text-slate-500 transition-colors">O continuar con</span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleGoogleLogin}
                                    className="w-full bg-black/5 dark:bg-white/5 border border-border-light dark:border-white/10 text-slate-900 dark:text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-black/10 dark:hover:bg-white/10 transition-all uppercase tracking-widest text-xs"
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
                        &copy; 2026 andoGym. Propulsado por IA.
                    </p>
                </footer>
            </div>
        </div>
    );
};

export default Login;