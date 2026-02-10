import React, { useState, useEffect } from 'react';
import AdminSidebar from '../components/AdminSidebar';
import { supabase } from '../services/supabaseClient';

const AccountingAdmin = () => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalRevenue: 0,
        monthlyRevenue: 0,
        monthlyAccrued: 0,
        dailyRevenue: 0,
        dailyAccrued: 0,
    });

    // Get local date boundaries
    const getLocalDateBoundaries = () => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const today = now.toISOString().split('T')[0];
        return { startOfMonth, today };
    };

    const { startOfMonth, today } = getLocalDateBoundaries();
    const [dateFrom, setDateFrom] = useState(startOfMonth);
    const [dateTo, setDateTo] = useState(today);

    useEffect(() => {
        fetchAccountingData();
    }, [dateFrom, dateTo]);

    const fetchAccountingData = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase
                .from('profiles')
                .select('gym_id')
                .eq('id', user.id)
                .single();

            if (!profile?.gym_id) {
                setLoading(false);
                return;
            }

            const { data: rpcData, error } = await supabase.rpc('get_admin_dashboard_stats', {
                target_gym_id: profile.gym_id,
                date_from: new Date(dateFrom + 'T00:00:00').toISOString(),
                date_to: new Date(dateTo + 'T23:59:59').toISOString()
            });

            if (error) throw error;

            setStats({
                totalRevenue: rpcData.total_revenue,
                monthlyRevenue: rpcData.monthly_revenue,
                monthlyAccrued: rpcData.monthly_accrued,
                dailyRevenue: rpcData.daily_revenue,
                dailyAccrued: rpcData.daily_accrued,
            });

        } catch (err) {
            console.error("Error loading accounting stats:", err);
        } finally {
            setLoading(false);
        }
    };

    const formatCOP = (val) => {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
    };

    return (
        <div className="flex min-h-screen bg-background-light dark:bg-background-dark text-slate-800 dark:text-white font-display transition-colors">
            <AdminSidebar />

            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <header className="px-10 py-8 border-b border-border-light dark:border-border-dark bg-surface-light/30 dark:bg-surface-dark/30 backdrop-blur-md flex justify-between items-center shrink-0 transition-colors">
                    <div>
                        <h1 className="text-4xl font-black uppercase italic tracking-tighter text-primary-blue">Contabilidad <span className="text-slate-800 dark:text-white transition-colors">Avanzada</span></h1>
                        <p className="text-slate-500 text-sm font-bold uppercase tracking-[0.2em] mt-1">Reporte de Ingresos Devengados (30/360)</p>
                    </div>
                </header>

                <div className="flex-1 p-10 overflow-y-auto custom-scrollbar space-y-8 pb-20">
                    {/* Date Filters Row */}
                    <section className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-[2.5rem] p-8 transition-all">
                        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                            <div>
                                <h3 className="text-xl font-black uppercase italic mb-1 text-primary-blue">Filtro de Periodo</h3>
                                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Ajusta las fechas para el cálculo de prorrateo</p>
                            </div>

                            <div className="flex items-center gap-4 bg-black/5 dark:bg-background-dark/50 p-4 rounded-[2rem] border border-black/5 dark:border-white/5 transition-colors">
                                <div className="flex flex-col px-4">
                                    <label className="text-[10px] font-black uppercase text-slate-500 mb-1">Desde</label>
                                    <input
                                        type="date"
                                        value={dateFrom}
                                        onChange={(e) => setDateFrom(e.target.value)}
                                        className="bg-transparent text-lg font-black outline-none text-primary-blue [color-scheme:light] dark:[color-scheme:dark]"
                                    />
                                </div>
                                <div className="h-12 w-px bg-black/10 dark:bg-white/10 mx-2 transition-colors"></div>
                                <div className="flex flex-col px-4">
                                    <label className="text-[10px] font-black uppercase text-slate-500 mb-1">Hasta</label>
                                    <input
                                        type="date"
                                        value={dateTo}
                                        onChange={(e) => setDateTo(e.target.value)}
                                        className="bg-transparent text-lg font-black outline-none text-primary-blue [color-scheme:light] dark:[color-scheme:dark]"
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Accounting Breakdown */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Cash Flow vs Accrued */}
                        <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-[2.5rem] p-8 space-y-6 transition-all">
                            <h3 className="text-xl font-black uppercase italic mb-4 text-slate-800 dark:text-white transition-colors">Ingresos del Periodo</h3>

                            <div className="space-y-4">
                                {[
                                    {
                                        period: "Caja Bruta",
                                        amount: stats.monthlyRevenue,
                                        label: "Dinero Real Recibido",
                                        color: "text-primary",
                                        desc: "Total de pagos ingresados físicamente en las fechas seleccionadas."
                                    },
                                    {
                                        period: "Ingreso Devengado",
                                        amount: stats.monthlyAccrued,
                                        label: "Valor Proporcional (Contable)",
                                        color: "text-primary-blue",
                                        desc: "Lo que realmente correspondió ganar en estos días (Prorrateo 30/360)."
                                    }
                                ].map((row, i) => (
                                    <div key={i} className="p-8 rounded-[2rem] bg-black/5 dark:bg-background-dark/30 border border-black/5 dark:border-white/5 transition-all">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-2">{row.period}</p>
                                                <h4 className="font-black text-3xl italic uppercase leading-none text-slate-800 dark:text-white transition-colors">{formatCOP(row.amount)}</h4>
                                            </div>
                                            <div className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${i === 0 ? 'bg-primary/10 text-primary' : 'bg-primary-blue/10 text-primary-blue'}`}>
                                                {row.label}
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-500 font-medium leading-relaxed">{row.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Daily Snapshot */}
                        <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-[2.5rem] p-8 space-y-6 transition-all">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xl font-black uppercase italic text-slate-800 dark:text-white transition-colors">Instantánea Diaria</h3>
                                <div className="text-[10px] font-black text-slate-500 uppercase bg-black/5 dark:bg-background-dark px-3 py-1 rounded-full transition-colors">Fecha: {dateTo}</div>
                            </div>

                            <div className="grid grid-cols-1 gap-6">
                                <div className="p-8 rounded-[2rem] bg-primary/5 border border-primary/20">
                                    <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-2">Efectivo 24h</p>
                                    <h4 className="text-4xl font-black italic text-slate-800 dark:text-white transition-colors">{formatCOP(stats.dailyRevenue)}</h4>
                                    <p className="text-[10px] text-slate-500 mt-4 font-bold uppercase">Ventas líquidas cerradas en este día</p>
                                </div>

                                <div className="p-8 rounded-[2rem] bg-primary-blue/5 border border-primary-blue/20">
                                    <p className="text-[10px] font-black text-primary-blue uppercase tracking-widest mb-2">Devengado Hoy</p>
                                    <h4 className="text-4xl font-black italic text-slate-800 dark:text-white transition-colors">{formatCOP(stats.dailyAccrued)}</h4>
                                    <p className="text-[10px] text-slate-500 mt-4 font-bold uppercase">Valor proporcional de todos los socios activos hoy</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Historical Helper */}
                    <div className="bg-black/5 dark:bg-background-dark/50 border border-black/5 dark:border-white/5 rounded-[2.5rem] p-8 flex items-center justify-between transition-all">
                        <div className="flex items-center gap-6">
                            <div className="size-14 rounded-2xl bg-black/5 dark:bg-white/5 flex items-center justify-center text-slate-400 transition-colors">
                                <span className="material-symbols-outlined text-3xl text-primary-blue">account_balance_wallet</span>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Recaudación Histórica Total</p>
                                <h4 className="text-2xl font-black italic text-slate-800 dark:text-white transition-colors">{formatCOP(stats.totalRevenue)}</h4>
                            </div>
                        </div>
                        <button className="px-8 py-4 bg-primary-blue text-background-dark font-black uppercase italic text-xs rounded-2xl hover:scale-105 transition-all">Exportar Reporte Contable</button>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AccountingAdmin;
