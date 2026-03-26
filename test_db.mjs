import { createClient } from '@supabase/supabase-js';

const url = 'https://vypnyzlvowyiosipuwpe.supabase.co';
const key = 'sb_publishable_PIHjUOghQ-wEY6Mm9E6_MQ_KPc_qgFJ';
const supabase = createClient(url, key);

async function checkTable() {
    console.log("Checking notifications table...");
    const { data, error } = await supabase.from('notifications').select('*').limit(1);
    console.log("Data:", data);
    console.log("Error:", error);
    
    console.log("Checking gyms...");
    const { data: gyms, error: gErr } = await supabase.from('gyms').select('*').limit(3);
    console.log("Gyms:", gyms);

    console.log("Checking profiles with null gym...");
    const { data: profs, error: pErr } = await supabase.from('profiles').select('id, full_name, role, gym_id').limit(10);
    console.log("Profiles:", profs);
}
checkTable();
