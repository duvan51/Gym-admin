import { supabase } from './supabaseClient';
import { generateNutritionPlanGoal, generateWeeklyNutritionPlan } from './geminiService';

/**
 * Initializes an annual nutrition plan and generates the first week
 */
export const createAnnualNutritionPlan = async (userProfile, userId) => {
  try {
    // 1. Generate annual goal summary with AI
    console.log('Generating annual nutrition goal...');
    const annualGoal = await generateNutritionPlanGoal(userProfile);

    // 2. Create nutrition_plan record
    const { data: planData, error: planError } = await supabase
      .from('nutrition_plans')
      .insert([{
        user_id: userId,
        annual_goal: annualGoal,
        is_active: true
      }])
      .select()
      .single();

    if (planError) throw planError;

    // 3. Generate first weekly plan
    await generateNextWeeklyPlan(userProfile, planData.id, userId, 1);

    return planData;
  } catch (error) {
    console.error('Error creating annual nutrition plan:', error);
    throw error;
  }
};

/**
 * Generates the next weekly plan for a user
 */
export const generateNextWeeklyPlan = async (userProfile, planId, userId, weekNumber) => {
  try {
    console.log(`Generating nutrition plan for week ${weekNumber}...`);
    const weeklyData = await generateWeeklyNutritionPlan(userProfile, weekNumber);

    const { data: weekData, error: weekError } = await supabase
      .from('nutrition_weeks')
      .insert([{
        plan_id: planId,
        user_id: userId,
        week_number: weekNumber,
        daily_meals: weeklyData.daily_meals,
        recommendations: weeklyData.recommendations,
        completed_days: [false, false, false, false, false, false, false]
      }])
      .select()
      .single();

    if (weekError) throw weekError;
    return weekData;
  } catch (error) {
    console.error(`Error generating weekly plan for week ${weekNumber}:`, error);
    throw error;
  }
};

/**
 * Fetches the user's active nutrition plan
 */
export const getActiveNutritionPlan = async (userId) => {
  const { data, error } = await supabase
    .from('nutrition_plans')
    .select('*, nutrition_weeks(*)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
};

/**
 * Toggles the completion status of a specific day in a week
 */
export const toggleDayCompletion = async (weekId, dayIndex, currentCompletions) => {
  const newCompletions = [...currentCompletions];
  newCompletions[dayIndex] = !newCompletions[dayIndex];

  const { data, error } = await supabase
    .from('nutrition_weeks')
    .update({ completed_days: newCompletions })
    .eq('id', weekId)
    .select()
    .single();

  if (error) throw error;
  return data;
};
