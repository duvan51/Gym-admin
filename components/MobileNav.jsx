import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const MobileNav = () => {
    const location = useLocation();

    const navItems = [
        { name: 'Plan', path: '/user-plan', icon: 'bolt' },
        { name: 'Nutri', path: '/user-nutrition', icon: 'restaurant' },
        { name: 'Tienda', path: '/store', icon: 'shopping_bag' },
        { name: 'Comu', path: '/community', icon: 'groups' },
        { name: 'Progre', path: '/user-progress', icon: 'monitoring' },
        { name: 'Perfil', path: '/user-profile', icon: 'person' },
    ];

    const isActive = (path) => location.pathname === path;

    // Do not show on login or onboarding screens
    const hideOnPaths = ['/login', '/onboarding-1', '/onboarding-2', '/onboarding-3', '/reset-password'];
    if (hideOnPaths.includes(location.pathname)) return null;

    return (
        <nav className="lg:hidden fixed bottom-5 left-3 right-3 z-[100] animate-in slide-in-from-bottom-5 duration-500">
            <div className="bg-background-dark/80 backdrop-blur-2xl border border-white/10 rounded-2xl p-1 shadow-[0_20px_40px_rgba(0,0,0,0.4)] flex items-center justify-between gap-0">
                {navItems.map((item) => (
                    <Link
                        key={item.path}
                        to={item.path}
                        className={`flex-1 flex flex-col items-center justify-center py-2.5 rounded-xl transition-all relative group
                            ${isActive(item.path) ? 'text-primary' : 'text-slate-500 hover:text-white'}
                        `}
                    >
                        {isActive(item.path) && (
                            <div className="absolute inset-x-1 inset-y-1 bg-primary/10 rounded-lg -z-10 animate-pulse"></div>
                        )}
                        <span className={`material-symbols-outlined text-[20px] transition-transform group-active:scale-90 ${isActive(item.path) ? 'font-black' : ''}`}>
                            {item.icon}
                        </span>
                    </Link>
                ))}
            </div>
        </nav>
    );
};

export default MobileNav;
