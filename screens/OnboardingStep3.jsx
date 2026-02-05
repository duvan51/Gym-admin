import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { createAnnualWorkoutPlan } from '../services/workoutPlanService';
import { createAnnualNutritionPlan } from '../services/nutritionService';

const OnboardingStep3 = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        sex: 'Masculino',
        age: '',
        height: '',
        weight: '',
        targetWeight: '',
        location: 'Colombia',
        habits: [],
        neck: '',
        chest: '',
        waist: '',
        hips: ''
    });

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (loading) return;
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No session found");

            const activityLevel = localStorage.getItem('onboarding_activity_level');
            const fitnessGoalsStr = localStorage.getItem('onboarding_fitness_goals');
            const fitnessGoals = fitnessGoalsStr ? JSON.parse(fitnessGoalsStr) : [];

            // 1. Update Profile (Base data)
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    activity_level: activityLevel,
                    fitness_goals: fitnessGoals,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id);

            if (profileError) throw profileError;

            // 2. Insert Biometrics (Initial constants)
            const sexMap = {
                'Masculino': 'male',
                'Femenino': 'female',
                'Otro': 'other'
            };

            const { error: bioError } = await supabase
                .from('biometrics')
                .upsert({
                    user_id: user.id,
                    sex: sexMap[formData.sex] || 'other',
                    age: parseInt(formData.age),
                    height_cm: parseFloat(formData.height),
                    initial_weight_kg: parseFloat(formData.weight),
                    target_weight_kg: parseFloat(formData.targetWeight),
                    location: formData.location,
                    habits: formData.habits
                });

            if (bioError) throw bioError;

            // 3. Insert into History (For progress tracking)
            const { error: histError } = await supabase
                .from('measurements_history')
                .insert({
                    user_id: user.id,
                    weight_kg: parseFloat(formData.weight),
                    neck_cm: parseFloat(formData.neck) || null,
                    chest_cm: parseFloat(formData.chest) || null,
                    waist_cm: parseFloat(formData.waist) || null,
                    hips_cm: parseFloat(formData.hips) || null
                });

            if (histError) throw histError;

            // 4. Generate Annual Workout & Nutrition Plan with AI
            alert("✨ Generando tu ecosistema personalizado con IA (Entrenamiento + Nutrición)...\n\nEsto puede tomar 30-40 segundos.");

            const userProfile = {
                activity_level: activityLevel,
                fitness_goals: fitnessGoals,
                biometrics: {
                    sex: sexMap[formData.sex] || 'other',
                    age: parseInt(formData.age),
                    weight_kg: parseFloat(formData.weight),
                    target_weight_kg: parseFloat(formData.targetWeight),
                    height_cm: parseFloat(formData.height),
                    location: formData.location,
                    habits: formData.habits
                }
            };

            const planResult = await createAnnualWorkoutPlan(userProfile, user.id);

            console.log(`Workout Plan created: ${planResult.sessionsCount} sessions`);

            // Cleanup
            localStorage.removeItem('onboarding_activity_level');
            localStorage.removeItem('onboarding_fitness_goals');

            alert(`🎉 ¡Ecosistema generado exitosamente!\n\n${planResult.sessionsCount} sesiones de entrenamiento personalizadas están listas.`);

            navigate('/user-plan');
        } catch (err) {
            console.error(err);
            alert("Error al guardar perfil: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="flex-1 flex flex-col items-center py-10 px-6 bg-background-dark min-h-screen text-white font-display">
            <div className="max-w-[800px] w-full flex flex-col gap-8">
                <div className="flex flex-col gap-3">
                    <div className="flex gap-6 justify-between items-end">
                        <h3 className="text-primary text-lg font-bold">Perfil Biométrico</h3>
                        <p className="text-[#9cbaa6] text-sm font-normal">75% completado</p>
                    </div>
                    <div className="rounded-full bg-[#1e3a24] h-2 w-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: "75%" }}></div>
                    </div>
                </div>

                <div className="text-center space-y-2">
                    <h1 className="text-4xl font-black uppercase italic tracking-tighter">Tus <span className="text-primary">Fundamentos</span></h1>
                    <p className="text-[#9cbaa6] text-lg max-w-2xl mx-auto">Necesitamos conocer tu punto de partida para medir tu éxito.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8 bg-surface-dark/50 border border-border-dark p-10 rounded-[2.5rem] shadow-2xl">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Sexo Biológico</label>
                            <select
                                name="sex"
                                value={formData.sex}
                                onChange={handleInputChange}
                                className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all appearance-none"
                            >
                                <option>Masculino</option>
                                <option>Femenino</option>
                                <option>Otro</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Estatura (cm)</label>
                            <input
                                required
                                type="number"
                                name="height"
                                placeholder="Ej: 175"
                                value={formData.height}
                                onChange={handleInputChange}
                                className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Peso Inicial (kg)</label>
                            <input
                                required
                                type="number"
                                step="0.1"
                                name="weight"
                                placeholder="Ej: 78.5"
                                value={formData.weight}
                                onChange={handleInputChange}
                                className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Edad</label>
                            <input
                                required
                                type="number"
                                name="age"
                                placeholder="Ej: 25"
                                value={formData.age}
                                onChange={handleInputChange}
                                className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Peso Objetivo (kg)</label>
                            <input
                                required
                                type="number"
                                step="0.1"
                                name="targetWeight"
                                placeholder="Ej: 72.0"
                                value={formData.targetWeight}
                                onChange={handleInputChange}
                                className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Ubicación (País/Región)</label>
                        <input
                            required
                            type="text"
                            name="location"
                            placeholder="Ej: Colombia, Bogotá"
                            value={formData.location}
                            onChange={handleInputChange}
                            className="w-full bg-background-dark border-2 border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all"
                        />
                    </div>

                    <div className="space-y-4 pt-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Hábitos / Adicciones</label>
                        <div className="flex flex-wrap gap-3">
                            {['Azúcar', 'Alcohol', 'Tabaco', 'Sedentarismo', 'Comida Chatarra'].map(habit => (
                                <button
                                    key={habit}
                                    type="button"
                                    onClick={() => {
                                        const newHabits = formData.habits.includes(habit)
                                            ? formData.habits.filter(h => h !== habit)
                                            : [...formData.habits, habit];
                                        setFormData({ ...formData, habits: newHabits });
                                    }}
                                    className={`px-4 py-2 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all ${formData.habits.includes(habit) ? 'bg-primary/20 border-primary text-primary' : 'bg-background-dark border-white/5 text-slate-500 hover:border-white/20'}`}
                                >
                                    {habit}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="pt-6 border-t border-white/5">
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em] mb-6 text-center">Medidas Opcionales (Recomendado)</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                { id: 'neck', label: 'Cuello' },
                                { id: 'chest', label: 'Pecho' },
                                { id: 'waist', label: 'Cintura' },
                                { id: 'hips', label: 'Cadera' }
                            ].map(field => (
                                <div key={field.id} className="space-y-2 text-center">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{field.label}</label>
                                    <input
                                        type="number"
                                        name={field.id}
                                        placeholder="cm"
                                        value={formData[field.id]}
                                        onChange={handleInputChange}
                                        className="w-full bg-background-dark/50 border border-white/5 rounded-xl py-3 px-4 text-center text-sm focus:border-primary outline-none"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-6 border-t border-white/5">
                        <button type="button" onClick={() => navigate('/onboarding-2')} className="px-8 py-3 rounded-xl border border-white/10 text-slate-400 font-bold hover:text-white transition-colors">Atrás</button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-12 py-4 rounded-2xl bg-primary text-background-dark font-black uppercase tracking-widest text-xs hover:shadow-[0_0_30px_rgba(13,242,89,0.3)] transition-all disabled:opacity-50"
                        >
                            {loading ? 'Guardando...' : 'Generar mi Ecosistema'}
                        </button>
                    </div>
                </form>

                <p className="text-center text-slate-500 text-[10px] font-bold uppercase tracking-widest">Tus datos están seguros y se usarán para personalizar tus rutinas.</p>
            </div>
        </main>
    );
};

export default OnboardingStep3;