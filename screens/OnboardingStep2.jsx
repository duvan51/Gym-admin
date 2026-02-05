import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const OnboardingStep2 = () => {
    const navigate = useNavigate();
    const [selected, setSelected] = useState('Fuerza');

    const handleNext = () => {
        localStorage.setItem('onboarding_fitness_goals', JSON.stringify([selected]));
        navigate('/onboarding-3');
    };

    return (
        <main className="flex-1 flex flex-col items-center py-10 px-6 bg-background-dark min-h-screen text-white">
            <div className="max-w-[800px] w-full flex flex-col gap-8">
                <div className="flex flex-col gap-3">
                    <div className="flex gap-6 justify-between items-end">
                        <h3 className="text-primary text-lg font-bold">Metas y Salud</h3>
                        <p className="text-[#9cbaa6] text-sm font-normal">50% completado</p>
                    </div>
                    <div className="rounded-full bg-[#1e3a24] h-2 w-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: "50%" }}></div>
                    </div>
                </div>
                <div className="text-center space-y-2">
                    <h1 className="text-4xl font-bold tracking-tight">¿Qué quieres lograr?</h1>
                    <p className="text-[#9cbaa6] text-lg max-w-2xl mx-auto">Selecciona tus objetivos principales.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                        { goal: 'Fuerza', desc: 'Aumenta masa muscular.', img: 'https://picsum.photos/seed/strength/400/225' },
                        { goal: 'Pérdida de Peso', desc: 'Déficit calórico.', img: 'https://picsum.photos/seed/weight/400/225' },
                        { goal: 'Salud General', desc: 'Longevidad.', img: 'https://picsum.photos/seed/health/400/225' }
                    ].map((item) => (
                        <div
                            key={item.goal}
                            onClick={() => setSelected(item.goal)}
                            className={`group relative flex flex-col gap-3 p-4 rounded-xl bg-[#1e3a24]/30 border-2 ${selected === item.goal ? 'border-primary' : 'border-[#28392e]'} hover:border-primary/50 transition-all cursor-pointer`}
                        >
                            <div className="w-full bg-center bg-no-repeat aspect-video bg-cover rounded-lg mb-2" style={{ backgroundImage: `url('${item.img}')` }}></div>
                            <div className="flex justify-between items-start">
                                <h4 className="text-lg font-bold">{item.goal}</h4>
                                {selected === item.goal && <span className="material-symbols-outlined text-primary">check_circle</span>}
                            </div>
                            <p className="text-[#9cbaa6] text-sm">{item.desc}</p>
                        </div>
                    ))}
                </div>
                <div className="flex items-center justify-between pt-6 border-t border-[#28392e]">
                    <button onClick={() => navigate('/onboarding-1')} className="px-8 py-3 rounded-xl border border-[#28392e] text-white font-medium hover:bg-white/5">Atrás</button>
                    <button onClick={handleNext} className="px-10 py-3 rounded-xl bg-primary text-background-dark font-bold hover:brightness-110 shadow-[0_0_20px_rgba(13,242,89,0.3)]">Continuar</button>
                </div>
            </div>
        </main>
    );
};

export default OnboardingStep2;