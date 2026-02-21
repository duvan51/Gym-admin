import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

const SuperAdmin = ({ darkMode, toggleDarkMode }) => {
    const [activeTab, setActiveTab] = useState('gyms');
    const [showAddModal, setShowAddModal] = useState(false);

    // Configuración de Planes SaaS (lo que SuperAdmin cobra a los Gyms)
    const [gyms, setGyms] = useState([]);

    // Estados para el nuevo gimnasio
    const today = new Date().toISOString().split('T')[0];
    const [newGymData, setNewGymData] = useState({
        name: '',
        owner: '',
        email: '',
        password: '',
        planId: '',
        agentId: '', // New Field
        startDate: today,
        endDate: ''
    });

    // Estados para gestión de Agentes
    const [agents, setAgents] = useState([]);
    const [showAddAgentModal, setShowAddAgentModal] = useState(false);
    const [showEditAgentModal, setShowEditAgentModal] = useState(false);
    const [editingAgent, setEditingAgent] = useState(null);
    const [selectedGymHistory, setSelectedGymHistory] = useState(null);
    const [selectedAgentHistory, setSelectedAgentHistory] = useState(null);
    const [newAgentData, setNewAgentData] = useState({
        name: '',
        email: '',
        phone: '',
        commission_rate: 20,
        password: ''
    });

    // Estados para gestión de Planes SaaS
    const [showAddPlanModal, setShowAddPlanModal] = useState(false);
    const [showEditPlanModal, setShowEditPlanModal] = useState(false);
    const [editingPlan, setEditingPlan] = useState(null);
    const [newPlanData, setNewPlanData] = useState({
        name: '',
        price_cop: 0,
        gym_limit: '',
        duration_days: 30
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingGym, setEditingGym] = useState(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [newPaymentData, setNewPaymentData] = useState({
        gym_id: '',
        plan_id: '',
        amount: 0,
        payment_method: 'transferencia',
        transaction_id: '',
        notes: ''
    });

    const [paymentFilters, setPaymentFilters] = useState({
        search: '',
        month: '',
        year: '',
        agent: ''
    });
    const [metrics, setMetrics] = useState({
        mrr: 0,
        activeGyms: 0,
        totalAthletes: 0,
        projection: 0
    });
    const [payments, setPayments] = useState([]);



    // Fetch existing plans from Supabase
    const [plans, setPlans] = useState([]);
    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true);
            try {
                const { data: plansData } = await supabase.from('saas_plans').select('*');
                if (plansData) {
                    setPlans(plansData);
                    setNewGymData(prev => ({ ...prev, planId: plansData[0]?.id }));
                }
                await fetchGyms();
                await fetchMetrics();
                await fetchPayments();
                await fetchAgents();
            } catch (err) {
                console.error("Error loading initial data:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchInitialData();
    }, []);

    const fetchAgents = async () => {
        const { data } = await supabase
            .from('saas_agents')
            .select(`
                *,
                agent_commissions(amount, status)
            `)
            .order('created_at', { ascending: false });
        if (data) setAgents(data);
    };

    const fetchPayments = async () => {
        const { data } = await supabase
            .from('gym_payments')
            .select(`
                *,
                gyms(name, saas_agents(name)),
                saas_plans(name),
                agent_commissions(amount, status)
            `)
            .order('payment_date', { ascending: false });
        if (data) setPayments(data);
    };


    const fetchMetrics = async () => {
        try {
            // 1. Total Athletes
            const { count: athletesCount } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'user');

            // 2. Active Gyms & MRR
            const { data: activeGymsData } = await supabase
                .from('gyms')
                .select('plan_id, saas_plans(price_cop)')
                .eq('status', 'active');

            const mrr = activeGymsData?.reduce((acc, g) => acc + (Number(g.saas_plans?.price_cop) || 0), 0) || 0;

            setMetrics({
                mrr,
                activeGyms: activeGymsData?.length || 0,
                totalAthletes: athletesCount || 0,
                projection: mrr * 12
            });
        } catch (err) {
            console.error("Error fetching metrics:", err);
        }
    };


    const fetchGyms = async () => {
        const { data, error } = await supabase
            .from('gyms')
            .select(`
                *,
                saas_plans (id, name, price_cop),
                saas_agents (id, name)
            `)
            .order('created_at', { ascending: false });

        if (data) {
            // Fetch member counts and admin profile for each gym
            const gymsWithMembers = await Promise.all(data.map(async (g) => {
                const { count } = await supabase
                    .from('profiles')
                    .select('*', { count: 'exact', head: true })
                    .eq('gym_id', g.id)
                    .eq('role', 'user');

                // Get gym admin email and user_id
                const { data: adminProfile } = await supabase
                    .from('profiles')
                    .select('id, email')
                    .eq('gym_id', g.id)
                    .eq('role', 'admin')
                    .limit(1)
                    .single();

                return {
                    id: g.id,
                    name: g.name,
                    owner: g.owner_name,
                    status: g.status,
                    plan: g.saas_plans?.name || 'N/A',
                    plan_id: g.plan_id,
                    agent_id: g.agent_id,
                    agent_name: g.saas_agents?.name || 'Venta Directa',
                    members: count || 0,
                    startDate: g.start_date,
                    endDate: g.end_date,
                    admin_id: adminProfile?.id,
                    admin_email: adminProfile?.email || ''
                };
            }));
            setGyms(gymsWithMembers);
        }
    };


    // Calcular fin de suscripción SaaS automáticamente
    useEffect(() => {
        if (newGymData.startDate && newGymData.planId && plans.length > 0) {
            const selectedPlan = plans.find(p => p.id === newGymData.planId);
            const duration = selectedPlan?.duration_value || 1;
            const unit = selectedPlan?.duration_unit || 'months';

            const start = new Date(newGymData.startDate);
            const end = new Date(start);

            if (unit === 'months') {
                end.setMonth(start.getMonth() + duration);
            } else {
                end.setDate(start.getDate() + (selectedPlan?.duration_days || (duration * 30)));
            }

            setNewGymData(prev => ({ ...prev, endDate: end.toISOString().split('T')[0] }));
        }
    }, [newGymData.startDate, newGymData.planId, plans]);


    const formatCurrency = (val) => {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
    };

    const generateStripeLink = async (gym) => {
        try {
            const plan = plans.find(p => p.id === gym.plan_id);
            if (!plan) throw new Error("Plan no seleccionado o no válido");

            const { data, error } = await supabase.functions.invoke('stripe-checkout', {
                body: {
                    planName: `Suscripción SaaS: ${plan.name} - ${gym.name}`,
                    amount: plan.price_cop * 100, // Stripe usa centavos
                    successUrl: `${window.location.origin}/#/login?success=true`,
                    cancelUrl: `${window.location.origin}/#/login?cancel=true`,
                    metadata: {
                        gymId: gym.id,
                        planId: plan.id,
                        type: 'saas_subscription',
                        isUpgrade: 'false',
                        notes: 'Activación vía Enlace Directo'
                    }
                }
            });

            if (error) throw error;
            if (data?.url) {
                await navigator.clipboard.writeText(data.url);
                alert('¡Enlace directo de Stripe generado y copiado! Envíalo al cliente. No necesita iniciar sesión para pagar.');
            }
        } catch (err) {
            console.error("Error generating link:", err);
            alert("Error al generar enlace: " + err.message);
        }
    };

    const toggleGymStatus = async (id) => {
        const gym = gyms.find(g => g.id === id);

        // Si el gimnasio está inactivo y se intenta activar, requerir registro de pago
        if (gym.status !== 'active') {
            const plan = plans.find(p => p.id === gym.plan_id);
            setNewPaymentData({
                gym_id: gym.id,
                plan_id: gym.plan_id,
                amount: plan?.price_cop || 0,
                payment_method: 'transferencia',
                transaction_id: '',
                notes: 'Reactivación manual desde panel'
            });
            setShowPaymentModal(true);
            return;
        }

        // Si ya está activo, permitir pausarlo (cambiar a inactive o pending)
        const newStatus = 'inactive';
        const { error } = await supabase
            .from('gyms')
            .update({ status: newStatus })
            .eq('id', id);

        if (!error) {
            setGyms(gyms.map(g => g.id === id ? { ...g, status: newStatus } : g));
        }
    };

    const handleUpdateGym = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { error } = await supabase
                .from('gyms')
                .update({
                    name: editingGym.name,
                    owner_name: editingGym.owner,
                    plan_id: editingGym.plan_id,
                    agent_id: editingGym.agent_id,
                    start_date: editingGym.startDate,
                    end_date: editingGym.endDate,
                    status: editingGym.status
                })
                .eq('id', editingGym.id);

            if (error) throw error;

            // Update Auth Credentials if changed
            if (editingGym.admin_id) {
                const gymInList = gyms.find(g => g.id === editingGym.id);
                const emailChanged = editingGym.admin_email !== gymInList?.admin_email;
                const passwordProvided = editingGym.admin_new_password && editingGym.admin_new_password.length > 0;

                if (emailChanged || passwordProvided) {
                    const { data: resultData, error: fnError } = await supabase.functions.invoke('manage-user-auth', {
                        body: {
                            action: 'update_credentials',
                            userId: editingGym.admin_id,
                            email: emailChanged ? editingGym.admin_email : undefined,
                            password: passwordProvided ? editingGym.admin_new_password : undefined
                        }
                    });

                    if (fnError) throw new Error(fnError.message || 'Error al actualizar credenciales');

                    // Sync email in profiles if it changed
                    if (emailChanged) {
                        await supabase
                            .from('profiles')
                            .update({ email: editingGym.admin_email })
                            .eq('id', editingGym.admin_id);
                    }
                }
            }

            await fetchGyms();
            await fetchMetrics();
            setShowEditModal(false);
            setEditingGym(null);
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };


    const handleAddGym = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            // 1. Create the Gym Admin user in Supabase Auth using Edge Function to avoid logging out the SuperAdmin
            const { data: resultData, error: fnError } = await supabase.functions.invoke('manage-user-auth', {
                body: {
                    action: 'create_user',
                    email: newGymData.email,
                    password: newGymData.password,
                    full_name: newGymData.owner
                }
            });

            if (fnError) throw new Error(fnError.message || 'Error al crear administrador de gimnasio');

            const authUser = resultData.user;

            // 2. Create the Gym record
            const { data: gymData, error: gymError } = await supabase
                .from('gyms')
                .insert([{
                    name: newGymData.name,
                    owner_name: newGymData.owner,
                    plan_id: newGymData.planId,
                    agent_id: newGymData.agentId || null,
                    start_date: null, // No inicia hasta el pago
                    end_date: null,   // No vence hasta el pago
                    status: 'pending' // Estado inicial de espera
                }])
                .select()
                .single();

            if (gymError) throw gymError;

            // 3. Update the newly created profile with the gym_id and email
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    gym_id: gymData.id,
                    role: 'admin',
                    email: newGymData.email
                })
                .eq('id', authUser.id);

            if (profileError) throw profileError;

            // 4. Record Initial Payment
            const selectedPlan = plans.find(p => p.id === newGymData.planId);
            await supabase.from('gym_payments').insert([{
                gym_id: gymData.id,
                plan_id: selectedPlan.id,
                amount: selectedPlan.price_cop,
                status: 'completed',
                payment_method: 'transferencia',
                notes: 'Pago inicial de activación SaaS'
            }]);

            // Success
            await fetchGyms();
            await fetchPayments();
            await fetchMetrics();
            setShowAddModal(false);
            setNewGymData({ name: '', owner: '', email: '', password: '', planId: plans[0]?.id, startDate: today });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRecordPayment = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // 1. Insertar pago y obtener ID
            const { data: payment, error: payError } = await supabase.from('gym_payments').insert([{
                gym_id: newPaymentData.gym_id,
                plan_id: newPaymentData.plan_id,
                amount: newPaymentData.amount,
                payment_method: newPaymentData.payment_method,
                transaction_id: newPaymentData.transaction_id,
                notes: newPaymentData.notes,
                status: 'completed',
                payment_date: new Date().toISOString()
            }]).select().single();

            if (payError) throw payError;

            // 2. Extender vigencia del Gimnasio
            const gym = gyms.find(g => g.id === newPaymentData.gym_id);
            const plan = plans.find(p => p.id === newPaymentData.plan_id);

            const currentEnd = gym.endDate ? new Date(gym.endDate) : new Date();
            const startFrom = currentEnd > new Date() ? currentEnd : new Date();
            const newEnd = new Date(startFrom);

            const duration = plan?.duration_value || 1;
            const unit = plan?.duration_unit || 'months';

            if (unit === 'months') {
                newEnd.setMonth(newEnd.getMonth() + duration);
            } else {
                newEnd.setDate(newEnd.getDate() + (plan?.duration_days || (duration * 30)));
            }

            const { error: gymError } = await supabase
                .from('gyms')
                .update({
                    end_date: newEnd.toISOString(),
                    status: 'active',
                    plan_id: plan.id
                })
                .eq('id', gym.id);

            if (gymError) throw gymError;

            // 3. Registrar Comisión si hay agente asignado
            if (gym.agent_id) {
                const { data: agent } = await supabase.from('saas_agents').select('commission_rate').eq('id', gym.agent_id).single();
                if (agent && agent.commission_rate > 0) {
                    const commissionAmount = (Number(newPaymentData.amount) * agent.commission_rate) / 100;
                    await supabase.from('agent_commissions').insert({
                        agent_id: gym.agent_id,
                        gym_id: gym.id,
                        payment_id: payment.id,
                        amount: commissionAmount,
                        commission_rate: agent.commission_rate,
                        status: 'pending'
                    });
                }
            }

            // 4. Registrar Log de Auditoría
            const { data: { user } } = await supabase.auth.getUser();
            await supabase.from('gym_activity_logs').insert([{
                gym_id: gym.id,
                action: 'payment_renewal',
                performed_by: user?.id,
                details: {
                    amount: newPaymentData.amount,
                    plan: plan.name,
                    transaction: newPaymentData.transaction_id
                }
            }]);

            await fetchPayments();
            await fetchGyms();
            await fetchMetrics();
            setShowPaymentModal(false);
            alert('Pago registrado y comisión asignada con éxito');

        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };
    const handlePayoutAgent = async (agentId) => {
        if (!window.confirm('¿Confirmas que has realizado el pago a este agente y deseas liquidar sus comisiones pendientes?')) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('agent_commissions')
                .update({ status: 'paid' })
                .eq('agent_id', agentId)
                .eq('status', 'pending');

            if (error) throw error;

            await fetchAgents();
            await fetchPayments();
            alert('Comisiones liquidadas con éxito');
        } catch (err) {
            alert('Error al liquidar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };


    const handleAddPlan = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { error } = await supabase
                .from('saas_plans')
                .insert([newPlanData]);

            if (error) throw error;

            const { data: plansData } = await supabase.from('saas_plans').select('*');
            if (plansData) setPlans(plansData);

            setShowAddPlanModal(false);
            setNewPlanData({ name: '', price_cop: 0, gym_limit: '', duration_days: 30 });
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdatePlan = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { error } = await supabase
                .from('saas_plans')
                .update({
                    name: editingPlan.name,
                    price_cop: editingPlan.price_cop,
                    duration_days: editingPlan.duration_days,
                    gym_limit: editingPlan.gym_limit
                })
                .eq('id', editingPlan.id);

            if (error) throw error;

            const { data: plansData } = await supabase.from('saas_plans').select('*');
            if (plansData) setPlans(plansData);

            setShowEditPlanModal(false);
            setEditingPlan(null);
            alert('Plan actualizado correctamente');
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeletePlan = async (id) => {
        if (!window.confirm('¿Estás seguro de eliminar este plan? Esto no afectará a los gimnasios que ya lo tienen asignado.')) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('saas_plans')
                .delete()
                .eq('id', id);

            if (error) throw error;

            const { data: plansData } = await supabase.from('saas_plans').select('*');
            if (plansData) setPlans(plansData);
            alert('Plan eliminado correctamente');
        } catch (err) {
            alert('Error al eliminar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddAgent = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // 1. Create Auth User for the Agent
            const { data: resultData, error: fnError } = await supabase.functions.invoke('manage-user-auth', {
                body: {
                    action: 'create_user',
                    email: newAgentData.email,
                    password: newAgentData.password,
                    full_name: newAgentData.name,
                    email_confirm: true
                }
            });

            if (fnError) throw new Error(fnError.message || 'Error al crear usuario del agente');
            const authUser = resultData.user;

            // 2. Create Agent Record linked to user_id
            const { error: agentError } = await supabase.from('saas_agents').insert([{
                name: newAgentData.name,
                email: newAgentData.email,
                phone: newAgentData.phone,
                commission_rate: newAgentData.commission_rate,
                user_id: authUser.id
            }]);

            if (agentError) throw agentError;

            // 3. Update Profile Role
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    email: newAgentData.email,
                    role: 'agent'
                })
                .eq('id', authUser.id);

            if (profileError) console.warn("Error updating profile role:", profileError);

            await fetchAgents();
            setShowAddAgentModal(false);
            setNewAgentData({ name: '', email: '', phone: '', commission_rate: 20, password: '' });
            alert('Agente creado exitosamente. Credenciales enviadas (simulado).');

        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };


    const handleUpdateAgent = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Actualizar tabla saas_agents
            const { error } = await supabase
                .from('saas_agents')
                .update({
                    name: editingAgent.name,
                    email: editingAgent.email,
                    phone: editingAgent.phone,
                    commission_rate: editingAgent.commission_rate
                })
                .eq('id', editingAgent.id);

            if (error) throw error;

            // Actualizar Credenciales de Auth si es necesario
            if (editingAgent.user_id) {
                const agentInList = agents.find(a => a.id === editingAgent.id);
                // NOTA: saas_agents.email es la fuente de verdad del email.
                const emailChanged = editingAgent.email !== agentInList?.email;
                const passwordProvided = editingAgent.new_password && editingAgent.new_password.length > 0;

                // Siempre llamamos a la función para asegurar email_confirm: true y corregir posibles inconsistencias
                const { data: resultData, error: fnError } = await supabase.functions.invoke('manage-user-auth', {
                    body: {
                        action: 'update_credentials',
                        userId: editingAgent.user_id,
                        email: emailChanged ? editingAgent.email : undefined,
                        password: passwordProvided ? editingAgent.new_password : undefined,
                        email_confirm: true
                    }
                });

                if (fnError) throw new Error(fnError.message || 'Error al actualizar credenciales del agente');

                // Asegurar consistencia del perfil (Role & Email)
                await supabase
                    .from('profiles')
                    .update({
                        email: editingAgent.email,
                        role: 'agent'
                    })
                    .eq('id', editingAgent.user_id);
            }

            await fetchAgents();
            setShowEditAgentModal(false);
            setEditingAgent(null);
            alert('Agente actualizado correctamente');
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchGymHistory = async (gymId) => {
        const { data } = await supabase
            .from('gym_payments')
            .select('*, saas_plans(name, duration_days)')
            .eq('gym_id', gymId)
            .order('payment_date', { ascending: false });
        return data || [];
    };

    const handleViewGymHistory = async (gym) => {
        setLoading(true);
        const history = await fetchGymHistory(gym.id);
        setSelectedGymHistory({ gym, history });
        setLoading(false);
    };

    const fetchAgentHistory = async (agentId) => {
        const { data } = await supabase
            .from('agent_commissions')
            .select(`
                *,
                gyms(name),
                gym_payments(payment_date, amount, transaction_id)
            `)
            .eq('agent_id', agentId)
            .order('created_at', { ascending: false });
        return data || [];
    };

    const handleViewAgentHistory = async (agent) => {
        setLoading(true);
        const history = await fetchAgentHistory(agent.id);
        setSelectedAgentHistory({ agent, history });
        setLoading(false);
    };

    const LocalLoader = () => (
        <div className="flex-1 flex flex-col items-center justify-center space-y-4 animate-fadeIn">
            <div className="size-16 border-4 border-primary-blue/20 border-t-primary-blue rounded-full animate-spin"></div>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.4em]">Sincronizando Datos...</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark text-slate-800 dark:text-white font-display flex flex-col transition-colors duration-300">
            {/* SuperAdmin Header */}
            <header className="sticky top-0 z-50 w-full border-b border-black/5 dark:border-white/5 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-xl px-4 md:px-10 py-4 md:py-6 flex items-center justify-between transition-colors">
                <div className="flex items-center gap-3 md:gap-6">
                    <div className="bg-primary-blue/20 p-2 md:p-3 rounded-2xl border border-primary-blue/30 shadow-[0_0_20px_rgba(25,127,230,0.2)] shrink-0">
                        <span className="material-symbols-outlined text-primary-blue text-xl md:text-3xl font-black">admin_panel_settings</span>
                    </div>
                    <div>
                        <h1 className="text-lg md:text-2xl font-black uppercase italic tracking-tighter">andoGym <span className="text-primary-blue">Central</span></h1>
                        <p className="hidden md:block text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Gestión de Ecosistema SaaS</p>
                    </div>
                </div>

                {/* Desktop Nav */}
                <nav className="hidden lg:flex items-center gap-2 bg-surface-light dark:bg-surface-dark p-1.5 rounded-2xl border border-black/5 dark:border-white/5 transition-colors">
                    {[
                        { id: 'metrics', label: 'Métricas', icon: 'analytics' },
                        { id: 'gyms', label: 'Gimnasios', icon: 'domain' },
                        { id: 'agents', label: 'Agentes', icon: 'support_agent' },
                        { id: 'payments', label: 'Pagos SaaS', icon: 'receipt_long' },
                        { id: 'pricing', label: 'Precios SaaS', icon: 'payments' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-primary-blue text-white shadow-lg shadow-primary-blue/30' : 'text-slate-500 hover:text-white'}`}
                        >
                            <span className="material-symbols-outlined text-sm">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </nav>

                <div className="flex items-center gap-2 md:gap-4">
                    <button
                        onClick={toggleDarkMode}
                        className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 text-slate-500 hover:text-primary-blue transition-all"
                        title={darkMode ? "Modo Claro" : "Modo Oscuro"}
                    >
                        <span className="material-symbols-outlined text-xl">
                            {darkMode ? 'light_mode' : 'dark_mode'}
                        </span>
                    </button>
                    <button
                        onClick={async () => {
                            await supabase.auth.signOut();
                            window.location.href = '#/login';
                        }}
                        className="flex items-center gap-2 text-slate-500 hover:text-red-500 transition-colors font-black uppercase text-[10px] tracking-widest pl-2 border-l border-black/10 dark:border-white/10 bg-transparent border-none cursor-pointer"
                    >
                        <span className="hidden md:inline">Cerrar Sesión</span> <span className="material-symbols-outlined text-sm">logout</span>
                    </button>
                </div>
            </header>

            {/* Mobile Floating Nav (Tipo App) */}
            <nav className="lg:hidden fixed bottom-6 left-4 right-4 z-[100] animate-in slide-in-from-bottom-5 duration-500">
                <div className="bg-white/80 dark:bg-background-dark/90 backdrop-blur-2xl border border-black/10 dark:border-white/10 rounded-[2rem] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center justify-between transition-colors">
                    {[
                        { id: 'metrics', icon: 'analytics', label: 'Métricas' },
                        { id: 'gyms', icon: 'domain', label: 'Gyms' },
                        { id: 'agents', icon: 'support_agent', label: 'Agentes' },
                        { id: 'payments', icon: 'receipt_long', label: 'Pagos' },
                        { id: 'pricing', icon: 'payments', label: 'Planes' }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 flex flex-col items-center justify-center py-3 rounded-2xl transition-all relative group
                                ${activeTab === tab.id ? 'text-primary-blue' : 'text-slate-500'}
                            `}
                        >
                            {activeTab === tab.id && (
                                <div className="absolute inset-x-2 inset-y-1 bg-primary-blue/10 rounded-2xl -z-10 animate-pulse"></div>
                            )}
                            <span className={`material-symbols-outlined text-[22px] transition-transform group-active:scale-90 ${activeTab === tab.id ? 'font-black' : ''}`}>
                                {tab.icon}
                            </span>
                            <span className="text-[8px] font-black uppercase tracking-tighter mt-1">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </nav>

            <main className="flex-1 p-4 md:p-10 pb-40 md:pb-10 overflow-y-auto custom-scrollbar flex flex-col">
                {loading && <LocalLoader />}

                {!loading && activeTab === 'metrics' && (
                    <div className="space-y-8 animate-fadeIn">
                        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {[
                                { label: 'MRR Global', value: formatCurrency(metrics.mrr), trend: '+12%', icon: 'account_balance_wallet', color: 'text-primary-blue' },
                                { label: 'Gimnasios Activos', value: metrics.activeGyms, trend: '+1', icon: 'store', color: 'text-primary' },
                                { label: 'Atletas Totales', value: metrics.totalAthletes.toLocaleString(), trend: '+8%', icon: 'groups', color: 'text-orange-500' },
                                { label: 'Proyección Anual', value: formatCurrency(metrics.projection), trend: 'Estable', icon: 'query_stats', color: 'text-purple-500' }
                            ].map((stat, i) => (

                                <div key={i} className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark p-8 rounded-[2.5rem] relative overflow-hidden group transition-all shadow-sm dark:shadow-none">
                                    <span className={`material-symbols-outlined absolute top-6 right-6 text-4xl opacity-10 dark:opacity-20 ${stat.color}`}>{stat.icon}</span>
                                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">{stat.label}</p>
                                    <h3 className="text-3xl font-black italic text-slate-800 dark:text-white transition-colors">{stat.value}</h3>
                                    <p className={`text-[10px] font-bold mt-2 ${stat.trend.includes('+') ? 'text-primary' : 'text-slate-400'}`}>{stat.trend} este mes</p>
                                </div>
                            ))}
                        </section>

                        <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-[2.5rem] p-10 transition-all shadow-sm dark:shadow-none">
                            <h3 className="text-xl font-black uppercase italic mb-8 text-slate-800 dark:text-white transition-colors">Crecimiento Mensual Recurrente</h3>
                            <div className="h-64 flex items-end gap-4">
                                {[30, 45, 35, 70, 65, 80, 95, 100, 115, 130].map((h, i) => (
                                    <div key={i} className="flex-1 bg-primary-blue/10 dark:bg-primary-blue/20 rounded-t-xl relative group transition-colors" style={{ height: `${h}%` }}>
                                        <div className="absolute inset-0 bg-primary-blue scale-y-0 group-hover:scale-y-100 transition-transform origin-bottom rounded-t-xl opacity-20 dark:opacity-40"></div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between mt-4 text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">
                                <span>Nov</span><span>Dic</span><span>Ene</span><span>Feb</span><span>Mar</span><span>Abr</span><span>May</span><span>Jun</span><span>Jul</span><span>Ago</span>
                            </div>
                        </div>
                    </div>
                )}

                {!loading && activeTab === 'gyms' && (
                    <div className="space-y-8 animate-fadeIn">
                        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                            <div>
                                <h2 className="text-2xl md:text-3xl font-black uppercase italic tracking-tight">Gimnasios <span className="text-primary-blue">Partner</span></h2>
                                <p className="text-slate-500 text-[10px] md:text-xs font-bold uppercase tracking-widest mt-1">Directorio central de unidades operativas</p>
                            </div>
                            <button
                                onClick={() => setShowAddModal(true)}
                                className="w-full md:w-auto bg-primary-blue hover:bg-blue-600 text-white px-8 py-4 rounded-2xl flex items-center justify-center gap-3 transition-all font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary-blue/20"
                            >
                                <span className="material-symbols-outlined">add_circle</span>
                                Registrar Gimnasio
                            </button>
                        </header>

                        {/* Vista de Escritorio (Tabla) */}
                        <div className="hidden md:block bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-[2.5rem] overflow-hidden shadow-sm dark:shadow-2xl transition-all">
                            <table className="w-full text-left">
                                <thead className="bg-black/5 dark:bg-background-dark/50 border-b border-border-light dark:border-border-dark transition-colors">
                                    <tr>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Unidad de Negocio</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Plan SaaS</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Vendedor</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Inicia</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-primary-blue tracking-widest">Vence el</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-center">Estado</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black/5 dark:divide-white/5 transition-colors">
                                    {gyms.map(gym => {
                                        const isExpired = new Date(gym.endDate) < new Date();
                                        return (
                                            <tr key={gym.id} className="hover:bg-black/[0.01] dark:hover:bg-white/[0.02] transition-colors group">
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`size-12 rounded-2xl ${gym.status === 'active' ? 'bg-primary-blue/10 text-primary-blue' : 'bg-red-500/10 text-red-500'} flex items-center justify-center border border-black/5 dark:border-white/5 group-hover:border-primary-blue/30 transition-all`}>
                                                            <span className="material-symbols-outlined">{gym.status === 'active' ? 'store' : 'storefront'}</span>
                                                        </div>
                                                        <div>
                                                            <p className="font-black uppercase italic text-sm text-slate-800 dark:text-white transition-colors">{gym.name}</p>
                                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{gym.owner}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-slate-600 dark:text-slate-300 transition-colors`}>
                                                        {gym.plan}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <p className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-tighter mb-1 transition-colors">Agente</p>
                                                    <p className="text-xs font-bold text-slate-700 dark:text-white uppercase italic transition-colors">{gym.agent_name}</p>
                                                </td>
                                                <td className="px-8 py-6 font-bold text-sm text-slate-400">
                                                    {gym.startDate ? new Date(gym.startDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className={`flex items-center gap-2 font-black italic text-sm transition-colors ${isExpired ? 'text-red-500' : 'text-slate-600 dark:text-white'}`}>
                                                        <span className="material-symbols-outlined text-xs">event</span>
                                                        {gym.endDate ? new Date(gym.endDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className={`flex items-center justify-center gap-2 ${gym.status === 'active' ? 'text-primary' :
                                                        gym.status === 'pending' ? 'text-amber-500' : 'text-red-500'
                                                        }`}>
                                                        <span className={`size-2 rounded-full ${gym.status === 'active' ? 'bg-primary shadow-[0_0_10px_rgba(13,242,89,0.5)]' :
                                                            gym.status === 'pending' ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]' :
                                                                'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'
                                                            }`}></span>
                                                        <span className="text-[10px] font-black uppercase italic tracking-widest">
                                                            {gym.status === 'active' ? 'ACTIVO' : gym.status === 'pending' ? 'POR PAGAR' : 'DESACTIVADO'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 text-right">
                                                    <div className="flex justify-end gap-3">
                                                        <button
                                                            onClick={() => handleViewGymHistory(gym)}
                                                            className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-primary-blue transition-all"
                                                            title="Ver Historial de Pagos"
                                                        >
                                                            <span className="material-symbols-outlined text-lg">history</span>
                                                        </button>
                                                        <button
                                                            onClick={() => toggleGymStatus(gym.id)}
                                                            className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-white transition-all"
                                                            title={gym.status === 'active' ? 'Pausar Gym' : 'Activar Gym'}
                                                        >
                                                            <span className="material-symbols-outlined text-lg">{gym.status === 'active' ? 'pause_circle' : 'play_circle'}</span>
                                                        </button>
                                                        <button
                                                            onClick={() => generateStripeLink(gym)}
                                                            className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-primary-blue transition-all"
                                                            title="Generar Enlace de Stripe Directo"
                                                        >
                                                            <span className="material-symbols-outlined text-lg">credit_card_heart</span>
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                const paymentLink = `${window.location.origin}/#/subscription-admin?gymId=${gym.id}&autoPay=true`;
                                                                try {
                                                                    await navigator.clipboard.writeText(paymentLink);
                                                                    alert('Enlace de activación copiado (Requiere Login).');
                                                                } catch (err) {
                                                                    console.error('Error al copiar:', err);
                                                                    alert('Enlace: ' + paymentLink);
                                                                }
                                                            }}
                                                            className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-amber-500 transition-all"
                                                            title="Copiar Enlace de Panel (Requiere Login)"
                                                        >
                                                            <span className="material-symbols-outlined text-lg">link</span>
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                const plan = plans.find(p => p.id === gym.plan_id);
                                                                setNewPaymentData({
                                                                    gym_id: gym.id,
                                                                    plan_id: gym.plan_id,
                                                                    amount: plan?.price_cop || 0,
                                                                    payment_method: 'transferencia',
                                                                    transaction_id: '',
                                                                    notes: 'Pago inicial / Activación manual'
                                                                });
                                                                setShowPaymentModal(true);
                                                            }}
                                                            className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-primary transition-all"
                                                            title="Registrar Pago / Activar"
                                                        >
                                                            <span className="material-symbols-outlined text-lg">add_card</span>
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setEditingGym({
                                                                    ...gym,
                                                                    admin_new_password: ''
                                                                });
                                                                setShowEditModal(true);
                                                            }}
                                                            className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-primary-blue transition-all"
                                                        >
                                                            <span className="material-symbols-outlined text-lg">edit_square</span>
                                                        </button>

                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Vista de Móvil (Cartas Reestructuradas) */}
                        <div className="md:hidden space-y-4">
                            {gyms.map(gym => {
                                const isExpired = new Date(gym.endDate) < new Date();
                                return (
                                    <div key={gym.id} className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark p-6 rounded-[2rem] space-y-5 shadow-sm animate-fadeInUp transition-all">
                                        {/* Cabecera: Unidad de Negocio y Estado */}
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3">
                                                <div className={`size-10 rounded-xl ${gym.status === 'active' ? 'bg-primary-blue/10 text-primary-blue' : 'bg-red-500/10 text-red-500'} flex items-center justify-center border border-black/5 dark:border-white/5`}>
                                                    <span className="material-symbols-outlined">{gym.status === 'active' ? 'store' : 'storefront'}</span>
                                                </div>
                                                <div>
                                                    <p className="font-black uppercase italic text-xs text-slate-800 dark:text-white leading-tight">{gym.name}</p>
                                                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{gym.owner}</p>
                                                </div>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest italic border ${gym.status === 'active' ? 'bg-primary/10 text-primary border-primary/20' :
                                                gym.status === 'pending' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                                    'bg-red-500/10 text-red-500 border-red-500/20'
                                                }`}>
                                                {gym.status === 'active' ? 'ACTIVO' : gym.status === 'pending' ? 'PENDIENTE' : 'OFF'}
                                            </span>
                                        </div>

                                        {/* Fila 1: Plan SaaS y Vendedor */}
                                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-black/5 dark:border-white/5">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Plan Contratado</span>
                                                <span className="w-fit px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-black/5 dark:bg-white/5 text-slate-600 dark:text-slate-300 border border-black/5 dark:border-white/5">
                                                    {gym.plan}
                                                </span>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Vendedor</span>
                                                <p className="text-[10px] font-black text-slate-800 dark:text-white uppercase italic truncate">{gym.agent_name}</p>
                                            </div>
                                        </div>

                                        {/* Fila 2: Fechas de Vigencia */}
                                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-black/5 dark:border-white/5">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Inicia</span>
                                                <div className="flex items-center gap-1.5 text-slate-500 font-bold text-[10px]">
                                                    <span className="material-symbols-outlined text-xs">calendar_today</span>
                                                    {gym.startDate ? new Date(gym.startDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[8px] font-black uppercase text-primary-blue tracking-widest">Vence saas</span>
                                                <div className={`flex items-center gap-1.5 font-black italic text-[10px] ${isExpired ? 'text-red-500' : 'text-slate-800 dark:text-white'}`}>
                                                    <span className="material-symbols-outlined text-xs">event</span>
                                                    {gym.endDate ? new Date(gym.endDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Fila 3: Botones de Acciones */}
                                        <div className="grid grid-cols-3 gap-2 pt-4 border-t border-black/5 dark:border-white/5">
                                            <button onClick={() => handleViewGymHistory(gym)} className="flex flex-col items-center justify-center gap-1 p-2 bg-black/5 dark:bg-white/5 rounded-xl text-slate-500">
                                                <span className="material-symbols-outlined text-lg">history</span>
                                                <span className="text-[7px] font-black uppercase">Pagos</span>
                                            </button>
                                            <button onClick={() => toggleGymStatus(gym.id)} className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl ${gym.status === 'active' ? 'bg-amber-500/10 text-amber-500' : 'bg-primary/10 text-primary'}`}>
                                                <span className="material-symbols-outlined text-lg">{gym.status === 'active' ? 'pause_circle' : 'play_circle'}</span>
                                                <span className="text-[7px] font-black uppercase">{gym.status === 'active' ? 'Pausar' : 'Reactivar'}</span>
                                            </button>
                                            <button onClick={() => generateStripeLink(gym)} className="flex flex-col items-center justify-center gap-1 p-2 bg-primary-blue/10 text-primary-blue rounded-xl">
                                                <span className="material-symbols-outlined text-lg">credit_card_heart</span>
                                                <span className="text-[7px] font-black uppercase">Stripe</span>
                                            </button>
                                            <button onClick={() => {
                                                const plan = plans.find(p => p.id === gym.plan_id);
                                                setNewPaymentData({ gym_id: gym.id, plan_id: gym.plan_id, amount: plan?.price_cop || 0, payment_method: 'transferencia', transaction_id: '', notes: 'Pago móvil' });
                                                setShowPaymentModal(true);
                                            }} className="flex flex-col items-center justify-center gap-1 p-2 bg-primary/10 text-primary rounded-xl">
                                                <span className="material-symbols-outlined text-lg">add_card</span>
                                                <span className="text-[7px] font-black uppercase">Cobrar</span>
                                            </button>
                                            <button onClick={() => { setEditingGym({ ...gym, admin_new_password: '' }); setShowEditModal(true); }} className="flex flex-col items-center justify-center gap-1 p-2 bg-primary-blue/10 text-primary-blue rounded-xl">
                                                <span className="material-symbols-outlined text-lg">edit_square</span>
                                                <span className="text-[7px] font-black uppercase">Editar</span>
                                            </button>
                                            <button onClick={async () => {
                                                const paymentLink = `${window.location.origin}/#/subscription-admin?gymId=${gym.id}&autoPay=true`;
                                                await navigator.clipboard.writeText(paymentLink);
                                                alert('Enlace copiado');
                                            }} className="flex flex-col items-center justify-center gap-1 p-2 bg-black/5 dark:bg-white/5 rounded-xl text-slate-500">
                                                <span className="material-symbols-outlined text-lg">link</span>
                                                <span className="text-[7px] font-black uppercase">Link</span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}


                {!loading && activeTab === 'payments' && (
                    <div className="space-y-8 animate-fadeIn">
                        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                            <div>
                                <h2 className="text-3xl font-black uppercase italic tracking-tight">Historial de <span className="text-primary-blue">Pagos SaaS</span></h2>
                                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Registro cronológico de ingresos por suscripciones</p>
                            </div>
                        </header>

                        {/* Payment Filters Bar */}
                        <div className="bg-surface-light dark:bg-surface-dark border border-black/5 dark:border-white/5 p-6 rounded-[2rem] grid grid-cols-1 md:grid-cols-4 gap-4 transition-all shadow-sm dark:shadow-none">
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">search</span>
                                <input
                                    type="text"
                                    placeholder="Buscar Gimnasio..."
                                    value={paymentFilters.search}
                                    onChange={(e) => setPaymentFilters({ ...paymentFilters, search: e.target.value })}
                                    className="w-full bg-black/5 dark:bg-background-dark/50 border border-black/5 dark:border-white/5 rounded-xl py-3 pl-10 pr-4 text-[10px] font-black uppercase tracking-widest outline-none focus:border-primary-blue/50 transition-all text-slate-800 dark:text-white"
                                />
                            </div>
                            <select
                                value={paymentFilters.month}
                                onChange={(e) => setPaymentFilters({ ...paymentFilters, month: e.target.value })}
                                className="bg-black/5 dark:bg-background-dark/50 border border-black/5 dark:border-white/5 rounded-xl py-3 px-4 text-[10px] font-black uppercase tracking-widest outline-none focus:border-primary-blue/50 transition-all cursor-pointer text-slate-600 dark:text-slate-400"
                            >
                                <option value="">Mes (Todos)</option>
                                {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((m, i) => (
                                    <option key={i} value={i}>{m}</option>
                                ))}
                            </select>
                            <select
                                value={paymentFilters.year}
                                onChange={(e) => setPaymentFilters({ ...paymentFilters, year: e.target.value })}
                                className="bg-black/5 dark:bg-background-dark/50 border border-black/5 dark:border-white/5 rounded-xl py-3 px-4 text-[10px] font-black uppercase tracking-widest outline-none focus:border-primary-blue/50 transition-all cursor-pointer text-slate-600 dark:text-slate-400"
                            >
                                <option value="">Año (Todos)</option>
                                {[2024, 2025, 2026].map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                            <select
                                value={paymentFilters.agent}
                                onChange={(e) => setPaymentFilters({ ...paymentFilters, agent: e.target.value })}
                                className="bg-black/5 dark:bg-background-dark/50 border border-black/5 dark:border-white/5 rounded-xl py-3 px-4 text-[10px] font-black uppercase tracking-widest outline-none focus:border-primary-blue/50 transition-all cursor-pointer text-slate-600 dark:text-slate-400"
                            >
                                <option value="">Agente (Todos)</option>
                                {agents.map(a => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Vista de Escritorio */}
                        <div className="hidden md:block bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-[2.5rem] overflow-hidden transition-all shadow-sm dark:shadow-none">
                            <table className="w-full text-left">
                                <thead className="bg-black/5 dark:bg-background-dark/50 border-b border-border-light dark:border-border-dark transition-colors">
                                    <tr>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Gimnasio</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Vendedor / Comisión</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Plan</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Monto</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Fecha</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black/5 dark:divide-white/5 transition-colors">
                                    {(payments || [])
                                        .filter(p => {
                                            const matchesSearch = (p.gyms?.name || '').toLowerCase().includes(paymentFilters.search.toLowerCase());
                                            const date = new Date(p.payment_date);
                                            const matchesMonth = paymentFilters.month === '' || date.getMonth() === parseInt(paymentFilters.month);
                                            const matchesYear = paymentFilters.year === '' || date.getFullYear() === parseInt(paymentFilters.year);
                                            const matchesAgent = paymentFilters.agent === '' || p.gyms?.agent_id === paymentFilters.agent;
                                            return matchesSearch && matchesMonth && matchesYear && matchesAgent;
                                        })
                                        .length === 0 ? (
                                        <tr>
                                            <td colSpan="6" className="px-8 py-20 text-center text-slate-500 font-bold uppercase tracking-widest">No hay pagos registrados o que coincidan con los filtros</td>
                                        </tr>
                                    ) : (
                                        payments
                                            .filter(p => {
                                                const matchesSearch = (p.gyms?.name || '').toLowerCase().includes(paymentFilters.search.toLowerCase());
                                                const date = new Date(p.payment_date);
                                                const matchesMonth = paymentFilters.month === '' || date.getMonth() === parseInt(paymentFilters.month);
                                                const matchesYear = paymentFilters.year === '' || date.getFullYear() === parseInt(paymentFilters.year);
                                                const matchesAgent = paymentFilters.agent === '' || p.gyms?.agent_id === paymentFilters.agent;
                                                return matchesSearch && matchesMonth && matchesYear && matchesAgent;
                                            })
                                            .map(payment => (
                                                <tr key={payment.id} className="hover:bg-black/[0.01] dark:hover:bg-white/[0.02] transition-colors">
                                                    <td className="px-8 py-6">
                                                        <p className="font-black uppercase italic text-sm text-slate-800 dark:text-white transition-colors">{payment.gyms?.name || 'Gimnasio Desconocido'}</p>
                                                        <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">Ref: {payment.transaction_id || 'Manual'}</p>
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        <p className="text-xs font-bold text-slate-700 dark:text-white uppercase italic transition-colors">{payment.gyms?.saas_agents?.name || 'Venta Directa'}</p>
                                                        {payment.agent_commissions?.[0] && (
                                                            <p className="text-[10px] text-primary-blue font-black uppercase mt-1">
                                                                Comisión: {formatCurrency(payment.agent_commissions[0].amount)}
                                                            </p>
                                                        )}
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        <span className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-3 py-1 rounded-lg text-[10px] font-black uppercase text-slate-500 dark:text-slate-300 transition-colors">
                                                            {payment.saas_plans?.name || 'Personalizado'}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        <p className="text-slate-800 dark:text-white font-black italic text-lg transition-colors">{formatCurrency(payment.amount)}</p>
                                                        <p className="text-[9px] text-slate-500 font-bold uppercase">{payment.payment_method}</p>
                                                    </td>
                                                    <td className="px-8 py-6 font-bold text-sm text-slate-400">
                                                        {new Date(payment.payment_date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </td>
                                                    <td className="px-8 py-6 text-right">
                                                        <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest bg-primary/20 text-primary border border-primary/30">
                                                            {payment.status === 'completed' ? 'Completado' : payment.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Vista de Móvil */}
                        <div className="md:hidden space-y-4">
                            {payments
                                .filter(p => {
                                    const matchesSearch = (p.gyms?.name || '').toLowerCase().includes(paymentFilters.search.toLowerCase());
                                    const date = new Date(p.payment_date);
                                    const matchesMonth = paymentFilters.month === '' || date.getMonth() === parseInt(paymentFilters.month);
                                    const matchesYear = paymentFilters.year === '' || date.getFullYear() === parseInt(paymentFilters.year);
                                    const matchesAgent = paymentFilters.agent === '' || p.gyms?.agent_id === paymentFilters.agent;
                                    return matchesSearch && matchesMonth && matchesYear && matchesAgent;
                                })
                                .map(payment => (
                                    <div key={payment.id} className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark p-6 rounded-[2rem] space-y-4 shadow-sm animate-fadeIn">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-black uppercase italic text-sm text-slate-800 dark:text-white leading-tight">{payment.gyms?.name || 'Gimnasio Desconocido'}</p>
                                                <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">Ref: {payment.transaction_id || 'Manual'}</p>
                                            </div>
                                            <span className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest bg-primary/10 text-primary border border-primary/20">
                                                {payment.status === 'completed' ? 'Completado' : payment.status}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 py-3 border-y border-black/5 dark:border-white/5">
                                            <div className="flex flex-col gap-1">
                                                <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Plan / Agente</p>
                                                <p className="text-[10px] font-black text-slate-800 dark:text-white uppercase truncate">{payment.saas_plans?.name || 'Personalizado'}</p>
                                                <p className="text-[9px] text-slate-400 font-bold uppercase italic truncate">{payment.gyms?.saas_agents?.name || 'Venta Directa'}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest mb-1">Monto Pagado</p>
                                                <p className="text-base font-black italic text-slate-800 dark:text-white leading-none">{formatCurrency(payment.amount)}</p>
                                                <p className="text-[8px] text-slate-500 font-bold uppercase mt-1">{payment.payment_method}</p>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-1.5 text-slate-500 font-bold text-[10px] uppercase">
                                                <span className="material-symbols-outlined text-xs">calendar_today</span>
                                                {new Date(payment.payment_date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </div>
                                            {payment.agent_commissions?.[0] && (
                                                <div className="text-right bg-primary-blue/5 px-3 py-1.5 rounded-xl border border-primary-blue/10">
                                                    <p className="text-[7px] font-black text-primary-blue uppercase leading-none mb-1">Comisión</p>
                                                    <p className="text-[10px] text-primary-blue font-black leading-none">{formatCurrency(payment.agent_commissions[0].amount)}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                )}
                {!loading && activeTab === 'agents' && (
                    <div className="space-y-8 animate-fadeIn">
                        <header className="flex justify-between items-end">
                            <div>
                                <h2 className="text-3xl font-black uppercase italic tracking-tight">Fuerza de <span className="text-primary-blue">Ventas (Agentes)</span></h2>
                                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Gestión de comisiones por referidos (20%)</p>
                            </div>
                            <button
                                onClick={() => setShowAddAgentModal(true)}
                                className="bg-primary-blue hover:bg-blue-600 text-white px-8 py-4 rounded-2xl flex items-center gap-3 transition-all font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary-blue/20"
                            >
                                <span className="material-symbols-outlined">person_add</span>
                                Nuevo Agente
                            </button>
                        </header>

                        {/* Vista de Escritorio */}
                        <div className="hidden md:block bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-[2.5rem] overflow-hidden transition-all shadow-sm dark:shadow-none">
                            <table className="w-full text-left">
                                <thead className="bg-black/5 dark:bg-background-dark/50 border-b border-border-light dark:border-border-dark transition-colors">
                                    <tr>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Agente</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Ventas Totales</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">MRR Atribuido</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-primary tracking-widest">Comisión (20%)</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black/5 dark:divide-white/5 transition-colors">
                                    {agents.length === 0 ? (
                                        <tr>
                                            <td colSpan="5" className="px-8 py-20 text-center text-slate-500 font-bold uppercase tracking-widest">No hay agentes registrados</td>
                                        </tr>
                                    ) : agents.map(agent => {
                                        const agentGyms = gyms.filter(g => g.agent_id === agent.id);
                                        const totalMrr = agentGyms.reduce((acc, g) => {
                                            const plan = plans.find(p => p.id === g.plan_id);
                                            return acc + (Number(plan?.price_cop) || 0);
                                        }, 0);
                                        return (
                                            <tr key={agent.id} className="hover:bg-black/[0.01] dark:hover:bg-white/[0.02] transition-colors group">
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center gap-4">
                                                        <div className="size-10 rounded-xl bg-primary-blue/10 text-primary-blue flex items-center justify-center border border-black/5 dark:border-white/5">
                                                            <span className="material-symbols-outlined">account_circle</span>
                                                        </div>
                                                        <div>
                                                            <p className="font-black uppercase italic text-sm text-slate-800 dark:text-white transition-colors">{agent.name}</p>
                                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{agent.email}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 font-bold text-sm text-slate-700 dark:text-white transition-colors">{agentGyms.length} Gyms</td>
                                                <td className="px-8 py-6 font-bold text-sm text-slate-400 dark:text-slate-500 transition-colors">{formatCurrency(totalMrr)}</td>
                                                <td className="px-8 py-6">
                                                    {(() => {
                                                        const pending = (agent.agent_commissions || [])
                                                            .filter(c => c.status === 'pending')
                                                            .reduce((acc, c) => acc + Number(c.amount), 0);
                                                        return (
                                                            <>
                                                                <p className="text-primary font-black italic text-lg">{formatCurrency(pending)}</p>
                                                                <p className="text-[8px] font-black text-slate-500 uppercase">Pendiente de Liquidar</p>
                                                                {pending > 0 && (
                                                                    <button
                                                                        onClick={() => handlePayoutAgent(agent.id)}
                                                                        className="mt-2 flex items-center gap-1 text-[8px] font-black text-primary-blue hover:text-blue-600 dark:hover:text-white uppercase tracking-widest transition-colors"
                                                                    >
                                                                        <span className="material-symbols-outlined text-xs">payments</span>
                                                                        Liquidar saldo
                                                                    </button>
                                                                )}
                                                            </>
                                                        );
                                                    })()}
                                                </td>
                                                <td className="px-8 py-6 text-right">
                                                    <button
                                                        onClick={() => handleViewAgentHistory(agent)}
                                                        className="p-3 hover:bg-black/5 dark:hover:bg-white/5 rounded-2xl text-slate-500 hover:text-primary-blue transition-all"
                                                        title="Ver Historial"
                                                    >
                                                        <span className="material-symbols-outlined text-xl">history</span>
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setEditingAgent(agent);
                                                            setShowEditAgentModal(true);
                                                        }}
                                                        className="p-3 hover:bg-black/5 dark:hover:bg-white/5 rounded-2xl text-slate-500 hover:text-primary-blue transition-all"
                                                        title="Editar Perfil"
                                                    >
                                                        <span className="material-symbols-outlined text-xl">edit_square</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Vista de Móvil */}
                        <div className="md:hidden space-y-4">
                            {agents.map(agent => {
                                const agentGyms = gyms.filter(g => g.agent_id === agent.id);
                                const totalMrr = agentGyms.reduce((acc, g) => {
                                    const plan = plans.find(p => p.id === g.plan_id);
                                    return acc + (Number(plan?.price_cop) || 0);
                                }, 0);
                                const pending = (agent.agent_commissions || [])
                                    .filter(c => c.status === 'pending')
                                    .reduce((acc, c) => acc + Number(c.amount), 0);

                                return (
                                    <div key={agent.id} className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark p-6 rounded-[2rem] space-y-4 shadow-sm animate-fadeIn">
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3">
                                                <div className="size-10 rounded-xl bg-primary-blue/10 text-primary-blue flex items-center justify-center border border-black/5 dark:border-white/5">
                                                    <span className="material-symbols-outlined">account_circle</span>
                                                </div>
                                                <div>
                                                    <p className="font-black uppercase italic text-sm text-slate-800 dark:text-white leading-tight">{agent.name}</p>
                                                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{agent.email}</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => handleViewAgentHistory(agent)} className="p-3 hover:bg-black/5 dark:hover:bg-white/5 rounded-2xl text-slate-500 hover:text-primary-blue transition-all" title="Ver Historial">
                                                    <span className="material-symbols-outlined text-lg">history</span>
                                                </button>
                                                <button onClick={() => { setEditingAgent(agent); setShowEditAgentModal(true); }} className="p-3 hover:bg-black/5 dark:hover:bg-white/5 rounded-2xl text-slate-500 hover:text-primary-blue transition-all" title="Editar Perfil">
                                                    <span className="material-symbols-outlined text-lg">edit_square</span>
                                                </button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-black/5 dark:border-white/5">
                                            <div>
                                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Gyms Asignados</p>
                                                <p className="text-xs font-bold text-slate-700 dark:text-white uppercase italic">{agentGyms.length} Unidades</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">MRR Atribuido</p>
                                                <p className="text-xs font-bold text-primary-blue">{formatCurrency(totalMrr)}</p>
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-black/5 dark:border-white/5 flex justify-between items-center">
                                            <div>
                                                <p className="text-[8px] font-black text-slate-500 uppercase">Comisión Pendiente</p>
                                                <p className="text-primary font-black italic text-xl">
                                                    {formatCurrency(pending)}
                                                </p>
                                            </div>
                                            {pending > 0 && (
                                                <button
                                                    onClick={() => handlePayoutAgent(agent.id)}
                                                    className="px-6 py-3 bg-primary-blue text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-primary-blue/20"
                                                >
                                                    Liquidar
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                {!loading && activeTab === 'pricing' && (
                    <div className="space-y-8 animate-fadeIn">
                        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                            <div>
                                <h2 className="text-3xl md:text-5xl font-black italic uppercase tracking-tighter text-slate-800 dark:text-white">
                                    Planes <span className="text-primary-blue">SaaS</span>
                                </h2>
                                <p className="text-slate-500 text-[10px] md:text-xs font-black uppercase tracking-[0.2em] mt-2">Configuración de suscripciones para gimnasios</p>
                            </div>
                            <button
                                onClick={() => setShowAddPlanModal(true)}
                                className="w-full md:w-auto px-8 py-4 bg-primary-blue text-white rounded-[2rem] font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 hover:shadow-[0_0_40px_rgba(25,127,230,0.4)] transition-all active:scale-95 shadow-xl"
                            >
                                <span className="material-symbols-outlined">add_circle</span>
                                Nuevo Plan
                            </button>
                        </header>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {plans.map(plan => (
                                <div key={plan.id} className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark p-8 rounded-[3rem] space-y-6 shadow-sm hover:shadow-xl hover:border-primary-blue/30 transition-all group relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                                        <span className="material-symbols-outlined text-8xl">diamond</span>
                                    </div>

                                    <div className="flex justify-between items-start relative z-10">
                                        <div>
                                            <p className="text-[10px] font-black text-primary-blue uppercase tracking-widest mb-1">Plan de Suscripción</p>
                                            <h3 className="text-2xl font-black uppercase italic text-slate-800 dark:text-white leading-tight">{plan.name}</h3>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => { setEditingPlan(plan); setShowEditPlanModal(true); }}
                                                className="size-10 rounded-xl bg-black/5 dark:bg-white/5 flex items-center justify-center text-slate-500 hover:text-primary-blue transition-all"
                                            >
                                                <span className="material-symbols-outlined text-sm">edit</span>
                                            </button>
                                            <button
                                                onClick={() => handleDeletePlan(plan.id)}
                                                className="size-10 rounded-xl bg-black/5 dark:bg-white/5 flex items-center justify-center text-slate-500 hover:text-red-500 transition-all"
                                            >
                                                <span className="material-symbols-outlined text-sm">delete</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-4xl font-black italic text-slate-800 dark:text-white">{formatCurrency(plan.price_cop)}</span>
                                            <span className="text-[10px] font-black text-slate-500 uppercase">/ {plan.duration_days} días</span>
                                        </div>
                                        <div className="flex items-center gap-3 py-3 px-4 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5">
                                            <span className="material-symbols-outlined text-primary-blue text-lg">groups</span>
                                            <span className="text-[10px] font-black text-slate-600 dark:text-white uppercase tracking-widest">{plan.gym_limit || 'Sin límite de socios'}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {/* Modal: Registrar Gimnasio */}
                {
                    showAddModal && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                            <div className="absolute inset-0 bg-slate-900/60 dark:bg-background-dark/95 backdrop-blur-md transition-all" onClick={() => setShowAddModal(false)}></div>
                            <div className="relative bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark w-full max-w-3xl rounded-[2rem] md:rounded-[3rem] shadow-2xl overflow-hidden animate-fadeInUp transition-colors max-h-[95vh] overflow-y-auto">
                                <header className="bg-black/5 dark:bg-background-dark/50 p-6 md:p-10 border-b border-border-light dark:border-border-dark flex justify-between items-center transition-colors">
                                    <div>
                                        <h3 className="text-xl md:text-3xl font-black italic uppercase tracking-tighter text-slate-800 dark:text-white transition-colors">Nuevo <span className="text-primary-blue">Gimnasio Partner</span></h3>
                                        <p className="text-slate-500 text-[8px] md:text-[10px] font-black uppercase tracking-widest mt-1">Configuración inicial de cuenta corporativa</p>
                                    </div>
                                    <button onClick={() => setShowAddModal(false)} className="text-slate-500 hover:text-white transition-colors"><span className="material-symbols-outlined text-2xl md:text-4xl">close</span></button>
                                </header>

                                <form onSubmit={handleAddGym} className="p-6 md:p-10 space-y-6 md:space-y-8">
                                    {error && (
                                        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3">
                                            <span className="material-symbols-outlined text-red-500">error</span>
                                            <p className="text-red-500 text-xs font-bold uppercase tracking-widest">{error}</p>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre Comercial</label>
                                            <input
                                                required
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-3 md:py-4 px-4 md:px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white"
                                                placeholder="Ej: Iron Fitness Center"
                                                value={newGymData.name}
                                                onChange={e => setNewGymData({ ...newGymData, name: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Dueño / Representante</label>
                                            <input
                                                required
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white"
                                                placeholder="Nombre del propietario"
                                                value={newGymData.owner}
                                                onChange={e => setNewGymData({ ...newGymData, owner: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Email de Acceso Gym</label>
                                            <input
                                                type="email"
                                                required
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white"
                                                placeholder="admin@gym.com"
                                                value={newGymData.email}
                                                onChange={e => setNewGymData({ ...newGymData, email: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Contraseña Provisional</label>
                                            <input
                                                type="password"
                                                required
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-3 md:py-4 px-4 md:px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white"
                                                placeholder="••••••••"
                                                value={newGymData.password}
                                                onChange={e => setNewGymData({ ...newGymData, password: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha de Alta</label>
                                            <input
                                                type="date"
                                                required
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-3 md:py-4 px-4 md:px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white"
                                                value={newGymData.startDate}
                                                onChange={e => setNewGymData({ ...newGymData, startDate: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Suscripción SaaS</label>
                                            <select
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-3 md:py-4 px-4 md:px-6 text-sm focus:border-primary-blue outline-none transition-all appearance-none text-slate-800 dark:text-white"
                                                value={newGymData.planId}
                                                onChange={e => setNewGymData({ ...newGymData, planId: e.target.value })}
                                            >
                                                {plans.map(p => (
                                                    <option key={p.id} value={p.id}>{p.name} - {formatCurrency(p.price_cop)}/mes</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Agente Vendedor (20% Com.)</label>
                                            <select
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all appearance-none text-slate-800 dark:text-white transition-colors"
                                                value={newGymData.agentId}
                                                onChange={e => setNewGymData({ ...newGymData, agentId: e.target.value })}
                                            >
                                                <option value="">Venta Directa (Sin Agente)</option>
                                                {agents.map(a => (
                                                    <option key={a.id} value={a.id}>{a.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="bg-primary-blue/5 border border-primary-blue/20 rounded-[1.5rem] md:rounded-3xl p-4 md:p-6 flex justify-between items-center text-center">
                                        <div>
                                            <p className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Inicia</p>
                                            <p className="text-sm md:text-lg font-black italic">{new Date(newGymData.startDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}</p>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="material-symbols-outlined text-primary-blue text-lg md:text-2xl">arrow_forward</span>
                                            <p className="text-[7px] md:text-[8px] font-black text-primary-blue uppercase tracking-widest">
                                                {plans.find(p => p.id === newGymData.planId)?.duration_days || 30} Días
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[8px] md:text-[10px] font-black text-primary-blue uppercase tracking-widest mb-1">Vence SaaS</p>
                                            <p className="text-sm md:text-lg font-black italic text-primary-blue">{new Date(newGymData.endDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                        </div>
                                    </div>


                                    <button type="submit" disabled={loading} className="w-full bg-primary-blue text-white font-black py-5 rounded-[2rem] uppercase tracking-widest hover:shadow-[0_0_40px_rgba(25,127,230,0.4)] transition-all flex items-center justify-center gap-3 active:scale-95 shadow-xl disabled:opacity-50 disabled:cursor-not-allowed">
                                        {loading ? 'Procesando...' : 'Activar Licencia SaaS'}
                                        <span className="material-symbols-outlined">{loading ? 'sync' : 'rocket_launch'}</span>
                                    </button>
                                </form>
                            </div>
                        </div>
                    )
                }
                {/* Modal: Editar Gimnasio */}
                {
                    showEditModal && editingGym && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                            <div className="absolute inset-0 bg-slate-900/60 dark:bg-background-dark/95 backdrop-blur-md transition-all" onClick={() => setShowEditModal(false)}></div>
                            <div className="relative bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark w-full max-w-2xl rounded-[2rem] md:rounded-[3rem] shadow-2xl overflow-hidden animate-fadeInUp transition-colors max-h-[95vh] overflow-y-auto">
                                <header className="bg-black/5 dark:bg-background-dark/50 p-6 md:p-10 border-b border-border-light dark:border-border-dark flex justify-between items-center transition-colors">
                                    <div>
                                        <h3 className="text-xl md:text-3xl font-black italic uppercase tracking-tighter text-slate-800 dark:text-white transition-colors">Editar <span className="text-primary-blue">Gimnasio</span></h3>
                                        <p className="text-slate-500 text-[8px] md:text-[10px] font-black uppercase tracking-widest mt-1">ID: {editingGym.id}</p>
                                    </div>
                                    <button onClick={() => setShowEditModal(false)} className="text-slate-500 hover:text-white transition-colors"><span className="material-symbols-outlined text-2xl md:text-4xl">close</span></button>
                                </header>

                                <form onSubmit={handleUpdateGym} className="p-6 md:p-10 space-y-4 md:space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nombre del Negocio</label>
                                            <input
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white transition-colors"
                                                value={editingGym.name}
                                                onChange={e => setEditingGym({ ...editingGym, name: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nombre del Dueño</label>
                                            <input
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white transition-colors"
                                                value={editingGym.owner}
                                                onChange={e => setEditingGym({ ...editingGym, owner: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Plan SaaS Activo</label>
                                            <select
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white transition-colors"
                                                value={editingGym.plan_id}
                                                onChange={e => setEditingGym({ ...editingGym, plan_id: e.target.value })}
                                            >
                                                {plans.map(p => (
                                                    <option key={p.id} value={p.id}>{p.name} - {formatCurrency(p.price_cop)}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Estado</label>
                                            <select
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white transition-colors"
                                                value={editingGym.status}
                                                onChange={e => setEditingGym({ ...editingGym, status: e.target.value })}
                                            >
                                                <option value="active">Activo</option>
                                                <option value="inactive">Inactivo</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Fecha Inicio</label>
                                            <input
                                                type="date"
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-3 md:py-4 px-4 md:px-6 text-sm text-slate-800 dark:text-white"
                                                value={editingGym.startDate}
                                                onChange={e => setEditingGym({ ...editingGym, startDate: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Fecha Vencimiento</label>
                                            <input
                                                type="date"
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-3 md:py-4 px-4 md:px-6 text-sm text-slate-800 dark:text-white"
                                                value={editingGym.endDate}
                                                onChange={e => setEditingGym({ ...editingGym, endDate: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Email de Acceso</label>
                                            <input
                                                type="email"
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white transition-colors"
                                                value={editingGym.admin_email}
                                                onChange={e => setEditingGym({ ...editingGym, admin_email: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nueva Contraseña (Opcional)</label>
                                            <input
                                                type="password"
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white transition-colors"
                                                placeholder="Dejar vacío para no cambiar"
                                                value={editingGym.admin_new_password}
                                                onChange={e => setEditingGym({ ...editingGym, admin_new_password: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Agente Vendedor</label>
                                            <select
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white transition-colors"
                                                value={editingGym.agent_id || ''}
                                                onChange={e => setEditingGym({ ...editingGym, agent_id: e.target.value })}
                                            >
                                                <option value="">Venta Directa (Sin Agente)</option>
                                                {agents.map(a => (
                                                    <option key={a.id} value={a.id}>{a.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <button type="submit" disabled={loading} className="w-full bg-primary-blue text-white font-black py-5 rounded-[2rem] uppercase tracking-widest hover:shadow-[0_0_40px_rgba(25,127,230,0.4)] transition-all active:scale-95 shadow-xl disabled:opacity-50">
                                        {loading ? 'Guardando...' : 'Actualizar Información'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    )
                }

                {/* Modal: Nuevo Plan SaaS */}
                {
                    showAddPlanModal && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                            <div className="absolute inset-0 bg-slate-900/60 dark:bg-background-dark/95 backdrop-blur-md transition-all" onClick={() => setShowAddPlanModal(false)}></div>
                            <div className="relative bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark w-full max-w-xl rounded-[2rem] md:rounded-[3rem] shadow-2xl overflow-hidden animate-fadeInUp transition-colors max-h-[95vh] overflow-y-auto">
                                <header className="bg-black/5 dark:bg-background-dark/50 p-6 md:p-10 border-b border-border-light dark:border-border-dark flex justify-between items-center transition-colors">
                                    <div>
                                        <h3 className="text-xl md:text-3xl font-black italic uppercase tracking-tighter text-slate-800 dark:text-white transition-colors">Crear <span className="text-primary-blue">Plan SaaS</span></h3>
                                        <p className="text-slate-500 text-[8px] md:text-[10px] font-black uppercase tracking-widest mt-1">Configuración de nueva tarifa de suscripción</p>
                                    </div>
                                    <button onClick={() => setShowAddPlanModal(false)} className="text-slate-500 hover:text-white transition-colors"><span className="material-symbols-outlined text-2xl md:text-4xl">close</span></button>
                                </header>

                                <form onSubmit={handleAddPlan} className="p-6 md:p-10 space-y-4 md:space-y-6">
                                    <div className="grid grid-cols-1 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre del Plan</label>
                                            <input
                                                required
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white transition-colors"
                                                placeholder="Ej: Plan Profesional"
                                                value={newPlanData.name}
                                                onChange={e => setNewPlanData({ ...newPlanData, name: e.target.value })}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Precio (COP)</label>
                                                <input
                                                    type="number"
                                                    required
                                                    className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white transition-colors"
                                                    value={newPlanData.price_cop}
                                                    onChange={e => setNewPlanData({ ...newPlanData, price_cop: Number(e.target.value) })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Duración (Días)</label>
                                                <input
                                                    type="number"
                                                    required
                                                    className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white transition-colors"
                                                    value={newPlanData.duration_days}
                                                    onChange={e => setNewPlanData({ ...newPlanData, duration_days: Number(e.target.value) })}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Límite de Socios (Texto)</label>
                                            <input
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white transition-colors"
                                                placeholder="Ej: Hasta 500 socios"
                                                value={newPlanData.gym_limit}
                                                onChange={e => setNewPlanData({ ...newPlanData, gym_limit: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <button type="submit" disabled={loading} className="w-full bg-primary-blue text-white font-black py-5 rounded-[2rem] uppercase tracking-widest hover:shadow-[0_0_40px_rgba(25,127,230,0.4)] transition-all flex items-center justify-center gap-3 active:scale-95 shadow-xl disabled:opacity-50">
                                        {loading ? 'Creando...' : 'Publicar Plan'}
                                        <span className="material-symbols-outlined">add_task</span>
                                    </button>
                                </form>
                            </div>
                        </div>
                    )
                }

                {/* Modal: Editar Plan SaaS */}
                {
                    showEditPlanModal && editingPlan && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                            <div className="absolute inset-0 bg-slate-900/60 dark:bg-background-dark/95 backdrop-blur-md transition-all" onClick={() => setShowEditPlanModal(false)}></div>
                            <div className="relative bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark w-full max-w-xl rounded-[2rem] md:rounded-[3rem] shadow-2xl overflow-hidden animate-fadeInUp transition-colors max-h-[95vh] overflow-y-auto">
                                <header className="bg-black/5 dark:bg-background-dark/50 p-6 md:p-10 border-b border-border-light dark:border-border-dark flex justify-between items-center transition-colors">
                                    <div>
                                        <h3 className="text-xl md:text-3xl font-black italic uppercase tracking-tighter text-slate-800 dark:text-white transition-colors">Editar <span className="text-primary-blue">Tarifa</span></h3>
                                        <p className="text-slate-500 text-[8px] md:text-[10px] font-black uppercase tracking-widest mt-1">Sincronización en tiempo real con el ecosistema</p>
                                    </div>
                                    <button onClick={() => setShowEditPlanModal(false)} className="text-slate-500 hover:text-white transition-colors"><span className="material-symbols-outlined text-2xl md:text-4xl">close</span></button>
                                </header>

                                <form onSubmit={handleUpdatePlan} className="p-6 md:p-10 space-y-4 md:space-y-6">
                                    <div className="grid grid-cols-1 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre del Plan</label>
                                            <input
                                                required
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white transition-colors"
                                                value={editingPlan.name}
                                                onChange={e => setEditingPlan({ ...editingPlan, name: e.target.value })}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Precio (COP)</label>
                                                <input
                                                    type="number"
                                                    required
                                                    className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white transition-colors"
                                                    value={editingPlan.price_cop}
                                                    onChange={e => setEditingPlan({ ...editingPlan, price_cop: Number(e.target.value) })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Duración (Días)</label>
                                                <input
                                                    type="number"
                                                    required
                                                    className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white transition-colors"
                                                    value={editingPlan.duration_days}
                                                    onChange={e => setEditingPlan({ ...editingPlan, duration_days: Number(e.target.value) })}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Límite de Socios (Texto)</label>
                                            <input
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white transition-colors"
                                                value={editingPlan.gym_limit}
                                                onChange={e => setEditingPlan({ ...editingPlan, gym_limit: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <button type="submit" disabled={loading} className="w-full bg-primary-blue text-white font-black py-5 rounded-[2rem] uppercase tracking-widest hover:shadow-[0_0_40px_rgba(25,127,230,0.4)] transition-all flex items-center justify-center gap-3 active:scale-95 shadow-xl disabled:opacity-50">
                                        {loading ? 'Actualizando...' : 'Guardar Cambios'}
                                        <span className="material-symbols-outlined">save</span>
                                    </button>
                                </form>
                            </div>
                        </div>
                    )
                }

                {/* Modal: Nuevo Agente */}
                {
                    showAddAgentModal && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                            <div className="absolute inset-0 bg-slate-900/60 dark:bg-background-dark/95 backdrop-blur-md transition-all" onClick={() => setShowAddAgentModal(false)}></div>
                            <div className="relative bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark w-full max-w-xl rounded-[2rem] md:rounded-[3rem] shadow-2xl overflow-hidden animate-fadeInUp transition-colors max-h-[95vh] overflow-y-auto">
                                <header className="bg-black/5 dark:bg-background-dark/50 p-6 md:p-10 border-b border-border-light dark:border-border-dark flex justify-between items-center transition-colors">
                                    <div>
                                        <h3 className="text-xl md:text-3xl font-black italic uppercase tracking-tighter text-slate-800 dark:text-white transition-colors">Nuevo <span className="text-primary-blue">Agente</span></h3>
                                        <p className="text-slate-500 text-[8px] md:text-[10px] font-black uppercase tracking-widest mt-1">Gana 20% por cada gimnasio referido</p>
                                    </div>
                                    <button onClick={() => setShowAddAgentModal(false)} className="text-slate-500 hover:text-white transition-colors"><span className="material-symbols-outlined text-2xl md:text-4xl">close</span></button>
                                </header>

                                <form onSubmit={handleAddAgent} className="p-6 md:p-10 space-y-4 md:space-y-6">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre Completo</label>
                                            <input
                                                required
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white transition-colors"
                                                placeholder="Ej: Juan Pérez"
                                                value={newAgentData.name}
                                                onChange={e => setNewAgentData({ ...newAgentData, name: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Email de Contacto</label>
                                            <input
                                                type="email"
                                                required
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white transition-colors"
                                                placeholder="correo@ejemplo.com"
                                                value={newAgentData.email}
                                                onChange={e => setNewAgentData({ ...newAgentData, email: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Contraseña de Acceso</label>
                                            <input
                                                type="password"
                                                required
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white transition-colors"
                                                placeholder="••••••••"
                                                value={newAgentData.password}
                                                onChange={e => setNewAgentData({ ...newAgentData, password: e.target.value })}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Teléfono</label>
                                                <input
                                                    className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm text-slate-800 dark:text-white transition-colors"
                                                    placeholder="300..."
                                                    value={newAgentData.phone}
                                                    onChange={e => setNewAgentData({ ...newAgentData, phone: e.target.value })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">% Comisión</label>
                                                <input
                                                    type="number"
                                                    className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm text-slate-800 dark:text-white transition-colors"
                                                    value={newAgentData.commission_rate}
                                                    onChange={e => setNewAgentData({ ...newAgentData, commission_rate: Number(e.target.value) })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <button type="submit" disabled={loading} className="w-full bg-primary-blue text-white font-black py-5 rounded-[2rem] uppercase tracking-widest hover:shadow-[0_0_40px_rgba(25,127,230,0.4)] transition-all">
                                        {loading ? 'Creando...' : 'Registrar Agente'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    )
                }

                {/* Modal: Editar Agente */}
                {
                    showEditAgentModal && editingAgent && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                            <div className="absolute inset-0 bg-slate-900/60 dark:bg-background-dark/95 backdrop-blur-md transition-all" onClick={() => setShowEditAgentModal(false)}></div>
                            <div className="relative bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark w-full max-w-xl rounded-[2rem] md:rounded-[3rem] shadow-2xl overflow-hidden animate-fadeInUp transition-colors max-h-[95vh] overflow-y-auto">
                                <header className="bg-black/5 dark:bg-background-dark/50 p-6 md:p-10 border-b border-border-light dark:border-border-dark flex justify-between items-center transition-colors">
                                    <h3 className="text-xl md:text-3xl font-black italic uppercase tracking-tighter text-slate-800 dark:text-white transition-colors">Editar <span className="text-primary-blue">Agente</span></h3>
                                    <button onClick={() => setShowEditAgentModal(false)} className="text-slate-500 hover:text-white"><span className="material-symbols-outlined text-2xl md:text-4xl">close</span></button>
                                </header>
                                <form onSubmit={handleUpdateAgent} className="p-6 md:p-10 space-y-4 md:space-y-6">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre Completo</label>
                                            <input
                                                required
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white transition-colors"
                                                value={editingAgent.name}
                                                onChange={e => setEditingAgent({ ...editingAgent, name: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Email</label>
                                            <input
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm text-slate-800 dark:text-white transition-colors"
                                                value={editingAgent.email}
                                                onChange={e => setEditingAgent({ ...editingAgent, email: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nueva Contraseña (Opcional)</label>
                                            <input
                                                type="password"
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm text-slate-800 dark:text-white transition-colors"
                                                placeholder="Dejar en blanco para no cambiar"
                                                value={editingAgent.new_password || ''}
                                                onChange={e => setEditingAgent({ ...editingAgent, new_password: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">% Comisión</label>
                                            <input
                                                type="number"
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm text-slate-800 dark:text-white transition-colors"
                                                value={editingAgent.commission_rate}
                                                onChange={e => setEditingAgent({ ...editingAgent, commission_rate: Number(e.target.value) })}
                                            />
                                        </div>
                                    </div>
                                    <button type="submit" disabled={loading} className="w-full bg-primary-blue text-white font-black py-5 rounded-[2rem] uppercase tracking-widest hover:shadow-[0_0_40px_rgba(25,127,230,0.4)] transition-all">
                                        {loading ? 'Actualizando...' : 'Guardar Cambios'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    )
                }

                {/* Modal: Registrar Pago / Renovar */}
                {
                    showPaymentModal && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                            <div className="absolute inset-0 bg-slate-900/60 dark:bg-background-dark/95 backdrop-blur-md transition-all" onClick={() => setShowPaymentModal(false)}></div>
                            <div className="relative bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark w-full max-w-2xl rounded-[2rem] md:rounded-[3rem] shadow-2xl overflow-hidden animate-fadeInUp transition-colors max-h-[95vh] overflow-y-auto">
                                <header className="bg-black/5 dark:bg-background-dark/50 p-6 md:p-10 border-b border-border-light dark:border-border-dark flex justify-between items-center transition-colors">
                                    <div>
                                        <h3 className="text-xl md:text-3xl font-black italic uppercase tracking-tighter text-slate-800 dark:text-white transition-colors">Registrar <span className="text-primary-blue">Pago SaaS</span></h3>
                                        <p className="text-slate-500 text-[8px] md:text-[10px] font-black uppercase tracking-widest mt-1">Renovación de Licencia y Auditoría</p>
                                    </div>
                                    <button onClick={() => setShowPaymentModal(false)} className="text-slate-500 hover:text-white transition-colors"><span className="material-symbols-outlined text-2xl md:text-4xl">close</span></button>
                                </header>

                                <form onSubmit={handleRecordPayment} className="p-6 md:p-10 space-y-4 md:space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Plan a Renovar</label>
                                            <select
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all appearance-none text-slate-800 dark:text-white transition-colors"
                                                value={newPaymentData.plan_id}
                                                onChange={e => {
                                                    const plan = plans.find(p => p.id === e.target.value);
                                                    setNewPaymentData({ ...newPaymentData, plan_id: e.target.value, amount: plan?.price_cop || 0 });
                                                }}
                                            >
                                                <option value="">Seleccionar Plan</option>
                                                {plans.map(p => (
                                                    <option key={p.id} value={p.id}>{p.name} - {formatCurrency(p.price_cop)}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Monto Recibido (COP)</label>
                                            <input
                                                type="number"
                                                required
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white transition-colors"
                                                value={newPaymentData.amount}
                                                onChange={e => setNewPaymentData({ ...newPaymentData, amount: Number(e.target.value) })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Método de Pago</label>
                                            <select
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all appearance-none text-slate-800 dark:text-white transition-colors"
                                                value={newPaymentData.payment_method}
                                                onChange={e => setNewPaymentData({ ...newPaymentData, payment_method: e.target.value })}
                                            >
                                                <option value="transferencia">Transferencia Bancaria</option>
                                                <option value="efectivo">Efectivo / Corresponsal</option>
                                                <option value="wompi">Link de Pago (Wompi)</option>
                                                <option value="stripe">Tarjeta (Stripe)</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">ID de Transacción / Referencia</label>
                                            <input
                                                className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all text-slate-800 dark:text-white transition-colors"
                                                placeholder="Cód. de aprobación o referencia"
                                                value={newPaymentData.transaction_id}
                                                onChange={e => setNewPaymentData({ ...newPaymentData, transaction_id: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Notas Internas</label>
                                        <textarea
                                            className="w-full bg-black/5 dark:bg-background-dark border-2 border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary-blue outline-none transition-all h-24 resize-none text-slate-800 dark:text-white transition-colors"
                                            placeholder="Detalles adicionales del pago..."
                                            value={newPaymentData.notes}
                                            onChange={e => setNewPaymentData({ ...newPaymentData, notes: e.target.value })}
                                        />
                                    </div>

                                    <div className="bg-primary/5 border border-primary/20 p-6 rounded-3xl flex items-start gap-4">
                                        <span className="material-symbols-outlined text-primary">info</span>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed tracking-widest">
                                            Al registrar este pago, la licencia del gimnasio se extenderá automáticamente según la duración del plan seleccionado ({plans.find(p => p.id === newPaymentData.plan_id)?.duration_days || 30} días).
                                        </p>
                                    </div>

                                    <button type="submit" disabled={loading} className="w-full bg-primary text-background-dark font-black py-5 rounded-[2rem] uppercase tracking-widest hover:shadow-[0_0_40px_rgba(13,242,89,0.3)] transition-all flex items-center justify-center gap-3 active:scale-95">
                                        {loading ? 'Procesando...' : 'Confirmar Registro de Pago'}
                                        <span className="material-symbols-outlined">receipt_long</span>
                                    </button>
                                </form>
                            </div>
                        </div>
                    )
                }

                {/* Modal Historial de Pagos Detallado por Gym */}
                {
                    selectedGymHistory && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-12">
                            <div className="absolute inset-0 bg-slate-900/60 dark:bg-background-dark/95 backdrop-blur-md transition-all" onClick={() => setSelectedGymHistory(null)}></div>
                            <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-white/5 w-full max-w-5xl rounded-[3rem] overflow-hidden relative shadow-2xl animate-scaleUp transition-colors">
                                {/* Header */}
                                <div className="p-10 border-b border-border-light dark:border-white/5 bg-black/5 dark:bg-background-dark/30 flex justify-between items-center transition-colors">
                                    <div>
                                        <h3 className="text-3xl font-black uppercase italic tracking-tighter text-slate-800 dark:text-white transition-colors">Bitácora de <span className="text-primary-blue">Pagos SaaS</span></h3>
                                        <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">Gimnasio: {selectedGymHistory.gym.name}</p>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="hidden md:flex flex-col items-end">
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Estado Actual</span>
                                            <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase italic ${selectedGymHistory.gym.status === 'active' ? 'bg-primary/10 text-primary' : 'bg-red-500/10 text-red-500'}`}>
                                                {selectedGymHistory.gym.status === 'active' ? 'Suscripción Activa' : 'Suscripción Vencida'}
                                            </span>
                                        </div>
                                        <button onClick={() => setSelectedGymHistory(null)} className="size-12 rounded-2xl bg-white/5 flex items-center justify-center text-slate-500 hover:text-white hover:bg-red-500/20 transition-all font-black">
                                            <span className="material-symbols-outlined">close</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Table Content */}
                                <div className="max-h-[60vh] overflow-y-auto p-10">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="text-[9px] font-black uppercase text-slate-500 tracking-[0.2em] border-b border-white/5">
                                                <th className="pb-6 px-4">Fecha Pago</th>
                                                <th className="pb-6 px-4">Plan / Ciclo</th>
                                                <th className="pb-6 px-4">Monto</th>
                                                <th className="pb-6 px-4">Periodo</th>
                                                <th className="pb-6 px-4">Vencimiento</th>
                                                <th className="pb-6 px-4 text-right">Referencia</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {selectedGymHistory.history.length === 0 ? (
                                                <tr>
                                                    <td colSpan="6" className="py-24 text-center">
                                                        <div className="flex flex-col items-center gap-4 text-slate-600">
                                                            <span className="material-symbols-outlined text-6xl opacity-20">history_toggle_off</span>
                                                            <p className="font-black uppercase tracking-widest italic">Sin registros históricos de cobranza</p>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : (
                                                selectedGymHistory.history.map(pay => {
                                                    const pDate = new Date(pay.payment_date);
                                                    const duration = pay.saas_plans?.duration_days || 30;
                                                    const expiry = new Date(pDate);
                                                    expiry.setDate(expiry.getDate() + duration);

                                                    return (
                                                        <tr key={pay.id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-all group border-b border-transparent hover:border-black/5 dark:hover:border-white/5">
                                                            <td className="py-6 px-4">
                                                                <span className="font-bold text-slate-800 dark:text-white text-sm">
                                                                    {pDate.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                                </span>
                                                                <p className="text-[8px] text-slate-500 font-bold uppercase mt-1">Hora: {pDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                            </td>
                                                            <td className="py-6 px-4">
                                                                <p className="font-black uppercase italic text-sm text-primary-blue leading-none mb-1">
                                                                    {pay.saas_plans?.name || 'Plan Custom'}
                                                                </p>
                                                                <span className="text-[8px] bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-2 py-0.5 rounded text-slate-500 dark:text-slate-400 font-black uppercase">
                                                                    SaaS
                                                                </span>
                                                            </td>
                                                            <td className="py-6 px-4">
                                                                <span className="font-black text-slate-800 dark:text-white italic text-base">{formatCurrency(pay.amount)}</span>
                                                                <p className="text-[8px] text-slate-500 font-bold uppercase tracking-tighter">{pay.payment_method}</p>
                                                            </td>
                                                            <td className="py-6 px-4">
                                                                <div className="flex flex-col">
                                                                    <span className="text-slate-800 dark:text-white font-bold text-xs">{duration} Días</span>
                                                                    <span className="text-[8px] text-slate-500 font-black uppercase italic">Duración total</span>
                                                                </div>
                                                            </td>
                                                            <td className="py-6 px-4">
                                                                <div className="flex flex-col">
                                                                    <span className={`text-xs font-black italic ${new Date() > expiry ? 'text-red-500/60' : 'text-primary'}`}>
                                                                        {expiry.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                                    </span>
                                                                    <span className="text-[8px] text-slate-500 font-black uppercase">Fecha Corte</span>
                                                                </div>
                                                            </td>
                                                            <td className="py-6 px-4 text-right">
                                                                <div className="flex items-center justify-end gap-2 group/ref">
                                                                    <span className="text-[9px] text-slate-600 font-mono truncate max-w-[100px] group-hover/ref:text-slate-400 transition-colors">
                                                                        {pay.transaction_id || pay.id.split('-')[0]}
                                                                    </span>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            navigator.clipboard.writeText(pay.transaction_id || pay.id);
                                                                            const btn = e.currentTarget;
                                                                            const original = btn.innerHTML;
                                                                            btn.innerHTML = '<span class="material-symbols-outlined text-xs text-primary">check</span>';
                                                                            setTimeout(() => btn.innerHTML = original, 2000);
                                                                        }}
                                                                        className="p-2 hover:bg-white/5 rounded-lg text-slate-600 hover:text-white transition-all active:scale-90"
                                                                        title="Copiar Referencia"
                                                                    >
                                                                        <span className="material-symbols-outlined text-sm">content_copy</span>
                                                                    </button>
                                                                </div>
                                                                <p className="text-[7px] text-slate-700 font-black uppercase mt-1">ID Único Transacción</p>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Footer Summary */}
                                <div className="p-10 bg-black/5 dark:bg-background-dark/30 flex flex-col md:flex-row justify-between items-center gap-6 transition-colors">
                                    <div className="flex gap-12">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total histórico</span>
                                            <span className="text-2xl font-black text-primary italic">
                                                {formatCurrency(selectedGymHistory.history.reduce((acc, p) => acc + Number(p.amount), 0))}
                                            </span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Pagos totales</span>
                                            <span className="text-2xl font-black text-slate-800 dark:text-white italic">
                                                {selectedGymHistory.history.length} <span className="text-[10px] text-slate-500">Ciclos</span>
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 w-full md:w-auto">
                                        <button onClick={() => setSelectedGymHistory(null)} className="flex-1 md:flex-none px-12 py-5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/5 dark:border-white/5 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all">
                                            Cerrar Bitácora
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Modal Historial de Comisiones por Agente */}
                {selectedAgentHistory && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-12">
                        <div className="absolute inset-0 bg-slate-900/60 dark:bg-background-dark/95 backdrop-blur-md transition-all" onClick={() => setSelectedAgentHistory(null)}></div>
                        <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-white/5 w-full max-w-5xl rounded-[3rem] overflow-hidden relative shadow-2xl animate-scaleUp transition-colors max-h-[90vh] flex flex-col">
                            {/* Header */}
                            <div className="p-10 border-b border-border-light dark:border-white/5 bg-black/5 dark:bg-background-dark/30 flex justify-between items-center transition-colors">
                                <div>
                                    <h3 className="text-3xl font-black uppercase italic tracking-tighter text-slate-800 dark:text-white transition-colors">Historial de <span className="text-primary-blue">Comisiones</span></h3>
                                    <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">Agente: {selectedAgentHistory.agent.name}</p>
                                </div>
                                <button onClick={() => setSelectedAgentHistory(null)} className="size-12 rounded-2xl bg-white/5 flex items-center justify-center text-slate-500 hover:text-white hover:bg-red-500/20 transition-all font-black">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            {/* Table Content */}
                            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="text-[9px] font-black uppercase text-slate-500 tracking-[0.2em] border-b border-white/5">
                                            <th className="pb-6 px-4">Fecha Registro</th>
                                            <th className="pb-6 px-4">Gimnasio</th>
                                            <th className="pb-6 px-4">Monto Comisión</th>
                                            <th className="pb-6 px-4">Estado</th>
                                            <th className="pb-6 px-4 text-right">Referencia Pago</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {selectedAgentHistory.history.length === 0 ? (
                                            <tr>
                                                <td colSpan="5" className="py-24 text-center">
                                                    <div className="flex flex-col items-center gap-4 text-slate-600">
                                                        <span className="material-symbols-outlined text-6xl opacity-20">history_toggle_off</span>
                                                        <p className="font-black uppercase tracking-widest italic">Sin registros de comisiones</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            selectedAgentHistory.history.map(item => {
                                                const createdAt = new Date(item.created_at);
                                                return (
                                                    <tr key={item.id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-all group border-b border-transparent hover:border-black/5 dark:hover:border-white/5">
                                                        <td className="py-6 px-4">
                                                            <span className="font-bold text-slate-800 dark:text-white text-sm">
                                                                {createdAt.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                            </span>
                                                            <p className="text-[8px] text-slate-500 font-bold uppercase mt-1">ID: {item.id.split('-')[0]}</p>
                                                        </td>
                                                        <td className="py-6 px-4">
                                                            <p className="font-black uppercase italic text-sm text-primary-blue leading-none mb-1">
                                                                {item.gyms?.name || 'Gimnasio'}
                                                            </p>
                                                            <span className="text-[8px] bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-2 py-0.5 rounded text-slate-500 dark:text-slate-400 font-black uppercase">
                                                                Partner
                                                            </span>
                                                        </td>
                                                        <td className="py-6 px-4">
                                                            <span className="font-black text-slate-800 dark:text-white italic text-base">{formatCurrency(item.amount)}</span>
                                                            <p className="text-[8px] text-slate-500 font-bold uppercase tracking-tighter">Comisión Devengada</p>
                                                        </td>
                                                        <td className="py-6 px-4">
                                                            <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest italic border ${item.status === 'paid' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                                                                {item.status === 'paid' ? 'Liquidado' : 'Pendiente'}
                                                            </span>
                                                        </td>
                                                        <td className="py-6 px-4 text-right">
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-slate-800 dark:text-white font-bold text-xs">
                                                                    {item.gym_payments?.transaction_id || 'N/A'}
                                                                </span>
                                                                <span className="text-[8px] text-slate-500 font-black uppercase">Transacción Origen</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer Summary */}
                            <div className="p-10 bg-black/5 dark:bg-background-dark/30 flex flex-col md:flex-row justify-between items-center gap-6 transition-colors">
                                <div className="flex gap-12">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total Devengado</span>
                                        <span className="text-2xl font-black text-primary italic">
                                            {formatCurrency(selectedAgentHistory.history.reduce((acc, item) => acc + Number(item.amount), 0))}
                                        </span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Saldo Pendiente</span>
                                        <span className="text-2xl font-black text-amber-500 italic">
                                            {formatCurrency(selectedAgentHistory.history.filter(i => i.status === 'pending').reduce((acc, item) => acc + Number(item.amount), 0))}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex gap-4 w-full md:w-auto">
                                    <button onClick={() => setSelectedAgentHistory(null)} className="flex-1 md:flex-none px-12 py-5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/5 dark:border-white/5 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all">
                                        Cerrar Historial
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </main>
        </div >
    );
};

export default SuperAdmin;