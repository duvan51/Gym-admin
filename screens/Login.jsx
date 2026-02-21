import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

const Login = ({ darkMode, toggleDarkMode }) => {
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
                let { data: profile, error: profileError } = await supabase
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
        },
        {
            id: 'agent',
            title: 'Agente Ventas',
            subtitle: 'COMISIONES',
            desc: 'Seguimiento de referidos, cálculo de comisiones y panel de prospección.',
            icon: 'support_agent',
            color: 'primary-blue',
            path: '/agent-dashboard',
            image: 'https://images.unsplash.com/photo-1556745753-b2904692b3cd?q=60&w=800&auto=format&fit=crop'
        }
    ];

    const athleteSector = sectors.find(s => s.id === 'user');
    const footerSectors = sectors.filter(s => s.id !== 'user');

    const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
    const phrases = [
        "LA DISCIPLINA ES EL PUENTE ENTRE TUS METAS Y TUS LOGROS.",
        "NO TE DETENGAS CUANDO ESTÉS CANSADO, DETENTE CUANDO HAYAS TERMINADO.",
        "TU CUERPO ES TU TEMPLO, PERO TU MENTE ES LA QUE MANDA.",
        "EL ÉXITO EMPIEZA CON LA DECISIÓN DE INTENTARLO.",
        "SUDAR ES LA FORMA EN QUE TU CUERPO TE DICE QUE ESTÁS GRITANDO POR ÉXITO."
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentPhraseIndex((prev) => (prev + 1) % phrases.length);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

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
            {/* Theme Toggle Floating Button */}
            <div className="absolute top-8 right-8 z-[100] animate-fadeIn">
                <button
                    onClick={toggleDarkMode}
                    className="p-3 rounded-2xl bg-white dark:bg-surface-dark border border-black/5 dark:border-white/10 shadow-xl dark:shadow-none text-slate-500 hover:text-primary transition-all active:scale-95 flex items-center justify-center group"
                    title={darkMode ? "Modo Claro" : "Modo Oscuro"}
                >
                    <span className="material-symbols-outlined text-2xl group-hover:rotate-12 transition-transform">
                        {darkMode ? 'light_mode' : 'dark_mode'}
                    </span>
                </button>
            </div>

            {/* Background elements */}
            <div className="absolute top-[-15%] right-[-10%] size-[600px] bg-primary/10 blur-[140px] rounded-full animate-pulse"></div>
            <div className="absolute bottom-[-15%] left-[-10%] size-[600px] bg-primary-blue/10 blur-[140px] rounded-full animate-pulse" style={{ animationDelay: '2s' }}></div>

            <div className="z-10 w-full min-h-screen flex flex-col md:flex-row">
                {/* Left Side: Login Form */}
                <div className="w-full md:w-[45%] p-8 md:p-16 flex flex-col justify-center animate-fadeIn">
                    <div className="mb-12">
                        <div className="bg-primary/20 p-4 rounded-2xl mb-6 inline-block shadow-[0_0_40px_rgba(13,242,89,0.2)] border border-primary/20">
                            <img src="/andoGymLogo.png" alt="andoGym Logo" className="size-12 object-contain" />
                        </div>
                        <h1 className="text-5xl md:text-7xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none transition-colors">
                            ando<span className="text-primary italic">Gym</span>
                        </h1>
                        <p className="text-slate-400 mt-4 text-sm font-bold tracking-widest uppercase opacity-70">
                            Acceso al Ecosistema Atleta
                        </p>
                    </div>

                    <div className="max-w-md w-full">
                        {error && (
                            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3 animate-shake">
                                <span className="material-symbols-outlined text-red-500">error</span>
                                <p className="text-red-500 text-[10px] font-bold uppercase tracking-widest">{error}</p>
                            </div>
                        )}

                        <form onSubmit={handleLoginSubmit} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1 transition-colors">Email / Usuario</label>
                                <div className="relative group">
                                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors">alternate_email</span>
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="atleta@andogym.com"
                                        className="w-full bg-black/5 dark:bg-background-dark/50 border-2 border-border-light dark:border-border-dark rounded-2xl py-4 pl-12 pr-4 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:border-primary focus:ring-0 transition-all outline-none transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1 transition-colors">Contraseña</label>
                                <div className="relative group">
                                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors">lock</span>
                                    <input
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full bg-black/5 dark:bg-background-dark/50 border-2 border-border-light dark:border-border-dark rounded-2xl py-4 pl-12 pr-4 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:border-primary focus:ring-0 transition-all outline-none transition-colors"
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
                                    className="text-primary hover:underline bg-transparent border-none cursor-pointer font-bold"
                                >
                                    ¿Olvidaste tu acceso?
                                </button>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-primary text-background-dark font-black py-4 rounded-2xl uppercase tracking-widest text-sm hover:shadow-[0_0_30px_rgba(13,242,89,0.4)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Verificando...' : 'Iniciar Sesión'}
                                <span className="material-symbols-outlined">{loading ? 'sync' : 'login'}</span>
                            </button>

                            <div className="relative py-4">
                                <div className="absolute inset-0 flex items-center text-slate-200 dark:text-slate-800 transition-colors">
                                    <div className="w-full border-t border-current"></div>
                                </div>
                                <div className="relative flex justify-center text-[10px] font-black uppercase tracking-widest">
                                    <span className="bg-background-light dark:bg-background-dark px-4 text-slate-500 transition-colors">O continuar con</span>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleGoogleLogin}
                                className="w-full bg-white dark:bg-white/5 border border-border-light dark:border-white/10 text-slate-900 dark:text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-slate-50 dark:hover:bg-white/10 transition-all uppercase tracking-widest text-xs shadow-sm dark:shadow-none transition-colors"
                            >
                                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="size-5" alt="Google" />
                                Google Account
                            </button>
                        </form>

                        <div className="mt-16 pt-10 border-t border-border-light dark:border-border-dark transition-colors">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mb-6 opacity-50">Otros Accesos</h4>
                            <div className="flex flex-wrap gap-4">
                                {footerSectors.map((sector) => (
                                    <button
                                        key={sector.id}
                                        onClick={() => handleSectorSelect(sector)}
                                        className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-black/5 dark:bg-white/5 border border-border-light dark:border-border-dark hover:border-primary/50 transition-all group scale-90 origin-left"
                                        title={sector.title}
                                    >
                                        <span className="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors text-lg">{sector.icon}</span>
                                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{sector.title}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <footer className="mt-12 text-center md:text-left">
                        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest transition-colors">
                            &copy; 2026 andoGym. Propulsado por IA.
                        </p>
                    </footer>
                </div>

                {/* Right Side: Visual & Phrases */}
                <div className="hidden md:flex w-[55%] relative overflow-hidden bg-background-dark">
                    <div
                        className="absolute inset-0 bg-cover bg-center animate-fadeIn duration-1000"
                        style={{
                            backgroundImage: `url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=30&w=1200&auto=format&fit=crop')`,
                            filter: 'brightness(0.6) contrast(1.1)'
                        }}
                    ></div>
                    <div className="absolute inset-0 bg-gradient-to-br from-background-dark/20 to-primary/10"></div>

                    <div className="relative z-10 w-full flex flex-col items-center justify-center p-20 text-center">
                        <div className="max-w-2xl">
                            <div className="bg-primary/10 backdrop-blur-md border border-primary/20 p-8 rounded-[3rem] shadow-2xl animate-fadeInUp">
                                <span className="material-symbols-outlined text-primary text-6xl mb-8 block">format_quote</span>
                                <h2 className="text-2xl md:text-4xl lg:text-5xl font-black text-white italic uppercase tracking-tighter leading-tight transition-all duration-700 min-h-[150px] flex items-center justify-center">
                                    "{phrases[currentPhraseIndex]}"
                                </h2>
                                <div className="mt-12 h-1 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary transition-all duration-500 ease-linear"
                                        style={{ width: `${((currentPhraseIndex + 1) / phrases.length) * 100}%` }}
                                    ></div>
                                </div>
                            </div>

                            <div className="mt-12 flex gap-3 justify-center">
                                {phrases.map((_, i) => (
                                    <div
                                        key={i}
                                        className={`size-2 rounded-full transition-all duration-500 ${i === currentPhraseIndex ? 'bg-primary w-8' : 'bg-white/20'}`}
                                    ></div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Login Modal for other sectors */}
                    {showLoginForm && selectedSector && (
                        <div className="absolute inset-0 z-[100] flex items-center justify-center p-12 animate-fadeIn bg-background-dark/80 backdrop-blur-xl">
                            <div className="bg-surface-dark border border-white/10 p-12 rounded-[3rem] w-full max-w-md shadow-[0_50px_100px_rgba(0,0,0,0.5)]">
                                <button
                                    onClick={() => { setShowLoginForm(false); setSelectedSector(null); }}
                                    className="flex items-center gap-2 text-slate-400 hover:text-primary mb-8 transition-colors uppercase text-[10px] font-black tracking-widest bg-transparent border-none cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                                    Cerrar Panel
                                </button>

                                <header className="mb-10">
                                    <span className="bg-primary-blue/20 text-primary-blue px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border border-primary-blue/20 mb-4 inline-block">
                                        {selectedSector.subtitle}
                                    </span>
                                    <h2 className="text-4xl font-black text-white uppercase italic tracking-tight">
                                        Login <span className="text-primary-blue">{selectedSector.title}</span>
                                    </h2>
                                </header>

                                <form onSubmit={handleLoginSubmit} className="space-y-6">
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="email@corporativo.com"
                                        className="w-full bg-white/5 border-2 border-white/5 rounded-2xl py-4 px-6 text-white focus:border-primary-blue outline-none transition-all"
                                    />
                                    <input
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full bg-white/5 border-2 border-white/5 rounded-2xl py-4 px-6 text-white focus:border-primary-blue outline-none transition-all"
                                    />
                                    <button
                                        type="submit"
                                        className="w-full bg-primary-blue text-white font-black py-4 rounded-2xl uppercase tracking-widest text-sm hover:shadow-primary-blue/20 transition-all cursor-pointer"
                                    >
                                        Acceder Ahora
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Login;