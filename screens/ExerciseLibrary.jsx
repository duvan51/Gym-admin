
import React from 'react';
import UserHeader from '../components/UserHeader';

const exercises = [
    { name: 'Sentadilla Búlgara', muscles: 'Cuádriceps', level: 'Intermedio' },
    { name: 'Press Militar', muscles: 'Hombros', level: 'Principiante' },
    { name: 'Peso Muerto Rumano', muscles: 'Isquios', level: 'Avanzado' },
];

const ExerciseLibrary = () => {
    return (
        <div className="min-h-screen bg-background-dark text-white">
            <UserHeader />
            <main className="max-w-[1200px] mx-auto px-4 py-8">
                <h1 className="text-4xl font-black mb-8">Biblioteca</h1>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {exercises.map((ex, i) => (
                        <div key={i} className="bg-[#1a2e21] rounded-xl overflow-hidden border border-[#28392e]">
                            <div className="p-5">
                                <h3 className="text-xl font-bold">{ex.name}</h3>
                                <p className="text-[#9cbaa6] text-sm">{ex.muscles}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
};

export default ExerciseLibrary;
