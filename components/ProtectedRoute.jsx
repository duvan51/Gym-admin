
import React, { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

const ProtectedRoute = ({ allowedRoles }) => {
    const [loading, setLoading] = useState(true);
    const [isAllowed, setIsAllowed] = useState(false);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();

                if (!session) {
                    setLoading(false);
                    return;
                }

                // Obtener el rol del usuario desde la tabla profiles
                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', session.user.id)
                    .single();

                if (error || !profile) {
                    console.error("Error verificando rol:", error);
                    setLoading(false);
                    return;
                }

                // Verificar si el rol está permitido
                // Convert rol to lowercase to avoid case issues
                const userRole = profile.role?.toLowerCase();

                if (allowedRoles.map(r => r.toLowerCase()).includes(userRole)) {
                    setIsAllowed(true);
                }

            } catch (error) {
                console.error("Error en ProtectedRoute:", error);
            } finally {
                setLoading(false);
            }
        };

        checkAuth();
    }, [allowedRoles]);

    if (loading) {
        return (
            <div className="min-h-screen bg-background-dark flex items-center justify-center">
                <div className="size-12 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
            </div>
        );
    }

    return isAllowed ? <Outlet /> : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
