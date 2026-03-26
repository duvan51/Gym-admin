import { createClient } from '@supabase/supabase-js';

const url = 'https://vypnyzlvowyiosipuwpe.supabase.co';
const key = 'sb_publishable_PIHjUOghQ-wEY6Mm9E6_MQ_KPc_qgFJ';
const supabase = createClient(url, key);

async function testNoti() {
    const gymId = 'e2fa42ea-3674-4d7e-baac-5b61358806ab';
    const triggerUserId = 'c0b38f33-d130-4dda-b3dd-dd914612c58f'; // Dumaraponte's ID probably?
    
    // 1. Fetch members
    const { data: members, error: fetchError } = await supabase
        .from('profiles')
        .select('id')
        .eq('gym_id', gymId)
        .neq('id', triggerUserId);
        
    console.log("Members to notify:", members, "Error:", fetchError);
    
    if (!members || members.length === 0) return;
    
    const notifications = members.map(member => ({
        user_id: member.id,
        title: "Test",
        message: "Test msg",
        type: "store_update",
        related_id: null,
        is_read: false
    }));
    
    // 2. Insert notifications
    const { error: insertError } = await supabase
        .from('notifications')
        .insert(notifications);
        
    console.log("Insert result error:", insertError);
}
testNoti();
