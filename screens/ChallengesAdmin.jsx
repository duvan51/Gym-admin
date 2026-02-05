
import React from 'react';
import AdminSidebar from '../components/AdminSidebar';

const ChallengesAdmin = () => {
    return (
        <div className="flex h-screen bg-background-dark text-white">
            <AdminSidebar />
            <main className="flex-1 p-8">
                <h1 className="text-4xl font-black mb-8">Desafíos</h1>
                <div className="bg-[#1b271f] rounded-xl border border-[#3b5443] p-8">
                    <button className="bg-primary py-4 rounded-xl font-black text-background-dark w-full">Lanzar</button>
                </div>
            </main>
        </div>
    );
};

export default ChallengesAdmin;
