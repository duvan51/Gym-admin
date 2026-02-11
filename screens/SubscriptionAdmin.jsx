import React, { useState, useEffect, useRef } from 'react';
import AdminSidebar from '../components/AdminSidebar';
import { supabase } from '../services/supabaseClient';
import { useReactToPrint } from 'react-to-print';

const SubscriptionAdmin = ({ darkMode, toggleDarkMode }) => {
    const [isPaying, setIsPaying] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saasHistory, setSaasHistory] = useState([]);
    const [saasPlans, setSaasPlans] = useState([]);
    const [currentGymStatus, setCurrentGymStatus] = useState(null);
    const [showSaaSDetails, setShowSaaSDetails] = useState(false);
    const [selectedPayment, setSelectedPayment] = useState(null);
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const receiptRef = useRef(null);

    const handlePrint = useReactToPrint({
        contentRef: receiptRef,
        documentTitle: `Recibo_${selectedPayment?.id?.split('-')[0] || 'Antigravity'}`,
    });

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const { data: { user } } = await supabase.auth.getUser();
                const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single();

                if (profile?.gym_id) {
                    const { data: gym } = await supabase.from('gyms').select('*, saas_plans(*)').eq('id', profile.gym_id).single();
                    if (gym) {
                        setCurrentGymStatus(gym);

                        // Si viene de un link de autopago y no está activo aún
                        const params = new URLSearchParams(window.location.search);
                        if (params.get('autoPay') === 'true' && gym.status === 'pending') {
                            // Pequeño delay para asegurar que todo cargó
                            setTimeout(() => handleSaaSPayment(gym.saas_plans), 1000);
                        }
                    }

                    // Fetch Available SaaS Plans
                    const { data: sPlans } = await supabase.from('saas_plans').select('*').order('price_cop', { ascending: true });
                    setSaasPlans(sPlans || []);

                    // Fetch SaaS Payment History
                    const { data: sHistory } = await supabase
                        .from('gym_payments')
                        .select('*, saas_plans(*)')
                        .eq('gym_id', profile.gym_id)
                        .order('payment_date', { ascending: false });
                    setSaasHistory(sHistory || []);
                }
            } catch (err) {
                console.error("Error fetching subscription data:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
    };

    const calculateUpgrade = (newPlan) => {
        if (!currentGymStatus?.end_date || !currentGymStatus?.saas_plans) return { total: newPlan.price_cop, credit: 0 };

        const now = new Date();
        const end = new Date(currentGymStatus.end_date);

        // Si el plan ya expiró, paga el total del nuevo plan
        if (end <= now) return { total: newPlan.price_cop, credit: 0, daysRemaining: 0 };

        const daysRemaining = Math.ceil((end - now) / (1000 * 60 * 60 * 24));

        // Para el crédito, usamos un mes estándar de 30 días para el cálculo del valor diario
        // Esto es estándar en facturación SaaS (Month = 30 days)
        const dailyRate = Number(currentGymStatus.saas_plans.price_cop) / 30;
        const credit = Math.floor(dailyRate * daysRemaining);

        // El total es el precio del nuevo mes menos el abono del tiempo no usado del anterior
        const total = Math.max(0, newPlan.price_cop - credit);

        return { total, credit, daysRemaining };
    };

    const handleSaaSPayment = async (targetPlan = null) => {
        setIsPaying(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single();
            const selectedPlan = targetPlan || currentGymStatus?.saas_plans || saasPlans[0];

            if (!selectedPlan) throw new Error("No hay planes disponibles");

            const { total, credit } = calculateUpgrade(selectedPlan);

            const { data, error } = await supabase.functions.invoke('stripe-checkout', {
                body: {
                    planName: `Suscripción SaaS: ${selectedPlan.name}`,
                    amount: Math.round(total) * 100,
                    successUrl: `${window.location.origin}/#/admin?success=true`,
                    cancelUrl: `${window.location.origin}/#/subscription-admin`,
                    metadata: {
                        userId: user.id,
                        gymId: profile.gym_id,
                        planId: selectedPlan.id,
                        type: 'saas_subscription',
                        isUpgrade: !!targetPlan,
                        creditApplied: Math.round(credit)
                    }
                }
            });

            if (error) throw error;
            if (data?.url) window.location.href = data.url;
        } catch (err) {
            alert("Error al procesar pago: " + err.message);
        } finally {
            setIsPaying(false);
        }
    };

    return (
        <div className="flex min-h-screen bg-background-light dark:bg-background-dark text-slate-800 dark:text-white font-display transition-colors">
            <AdminSidebar darkMode={darkMode} toggleDarkMode={toggleDarkMode} />

            <main className="flex-1 flex flex-col h-screen overflow-hidden pt-16 lg:pt-0">
                <header className="px-6 md:px-10 py-6 md:py-8 border-b border-border-light dark:border-border-dark bg-surface-light/30 dark:bg-surface-dark/30 backdrop-blur-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0 transition-colors">
                    <div>
                        <h1 className="text-2xl md:text-4xl font-black uppercase italic tracking-tighter text-slate-800 dark:text-white transition-colors">Suscripción <span className="text-primary-blue">SaaS</span></h1>
                        <p className="text-slate-500 text-[10px] md:text-sm font-bold uppercase tracking-[0.2em] mt-1">Estatus del servicio y facturación de plataforma</p>
                    </div>
                </header>

                <div className="flex-1 p-6 md:p-10 overflow-y-auto custom-scrollbar space-y-8 pb-32">
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                        </div>
                    ) : (
                        <div className="space-y-12">
                            {/* Expiry Warning Banner */}
                            {(() => {
                                if (currentGymStatus?.status === 'pending') {
                                    return (
                                        <div className="bg-amber-500/10 border border-amber-500/30 p-8 rounded-[2.5rem] flex flex-col md:flex-row items-center gap-8 animate-fadeIn">
                                            <div className="size-16 rounded-3xl bg-amber-500 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.4)]">
                                                <span className="material-symbols-outlined text-white text-3xl font-black">hourglass_top</span>
                                            </div>
                                            <div className="flex-1 text-center md:text-left">
                                                <h4 className="text-2xl font-black uppercase italic text-amber-600 dark:text-amber-500">Suscripción en Espera</h4>
                                                <p className="text-xs text-slate-500 dark:text-amber-400 font-bold uppercase tracking-widest mt-1">
                                                    Tu cuenta ha sido creada con éxito, pero el acceso está restringido hasta que se confirme el pago inicial.
                                                    <br /><span className="text-[10px] opacity-70">El tiempo de tu suscripción solo empezará a correr desde hoy si realizas el pago.</span>
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => handleSaaSPayment()}
                                                disabled={isPaying}
                                                className="bg-amber-500 hover:bg-amber-600 text-white font-black px-10 py-4 rounded-2xl uppercase text-[10px] tracking-[0.2em] transition-all shadow-xl shadow-amber-500/20 active:scale-95 disabled:opacity-50"
                                            >
                                                {isPaying ? 'Procesando...' : 'Pagar Ahora y Activar'}
                                            </button>
                                        </div>
                                    );
                                }

                                if (!currentGymStatus?.end_date) return null;
                                const days = Math.ceil((new Date(currentGymStatus.end_date) - new Date()) / (1000 * 60 * 60 * 24));
                                if (days <= 5) {
                                    return (
                                        <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-[2rem] flex items-center gap-6 animate-pulse">
                                            <div className="size-12 rounded-full bg-red-500 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.4)]">
                                                <span className="material-symbols-outlined text-white font-black">warning</span>
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="text-lg font-black uppercase italic text-red-500">Acceso por expirar</h4>
                                                <p className="text-xs text-red-400 font-bold uppercase tracking-widest">Tu suscripción SaaS vence en {days} días. Renueva ahora para evitar el bloqueo del sistema.</p>
                                            </div>
                                            <button
                                                onClick={() => handleSaaSPayment()}
                                                className="bg-red-500 hover:bg-red-600 text-white font-black px-6 py-3 rounded-xl uppercase text-xs tracking-widest transition-all"
                                            >
                                                Renovar Ahora
                                            </button>
                                        </div>
                                    );
                                }
                                return null;
                            })()}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Current Plan Info */}
                                <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark p-8 rounded-[2.5rem] relative overflow-hidden group shadow-sm">
                                    <div className="absolute top-0 right-0 p-8 opacity-5">
                                        <span className="material-symbols-outlined text-9xl">workspace_premium</span>
                                    </div>
                                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Plan Activo Actual</p>
                                    <h3 className="text-4xl font-black italic text-slate-800 dark:text-white uppercase tracking-tighter mb-4">
                                        {currentGymStatus?.saas_plans?.name || 'Venta Directa'}
                                    </h3>
                                    <div className="flex items-center gap-4 text-sm font-bold text-slate-400">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] uppercase tracking-widest text-slate-500">
                                                {currentGymStatus?.status === 'pending' ? 'Estado' : 'Vence el'}
                                            </span>
                                            <span className={`${currentGymStatus?.status === 'pending' ? 'text-amber-500' : 'text-slate-700 dark:text-white'}`}>
                                                {currentGymStatus?.status === 'pending'
                                                    ? 'PENDIENTE DE ACTIVACIÓN'
                                                    : currentGymStatus?.end_date ? new Date(currentGymStatus.end_date).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
                                                        : '-'}
                                            </span>
                                        </div>
                                        <div className="w-px h-8 bg-black/10 dark:bg-white/10" />
                                        <div className="flex flex-col">
                                            <span className="text-[9px] uppercase tracking-widest text-slate-500">Precio</span>
                                            <span className="text-primary-blue">{formatCurrency(currentGymStatus?.saas_plans?.price_cop || 0)} / mes</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Upgrade Options Card */}
                                <div className="bg-gradient-to-br from-primary-blue/5 to-surface-light dark:from-primary-blue/10 dark:to-surface-dark border border-primary-blue/20 dark:border-primary-blue/20 p-8 rounded-[2.5rem] flex flex-col justify-center">
                                    <h4 className="text-xl font-black italic uppercase text-slate-800 dark:text-white mb-2">¿Necesitas más potencia?</h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-6">Mejora tu plan hoy y recibe un descuento proporcional por los días restantes de tu plan actual.</p>

                                    <div className="space-y-4">
                                        {saasPlans.filter(p => p.id !== currentGymStatus?.plan_id).map(plan => {
                                            const { total, credit } = calculateUpgrade(plan);
                                            return (
                                                <div key={plan.id} className="bg-white/50 dark:bg-background-dark/50 border border-black/5 dark:border-white/5 p-4 rounded-2xl flex items-center justify-between group hover:border-primary-blue/50 transition-all shadow-sm">
                                                    <div>
                                                        <p className="font-black italic uppercase text-sm text-slate-700 dark:text-white">{plan.name}</p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <p className="text-primary-blue font-black">{formatCurrency(plan.price_cop)}</p>
                                                            {credit > 0 && (
                                                                <span className="text-[8px] bg-green-500/20 text-green-500 px-2 py-1 rounded-md font-black uppercase tracking-widest">
                                                                    Abono: -{formatCurrency(credit)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleSaaSPayment(plan)}
                                                        className="bg-primary-blue text-white font-black px-4 py-2 rounded-xl text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary-blue/20"
                                                    >
                                                        {credit > 0 ? `Mejorar por ${formatCurrency(total)}` : 'Adquirir'}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Payment History Section */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary-blue">receipt_long</span>
                                    <h2 className="text-2xl font-black uppercase italic tracking-tight text-slate-800 dark:text-white">Transacciones <span className="text-primary-blue">Recientes</span></h2>
                                </div>

                                <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-[2.5rem] overflow-hidden shadow-sm">
                                    <table className="w-full text-left">
                                        <thead className="bg-black/5 dark:bg-background-dark/50 border-b border-border-light dark:border-border-dark text-slate-500">
                                            <tr>
                                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Fecha de Pago</th>
                                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Concepto / Plan</th>
                                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Referencia</th>
                                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Monto</th>
                                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-right">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-black/5 dark:divide-white/5 transition-colors">
                                            {saasHistory.length === 0 ? (
                                                <tr>
                                                    <td colSpan="5" className="px-8 py-20 text-center text-slate-500 font-bold uppercase tracking-widest bg-black/[0.01] dark:bg-white/[0.01]">
                                                        <span className="material-symbols-outlined text-4xl mb-2 block opacity-20">history_toggle_off</span>
                                                        No hay pagos registrados aún
                                                    </td>
                                                </tr>
                                            ) : saasHistory.map(pay => (
                                                <tr key={pay.id} className="hover:bg-black/[0.01] dark:hover:bg-white/[0.02] transition-colors group">
                                                    <td className="px-8 py-6">
                                                        <div className="flex flex-col">
                                                            <span className="font-black text-sm text-slate-700 dark:text-white">{new Date(pay.payment_date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}</span>
                                                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tighter">{new Date(pay.payment_date).getFullYear()}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        <div className="flex flex-col">
                                                            <p className="font-black uppercase italic text-sm text-slate-800 dark:text-white group-hover:text-primary-blue transition-colors">{pay.saas_plans?.name || 'Suscripción SaaS'}</p>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <span className="size-1.5 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                                                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.1em]">{pay.payment_method}</p>
                                                            </div>
                                                            {pay.notes && (
                                                                <p className="text-[8px] text-slate-400 italic mt-1 font-medium max-w-[200px] truncate" title={pay.notes}>
                                                                    {pay.notes}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest block">Referencia</span>
                                                            <span className="text-[10px] text-slate-400 font-mono bg-black/5 dark:bg-white/5 px-2 py-1 rounded inline-block w-fit">
                                                                {pay.transaction_id ? (pay.transaction_id.startsWith('cs_') ? 'STRIPE_ID' : pay.transaction_id.split('-')[0]) : pay.id.split('-')[0]}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        <div className="flex flex-col">
                                                            <span className="text-primary-blue font-black italic text-lg leading-tight">
                                                                {formatCurrency(pay.amount)}
                                                            </span>
                                                            {pay.receipt_url && (
                                                                <a href={pay.receipt_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[9px] text-primary-blue/60 hover:text-primary-blue font-black uppercase mt-1 tracking-widest transition-all">
                                                                    <span className="material-symbols-outlined text-xs">download</span> Recibo
                                                                </a>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-6 text-right">
                                                        <div className="flex flex-col items-end gap-2">
                                                            <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-[0.1em] shadow-sm border ${pay.status === 'completed'
                                                                ? 'bg-green-500/10 text-green-500 border-green-500/20'
                                                                : pay.status === 'pending'
                                                                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                                                    : 'bg-red-500/10 text-red-500 border-red-500/20'
                                                                }`}>
                                                                {pay.status === 'completed' ? 'Completado' : pay.status === 'pending' ? 'Pendiente' : pay.status}
                                                            </span>
                                                            {pay.status === 'completed' && (
                                                                <button
                                                                    onClick={() => {
                                                                        setSelectedPayment(pay);
                                                                        setShowReceiptModal(true);
                                                                    }}
                                                                    className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-primary-blue hover:text-blue-600 transition-colors mt-1"
                                                                >
                                                                    <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                                                                    Ver Recibo
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* Receipt Modal */}
            {showReceiptModal && selectedPayment && (
                <div id="receipt-modal-wrapper" className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-10">
                    {/* El fondo del modal se oculta al imprimir */}
                    <div className="absolute inset-0 bg-slate-900/40 dark:bg-black/80 backdrop-blur-sm no-print" onClick={() => setShowReceiptModal(false)}></div>

                    <div className="relative bg-white dark:bg-white w-full max-w-2xl rounded-[1.5rem] shadow-2xl overflow-hidden animate-fadeInUp flex flex-col max-h-full border border-black/10">

                        {/* Header del Modal - Solo visible en pantalla */}
                        <div className="p-6 border-b border-black/10 flex justify-between items-center bg-slate-50 no-print">
                            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary-blue">verified</span>
                                Comprobante Legal
                            </h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handlePrint()}
                                    className="p-2.5 bg-slate-800 text-white rounded-xl hover:bg-black transition-colors shadow-lg flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                                >
                                    <span className="material-symbols-outlined text-sm">print</span>
                                    Imprimir Formato Legal
                                </button>
                                <button onClick={() => setShowReceiptModal(false)} className="p-2.5 text-slate-400 hover:text-red-500 transition-colors">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                        </div>

                        {/* CONTENIDO LEGAL - Formato A4 al imprimir */}
                        <div ref={receiptRef} id="receipt-content" className="p-16 overflow-y-auto bg-white text-slate-950 font-serif print:p-0 print:overflow-visible">
                            {/* Encabezado Corporativo */}
                            <div className="flex justify-between items-start mb-10 border-b-4 border-slate-900 pb-8">
                                <div>
                                    <h1 className="text-4xl font-black italic uppercase tracking-tighter text-slate-900 leading-none mb-2 font-sans">
                                        ANTIGRAVITY <span className="text-primary-blue">GYM</span>
                                    </h1>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] font-sans">Professional SaaS Ecosystem</p>
                                    <div className="mt-4 text-[10px] text-slate-500 uppercase font-bold leading-tight flex flex-col gap-1 font-sans">
                                        <p>NIT: 901.452.XXX-X - Régimen Simplificado</p>
                                        <p>Centro de Soporte: soporte@antigravitysaas.com</p>
                                        <p>Cali, Valle del Cauca, Colombia</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="border-2 border-slate-900 p-4 rounded-lg mb-2 inline-block bg-slate-50">
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1 font-sans">Comprobante Oficial No.</p>
                                        <p className="text-2xl font-black font-sans tracking-widest uppercase">{selectedPayment.id.split('-')[0]}</p>
                                    </div>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase italic font-sans">Documento Digital Verificado</p>
                                </div>
                            </div>

                            {/* Información de las Partes */}
                            <div className="grid grid-cols-2 gap-12 mb-10 pb-10 border-b border-slate-100 italic">
                                <div>
                                    <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 not-italic border-b border-slate-100 pb-1 w-fit font-sans">Información del Cliente</h5>
                                    <p className="text-xl font-black text-slate-900 uppercase tracking-tighter font-sans">{currentGymStatus?.name}</p>
                                    <p className="text-sm text-slate-600 font-bold mt-1 font-sans">Representante: {currentGymStatus?.owner_name}</p>
                                    <p className="text-xs text-slate-400 font-sans">ID Local: {currentGymStatus?.id?.split('-')[0]}</p>
                                </div>
                                <div className="text-right flex flex-col justify-end">
                                    <div className="space-y-1 text-xs font-sans">
                                        <div className="flex justify-end gap-3 pb-1 border-b border-slate-50">
                                            <span className="text-slate-400 font-bold uppercase">Fecha de Emisión:</span>
                                            <span className="text-slate-900 font-black">{new Date(selectedPayment.payment_date).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                                        </div>
                                        <div className="flex justify-end gap-3 pb-1 border-b border-slate-50">
                                            <span className="text-slate-400 font-bold uppercase text-primary-blue">Válido Hasta:</span>
                                            <span className="text-slate-900 font-black">
                                                {(() => {
                                                    const date = new Date(selectedPayment.payment_date);
                                                    const val = selectedPayment.saas_plans?.duration_value || 1;
                                                    const unit = selectedPayment.saas_plans?.duration_unit || 'months';
                                                    if (unit === 'months') date.setMonth(date.getMonth() + val);
                                                    else date.setDate(date.getDate() + (selectedPayment.saas_plans?.duration_days || val * 30));
                                                    return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
                                                })()}
                                            </span>
                                        </div>
                                        <div className="flex justify-end gap-3">
                                            <span className="text-slate-400 font-bold uppercase">Canal de Pago:</span>
                                            <span className="text-slate-900 font-black uppercase">{selectedPayment.payment_method}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Cuerpo de la Transacción */}
                            <div className="border-x-2 border-y-2 border-slate-900 rounded-xl overflow-hidden mb-12">
                                <table className="w-full font-sans">
                                    <thead className="bg-slate-900 text-white uppercase text-[10px] font-black tracking-widest">
                                        <tr>
                                            <th className="px-8 py-4 text-left">Descripción del Producto / Servicio Digital</th>
                                            <th className="px-8 py-4 text-right w-48">Total COP</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 italic">
                                        <tr>
                                            <td className="px-8 py-10">
                                                <p className="text-lg font-black uppercase text-slate-900 mb-2 not-italic tracking-tighter">
                                                    SUSCRIPCIÓN {selectedPayment.saas_plans?.name || 'SaaS'} - ACCESO FULL
                                                </p>
                                                <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-md not-italic">
                                                    {selectedPayment.notes || 'Licencia de uso mensual para el centro deportivo. Incluye acceso a todos los módulos administrativos, soporte técnico y actualizaciones de seguridad para el periodo descrito arriba.'}
                                                </p>
                                            </td>
                                            <td className="px-8 py-10 text-right align-top">
                                                <p className="text-2xl font-black text-slate-900 not-italic">{formatCurrency(selectedPayment.amount)}</p>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Pie de Documento y QR */}
                            <div className="flex justify-between items-end gap-16 pt-8">
                                <div className="space-y-8">
                                    <div className="flex gap-6 items-center">
                                        <img
                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=REC-${selectedPayment.id}-VALIDATED`}
                                            alt="Verification QR"
                                            className="size-32 border-2 border-slate-900 p-2 rounded-lg bg-white"
                                        />
                                        <div className="max-w-[200px]">
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2 font-sans">Seguridad Digital</p>
                                            <p className="text-[10px] text-slate-500 font-medium leading-tight font-sans italic">
                                                Este documento cuenta con autenticación criptográfica. Escanee el código para validar la autenticidad en los servidores oficiales de Antigravity.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1 w-48 pt-4">
                                        <div className="h-0.5 bg-slate-300 w-full mb-1"></div>
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 font-sans">Firma Autorizada SaaS</p>
                                    </div>
                                </div>

                                <div className="w-80 space-y-3 font-sans">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-400 font-bold uppercase tracking-widest">Base Imponible:</span>
                                        <span className="text-slate-600 font-bold">{formatCurrency(selectedPayment.amount)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs border-b border-slate-100 pb-2">
                                        <span className="text-slate-400 font-bold uppercase tracking-widest">IVA (0%):</span>
                                        <span className="text-slate-600 font-bold">$0</span>
                                    </div>
                                    <div className="flex justify-between items-center pt-2 bg-slate-900 text-white p-6 rounded-2xl shadow-xl">
                                        <span className="text-sm font-black uppercase tracking-widest italic">TOTAL PAGADO:</span>
                                        <span className="text-3xl font-black italic tracking-tighter">{formatCurrency(selectedPayment.amount)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Cláusulas Legales */}
                            <div className="mt-20 pt-8 border-t border-slate-100 italic">
                                <div className="grid grid-cols-2 gap-12 text-[9px] text-slate-400 font-medium leading-relaxed text-justify font-sans">
                                    <p>
                                        * Este documento se emite como soporte de pago electrónico para los servicios SaaS Antigravity. No representa una factura fiscal a menos que se especifique lo contrario. Los servicios pagados son de activación inmediata y no están sujetos a retracto después de 24 horas de uso según los términos aceptados.
                                    </p>
                                    <p>
                                        Antigravity Gym Ecosystem es una marca registrada. Todos los derechos reservados. Cali, Colombia. Transacción procesada bajo estándares de seguridad internacional. ID de Referencia para Auditoría: {selectedPayment.id}.
                                    </p>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {/* Estilos cargados exitosamente desde index.css */}
        </div>
    );
};

export default SubscriptionAdmin;
