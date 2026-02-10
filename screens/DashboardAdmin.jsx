import React, { useState, useEffect } from 'react';
import AdminSidebar from '../components/AdminSidebar';
import { getAdminInsights } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';

const DashboardAdmin = () => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalRevenue: 0,
        monthlyRevenue: 0,
        dailyRevenue: 0,
        activeUsers: 0,
        totalUsers: 0,
        expiredUsers: 0,
        growth: 0,
        retentionRate: 0
    });
    const [insight, setInsight] = useState("Analizando tendencias financieras...");
    const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);

    useEffect(() => {
        const query = new URLSearchParams(window.location.search);
        if (query.get('success') === 'true') {
            setShowPaymentSuccess(true);
            // Clean URL after detection
            window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
            setTimeout(() => setShowPaymentSuccess(false), 5000);
        }
    }, []);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            // 1. Get current user profile to ensure gym_id
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase
                .from('profiles')
                .select('gym_id')
                .eq('id', user.id)
                .single();

            if (!profile?.gym_id) {
                console.error("No gym_id found for admin");
                setLoading(false);
                return;
            }

            // 2. Fetch all stats via specialized RPC in a single request
            // Use current date for "normal" dashboard snapshot
            const { data: rpcData, error } = await supabase.rpc('get_admin_dashboard_stats', {
                target_gym_id: profile.gym_id,
                date_from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
                date_to: new Date().toISOString()
            });

            if (error) throw error;

            const newStats = {
                totalRevenue: rpcData.total_revenue,
                monthlyRevenue: rpcData.monthly_revenue,
                dailyRevenue: rpcData.daily_revenue,
                activeUsers: rpcData.active_users,
                totalUsers: rpcData.total_users,
                expiredUsers: rpcData.total_users - rpcData.active_users,
                growth: 15.2, // Simulated
                retentionRate: rpcData.total_users > 0
                    ? Math.round((rpcData.active_users / rpcData.total_users) * 100)
                    : 0
            };

            setStats(newStats);

            // Finish main loading state immediately
            setLoading(false);

            // 3. Trigger AI Insight progressively (non-blocking)
            fetchAIInsights(newStats);

        } catch (err) {
            console.error("Error loading admin stats:", err);
            setLoading(false);
        }
    };

    const fetchAIInsights = async (currentStats) => {
        setInsight("Generando estrategia personalizada...");
        try {
            const aiInsight = await getAdminInsights({
                active: currentStats.activeUsers,
                revenue: currentStats.monthlyRevenue,
                retention: currentStats.retentionRate
            });
            setInsight(aiInsight);
        } catch (err) {
            console.error("Error getting AI insights:", err);
            setInsight("No se pudo generar el consejo estratégico en este momento.");
        }
    };

    const formatCOP = (val) => {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
    };

    if (loading) {
        return (
            <div className="flex min-h-screen bg-background-light dark:bg-background-dark text-slate-800 dark:text-white font-display transition-colors">
                <AdminSidebar />
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <div className="size-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                        <p className="text-primary font-black uppercase tracking-widest text-sm">Sincronizando Dashboard...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-background-light dark:bg-background-dark text-slate-800 dark:text-white font-display transition-colors">
            <AdminSidebar />

            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <header className="px-10 py-8 border-b border-border-light dark:border-border-dark bg-surface-light/30 dark:bg-surface-dark/30 backdrop-blur-md flex justify-between items-center shrink-0 transition-colors">
                    <div>
                        <h1 className="text-4xl font-black uppercase italic tracking-tighter text-slate-800 dark:text-white transition-colors">Executive <span className="text-primary">Dashboard</span></h1>
                        <p className="text-slate-500 text-sm font-bold uppercase tracking-[0.2em] mt-1">Reporte financiero y operativo real</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="bg-black/5 dark:bg-background-dark/50 px-6 py-2 rounded-2xl border border-black/5 dark:border-white/5 text-right transition-colors">
                            <p className="text-[10px] font-black text-slate-500 uppercase">Estado del Sistema</p>
                            <p className="text-primary text-xs font-black uppercase tracking-widest flex items-center gap-2 justify-end">
                                <span className="size-2 rounded-full bg-primary animate-pulse"></span> Sincronizado
                            </p>
                        </div>
                    </div>
                </header>

                {/* Success Notification Overlay */}
                {showPaymentSuccess && (
                    <div className="mx-10 mt-8 bg-primary/20 border border-primary/30 p-6 rounded-[2rem] flex items-center justify-between animate-fadeInDown">
                        <div className="flex items-center gap-6">
                            <div className="size-12 rounded-2xl bg-primary/20 text-primary flex items-center justify-center border border-primary/20">
                                <span className="material-symbols-outlined text-3xl">verified_user</span>
                            </div>
                            <div>
                                <h4 className="text-lg font-black uppercase italic tracking-tight text-slate-800 dark:text-white transition-colors">¡Pago Procesado con Éxito!</h4>
                                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-0.5">Tu suscripción SaaS ha sido renovada. Los cambios se reflejarán en breve.</p>
                            </div>
                        </div>
                        <button onClick={() => setShowPaymentSuccess(false)} className="text-slate-500 hover:text-white transition-colors">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                )}

                <div className="flex-1 p-10 overflow-y-auto custom-scrollbar space-y-8 pb-20">
                    {/* IA Insights Row */}
                    <section className="bg-primary/5 border border-primary/20 rounded-[2.5rem] p-8 flex items-center gap-6 animate-fadeIn transition-colors">
                        <div className="size-16 rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/30 shrink-0">
                            <span className="material-symbols-outlined text-primary text-4xl">analytics</span>
                        </div>
                        <div>
                            <h4 className="text-primary text-xs font-black uppercase tracking-[0.3em] mb-2">Estrategia sugerida por IA</h4>
                            <p className="text-slate-600 dark:text-slate-300 italic text-lg leading-relaxed transition-colors">"{insight}"</p>
                        </div>
                    </section>

                    {/* Main Stats Bento Grid */}
                    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {/* Revenue Card */}
                        <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark p-8 rounded-[2.5rem] relative overflow-hidden group transition-all">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                                <span className="material-symbols-outlined text-7xl text-slate-800 dark:text-white">payments</span>
                            </div>
                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Recaudación Total</p>
                            <h3 className="text-3xl font-black italic text-slate-800 dark:text-white transition-colors">{formatCOP(stats.totalRevenue)}</h3>
                            <div className="mt-4 flex items-center gap-2 text-primary">
                                <span className="material-symbols-outlined text-sm">trending_up</span>
                                <span className="text-xs font-bold">Sin histórico</span>
                            </div>
                        </div>

                        {/* Active Users Card */}
                        <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark p-8 rounded-[2.5rem] relative overflow-hidden group transition-all">
                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Usuarios Activos</p>
                            <h3 className="text-3xl font-black italic text-slate-800 dark:text-white transition-colors">{stats.activeUsers}</h3>
                            <div className="mt-4 w-full h-1.5 bg-black/5 dark:bg-background-dark rounded-full overflow-hidden transition-colors">
                                <div className="h-full bg-primary" style={{ width: `${stats.retentionRate}%` }}></div>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-2 font-bold uppercase tracking-widest">Ratio: {stats.retentionRate}% Activos</p>
                        </div>

                        {/* Expired Users Card */}
                        <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark p-8 rounded-[2.5rem] relative overflow-hidden group transition-all">
                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Atletas sin Plan</p>
                            <h3 className="text-3xl font-black italic text-red-500">{stats.expiredUsers}</h3>
                            <button className="mt-4 flex items-center gap-2 text-slate-500 dark:text-white/50 hover:text-slate-800 dark:hover:text-white transition-colors">
                                <span className="material-symbols-outlined text-sm">mail</span>
                                <span className="text-xs font-bold underline">Recordar pagos</span>
                            </button>
                        </div>

                        {/* Retention Card */}
                        <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark p-8 rounded-[2.5rem] relative overflow-hidden group transition-all">
                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Total Registrados</p>
                            <h3 className="text-3xl font-black italic text-primary-blue">{stats.totalUsers}</h3>
                            <div className="flex gap-1 mt-4">
                                {[1, 2, 3, 4, 5].map(i => (
                                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= 3 ? 'bg-primary-blue' : 'bg-black/5 dark:bg-white/10'}`}></div>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* Financial Breakdown Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Recent Payments Table */}
                        <div className="lg:col-span-2 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-[2.5rem] p-8 transition-all">
                            <div className="flex justify-between items-center mb-8">
                                <h3 className="text-xl font-black uppercase italic text-slate-800 dark:text-white transition-colors">Flujo de Caja Real</h3>
                                <div className="flex gap-2">
                                    <button className="px-4 py-2 bg-black/5 dark:bg-background-dark border border-black/5 dark:border-white/5 rounded-xl text-[10px] font-black uppercase hover:bg-black/10 dark:hover:bg-white/5 transition-all text-slate-600 dark:text-slate-400">Exportar PDF</button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {[
                                    { period: "Hoy", amount: stats.dailyRevenue, label: "Recaudación 24h" },
                                    { period: "Este Mes", amount: stats.monthlyRevenue, label: "Recaudo Bruto (Caja)", color: "text-primary" },
                                    { period: "Histórico", amount: stats.totalRevenue, label: "Total Producido" }
                                ].map((row, i) => (
                                    <div key={i} className="flex items-center justify-between p-6 rounded-[2rem] bg-black/5 dark:bg-background-dark/30 border border-black/5 dark:border-white/5 group hover:border-primary/20 transition-all">
                                        <div className="flex items-center gap-6">
                                            <div className="size-12 rounded-2xl bg-black/5 dark:bg-white/5 flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors">
                                                <span className="material-symbols-outlined">calendar_today</span>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Periodo</p>
                                                <p className="font-black text-lg italic uppercase text-slate-800 dark:text-white transition-colors">{row.period}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{row.label}</p>
                                            <p className={`text-2xl font-black ${row.color || 'text-slate-800 dark:text-white'} transition-colors`}>{formatCOP(row.amount)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* User Distribution Chart Placeholder */}
                        <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-[2.5rem] p-8 flex flex-col justify-between transition-all">
                            <h3 className="text-xl font-black uppercase italic mb-8 text-slate-800 dark:text-white transition-colors">Estado de Atletas</h3>

                            <div className="flex-1 flex flex-col justify-center items-center gap-8">
                                <div className="size-48 rounded-full border-[12px] border-primary flex items-center justify-center relative shadow-lg dark:shadow-[0_0_50px_rgba(13,242,89,0.1)] transition-all">
                                    <div className="absolute inset-[-12px] rounded-full border-[12px] border-red-500 border-t-transparent border-r-transparent -rotate-45" style={{ transform: `rotate(${(stats.retentionRate * 3.6) - 90}deg)` }}></div>
                                    <div className="text-center">
                                        <p className="text-4xl font-black italic text-slate-800 dark:text-white transition-colors">{stats.activeUsers}</p>
                                        <p className="text-[10px] font-black text-slate-500 uppercase">Activos</p>
                                    </div>
                                </div>

                                <div className="w-full space-y-4">
                                    <div className="flex justify-between items-center text-sm font-bold text-slate-800 dark:text-white transition-colors">
                                        <div className="flex items-center gap-2">
                                            <span className="size-3 rounded-full bg-primary"></span>
                                            <span>Membresías activas</span>
                                        </div>
                                        <span>{stats.retentionRate}%</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm font-bold text-slate-800 dark:text-white transition-colors">
                                        <div className="flex items-center gap-2">
                                            <span className="size-3 rounded-full bg-red-500"></span>
                                            <span>Sin plan/vencidos</span>
                                        </div>
                                        <span>{100 - stats.retentionRate}%</span>
                                    </div>
                                </div>
                            </div>

                            <button className="w-full mt-8 py-4 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-black/10 dark:hover:bg-white/10 transition-all text-slate-600 dark:text-slate-400">Ver todos los socios</button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default DashboardAdmin;