import { supabase } from './supabaseClient';
import { generateAnnualWorkoutPlan } from './geminiService';

/**
 * Generates a complete annual workout plan for a user
 * @param {object} userProfile - User profile with activity_level, fitness_goals, biometrics
 * @param {string} userId - User ID
 * @returns {Promise<object>} - Created plan with sessions
 */
export const createAnnualWorkoutPlan = async (userProfile, userId) => {
  try {
    // 1. Generate plan with AI
    console.log('Generating annual plan with AI...');
    const aiPlan = await generateAnnualWorkoutPlan(userProfile);
    
    // 2. Create workout_plan record
    const startDate = new Date();
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 1);
    
    const { data: planData, error: planError } = await supabase
      .from('workout_plans')
      .insert([{
        user_id: userId,
        title: aiPlan.title,
        description: aiPlan.description,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        activity_level: userProfile.activity_level,
        fitness_goals: userProfile.fitness_goals,
        training_days_per_week: aiPlan.training_days_per_week || 5,
        ai_generated: true,
        is_active: true
      }])
      .select()
      .single();
    
    if (planError) throw planError;
    
    // 3. Expand monthly templates to daily sessions (365 days)
    console.log('Expanding plan to 365 daily sessions...');
    const sessions = expandPlanToSessions(aiPlan, planData.id, userId, startDate);
    
    // 4. Insert all sessions in batches (Supabase has limits)
    const batchSize = 100;
    for (let i = 0; i < sessions.length; i += batchSize) {
      const batch = sessions.slice(i, i + batchSize);
      const { error: sessionsError } = await supabase
        .from('workout_sessions')
        .insert(batch);
      
      if (sessionsError) throw sessionsError;
    }
    
    console.log(`Created ${sessions.length} workout sessions`);
    
    return {
      plan: planData,
      sessionsCount: sessions.length
    };
    
  } catch (error) {
    console.error('Error creating annual workout plan:', error);
    throw error;
  }
};

/**
 * Expands monthly templates to 365 daily sessions
 * @param {object} aiPlan - AI-generated plan with monthly templates
 * @param {string} planId - Plan ID
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date
 * @returns {Array} - Array of session objects
 */
function expandPlanToSessions(aiPlan, planId, userId, startDate) {
  const sessions = [];
  const currentDate = new Date(startDate);
  
  for (let day = 0; day < 365; day++) {
    const month = currentDate.getMonth(); // 0-11
    const weekNumber = Math.floor(day / 7) + 1;
    const dayOfWeek = currentDate.getDay(); // 0=Sunday, 6=Saturday
    
    // Get the corresponding month template from AI plan
    const monthTemplate = aiPlan.months[month];
    if (!monthTemplate) continue;
    
    // Find the session for this day of week
    const dayTemplate = monthTemplate.weekly_template.find(
      t => t.day_of_week === dayOfWeek
    );
    
    if (dayTemplate) {
      sessions.push({
        plan_id: planId,
        user_id: userId,
        session_date: currentDate.toISOString().split('T')[0],
        session_type: dayTemplate.type,
        title: dayTemplate.title,
        description: dayTemplate.description,
        exercises: dayTemplate.exercises,
        estimated_duration_min: dayTemplate.duration_min,
        difficulty: dayTemplate.difficulty,
        week_number: weekNumber,
        month_number: month + 1
      });
    } else {
      // If no template for this day, create a rest day
      sessions.push({
        plan_id: planId,
        user_id: userId,
        session_date: currentDate.toISOString().split('T')[0],
        session_type: 'rest',
        title: 'Día de Descanso',
        description: 'Recuperación activa',
        exercises: [],
        estimated_duration_min: 0,
        difficulty: 'easy',
        week_number: weekNumber,
        month_number: month + 1
      });
    }
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return sessions;
}

/**
 * Marks a session as completed
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @param {number} durationMin - Actual duration in minutes
 * @param {string} notes - Optional notes
 * @param {boolean} autoMarked - Whether it was auto-marked
 * @returns {Promise<object>} - Completion record
 */
export const completeSession = async (sessionId, userId, durationMin = null, notes = '', autoMarked = false) => {
  try {
    // 1. Create completion record
    const { data: completion, error: completionError } = await supabase
      .from('session_completions')
      .insert([{
        session_id: sessionId,
        user_id: userId,
        duration_min: durationMin,
        notes,
        xp_earned: 50,
        auto_marked: autoMarked
      }])
      .select()
      .single();
    
    if (completionError) throw completionError;
    
    // 2. Update user XP
    const { data: profile } = await supabase
      .from('profiles')
      .select('xp, level')
      .eq('id', userId)
      .single();
    
    const newXp = (profile?.xp || 0) + 50;
    const newLevel = calculateLevel(newXp);
    
    await supabase
      .from('profiles')
      .update({ 
        xp: newXp,
        level: newLevel
      })
      .eq('id', userId);
    
    // 3. Update streak
    const { data: streakData } = await supabase
      .rpc('get_user_streak', { target_user_id: userId });
    
    await supabase
      .from('profiles')
      .update({ streak: streakData || 0 })
      .eq('id', userId);
    
    return {
      completion,
      xp_earned: 50,
      new_xp: newXp,
      new_level: newLevel,
      streak: streakData || 0
    };
    
  } catch (error) {
    console.error('Error completing session:', error);
    throw error;
  }
};

/**
 * Calculate level based on XP
 * @param {number} xp - Total XP
 * @returns {number} - Level
 */
function calculateLevel(xp) {
  // Simple formula: level = floor(sqrt(xp / 100)) + 1
  // Level 1: 0 XP
  // Level 2: 100 XP
  // Level 3: 400 XP
  // Level 4: 900 XP
  // Level 5: 1600 XP
  // etc.
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

/**
 * Get user's workout progress for a specific month
 * @param {string} userId - User ID
 * @param {number} month - Month (1-12)
 * @param {number} year - Year
 * @returns {Promise<object>} - Progress data
 */
export const getMonthlyProgress = async (userId, month, year) => {
  try {
    const { data, error } = await supabase
      .rpc('get_monthly_progress', {
        target_user_id: userId,
        target_month: month,
        target_year: year
      });
    
    if (error) throw error;
    return data[0] || { total_sessions: 0, completed_sessions: 0, completion_rate: 0 };
    
  } catch (error) {
    console.error('Error getting monthly progress:', error);
    throw error;
  }
};
