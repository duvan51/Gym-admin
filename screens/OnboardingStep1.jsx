import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const OnboardingStep1 = () => {
    const navigate = useNavigate();
    const [level, setLevel] = useState(localStorage.getItem('onboarding_activity_level') || 'Moderado');

    const handleNext = () => {
        localStorage.setItem('onboarding_activity_level', level);
        navigate('/onboarding-2');
    };

    return (
        <main className="flex-1 flex flex-col items-center py-12 px-6 bg-background-dark min-h-screen text-white">
            <div className="w-full max-w-[800px] flex flex-col gap-10">
                <div className="flex flex-col gap-3 w-full">
                    <div className="flex gap-6 justify-between items-end">
                        <p className="text-lg font-medium leading-normal">Paso 1 de 4</p>
                        <p className="text-primary text-sm font-bold leading-normal">25%</p>
                    </div>
                    <div className="rounded-full bg-[#3b5443] h-3 overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: "25%" }}></div>
                    </div>
                </div>
                <div className="text-center">
                    <h1 className="tracking-tight text-4xl md:text-5xl font-bold leading-tight pb-4">¿Cuál es tu nivel actual de actividad física?</h1>
                    <p className="text-[#9cbaa6] text-lg max-w-2xl mx-auto">Selecciona la opción que mejor describa tu rutina semanal.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 w-full">
                    {[
                        { level: 'Sedentario', desc: 'Poca o nula actividad física diaria.', icon: 'airline_seat_recline_normal' },
                        { level: 'Moderado', desc: 'Ejercicio 3-4 veces por semana.', icon: 'directions_walk' },
                        { level: 'Activo', desc: 'Entrenamiento intenso diario.', icon: 'fitness_center' }
                    ].map(item => (
                        <label
                            key={item.level}
                            className={`group flex items-center gap-6 rounded-xl border-2 border-solid p-6 cursor-pointer transition-all bg-background-dark/50 ${level === item.level ? 'border-primary shadow-[0_0_20px_rgba(13,242,89,0.1)]' : 'border-[#3b5443] hover:border-primary'}`}
                        >
                            <input
                                className="custom-radio h-6 w-6 border-2 border-[#3b5443] bg-transparent text-primary checked:bg-primary focus:ring-primary focus:ring-offset-0"
                                name="activity-level"
                                type="radio"
                                checked={level === item.level}
                                onChange={() => setLevel(item.level)}
                            />
                            <div className="flex items-center gap-5 grow">
                                <div className={`hidden sm:flex items-center justify-center size-14 rounded-lg text-primary ${level === item.level ? 'bg-primary/20' : 'bg-[#1a2e20]'}`}>
                                    <span className="material-symbols-outlined text-3xl">{item.icon}</span>
                                </div>
                                <div className="flex flex-col text-left">
                                    <p className="text-lg font-bold">{item.level}</p>
                                    <p className="text-[#9cbaa6] text-base">{item.desc}</p>
                                </div>
                            </div>
                        </label>
                    ))}
                </div>
                <div className="flex py-6 justify-between items-center border-t border-[#28392e] mt-4">
                    <button onClick={() => navigate('/login')} className="flex min-w-[84px] cursor-pointer items-center justify-center rounded-lg h-12 px-6 border border-[#3b5443] text-white font-bold hover:bg-[#1a2e20]">Atrás</button>
                    <button onClick={handleNext} className="flex min-w-[160px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-8 bg-primary text-background-dark gap-2 text-base font-bold tracking-tight hover:shadow-[0_0_20px_rgba(13,242,89,0.3)]">
                        <span>Siguiente</span><span className="material-symbols-outlined">arrow_forward</span>
                    </button>
                </div>
            </div>
        </main>
    );
};

export default OnboardingStep1;
