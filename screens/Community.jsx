import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { notificationService } from '../services/notificationService';
import { Link } from 'react-router-dom';
import UserHeader from '../components/UserHeader';


const Community = () => {
    const [posts, setPosts] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newPost, setNewPost] = useState({ content: '', tag: 'Logro', image: null });
    const [userProfile, setUserProfile] = useState(null);
    const [isPosting, setIsPosting] = useState(false);

    // Comments State
    const [activePostComments, setActivePostComments] = useState(null);
    const [commentContent, setCommentContent] = useState('');

    const tags = ['Logro', 'Nutrición', 'Entrenamiento', 'Desafío', 'Motivación'];

    // Initial load: Only fetch profile
    useEffect(() => {
        fetchUserProfile();
    }, []);

    // Fetch products when userProfile is available
    useEffect(() => {
        if (userProfile?.gym_id) {
            fetchProducts();
        }
    }, [userProfile?.gym_id]);

    const fetchUserProfile = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            setUserProfile(data);
            // Fetch posts immediately after profile is loaded
            if (data?.gym_id) {
                fetchPosts(data.gym_id);
            }
        }
    };

    const fetchPosts = async (specificGymId) => {
        const targetGymId = specificGymId || userProfile?.gym_id;
        if (!targetGymId) return;

        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('community_posts')
                .select(`
                    *, 
                    profiles!user_id(id, full_name, avatar_url, level, role),
                    post_likes(user_id),
                    gyms(name, avatar_url)
                `)
                .eq('gym_id', targetGymId)
                .order('is_priority', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (data) {
                const mappedPosts = data.map(p => {
                    // Handle both object and array response from profiles join
                    const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
                    const gym = Array.isArray(p.gyms) ? p.gyms[0] : p.gyms;
                    const likes = Array.isArray(p.post_likes) ? p.post_likes : (p.post_likes ? [p.post_likes] : []);

                    const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';

                    return {
                        id: p.id,
                        user: (isAdmin && gym) ? gym.name : (profile?.full_name || 'Atleta Anónimo'),
                        avatar: (isAdmin && gym) ? (gym.avatar_url || profile?.avatar_url) : (profile?.avatar_url || `https://i.pravatar.cc/150?u=${p.user_id}`),
                        level: profile?.level || 1,
                        content: p.content,
                        image: p.image_url,
                        likes: p.likes_count || 0,
                        comments_count: p.comments_count || 0,
                        tag: p.tag || 'General',
                        created_at: p.created_at,
                        is_priority: p.is_priority,
                        role: profile?.role,
                        creator_id: profile?.id || p.user_id,
                        user_has_liked: likes.some(l => l.user_id === userProfile?.id)
                    };

                });

                setPosts(mappedPosts);
            }

        } catch (err) {
            console.error("Error fetching posts:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchProducts = async () => {
        if (!userProfile?.gym_id) return;

        try {
            const { data, error } = await supabase
                .from('store_products')
                .select('*')
                .eq('gym_id', userProfile.gym_id)
                .eq('is_available', true)
                .order('created_at', { ascending: false })
                .limit(6);

            if (error) throw error;
            setProducts(data || []);
        } catch (err) {
            console.error("Error fetching products:", err);
        }
    };

    // Re-fetch posts when userProfile is loaded to correctly show 'liked' status
    useEffect(() => {
        if (userProfile?.id) {
            fetchPosts();
        }
    }, [userProfile?.id]);



    const handleCreatePost = async () => {
        if (!newPost.content.trim() || !userProfile) return;
        setIsPosting(true);
        try {
            const { error } = await supabase
                .from('community_posts')
                .insert([{
                    user_id: userProfile.id,
                    content: newPost.content,
                    tag: newPost.tag,
                    gym_id: userProfile.gym_id
                }]);

            if (error) throw error;

            // Wait for a second to let DB propagate
            setTimeout(async () => {
                await fetchPosts();
                setNewPost({ content: '', tag: 'Logro', image: null });
                setShowCreateModal(false);
                // Trigger Notification for gym members
                if (userProfile?.gym_id) {
                    await notificationService.notifyGymMembers(
                        userProfile.gym_id,
                        userProfile.id,
                        {
                            title: "Nueva publicación",
                            message: `${userProfile.full_name} compartió algo nuevo en la comunidad.`,
                            type: "community_post"
                        }
                    );
                }

                setIsPosting(false);
            }, 500);

        } catch (err) {
            alert("Error al crear la publicación: " + err.message);
            setIsPosting(false);
        }
    };


    const handleToggleLike = async (postId, hasLiked) => {
        if (!userProfile) return;
        try {
            if (hasLiked) {
                await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userProfile.id);
                await supabase.rpc('decrement_likes', { post_id_val: postId });
            } else {
                await supabase.from('post_likes').insert([{ post_id: postId, user_id: userProfile.id }]);
                await supabase.rpc('increment_likes', { post_id_val: postId });

                // Trigger Notification for the post author
                const post = posts.find(p => p.id === postId);
                if (post && post.user_id !== userProfile.id) {
                    await notificationService.createNotification({
                        userId: post.user_id,
                        title: "Nuevo Like",
                        message: `A ${userProfile.full_name} le gusta tu publicación.`,
                        type: "community_interaction",
                        relatedId: postId
                    });
                }
            }
            // Update local state for immediate feedback
            setPosts(posts.map(p => {
                if (p.id === postId) {
                    return {
                        ...p,
                        likes: hasLiked ? p.likes - 1 : p.likes + 1,
                        user_has_liked: !hasLiked
                    };
                }
                return p;
            }));
        } catch (err) {
            console.error(err);
        }
    };

    const fetchComments = async (postId) => {
        const { data } = await supabase
            .from('post_comments')
            .select('*, profiles(full_name, avatar_url)')
            .eq('post_id', postId)
            .order('created_at', { ascending: true });

        setActivePostComments({ postId, list: data || [] });
    };

    const handleAddComment = async (postId) => {
        if (!commentContent.trim()) return;
        try {
            const { error } = await supabase
                .from('post_comments')
                .insert([{
                    post_id: postId,
                    user_id: userProfile.id,
                    content: commentContent
                }]);
            if (error) throw error;
            setCommentContent('');
            fetchComments(postId);

            // Trigger Notification for the post author
            const post = posts.find(p => p.id === postId);
            if (post && post.user_id !== userProfile.id) {
                await notificationService.createNotification({
                    userId: post.user_id,
                    title: "Nuevo Comentario",
                    message: `${userProfile.full_name} comentó tu publicación.`,
                    type: "community_interaction",
                    relatedId: postId
                });
            }
        } catch (err) {
            alert(err.message);
        }
    };

    const handleDeleteOwnPost = async (postId) => {
        const confirmDelete = window.confirm("¿Estás seguro de que quieres eliminar tu publicación?");
        if (!confirmDelete) return;

        try {
            const { error } = await supabase
                .from('community_posts')
                .delete()
                .eq('id', postId);

            if (error) throw error;
            setPosts(posts.filter(p => p.id !== postId));
        } catch (err) {
            alert("Error al eliminar publicación: " + err.message);
        }
    };

    const formatTimeAgo = (dateStr) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        if (diffInSeconds < 60) return 'Ahora';
        if (diffInSeconds < 3600) return `Hace ${Math.floor(diffInSeconds / 60)}min`;
        if (diffInSeconds < 86400) return `Hace ${Math.floor(diffInSeconds / 3600)}h`;
        return `Hace ${Math.floor(diffInSeconds / 86400)}d`;
    };

    return (
        <div className="bg-background-dark min-h-screen">
            <UserHeader />
            <div className="px-0 py-6 md:p-10 text-white font-display pb-32 max-w-7xl mx-auto">

                {/* Header */}
                <div className="flex justify-between items-center mb-10 px-6 md:px-0">
                    <div>
                        <h1 className="text-2xl md:text-5xl font-black italic uppercase italic tracking-tighter">
                            Comunidad <span className="text-primary">PRO</span>
                        </h1>
                        <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] md:text-sm mt-1">
                            Conecta, Inspira y Evoluciona {posts.length > 0 && <span className="text-primary/50 ml-2">({posts.length} Activos)</span>}
                        </p>
                    </div>

                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="bg-primary text-background-dark size-14 md:size-16 rounded-2xl flex items-center justify-center hover:shadow-[0_0_30px_rgba(13,242,89,0.4)] hover:scale-105 active:scale-95 transition-all"
                    >
                        <span className="material-symbols-outlined text-3xl font-black">add</span>
                    </button>
                </div>

                {/* Quick Stats/Tabs */}
                <div className="flex gap-4 mb-10 overflow-x-auto pb-4 no-scrollbar px-6 md:px-0">
                    {['Todo', ...tags].map(tag => (
                        <button key={tag} className="px-6 py-2 bg-surface-dark border border-white/10 rounded-full text-[10px] md:text-xs font-black uppercase tracking-widest whitespace-nowrap hover:border-primary transition-colors">
                            {tag}
                        </button>
                    ))}
                </div>

                {/* Main Layout: Feed + Marketplace Sidebar */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Feed Column */}
                    <div className="lg:col-span-2 space-y-6">
                        {loading ? (
                            <div className="py-20 text-center">
                                <div className="size-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                                <p className="text-slate-500 font-black uppercase tracking-widest text-sm">Escaneando el pulso del gym...</p>
                            </div>
                        ) : posts.length === 0 ? (
                            <div className="py-20 text-center bg-surface-dark rounded-[2.5rem] border border-dashed border-white/10">
                                <p className="text-slate-500 font-black uppercase tracking-widest text-sm mb-4">Aún no hay energía por aquí</p>
                                <button onClick={() => setShowCreateModal(true)} className="text-primary font-black uppercase italic hover:underline">Sé el primero en publicar</button>
                            </div>
                        ) : posts.map((post) => (
                            <div key={post.id} className={`group bg-surface-dark border md:rounded-[2.5rem] overflow-hidden hover:shadow-[0_10px_40px_rgba(0,0,0,0.3)] transition-all ${post.is_priority ? 'border-primary-blue bg-primary-blue/5' : 'border-white/5 hover:border-primary/30'}`}>

                                {/* Post Header */}
                                <div className="p-6 flex justify-between items-start">
                                    <div className="flex items-center gap-4">
                                        <div className={`size-14 rounded-full p-0.5 border-2 ${post.role === 'admin' ? 'border-primary-blue' : 'border-primary'}`}>
                                            <div className="size-full rounded-full bg-cover bg-center" style={{ backgroundImage: `url('${post.avatar}')` }}></div>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className={`font-black uppercase italic text-lg group-hover:text-primary transition-colors ${post.role === 'admin' ? 'text-primary-blue' : ''}`}>{post.user}</h4>
                                                {post.role === 'admin' && (
                                                    <span className="material-symbols-outlined text-primary-blue text-sm">verified</span>
                                                )}
                                                {post.is_priority && (
                                                    <span className="bg-primary-blue text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">PINNED</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nivel {post.level}</span>
                                                <span className="size-1 bg-slate-700 rounded-full"></span>
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{formatTimeAgo(post.created_at)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border ${post.role === 'admin' ? 'bg-primary-blue/20 border-primary-blue/30 text-primary-blue' : 'bg-primary/10 border-primary/20 text-primary'}`}>
                                            {post.tag}
                                        </span>
                                        {userProfile?.id === post.creator_id && (
                                            <button onClick={() => handleDeleteOwnPost(post.id)} className="text-slate-600 hover:text-red-500 transition-colors">
                                                <span className="material-symbols-outlined text-sm">delete</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Post Content */}
                                <div className="px-6 pb-4">
                                    <p className="text-slate-300 text-base leading-relaxed">{post.content}</p>
                                </div>

                                {post.image && (
                                    <div className="w-full aspect-video bg-cover bg-center border-y border-white/5" style={{ backgroundImage: `url('${post.image}')` }}></div>
                                )}

                                {/* Post Actions */}
                                <div className="px-6 py-4 flex items-center gap-6 border-t border-white/5">
                                    <button
                                        onClick={() => handleToggleLike(post.id, post.user_has_liked)}
                                        className={`flex items-center gap-2 font-black text-sm transition-all ${post.user_has_liked ? 'text-primary' : 'text-slate-500 hover:text-white'}`}
                                    >
                                        <span className={`material-symbols-outlined ${post.user_has_liked ? 'fill-1 scale-110' : ''}`}>favorite</span>
                                        {post.likes}
                                    </button>
                                    <button
                                        onClick={() => activePostComments?.postId === post.id ? setActivePostComments(null) : fetchComments(post.id)}
                                        className="flex items-center gap-2 text-slate-500 hover:text-white font-black text-sm"
                                    >
                                        <span className="material-symbols-outlined">chat_bubble</span>
                                        {post.comments_count}
                                    </button>
                                    <button className="flex items-center gap-2 text-slate-500 hover:text-white font-black text-sm ml-auto">
                                        <span className="material-symbols-outlined">share</span>
                                    </button>
                                </div>

                                {/* Comments Section */}
                                {activePostComments?.postId === post.id && (
                                    <div className="px-6 pb-6 space-y-4 animate-fadeIn border-t border-white/5 pt-4">
                                        <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                                            {activePostComments.list.length === 0 ? (
                                                <p className="text-[10px] text-slate-600 uppercase font-black tracking-widest text-center py-4 italic">No hay comentarios aún. ¡Sé el primero!</p>
                                            ) : activePostComments.list.map(c => (
                                                <div key={c.id} className="flex gap-3">
                                                    <div className="size-8 rounded-full bg-cover bg-center shrink-0" style={{ backgroundImage: `url('${c.profiles?.avatar_url || 'https://i.pravatar.cc/150'}')` }}></div>
                                                    <div className="flex-1 bg-background-dark/50 p-3 rounded-2xl border border-white/5">
                                                        <p className="text-[10px] font-black uppercase text-slate-500 mb-1">{c.profiles?.full_name}</p>
                                                        <p className="text-sm text-slate-300">{c.content}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="size-8 rounded-full bg-cover bg-center shrink-0" style={{ backgroundImage: `url('${userProfile?.avatar_url || 'https://i.pravatar.cc/150'}')` }}></div>
                                            <input
                                                type="text"
                                                className="flex-1 bg-background-dark border border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:border-primary"
                                                placeholder="Escribe un comentario..."
                                                value={commentContent}
                                                onChange={(e) => setCommentContent(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleAddComment(post.id)}
                                            />
                                            <button
                                                onClick={() => handleAddComment(post.id)}
                                                disabled={!commentContent.trim()}
                                                className="bg-primary px-4 py-2 rounded-xl text-background-dark disabled:opacity-50 hover:shadow-[0_0_20px_rgba(13,242,89,0.3)] transition-all"
                                            >
                                                <span className="material-symbols-outlined text-sm font-black">send</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Marketplace Sidebar */}
                    <div className="lg:col-span-1 space-y-6">
                        {/* Sticky Sidebar */}
                        <div className="sticky top-6 space-y-6">

                            {/* Marketplace Header */}
                            <div className="bg-surface-dark border border-white/5 md:rounded-[2rem] p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xl font-black uppercase italic tracking-tighter">
                                        Market<span className="text-primary">place</span>
                                    </h3>
                                    <Link to="/store" className="flex items-center gap-1 text-primary hover:underline transition-all">
                                        <span className="text-[10px] font-black uppercase tracking-widest">Ver Todo</span>
                                        <span className="material-symbols-outlined text-sm">shopping_bag</span>
                                    </Link>
                                </div>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Productos destacados</p>
                            </div>

                            {/* Products */}
                            <div className="grid grid-cols-2 lg:grid-cols-1 gap-4 px-4 md:px-0">
                                {products.length === 0 ? (
                                    <div className="col-span-2 lg:col-span-1 bg-surface-dark border border-dashed border-white/10 rounded-[2rem] p-8 text-center">
                                        <span className="material-symbols-outlined text-4xl text-slate-700 mb-3">inventory_2</span>
                                        <p className="text-[10px] text-slate-600 uppercase font-black tracking-widest">Próximamente productos</p>
                                    </div>
                                ) : products.map((product) => (
                                    <Link to="/store" key={product.id} className="group bg-surface-dark border border-white/5 rounded-2xl md:rounded-[2rem] overflow-hidden hover:border-primary/30 hover:shadow-[0_10px_30px_rgba(0,0,0,0.3)] transition-all cursor-pointer">
                                        <div className="aspect-square bg-cover bg-center" style={{ backgroundImage: `url('${product.image_url || 'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=400'}')` }}></div>
                                        <div className="p-3 md:p-4">
                                            <h4 className="font-black uppercase text-[10px] md:text-sm mb-1 group-hover:text-primary transition-colors line-clamp-1">{product.name}</h4>
                                            <p className="text-[8px] md:text-[10px] text-slate-500 mb-2 line-clamp-1">{product.description}</p>
                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                                                <span className="text-primary font-black text-sm md:text-lg">${product.price?.toLocaleString()}</span>
                                                <button className="w-full md:w-auto bg-primary/10 border border-primary/30 text-primary px-2 py-0.5 md:px-3 md:py-1 rounded-lg text-[8px] md:text-[10px] font-black uppercase tracking-widest group-hover:bg-primary group-hover:text-background-dark transition-all">
                                                    Ver
                                                </button>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>

                            {/* View All Products */}
                            {products.length > 0 && (
                                <Link to="/store" className="w-full block text-center bg-surface-dark border border-white/10 text-white font-black py-3 rounded-2xl uppercase tracking-widest text-xs hover:border-primary hover:shadow-[0_0_20px_rgba(13,242,89,0.2)] transition-all">
                                    Ver Todos los Productos
                                </Link>
                            )}
                        </div>
                    </div>

                </div>

                {/* Create Post Modal */}
                {showCreateModal && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-6 backdrop-blur-xl bg-background-dark/90">
                        <div className="bg-surface-dark border border-white/10 w-full max-w-xl rounded-[2.5rem] md:rounded-[3rem] p-6 md:p-10 relative animate-scaleUp overflow-y-auto max-h-[90vh]">
                            <button onClick={() => setShowCreateModal(false)} className="absolute top-8 right-8 text-slate-500 hover:text-white">
                                <span className="material-symbols-outlined">close</span>
                            </button>

                            <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-8">Nueva <span className="text-primary">Publicación</span></h2>

                            <div className="space-y-6">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 block">Categoría</label>
                                    <div className="flex flex-wrap gap-2">
                                        {tags.map((tag, idx) => {
                                            const emojis = ['🏆', '🍏', '💪', '🔥', '✨'];
                                            return (
                                                <button
                                                    key={tag}
                                                    onClick={() => setNewPost({ ...newPost, tag })}
                                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 ${newPost.tag === tag ? 'bg-primary border-primary text-background-dark' : 'border-white/10 text-slate-500 hover:border-white/30'}`}
                                                >
                                                    <span>{emojis[idx]}</span>
                                                    <span className="hidden md:inline">{tag}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 block">Tu mensaje</label>
                                    <textarea
                                        className="w-full bg-background-dark/50 border border-white/10 rounded-2xl p-4 text-white placeholder:text-slate-600 focus:border-primary transition-all outline-none h-32"
                                        placeholder="¿Qué estás logrando hoy?"
                                        value={newPost.content}
                                        onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                                    ></textarea>
                                </div>

                                <button
                                    onClick={handleCreatePost}
                                    disabled={isPosting || !newPost.content.trim()}
                                    className="w-full bg-primary text-background-dark font-black py-4 rounded-2xl uppercase tracking-[0.2em] text-sm hover:shadow-[0_0_30px_rgba(13,242,89,0.4)] transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {isPosting ? 'Sincronizando...' : 'Publicar Ahora'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


export default Community;