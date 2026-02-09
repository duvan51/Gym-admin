import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { useNavigate } from 'react-router-dom';

const AgentDashboard = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [agent, setAgent] = useState(null);
    const [gyms, setGyms] = useState([]);
    const [metrics, setMetrics] = useState({
        totalGyms: 0,
        totalMrr: 0,
        estimatedCommission: 0
    });

    useEffect(() => {
        fetchAgentData();
    }, []);

    const fetchAgentData = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                navigate('/login');
                return;
            }

            // 1. Get Agent Profile from saas_agents using user_id
            const { data: agentData, error: agentError } = await supabase
                .from('saas_agents')
                .select('*')
                .eq('user_id', session.user.id)
                .single();

            if (agentError) throw agentError;
            setAgent(agentData);

            // 2. Get Gyms assigned to this agent
            // We join with saas_plans to get price
            const { data: gymsData, error: gymsError } = await supabase
                .from('gyms')
                .select(`
                    id, name, status, start_date, plan_id,
                    saas_plans ( name, price_cop )
                `)
                .eq('agent_id', agentData.id)
                .order('created_at', { ascending: false });

            if (gymsError) throw gymsError;

            // 3. Process Metrics
            let mrr = 0;
            const processedGyms = gymsData.map(gym => {
                const price = Number(gym.saas_plans?.price_cop || 0);
                if (gym.status === 'active') {
                    mrr += price;
                }
                return {
                    ...gym,
                    price,
                    commission: price * (agentData.commission_rate / 100)
                };
            });

            setGyms(processedGyms);
            setMetrics({
                totalGyms: processedGyms.filter(g => g.status === 'active').length,
                totalMrr: mrr,
                estimatedCommission: mrr * (agentData.commission_rate / 100)
            });

        } catch (error) {
            console.error('Error fetching agent data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/login');
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0
        }).format(amount);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background-dark flex items-center justify-center">
                <div className="size-12 border-4 border-primary-blue/20 border-t-primary-blue rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background-dark text-white font-display selection:bg-primary-blue selection:text-white pb-20">
            {/* Header */}
            <header className="bg-surface-dark border-b border-white/5 sticky top-0 z-50 backdrop-blur-xl bg-opacity-80">
                <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="size-10 bg-gradient-to-br from-primary-blue to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-blue/20">
                            <span className="material-symbols-outlined text-white">confirmation_number</span>
                        </div>
                        <div>
                            <h1 className="text-xl font-black uppercase italic tracking-tighter">Panel <span className="text-primary-blue">Agente</span></h1>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Bienvenido, {agent?.name}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="p-2 hover:bg-white/5 rounded-xl transition-colors text-slate-400 hover:text-white"
                    >
                        <span className="material-symbols-outlined">logout</span>
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-10 space-y-12">
                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeInUp">
                    {/* Card 1: Ventas Activas */}
                    <div className="bg-surface-dark border border-white/5 p-8 rounded-[2.5rem] relative overflow-hidden group hover:border-primary-blue/30 transition-all">
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-500">
                            <span className="material-symbols-outlined text-8xl text-primary-blue">storefront</span>
                        </div>
                        <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Gimnasios Activos</p>
                        <h3 className="text-5xl font-black italic text-white mb-2">{metrics.totalGyms}</h3>
                        <p className="text-xs text-slate-400 font-medium">Clientes referidos activos</p>
                    </div>

                    {/* Card 2: MRR Generado */}
                    <div className="bg-surface-dark border border-white/5 p-8 rounded-[2.5rem] relative overflow-hidden group hover:border-primary-blue/30 transition-all">
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-500">
                            <span className="material-symbols-outlined text-8xl text-green-500">payments</span>
                        </div>
                        <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">MRR Generado</p>
                        <h3 className="text-4xl font-black italic text-white mb-2">{formatCurrency(metrics.totalMrr)}</h3>
                        <p className="text-xs text-slate-400 font-medium">Facturación mensual total</p>
                    </div>

                    {/* Card 3: Comisión Estimada */}
                    <div className="bg-gradient-to-br from-primary-blue/20 to-surface-dark border border-primary-blue/20 p-8 rounded-[2.5rem] relative overflow-hidden group hover:shadow-[0_0_50px_rgba(25,127,230,0.15)] transition-all">
                        <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-30 transition-opacity transform group-hover:scale-110 duration-500">
                            <span className="material-symbols-outlined text-8xl text-primary-blue">account_balance_wallet</span>
                        </div>
                        <p className="text-primary-blue text-[10px] font-black uppercase tracking-widest mb-2">Tu Comisión Mensual ({agent?.commission_rate}%)</p>
                        <h3 className="text-5xl font-black italic text-white mb-2">{formatCurrency(metrics.estimatedCommission)}</h3>
                        <p className="text-xs text-blue-200/50 font-medium">Pago estimado recurrente</p>
                    </div>
                </div>

                {/* Gyms Table */}
                <div className="space-y-6 animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
                    <h2 className="text-2xl font-black uppercase italic tracking-tight flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary-blue">list_alt</span>
                        Tu Cartera de <span className="text-primary-blue">Clientes</span>
                    </h2>

                    <div className="bg-surface-dark border border-white/5 rounded-[2.5rem] overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-background-dark/50 border-b border-white/5">
                                <tr>
                                    <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Gimnasio</th>
                                    <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Plan Contratado</th>
                                    <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Fecha Inicio</th>
                                    <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Estado</th>
                                    <th className="px-8 py-6 text-[10px] font-black uppercase text-primary-blue tracking-widest text-right">Tu Comisión</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {gyms.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="px-8 py-20 text-center text-slate-500 font-bold uppercase tracking-widest">
                                            Aún no tienes gimnasios referidos
                                        </td>
                                    </tr>
                                ) : gyms.map(gym => (
                                    <tr key={gym.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-8 py-6">
                                            <p className="font-black uppercase italic text-sm">{gym.name}</p>
                                        </td>
                                        <td className="px-8 py-6">
                                            <span className="bg-white/5 border border-white/10 px-3 py-1 rounded-lg text-[10px] font-black uppercase text-slate-300">
                                                {gym.saas_plans?.name}
                                            </span>
                                            <p className="mt-1 text-[10px] text-slate-500 font-bold">{formatCurrency(gym.price)}/mes</p>
                                        </td>
                                        <td className="px-8 py-6 text-sm font-bold text-slate-400">
                                            {new Date(gym.start_date).toLocaleDateString()}
                                        </td>
                                        <td className="px-8 py-6">
                                            <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border ${gym.status === 'active'
                                                    ? 'bg-green-500/10 text-green-500 border-green-500/20'
                                                    : 'bg-red-500/10 text-red-500 border-red-500/20'
                                                }`}>
                                                {gym.status === 'active' ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <p className="text-primary-blue font-black italic text-lg">{formatCurrency(gym.commission)}</p>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AgentDashboard;
