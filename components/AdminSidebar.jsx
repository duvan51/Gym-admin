import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

const AdminSidebar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [profile, setProfile] = useState(null);
    const [sidebarLoading, setSidebarLoading] = useState(true);

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
        { path: '/brand-settings', label: 'Configuración', icon: 'settings_suggest' },
    ];

    return (
        <aside className="w-72 border-r border-primary/10 bg-background-light dark:bg-background-dark flex flex-col h-screen sticky top-0 shrink-0">
            <div className="p-6 flex flex-col h-full">
                <div className="flex items-center gap-4 mb-10">
                    <div className="size-12 rounded-xl bg-surface-dark border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-lg shadow-black/20">
                        {profile?.gyms?.avatar_url ? (
                            <img src={profile.gyms.avatar_url} alt="Gym Logo" className="w-full h-full object-cover" />
                        ) : (
                            <span className="material-symbols-outlined text-primary text-2xl">fitness_center</span>
                        )}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                        {sidebarLoading ? (
                            <div className="h-4 w-32 bg-white/10 rounded animate-pulse"></div>
                        ) : (
                            <h1 className="text-sm font-black leading-tight uppercase italic truncate">{profile?.gyms?.name || 'SaaS Admin'}</h1>
                        )}
                        <p className="text-[10px] text-primary/60 uppercase tracking-[0.2em] font-black italic">Operaciones</p>
                    </div>
                </div>
                <nav className="flex-1 space-y-2">
                    {menuItems.map(item => (
                        <Link
                            to={item.path}
                            key={item.path}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${location.pathname === item.path ? 'bg-primary text-background-dark font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-primary/10 hover:text-primary'}`}
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
                        <div className="size-10 rounded-full bg-cover bg-center border-2 border-primary/30 bg-surface-dark flex items-center justify-center">
                            {sidebarLoading ? (
                                <div className="size-full rounded-full bg-white/5 animate-pulse"></div>
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
                                    <span className="text-sm font-bold truncate">{profile?.full_name || 'Admin User'}</span>
                                    <span className="text-xs text-primary/60 truncate uppercase font-bold tracking-tighter">
                                        {profile?.gyms?.name || 'SaaS Admin'}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                    <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 bg-slate-200 dark:bg-slate-800 hover:bg-red-500/10 hover:text-red-500 py-3 rounded-lg font-bold text-sm transition-all group">
                        <span className="material-symbols-outlined text-xl transition-transform group-hover:translate-x-1">logout</span>
                        Cerrar Sesión
                    </button>
                </div>
            </div>
        </aside>
    );
};

export default AdminSidebar;