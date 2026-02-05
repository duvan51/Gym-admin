import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import UserHeader from '../components/UserHeader';

const Store = () => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [categoryFilter, setCategoryFilter] = useState('todo');
    const [gym, setGym] = useState(null);
    const [selectedProduct, setSelectedProduct] = useState(null);

    useEffect(() => {
        fetchProducts();
    }, [categoryFilter]);

    const fetchProducts = async () => {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('gym_id, gyms(*)')
                .eq('id', user.id)
                .single();

            setGym(profile?.gyms);

            if (profile?.gym_id) {
                let query = supabase
                    .from('store_products')
                    .select('*')
                    .eq('gym_id', profile.gym_id)
                    .eq('is_available', true);

                if (categoryFilter !== 'todo') {
                    query = query.eq('category', categoryFilter);
                }

                const { data } = await query.order('created_at', { ascending: false });
                if (data) setProducts(data);
            }
        }
        setLoading(false);
    };

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
    };

    return (
        <div className="min-h-screen bg-background-dark text-white font-display">
            <UserHeader />

            <main className="max-w-[1200px] mx-auto px-4 md:px-6 py-12 pb-32">
                <header className="mb-12 animate-fadeIn">
                    <div className="flex flex-col gap-2">
                        <span className="text-primary text-[10px] md:text-xs font-black uppercase tracking-[0.4em]">Tienda {gym?.name}</span>
                        <h1 className="text-4xl md:text-6xl font-black leading-tight tracking-tighter uppercase italic">
                            Marketplace <span className="text-primary">Interno</span>
                        </h1>
                        <p className="text-slate-400 text-sm md:text-lg max-w-xl mt-4 italic font-medium">Suplementos, snacks nutritivos y servicios exclusivos para potenciar tu entrenamiento.</p>
                    </div>
                </header>

                <nav className="flex overflow-x-auto pb-4 md:pb-0 md:flex-wrap gap-3 md:gap-4 mb-12 animate-fadeInUp no-scrollbar">
                    {['todo', 'suplementos', 'comida', 'bebidas', 'servicios', 'ropa'].map(cat => (
                        <button
                            key={cat}
                            onClick={() => setCategoryFilter(cat)}
                            className={`px-6 md:px-8 py-2.5 md:py-3 rounded-xl md:rounded-2xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${categoryFilter === cat ? 'bg-primary text-background-dark shadow-xl shadow-primary/20' : 'bg-surface-dark border border-white/5 text-slate-400 hover:text-white hover:border-white/10'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </nav>

                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="size-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : products.length === 0 ? (
                    <div className="text-center py-32 bg-surface-dark rounded-[3rem] border border-white/5">
                        <span className="material-symbols-outlined text-6xl text-slate-700 mb-6">shopping_basket</span>
                        <h3 className="text-2xl font-black uppercase italic mb-2">No hay productos aún</h3>
                        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Vuelve más tarde para ver las novedades de {gym?.name}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-8 animate-fadeIn">
                        {products.map(product => (
                            <div
                                key={product.id}
                                onClick={() => setSelectedProduct(product)}
                                className="bg-surface-dark border border-white/5 rounded-[1.5rem] md:rounded-[2.5rem] overflow-hidden group hover:border-primary/40 transition-all flex flex-col hover:-translate-y-2 cursor-pointer"
                            >
                                <div className="aspect-square md:aspect-[4/3] bg-background-dark relative overflow-hidden">
                                    {product.image_url ? (
                                        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-800">
                                            <span className="material-symbols-outlined text-4xl md:text-7xl">shopping_basket</span>
                                        </div>
                                    )}
                                    <div className="absolute bottom-2 md:bottom-4 left-2 md:left-4">
                                        <span className="px-2 md:px-4 py-1 rounded-lg md:rounded-xl bg-background-dark/80 backdrop-blur-md text-primary text-[7px] md:text-[9px] font-black uppercase tracking-[0.2em] border border-white/5">
                                            {product.category}
                                        </span>
                                    </div>
                                </div>
                                <div className="p-4 md:p-8 flex-1 flex flex-col">
                                    <h3 className="text-xs md:text-2xl font-black uppercase italic mb-1 md:mb-3 group-hover:text-primary transition-colors leading-tight line-clamp-1 md:line-clamp-2">{product.name}</h3>
                                    <p className="hidden md:block text-slate-400 text-sm font-medium mb-8 leading-relaxed line-clamp-2 italic">{product.description}</p>

                                    <div className="mt-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                                        <div className="flex flex-col">
                                            <span className="text-[7px] md:text-[10px] text-slate-500 font-black uppercase tracking-widest mb-0.5 md:mb-1">Precio</span>
                                            <span className="text-sm md:text-3xl font-black italic text-white group-hover:text-primary transition-colors">{formatCurrency(product.price)}</span>
                                        </div>
                                        <button className="w-full md:w-16 h-10 md:h-16 rounded-xl md:rounded-[1.5rem] bg-white text-background-dark flex items-center justify-center hover:bg-primary transition-all active:scale-90 shadow-xl group-hover:shadow-primary/20">
                                            <span className="material-symbols-outlined text-xl md:text-3xl font-black">add_shopping_cart</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Product Detail Modal */}
            {selectedProduct && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-6 backdrop-blur-xl bg-background-dark/90">
                    <div className="bg-surface-dark border border-white/10 w-full max-w-2xl rounded-[2.5rem] md:rounded-[3rem] overflow-hidden relative animate-scaleUp max-h-[90vh] flex flex-col">
                        <button
                            onClick={() => setSelectedProduct(null)}
                            className="absolute top-6 right-6 z-20 size-10 bg-background-dark/50 backdrop-blur rounded-full flex items-center justify-center text-slate-400 hover:text-white border border-white/10"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>

                        <div className="flex flex-col md:flex-row h-full overflow-y-auto">
                            {/* Product Image */}
                            <div className="md:w-1/2 aspect-square md:aspect-auto bg-background-dark">
                                {selectedProduct.image_url ? (
                                    <img src={selectedProduct.image_url} alt={selectedProduct.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-800">
                                        <span className="material-symbols-outlined text-8xl">shopping_basket</span>
                                    </div>
                                )}
                            </div>

                            {/* Product Info */}
                            <div className="md:w-1/2 p-8 md:p-10 flex flex-col">
                                <div className="mb-8">
                                    <span className="px-4 py-1.5 rounded-xl bg-primary/10 text-primary text-[10px] font-black uppercase tracking-[0.2em] border border-primary/20 mb-4 inline-block">
                                        {selectedProduct.category}
                                    </span>
                                    <h2 className="text-3xl md:text-4xl font-black uppercase italic tracking-tighter leading-none mb-4">{selectedProduct.name}</h2>
                                    <p className="text-slate-400 text-base italic leading-relaxed">{selectedProduct.description}</p>
                                </div>

                                <div className="mt-auto space-y-6">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Precio</span>
                                        <span className="text-4xl font-black italic text-primary">{formatCurrency(selectedProduct.price)}</span>
                                    </div>

                                    <button className="w-full py-5 bg-white text-background-dark rounded-2xl font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 hover:bg-primary transition-all active:scale-95 shadow-2xl shadow-white/5">
                                        <span className="material-symbols-outlined font-black">add_shopping_cart</span>
                                        Añadir al Carrito
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Store;
