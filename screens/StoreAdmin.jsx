import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { notificationService } from '../services/notificationService';
import AdminSidebar from '../components/AdminSidebar';

const StoreAdmin = ({ darkMode, toggleDarkMode }) => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [profile, setProfile] = useState(null);
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState('');


    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        category: 'suplementos',
        stock: 0,
        is_available: true,
        image_url: ''
    });

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: profileData } = await supabase
                .from('profiles')
                .select('*, gyms(*)')
                .eq('id', user.id)
                .single();
            setProfile(profileData);

            if (profileData?.gym_id) {
                fetchProducts(profileData.gym_id);
            }
        }
    };

    const fetchProducts = async (gymId) => {
        const { data, error } = await supabase
            .from('store_products')
            .select('*')
            .eq('gym_id', gymId)
            .order('created_at', { ascending: false });

        if (data) setProducts(data);
        setLoading(false);
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const uploadImage = async () => {
        if (!imageFile) return formData.image_url;

        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${profile.gym_id}/${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('product-images')
            .upload(filePath, imageFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
            .from('product-images')
            .getPublicUrl(filePath);

        return publicUrl;
    };


    const handleSaveProduct = async (e) => {
        e.preventDefault();

        console.log("Saving product. Profile data:", profile);

        if (!profile?.gym_id && profile?.role !== 'superadmin') {
            alert(`Error: Tu cuenta (Rol: ${profile?.role}) no tiene un gimnasio vinculado. No puedes crear productos.`);
            return;
        }

        setLoading(true);

        try {
            let finalImageUrl = formData.image_url;
            if (imageFile) {
                finalImageUrl = await uploadImage();
            }

            const productData = {
                ...formData,
                image_url: finalImageUrl,
                gym_id: profile.gym_id,
                price: parseFloat(formData.price)
            };


            if (editingProduct) {
                const { error } = await supabase
                    .from('store_products')
                    .update(productData)
                    .eq('id', editingProduct.id);
                if (error) throw error;
            } else {
                const { data: newProd, error } = await supabase
                    .from('store_products')
                    .insert([productData])
                    .select()
                    .single();
                if (error) throw error;

                // Trigger notification for all gym members
                if (newProd && profile?.gym_id) {
                    await notificationService.notifyGymMembers(
                        profile.gym_id,
                        profile.id,
                        {
                            title: "Nuevo Producto en Tienda 🎁",
                            message: `Se ha publicado: ${newProd.name}. ¡Míralo ahora!`,
                            type: "store_update",
                            relatedId: newProd.id
                        }
                    );
                }
            }

            setShowAddModal(false);
            setEditingProduct(null);
            setImageFile(null);
            setImagePreview('');
            setFormData({ name: '', description: '', price: '', category: 'suplementos', stock: 0, is_available: true, image_url: '' });
            fetchProducts(profile.gym_id);

        } catch (error) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteProduct = async (id) => {
        if (!confirm('¿Estás seguro de eliminar este producto?')) return;

        const { error } = await supabase
            .from('store_products')
            .delete()
            .eq('id', id);

        if (!error) {
            fetchProducts(profile.gym_id);
        }
    };

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
    };

    return (
        <div className="flex min-h-screen bg-background-light dark:bg-background-dark text-slate-800 dark:text-white font-display transition-colors">
            <AdminSidebar darkMode={darkMode} toggleDarkMode={toggleDarkMode} />

            <main className="flex-1 flex flex-col h-screen overflow-hidden pt-16 lg:pt-0 transition-all pb-32">
                <header className="px-6 md:px-10 py-6 md:py-8 border-b border-border-light dark:border-border-dark bg-surface-light/30 dark:bg-surface-dark/30 backdrop-blur-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0 transition-colors">
                    <div>
                        <h1 className="text-2xl md:text-4xl font-black uppercase italic tracking-tighter text-slate-800 dark:text-white transition-colors">Marketplace <span className="text-primary">Interno</span></h1>
                        <p className="text-slate-500 text-[10px] md:text-sm font-bold uppercase tracking-[0.2em] mt-1">Gestiona productos y servicios extras para tus socios</p>
                    </div>
                    <button
                        onClick={() => {
                            setEditingProduct(null);
                            setImageFile(null);
                            setImagePreview('');
                            setFormData({ name: '', description: '', price: '', category: 'suplementos', stock: 0, is_available: true, image_url: '' });
                            setShowAddModal(true);
                        }}
                        className="w-full md:w-auto px-8 py-4 bg-primary text-white rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 hover:shadow-[0_0_30px_rgba(33,150,243,0.3)] transition-all active:scale-95 shadow-xl"
                    >
                        <span className="material-symbols-outlined">add_circle</span>
                        Nuevo Producto
                    </button>
                </header>

                <div className="flex-1 p-6 md:p-10 overflow-y-auto">

                    {loading && products.length === 0 ? (
                        <div className="flex justify-center py-20">
                            <div className="size-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                            {products.map(product => (
                                <div key={product.id} className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-white/5 rounded-[2.5rem] overflow-hidden group hover:border-primary/30 transition-all flex flex-col shadow-sm">
                                    <div className="aspect-square bg-slate-100 dark:bg-background-dark relative overflow-hidden">
                                        {product.image_url ? (
                                            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-700">
                                                <span className="material-symbols-outlined text-6xl">inventory_2</span>
                                            </div>
                                        )}
                                        <div className="absolute top-4 right-4 flex gap-2">
                                            <button
                                                onClick={() => {
                                                    setEditingProduct(product);
                                                    setImageFile(null);
                                                    setImagePreview(product.image_url || '');
                                                    setFormData({
                                                        name: product.name,
                                                        description: product.description,
                                                        price: product.price,
                                                        category: product.category,
                                                        stock: product.stock,
                                                        is_available: product.is_available,
                                                        image_url: product.image_url || ''
                                                    });
                                                    setShowAddModal(true);
                                                }}

                                                className="size-10 rounded-xl bg-background-dark/80 backdrop-blur-md text-white flex items-center justify-center hover:bg-primary hover:text-background-dark transition-all"
                                            >
                                                <span className="material-symbols-outlined text-sm">edit</span>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteProduct(product.id)}
                                                className="size-10 rounded-xl bg-background-dark/80 backdrop-blur-md text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"
                                            >
                                                <span className="material-symbols-outlined text-sm">delete</span>
                                            </button>
                                        </div>
                                        <div className="absolute bottom-4 left-4">
                                            <span className="px-3 py-1 rounded-lg bg-primary/20 backdrop-blur-md text-primary text-[8px] font-black uppercase tracking-widest border border-primary/20">
                                                {product.category}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-6 flex-1 flex flex-col">
                                        <h3 className="text-xl font-black uppercase italic mb-2 group-hover:text-primary transition-colors">{product.name}</h3>
                                        <p className="text-slate-500 text-xs font-medium mb-4 line-clamp-2">{product.description}</p>
                                        <div className="mt-auto flex justify-between items-center">
                                            <span className="text-2xl font-black italic">{formatCurrency(product.price)}</span>
                                            <div className="flex flex-col items-end">
                                                <span className={`text-[9px] font-black uppercase tracking-widest ${product.is_available ? 'text-primary' : 'text-red-500'}`}>
                                                    {product.is_available ? 'Disponible' : 'Agotado'}
                                                </span>
                                                <span className="text-[10px] text-slate-600 font-bold uppercase tracking-tighter">Stock: {product.stock}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Modal: Agregar/Editar */}
            {showAddModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-fadeIn">
                    <div className="absolute inset-0 bg-background-dark/90 backdrop-blur-xl" onClick={() => setShowAddModal(false)}></div>
                    <div className="relative bg-surface-light dark:bg-surface-dark border border-border-light dark:border-white/5 w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-fadeInUp transition-colors">
                        <header className="bg-black/5 dark:bg-background-dark/50 p-6 md:p-10 border-b border-border-light dark:border-white/5 flex justify-between items-center transition-colors">
                            <div>
                                <h3 className="text-3xl font-black italic uppercase tracking-tighter">
                                    {editingProduct ? 'Editar' : 'Nuevo'} <span className="text-primary">Producto</span>
                                </h3>
                                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">Completa los detalles del ítem</p>
                            </div>
                            <button onClick={() => setShowAddModal(false)} className="text-slate-500 hover:text-white transition-colors">
                                <span className="material-symbols-outlined text-4xl">close</span>
                            </button>
                        </header>

                        <form onSubmit={handleSaveProduct} className="p-6 md:p-10 grid grid-cols-2 gap-6">
                            <div className="col-span-2 space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nombre del Producto</label>
                                <input
                                    required
                                    className="w-full bg-black/5 dark:bg-background-dark border border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm text-slate-800 dark:text-white focus:border-primary outline-none transition-all"
                                    placeholder="Ej: Creatina Monohidratada 500g"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div className="col-span-2 space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Descripción</label>
                                <textarea
                                    className="w-full bg-black/5 dark:bg-background-dark border border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm text-slate-800 dark:text-white focus:border-primary outline-none transition-all h-24 resize-none"
                                    placeholder="Detalles sobre beneficios, porciones, etc."
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Precio (COP)</label>
                                <input
                                    required
                                    type="number"
                                    className="w-full bg-black/5 dark:bg-background-dark border border-border-light dark:border-white/5 rounded-2xl py-4 px-6 text-sm text-slate-800 dark:text-white focus:border-primary outline-none transition-all"
                                    placeholder="0"
                                    value={formData.price}
                                    onChange={e => setFormData({ ...formData, price: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Categoría</label>
                                <select
                                    className="w-full bg-background-dark border border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all"
                                    value={formData.category}
                                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                                >
                                    <option value="suplementos">Suplementos</option>
                                    <option value="comida">Comida / Snacks</option>
                                    <option value="bebidas">Bebidas</option>
                                    <option value="servicios">Servicios (Sauna, Masajes)</option>
                                    <option value="ropa">Ropa / Accesorios</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Stock Inicial</label>
                                <input
                                    type="number"
                                    className="w-full bg-background-dark border border-white/5 rounded-2xl py-4 px-6 text-sm focus:border-primary outline-none transition-all"
                                    placeholder="0"
                                    value={formData.stock}
                                    onChange={e => setFormData({ ...formData, stock: e.target.value })}
                                />
                            </div>
                            <div className="col-span-2 space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Imagen del Producto</label>
                                <div className="flex items-center gap-6">
                                    <div className="size-32 rounded-3xl bg-background-dark border-2 border-dashed border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                        {imagePreview ? (
                                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="material-symbols-outlined text-3xl text-slate-700">image</span>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageChange}
                                            id="product-image"
                                            className="hidden"
                                        />
                                        <label
                                            htmlFor="product-image"
                                            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 cursor-pointer transition-all"
                                        >
                                            <span className="material-symbols-outlined text-sm">upload</span>
                                            {imagePreview ? 'Cambiar Imagen' : 'Seleccionar Imagen'}
                                        </label>
                                        <p className="text-[9px] text-slate-500 mt-2 font-bold uppercase tracking-widest">Formatos: JPG, PNG, WEBP (Max 2MB)</p>
                                    </div>
                                </div>
                            </div>

                            <div className="col-span-2 flex items-center gap-4 py-4">
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, is_available: !formData.is_available })}
                                    className={`size-6 rounded-lg transition-all flex items-center justify-center ${formData.is_available ? 'bg-primary text-background-dark' : 'bg-white/5 text-slate-500'}`}
                                >
                                    <span className="material-symbols-outlined text-xs">{formData.is_available ? 'check' : ''}</span>
                                </button>
                                <span className="text-sm font-black uppercase italic tracking-widest">Publicar inmediatamente</span>
                            </div>

                            <button type="submit" disabled={loading} className="col-span-2 bg-primary text-background-dark font-black py-5 rounded-[2rem] uppercase tracking-widest hover:shadow-[0_0_40px_rgba(13,242,89,0.4)] transition-all active:scale-95 shadow-xl disabled:opacity-50 mt-4">
                                {loading ? 'Procesando...' : (editingProduct ? 'Actualizar Producto' : 'Crear Producto')}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StoreAdmin;
