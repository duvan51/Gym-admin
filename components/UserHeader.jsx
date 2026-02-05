import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { notificationService } from '../services/notificationService';

const UserHeader = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [showNotifications, setShowNotifications] = useState(false);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        const fetchUserData = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data } = await supabase
                        .from('profiles')
                        .select('*, gyms(name, avatar_url)')
                        .eq('id', user.id)
                        .single();
                    setProfile(data);

                    // Fetch notifications
                    await refreshNotifications(user.id);

                    // Set up realtime subscription for notifications
                    const channel = supabase
                        .channel('schema-db-changes')
                        .on(
                            'postgres_changes',
                            {
                                event: 'INSERT',
                                schema: 'public',
                                table: 'notifications',
                                filter: `user_id=eq.${user.id}`
                            },
                            () => {
                                refreshNotifications(user.id);
                            }
                        )
                        .subscribe();

                    return () => supabase.removeChannel(channel);
                }
            } catch (err) {
                console.error("Error fetching header data:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchUserData();
    }, []);

    const refreshNotifications = async (userId) => {
        const data = await notificationService.getNotifications(userId);
        setNotifications(data);
        const count = await notificationService.getUnreadCount(userId);
        setUnreadCount(count);
    };

    const handleNotificationClick = async () => {
        const newState = !showNotifications;
        setShowNotifications(newState);

        if (newState && unreadCount > 0) {
            // Mark as read when opening
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await notificationService.markAllAsRead(user.id);
                setUnreadCount(0);
                // Update local state is_read to true for all
                setNotifications(notifications.map(n => ({ ...n, is_read: true })));
            }
        }
    };

    const getNotificationIcon = (type) => {
        switch (type) {
            case 'membership_expiry': return 'warning';
            case 'community_interaction': return 'favorite';
            case 'community_post': return 'groups';
            case 'store_update': return 'shopping_bag';
            default: return 'info';
        }
    };

    const getNotificationColor = (type) => {
        switch (type) {
            case 'membership_expiry': return 'bg-red-500/20 text-red-500';
            case 'community_interaction': return 'bg-pink-500/20 text-pink-500';
            case 'store_update': return 'bg-primary text-background-dark';
            default: return 'bg-primary-blue/20 text-primary-blue';
        }
    };

    const formatTime = (dateStr) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);

        if (diff < 60) return 'Ahora';
        if (diff < 3600) return `Hace ${Math.floor(diff / 60)}m`;
        if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`;
        return date.toLocaleDateString();
    };

    const isActive = (path) => location.pathname === path;

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/login');
    };

    return (
        <header className="flex items-center justify-between border-b border-border-dark px-6 py-3 md:px-10 md:py-5 bg-background-dark/80 backdrop-blur-xl sticky top-0 z-50">
            <div className="flex items-center gap-4 group">
                <Link to="/user-plan" className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-surface-dark border border-primary/30 shadow-[0_0_20px_rgba(13,242,89,0.1)] overflow-hidden flex items-center justify-center shrink-0">
                        {profile?.gyms?.avatar_url ? (
                            <img src={profile.gyms.avatar_url} alt="Gym Logo" className="w-full h-full object-cover" />
                        ) : (
                            <span className="material-symbols-outlined text-primary text-xl font-black">fitness_center</span>
                        )}
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-sm font-black leading-tight tracking-tighter text-white uppercase italic truncate max-w-[150px]">
                            {profile?.gyms?.name || 'Cargando...'}
                        </h2>
                        <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.3em] block -mt-1">Athlete Ecosystem</span>
                    </div>
                </Link>
            </div>


            <div className="flex flex-1 justify-end gap-8 items-center">
                <nav className="hidden lg:flex items-center gap-8">
                    {[
                        { name: 'Mi Plan', path: '/user-plan' },
                        { name: 'Nutrición', path: '/user-nutrition' },
                        { name: 'Mi Progreso', path: '/user-progress' },
                        { name: 'Ejercicios', path: '/library' },
                        { name: 'Comunidad', path: '/community' },
                        { name: 'Tienda', path: '/store' },
                        { name: 'Perfil y Pagos', path: '/user-profile' }
                    ].map((link) => (
                        <Link
                            key={link.path}
                            to={link.path}
                            className={`text-[11px] font-black uppercase tracking-[0.2em] transition-all hover:text-primary ${isActive(link.path) ? 'text-primary' : 'text-slate-400'}`}
                        >
                            {link.name}
                        </Link>
                    ))}
                </nav>

                <div className="flex items-center gap-4 border-l border-white/10 pl-8 relative">
                    {/* Botón de Notificaciones */}
                    <button
                        onClick={handleNotificationClick}
                        className={`relative transition-colors ${showNotifications ? 'text-primary' : 'text-slate-400 hover:text-white'}`}
                    >
                        <span className="material-symbols-outlined">notifications</span>
                        {unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 size-4 bg-red-500 text-[8px] font-black text-white rounded-full border-2 border-background-dark flex items-center justify-center animate-pulse">
                                {unreadCount}
                            </span>
                        )}
                    </button>

                    {/* Menú Desplegable de Notificaciones */}
                    {showNotifications && (
                        <>
                            <div className="fixed inset-0 z-[-1]" onClick={() => setShowNotifications(false)}></div>
                            <div className="absolute top-12 right-0 w-80 bg-surface-dark border border-border-dark rounded-3xl shadow-2xl overflow-hidden animate-fadeInUp origin-top-right">
                                <div className="p-4 bg-background-dark/50 border-b border-border-dark flex justify-between items-center">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Alertas Recientes</span>
                                    <span className="text-[8px] font-black uppercase text-primary px-2 py-0.5 bg-primary/10 rounded-full">{unreadCount} nuevas</span>
                                </div>
                                <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                                    {notifications.length > 0 ? (
                                        notifications.map(n => (
                                            <div
                                                key={n.id}
                                                onClick={() => {
                                                    setShowNotifications(false);
                                                    if (n.type === 'community_post') navigate('/community');
                                                    if (n.type === 'store_update') navigate('/store');
                                                    if (n.type === 'membership_expiry') navigate('/user-profile');
                                                }}
                                                className={`p-4 flex gap-3 hover:bg-white/5 border-b border-white/5 transition-colors cursor-pointer ${!n.is_read ? 'bg-primary/5' : ''}`}
                                            >
                                                <div className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${getNotificationColor(n.type)}`}>
                                                    <span className="material-symbols-outlined text-lg">{getNotificationIcon(n.type)}</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <p className={`text-xs font-black uppercase italic ${!n.is_read ? 'text-white' : 'text-slate-400'}`}>{n.title}</p>
                                                        {n.priority && <span className="size-1.5 rounded-full bg-red-500 animate-ping shrink-0"></span>}
                                                    </div>
                                                    <p className="text-[10px] text-slate-500 mt-1 leading-relaxed line-clamp-2 italic">{n.message}</p>
                                                    <p className="text-[8px] text-slate-600 font-bold mt-2 uppercase tracking-widest">{formatTime(n.created_at)}</p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="p-12 text-center flex flex-col items-center gap-4">
                                            <span className="material-symbols-outlined text-4xl text-slate-800">notifications_off</span>
                                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Sin notificaciones pendientes</p>
                                        </div>
                                    )}
                                </div>
                                <Link to="/user-profile" onClick={() => setShowNotifications(false)} className="block p-3 text-center bg-background-dark/50 text-[10px] font-black uppercase text-slate-400 hover:text-white transition-colors border-t border-border-dark">
                                    Ver todas las alertas
                                </Link>
                            </div>
                        </>
                    )}

                    <div className="flex items-center gap-3">
                        <Link to="/user-profile" className={`size-10 rounded-full p-0.5 border-2 transition-all ${isActive('/user-profile') ? 'border-primary shadow-[0_0_15px_rgba(13,242,89,0.3)]' : 'border-white/10 overflow-hidden'}`}>
                            {profile?.avatar_url ? (
                                <img src={profile.avatar_url} alt="Profile" className="w-full h-full rounded-full object-cover" />
                            ) : (
                                <div className="size-full rounded-full bg-surface-dark flex items-center justify-center">
                                    <span className="material-symbols-outlined text-slate-500 text-xl">person</span>
                                </div>
                            )}
                        </Link>

                        <button
                            onClick={handleLogout}
                            className="p-2 text-slate-500 hover:text-red-500 transition-colors group"
                            title="Cerrar Sesión"
                        >
                            <span className="material-symbols-outlined group-hover:rotate-12 transition-transform">logout</span>
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default UserHeader;