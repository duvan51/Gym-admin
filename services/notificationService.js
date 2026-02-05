import { supabase } from './supabaseClient';

export const notificationService = {
    /**
     * Create a new notification for a specific user
     */
    async createNotification({ userId, title, message, type, relatedId = null, priority = false }) {
        try {
            const { data, error } = await supabase
                .from('notifications')
                .insert([{
                    user_id: userId,
                    title,
                    message,
                    type,
                    related_id: relatedId,
                    priority,
                    is_read: false
                }]);
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating notification:', error);
            return null;
        }
    },

    /**
     * Create notifications for all users in a gym (e.g., for a new post)
     * Except for the trigger user
     */
    async notifyGymMembers(gymId, triggerUserId, { title, message, type, relatedId }) {
        try {
            // Get all profiles in the gym except the current user
            const { data: members, error: fetchError } = await supabase
                .from('profiles')
                .select('id')
                .eq('gym_id', gymId)
                .neq('id', triggerUserId);

            if (fetchError) throw fetchError;
            if (!members || members.length === 0) return;

            const notifications = members.map(member => ({
                user_id: member.id,
                title,
                message,
                type,
                related_id: relatedId,
                is_read: false
            }));

            const { error: insertError } = await supabase
                .from('notifications')
                .insert(notifications);

            if (insertError) throw insertError;
        } catch (error) {
            console.error('Error notifying gym members:', error);
        }
    },

    /**
     * Fetch unread count for a user
     */
    async getUnreadCount(userId) {
        try {
            const { count, error } = await supabase
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('is_read', false);
            
            if (error) throw error;
            return count || 0;
        } catch (error) {
            console.error('Error fetching unread count:', error);
            return 0;
        }
    },

    /**
     * Fetch all notifications for a user (ordered by date)
     */
    async getNotifications(userId) {
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(50);
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching notifications:', error);
            return [];
        }
    },

    /**
     * Mark all notifications as read for a user
     */
    async markAllAsRead(userId) {
        try {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', userId)
                .eq('is_read', false);
            
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error marking notifications as read:', error);
            return false;
        }
    }
};
