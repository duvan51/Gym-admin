import React, { useState, useEffect } from 'react';
import AdminSidebar from '../components/AdminSidebar';
import { supabase } from '../services/supabaseClient';

const CommunityAdmin = ({ darkMode, toggleDarkMode }) => {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [myProfile, setMyProfile] = useState(null);
    const [stats, setStats] = useState({ total: 0, todays: 0, tags: [] });

    // Create Post State
    const [newPostContent, setNewPostContent] = useState('');
    const [isPriority, setIsPriority] = useState(false);
    const [isPosting, setIsPosting] = useState(false);

    // Comments State
    const [activePostComments, setActivePostComments] = useState(null);
    const [commentContent, setCommentContent] = useState('');

    useEffect(() => {
        fetchMyProfile();
    }, []);

    useEffect(() => {
        if (myProfile?.id) {
            fetchPosts();
        }
    }, [myProfile?.id]);


    const fetchMyProfile = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            setMyProfile(data);
        }
    };

    const fetchPosts = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('community_posts')
                .select(`
                    *, 
                    profiles!user_id(full_name, avatar_url, level, role),
                    post_likes(user_id),
                    gyms(name, avatar_url)
                `)
                .order('is_priority', { ascending: false })
                .order('created_at', { ascending: false });


            if (error) throw error;

            if (data) {
                const mappedPosts = data.map(p => {
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
                        is_priority: p.is_priority,
                        tag: p.tag || 'General',
                        created_at: p.created_at,
                        role: profile?.role,
                        user_has_liked: likes.some(l => l.user_id === myProfile?.id)
                    };

                });
                setPosts(mappedPosts);
                calculateStats(data);
            }


        } catch (err) {
            console.error("Error fetching admin posts:", err);
        } finally {
            setLoading(false);
        }
    };


    const calculateStats = (data) => {
        const today = new Date().toISOString().split('T')[0];
        const todaysPosts = data.filter(p => p.created_at.startsWith(today)).length;
        const tagCounts = data.reduce((acc, p) => {
            acc[p.tag] = (acc[p.tag] || 0) + 1;
            return acc;
        }, {});

        setStats({
            total: data.length,
            todays: todaysPosts,
            tags: Object.entries(tagCounts).map(([name, count]) => ({ name, count }))
        });
    };

    const handleCreateAnnouncement = async () => {
        if (!newPostContent.trim() || !myProfile) return;
        setIsPosting(true);
        try {
            const { error } = await supabase
                .from('community_posts')
                .insert([{
                    user_id: myProfile.id,
                    content: newPostContent,
                    tag: 'Anuncio',
                    is_priority: isPriority,
                    gym_id: myProfile.gym_id
                }]);

            if (error) {
                console.error("Announcement Error:", error);
                throw error;
            }

            // Artificial delay to let DB update
            setTimeout(async () => {
                setNewPostContent('');
                setIsPriority(false);
                await fetchPosts();
                setIsPosting(false);
            }, 500);


        } catch (err) {
            alert("Error al publicar: " + err.message);
            setIsPosting(false);
        }
    };


    const handleDeletePost = async (postId) => {
        const confirmDelete = window.confirm("¿Estás seguro de que quieres eliminar esta publicación?");
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

    const handleToggleLike = async (postId, hasLiked) => {
        try {
            if (hasLiked) {
                await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', myProfile.id);
                await supabase.rpc('decrement_likes', { post_id_val: postId });
            } else {
                await supabase.from('post_likes').insert([{ post_id: postId, user_id: myProfile.id }]);
                await supabase.rpc('increment_likes', { post_id_val: postId });
            }
            fetchPosts();
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
                    user_id: myProfile.id,
                    content: commentContent
                }]);
            if (error) throw error;
            setCommentContent('');
            fetchComments(postId);
        } catch (err) {
            alert(err.message);
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
        <div className="flex min-h-screen bg-background-light dark:bg-background-dark text-slate-800 dark:text-white font-display transition-colors">
            <AdminSidebar darkMode={darkMode} toggleDarkMode={toggleDarkMode} />

            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <header className="px-6 md:px-10 py-6 md:py-8 border-b border-border-light dark:border-border-dark bg-surface-light/30 dark:bg-surface-dark/30 backdrop-blur-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0 transition-colors">
                    <div>
                        <h1 className="text-2xl md:text-4xl font-black uppercase italic tracking-tighter text-slate-800 dark:text-white">
                            Portal <span className="text-primary-blue">Moderador</span>
                        </h1>
                        <p className="text-slate-500 text-[10px] md:text-sm font-bold uppercase tracking-widest mt-1">Supervisión de comunidad y anuncios oficiales</p>
                    </div>
                    <div className="flex gap-4">
                        <div className="bg-black/5 dark:bg-background-dark/50 px-4 md:px-6 py-2 rounded-2xl border border-black/5 dark:border-white/5">
                            <span className="text-[8px] md:text-[10px] text-slate-500 font-bold uppercase block">Total</span>
                            <span className="text-lg md:text-xl font-black text-primary-blue">{stats.total}</span>
                        </div>
                    </div>
                </header>

                <div className="flex-1 p-10 overflow-y-auto custom-scrollbar pb-32">
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
                        {/* Feed y Creador */}
                        <div className="xl:col-span-8 space-y-8">

                            {/* Creador de Anuncios */}
                            <section className="bg-primary-blue/5 border border-primary-blue/20 rounded-[2.5rem] p-8">
                                <h3 className="text-xl font-black uppercase italic mb-4 text-primary-blue">Crear Comunicado Oficial</h3>
                                <textarea
                                    className="w-full bg-surface-light dark:bg-background-dark/50 border-2 border-border-light dark:border-primary-blue/10 rounded-2xl p-4 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:border-primary-blue transition-all outline-none h-24 mb-4"
                                    placeholder="Escribe un anuncio para todos los socios..."
                                    value={newPostContent}
                                    onChange={(e) => setNewPostContent(e.target.value)}
                                ></textarea>
                                <div className="flex items-center justify-between">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <div className={`size-6 rounded-lg border-2 flex items-center justify-center transition-all ${isPriority ? 'bg-primary-blue border-primary-blue' : 'border-slate-700'}`}>
                                            {isPriority && <span className="material-symbols-outlined text-white text-sm font-black">check</span>}
                                        </div>
                                        <input type="checkbox" className="hidden" checked={isPriority} onChange={() => setIsPriority(!isPriority)} />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-primary-blue">Marcar como Prioritario (Pinned)</span>
                                    </label>
                                    <button
                                        onClick={handleCreateAnnouncement}
                                        disabled={isPosting || !newPostContent.trim()}
                                        className="bg-primary-blue text-white font-black px-10 py-3 rounded-xl uppercase tracking-widest text-xs hover:shadow-[0_0_30px_rgba(33,150,243,0.3)] transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        {isPosting ? 'Publicando...' : 'Publicar Anuncio'}
                                    </button>
                                </div>
                            </section>

                            {/* Feed de Publicaciones */}
                            <div className="space-y-6">
                                {loading ? (
                                    <div className="py-20 text-center">
                                        <div className="size-16 border-4 border-primary-blue border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                                        <p className="text-slate-500 font-black uppercase tracking-widest text-sm">Escaneando comunidad...</p>
                                    </div>
                                ) : posts.length === 0 ? (
                                    <div className="py-20 text-center">No hay publicaciones</div>
                                ) : posts.map((post) => (
                                    <article key={post.id} className={`bg-surface-light dark:bg-surface-dark border p-8 rounded-[2.5rem] flex flex-col gap-6 hover:border-primary-blue/30 transition-all ${post.is_priority ? 'border-primary-blue shadow-[0_0_30px_rgba(33,150,243,0.1)]' : 'border-border-light dark:border-border-dark'}`}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-4">
                                                <div className={`size-12 rounded-full p-0.5 border-2 ${post.role === 'admin' ? 'border-primary-blue' : 'border-primary/20'}`}>
                                                    <div className="size-full rounded-full bg-cover bg-center" style={{ backgroundImage: `url('${post.avatar}')` }}></div>
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h4 className={`font-black uppercase italic ${post.role === 'admin' ? 'text-primary-blue' : 'text-white'}`}>{post.user}</h4>
                                                        {post.is_priority && <span className="bg-primary-blue text-white text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter">Prioritario</span>}
                                                    </div>
                                                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{formatTimeAgo(post.created_at)}</p>
                                                </div>
                                            </div>
                                            <button onClick={() => handleDeletePost(post.id)} className="text-slate-600 hover:text-red-500 transition-colors">
                                                <span className="material-symbols-outlined">delete</span>
                                            </button>
                                        </div>

                                        <p className="text-slate-600 dark:text-slate-300 text-lg leading-relaxed whitespace-pre-wrap">{post.content}</p>

                                        <div className="flex items-center gap-6 pt-4 border-t border-black/5 dark:border-white/5">
                                            <button
                                                onClick={() => handleToggleLike(post.id, post.user_has_liked)}
                                                className={`flex items-center gap-2 font-bold text-sm ${post.user_has_liked ? 'text-primary' : 'text-slate-500 hover:text-white'}`}
                                            >
                                                <span className={`material-symbols-outlined ${post.user_has_liked ? 'fill-1' : ''}`}>favorite</span>
                                                {post.likes}
                                            </button>
                                            <button
                                                onClick={() => activePostComments?.postId === post.id ? setActivePostComments(null) : fetchComments(post.id)}
                                                className="flex items-center gap-2 text-slate-500 hover:text-white font-bold text-sm"
                                            >
                                                <span className="material-symbols-outlined">chat_bubble</span>
                                                {post.comments_count} Comentarios
                                            </button>

                                        </div>

                                        {/* Comentarios */}
                                        {activePostComments?.postId === post.id && (
                                            <div className="mt-4 space-y-4 animate-fadeIn">
                                                <div className="space-y-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                                    {activePostComments.list.map(c => (
                                                        <div key={c.id} className="bg-black/5 dark:bg-background-dark/30 p-4 rounded-2xl flex gap-3">
                                                            <div className="size-8 rounded-full bg-cover bg-center shrink-0" style={{ backgroundImage: `url('${c.profiles?.avatar_url || 'https://i.pravatar.cc/150'}')` }}></div>
                                                            <div>
                                                                <p className="text-xs font-black uppercase text-slate-500 dark:text-slate-400">{c.profiles?.full_name}</p>
                                                                <p className="text-sm text-slate-600 dark:text-slate-200">{c.content}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        className="flex-1 bg-surface-light dark:bg-background-dark/50 border border-border-light dark:border-white/10 rounded-xl px-4 py-2 text-sm text-slate-800 dark:text-white outline-none focus:border-primary-blue"
                                                        placeholder="Escribe un comentario..."
                                                        value={commentContent}
                                                        onChange={(e) => setCommentContent(e.target.value)}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleAddComment(post.id)}
                                                    />
                                                    <button onClick={() => handleAddComment(post.id)} className="bg-primary-blue p-2 rounded-xl text-white">
                                                        <span className="material-symbols-outlined">send</span>
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </article>
                                ))}
                            </div>
                        </div>

                        {/* Sidebar */}
                        <div className="xl:col-span-4 space-y-8">
                            <section className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark p-8 rounded-[2.5rem]">
                                <h3 className="text-xl font-black uppercase italic mb-6">Métricas de hoy</h3>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-4 rounded-2xl bg-black/5 dark:bg-background-dark/50 border border-black/5 dark:border-white/5">
                                        <span className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Posts Hoy</span>
                                        <span className="text-xl font-black text-primary">{stats.todays}</span>
                                    </div>
                                    <div className="flex items-center justify-between p-4 rounded-2xl bg-black/5 dark:bg-background-dark/50 border border-black/5 dark:border-white/5">
                                        <span className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Favoritos</span>
                                        <span className="text-xl font-black text-primary-blue">
                                            {posts.reduce((acc, p) => acc + (p.likes || 0), 0)}
                                        </span>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default CommunityAdmin;
