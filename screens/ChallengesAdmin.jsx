
import React from 'react';
import AdminSidebar from '../components/AdminSidebar';

const ChallengesAdmin = ({ darkMode, toggleDarkMode }) => {
    return (
        <div className="flex min-h-screen bg-background-light dark:bg-background-dark text-slate-800 dark:text-white font-display transition-colors">
            <AdminSidebar darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
            <main className="flex-1 flex flex-col h-screen overflow-hidden pt-16 lg:pt-0">
                <header className="px-6 md:px-10 py-6 md:py-8 border-b border-border-light dark:border-border-dark bg-surface-light/30 dark:bg-surface-dark/30 backdrop-blur-md shrink-0">
                    <h1 className="text-2xl md:text-4xl font-black uppercase italic tracking-tighter">Desafíos <span className="text-primary">& Eventos</span></h1>
                    <p className="text-slate-500 text-[10px] md:text-sm font-bold uppercase tracking-[0.2em] mt-1">Gamificación y retos para la comunidad</p>
                </header>

                <div className="flex-1 p-6 md:p-10 overflow-y-auto">
                    <div className="max-w-4xl mx-auto">
                        <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark p-8 md:p-12 rounded-[3rem] relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-12 opacity-5 scale-150 rotate-12">
                                <span className="material-symbols-outlined text-[120px]">emoji_events</span>
                            </div>

                            <h2 className="text-3xl font-black uppercase italic mb-4 relative z-10">Módulo en <span className="text-primary">Construcción</span></h2>
                            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mb-8 max-w-md relative z-10">
                                Estamos diseñando un sistema de retos dinámicos con recompensas automáticas para tus socios. Pronto disponible.
                            </p>

                            <div className="flex flex-col md:flex-row gap-4 relative z-10">
                                <div className="flex-1 p-6 bg-black/5 dark:bg-white/5 rounded-3xl border border-black/5 dark:border-white/5">
                                    <span className="material-symbols-outlined text-primary mb-2">hotel_class</span>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Próxima función</p>
                                    <h4 className="text-sm font-black uppercase italic mt-1">Ranking Global</h4>
                                </div>
                                <div className="flex-1 p-6 bg-black/5 dark:bg-white/5 rounded-3xl border border-black/5 dark:border-white/5">
                                    <span className="material-symbols-outlined text-primary mb-2">military_tech</span>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Próxima función</p>
                                    <h4 className="text-sm font-black uppercase italic mt-1">Insignias Digitales</h4>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ChallengesAdmin;
