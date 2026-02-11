import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

const AdminSidebar = ({ darkMode, toggleDarkMode }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [profile, setProfile] = useState(null);
    const [sidebarLoading, setSidebarLoading] = useState(true);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    useEffect(() => {
        const getProfile = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data } = await supabase
                        .from('profiles')
                        .select('*, gyms(name, avatar_url)')
                        .eq('id', user.id)
                        .single();
                    setProfile(data);
                }
            } catch (error) {
                console.error("Error loading sidebar profile:", error);
            } finally {
                setSidebarLoading(false);
            }
        };
        getProfile();
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/login');
    };

    const menuItems = [
        { path: '/admin', label: 'Dashboard', icon: 'dashboard' },
        { path: '/accounting-admin', label: 'Contabilidad', icon: 'account_balance' },
        { path: '/analytics-report', label: 'Usuarios', icon: 'group' },
        { path: '/challenges-admin', label: 'Desafíos', icon: 'emoji_events' },
        { path: '/community-admin', label: 'Comunidad', icon: 'forum' },
        { path: '/store-admin', label: 'Tienda / Marketplace', icon: 'storefront' },
        { path: '/subscription-admin', label: 'Suscripción', icon: 'workspace_premium' },
        { path: '/brand-settings', label: 'Configuración', icon: 'settings_suggest' },
    ];

    return (
        <>
            {/* Mobile Header (Minimalista) */}
            <div className="lg:hidden fixed top-0 left-0 right-0 z-[110] px-6 py-4 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-xl border-b border-primary/10 flex justify-between items-center transition-colors">
                <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-surface-light dark:bg-surface-dark border border-black/10 dark:border-white/10 flex items-center justify-center overflow-hidden transition-colors">
                        {profile?.gyms?.avatar_url ? (
                            <img src={profile.gyms.avatar_url} alt="Gym Logo" className="w-full h-full object-cover" />
                        ) : (
                            <span className="material-symbols-outlined text-primary text-xl">fitness_center</span>
                        )}
                    </div>
                    <span className="text-sm font-black uppercase italic tracking-tighter text-slate-800 dark:text-white transition-colors">{profile?.gyms?.name || 'Admin'}</span>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={toggleDarkMode}
                        className="text-slate-500 hover:text-primary transition-colors"
                        title={darkMode ? "Modo Claro" : "Modo Oscuro"}
                    >
                        <span className="material-symbols-outlined">
                            {darkMode ? 'light_mode' : 'dark_mode'}
                        </span>
                    </button>
                    <button onClick={handleLogout} className="text-slate-500 hover:text-red-500 transition-colors pl-2 border-l border-black/10 dark:border-white/10">
                        <span className="material-symbols-outlined">logout</span>
                    </button>
                </div>
            </div>

            {/* Mobile Bottom Floating Nav (UNIFORME) */}
            <nav className="lg:hidden fixed bottom-6 left-4 right-4 z-[120] animate-in slide-in-from-bottom-5 duration-500">
                <div className="bg-white/80 dark:bg-background-dark/90 backdrop-blur-2xl border border-black/10 dark:border-white/10 rounded-[2rem] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center justify-between transition-colors">
                    {[
                        { path: '/admin', icon: 'dashboard', label: 'Dash' },
                        { path: '/accounting-admin', icon: 'account_balance', label: 'Caja' },
                        { path: '/analytics-report', icon: 'group', label: 'Socios' },
                        { path: '/store-admin', icon: 'storefront', label: 'Tienda' },
                        { type: 'toggle', icon: 'menu', label: 'Más' }
                    ].map((item, idx) => {
                        const isBtnActive = location.pathname === item.path || (item.type === 'toggle' && isMenuOpen);

                        if (item.type === 'toggle') {
                            return (
                                <button
                                    key="toggle"
                                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                                    className={`flex-1 flex flex-col items-center justify-center py-3 rounded-2xl transition-all relative group
                                        ${isMenuOpen ? 'text-primary' : 'text-slate-500'}
                                    `}
                                >
                                    {isMenuOpen && <div className="absolute inset-x-2 inset-y-1 bg-primary/10 rounded-2xl -z-10 animate-pulse"></div>}
                                    <span className="material-symbols-outlined text-[22px] transition-transform group-active:scale-90">{isMenuOpen ? 'close' : 'menu'}</span>
                                    <span className="text-[8px] font-black uppercase tracking-tighter mt-1">Más</span>
                                </button>
                            );
                        }

                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                onClick={() => setIsMenuOpen(false)}
                                className={`flex-1 flex flex-col items-center justify-center py-3 rounded-2xl transition-all relative group
                                    ${location.pathname === item.path ? 'text-primary' : 'text-slate-500'}
                                `}
                            >
                                {location.pathname === item.path && <div className="absolute inset-x-2 inset-y-1 bg-primary/10 rounded-2xl -z-10 animate-pulse"></div>}
                                <span className={`material-symbols-outlined text-[22px] transition-transform group-active:scale-90 ${location.pathname === item.path ? 'font-black' : ''}`}>
                                    {item.icon}
                                </span>
                                <span className="text-[8px] font-black uppercase tracking-tighter mt-1">{item.label}</span>
                            </Link>
                        );
                    })}
                </div>

                {/* Extended Menu Overlay */}
                {isMenuOpen && (
                    <div className="absolute bottom-20 left-0 right-0 animate-fadeInUp">
                        <div className="bg-surface-dark border border-white/10 rounded-[2.5rem] p-4 shadow-2xl overflow-hidden grid grid-cols-2 gap-2">
                            {menuItems.filter(mi => !['/admin', '/accounting-admin', '/analytics-report', '/store-admin'].includes(mi.path)).map(item => (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    onClick={() => setIsMenuOpen(false)}
                                    className={`flex items-center gap-3 p-4 rounded-2xl transition-all ${location.pathname === item.path ? 'bg-primary text-background-dark font-black' : 'bg-white/5 text-slate-400 hover:text-white'}`}
                                >
                                    <span className="material-symbols-outlined text-sm">{item.icon}</span>
                                    <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </nav>

            {/* Sidebar Content (Desktop Only) */}
            <aside className={`
                hidden lg:flex flex-col w-72 h-screen sticky top-0 shrink-0
                border-r border-primary/10 bg-background-light dark:bg-background-dark
                transition-all duration-300
            `}>
                <div className="p-6 flex flex-col h-full">
                    <div className="flex items-center gap-4 mb-10">
                        <div className="size-12 rounded-xl bg-surface-light dark:bg-surface-dark border border-black/10 dark:border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-lg shadow-black/20 transition-colors">
                            {profile?.gyms?.avatar_url ? (
                                <img src={profile.gyms.avatar_url} alt="Gym Logo" className="w-full h-full object-cover" />
                            ) : (
                                <span className="material-symbols-outlined text-primary text-2xl">fitness_center</span>
                            )}
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                            {sidebarLoading ? (
                                <div className="h-4 w-32 bg-black/10 dark:bg-white/10 rounded animate-pulse transition-colors"></div>
                            ) : (
                                <h1 className="text-sm font-black leading-tight uppercase italic truncate text-slate-800 dark:text-white transition-colors">{profile?.gyms?.name || 'SaaS Admin'}</h1>
                            )}
                            <p className="text-[10px] text-primary/60 uppercase tracking-[0.2em] font-black italic">Operaciones</p>
                        </div>
                    </div>
                    <nav className="flex-1 space-y-2">
                        {menuItems.map(item => (
                            <Link
                                to={item.path}
                                key={item.path}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${location.pathname === item.path ? 'bg-primary text-background-dark font-bold shadow-lg shadow-primary/20' : 'text-slate-600 dark:text-slate-400 hover:bg-primary/10 hover:text-primary'}`}
                            >
                                <span className="material-symbols-outlined">{item.icon}</span>
                                <span>{item.label}</span>
                            </Link>
                        ))}
                        {profile?.role === 'superadmin' && (
                            <Link to="/superadmin" className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-primary/20 hover:text-primary-blue mt-8 border border-primary-blue/20 bg-primary-blue/5">
                                <span className="material-symbols-outlined">admin_panel_settings</span>
                                <span className="font-black uppercase tracking-widest text-[10px]">Portal Global SaaS</span>
                            </Link>
                        )}
                    </nav>
                    <div className="pt-6 border-t border-primary/10">
                        <div className="flex items-center gap-3 mb-6 p-2">
                            <div className="size-10 rounded-full bg-cover bg-center border-2 border-primary/30 bg-surface-light dark:bg-surface-dark flex items-center justify-center transition-colors">
                                {sidebarLoading ? (
                                    <div className="size-full rounded-full bg-black/5 dark:bg-white/5 animate-pulse transition-colors"></div>
                                ) : profile?.avatar_url ? (
                                    <img src={profile.avatar_url} alt="Profile" className="w-full h-full rounded-full object-cover" />
                                ) : (
                                    <span className="material-symbols-outlined text-primary">person</span>
                                )}
                            </div>
                            <div className="flex flex-col overflow-hidden flex-1">
                                {sidebarLoading ? (
                                    <>
                                        <div className="h-3 w-24 bg-white/10 rounded animate-pulse mb-1"></div>
                                        <div className="h-2 w-16 bg-white/5 rounded animate-pulse"></div>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-sm font-bold truncate text-slate-800 dark:text-white transition-colors">{profile?.full_name || 'Admin User'}</span>
                                        <span className="text-xs text-primary/60 truncate uppercase font-bold tracking-tighter">
                                            {profile?.gyms?.name || 'SaaS Admin'}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                        <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 bg-black/5 dark:bg-slate-800 hover:bg-red-500/10 hover:text-red-500 py-3 rounded-lg font-bold text-sm transition-all group text-slate-500 dark:text-slate-400">
                            <span className="material-symbols-outlined text-xl transition-transform group-hover:translate-x-1">logout</span>
                            Cerrar Sesión
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
};

export default AdminSidebar;