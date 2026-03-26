import { createClient } from '@supabase/supabase-js';

const url = 'https://vypnyzlvowyiosipuwpe.supabase.co';
const key = 'sb_publishable_PIHjUOghQ-wEY6Mm9E6_MQ_KPc_qgFJ';
const supabase = createClient(url, key);

async function checkIds() {
    const { data: q1 } = await supabase.from('profiles').select('*').ilike('full_name', '%dumar%');
    console.log("Dumar profiles:", q1);
    
    // Also let's check auth.users directly? No, anon cannot query auth.users.
    
    // let's get any gym with "iron fit" in the name
    const { data: q2 } = await supabase.from('gyms').select('*').ilike('name', '%iron%');
    console.log("Iron Fit gyms:", q2);
    
    const { data: q3 } = await supabase.from('profiles').select('*').ilike('full_name', '%lucas%');
    console.log("Lucas profiles:", q3);
}
checkIds();
