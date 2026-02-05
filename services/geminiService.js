
import { GoogleGenAI, Type } from "@google/genai";

let aiInstances = {
  workout: null,
  nutrition: null
};

const getAI = (area = 'workout') => {
  if (aiInstances[area]) return aiInstances[area];
  
  let key;
  if (area === 'nutrition') {
    key = import.meta.env.VITE_GEMINI_NUTRITION_KEY || import.meta.env.VITE_GEMINI_API_KEY;
  } else {
    key = import.meta.env.VITE_GEMINI_API_KEY || 
          (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : null);
  }
  
  // Sanitize key
  if (typeof key === 'string') {
    key = key.trim();
    if (key === 'undefined' || key === 'null') key = null;
  }

  if (!key) {
    throw new Error(`API Key for ${area} missing. Check your .env.local.`);
  }
  
  console.log(`DEBUG: Initializing GoogleGenAI for ${area} with key (length: ${key.length})`);
  aiInstances[area] = new GoogleGenAI({ apiKey: key });
  return aiInstances[area];
};

/**
 * Helper to retry AI calls with exponential backoff on 429 errors
 */
const withRetry = async (fn, maxRetries = 3) => {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRateLimit = error.message?.includes('429') || error.status === 429 || error.code === 429;
      if (isRateLimit && i < maxRetries - 1) {
        // Reduced backoff for better UX: 2s, 4s, 8s
        const delay = Math.pow(2, i) * 2000 + (Math.random() * 500); 
        console.warn(`Gemini Rate Limit (429). Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

export const generateWorkoutPlan = async (activityLevel, goals) => {
  const prompt = `Actúa como un entrenador personal experto. Crea un plan de entrenamiento para un nivel de actividad "${activityLevel}" y objetivos: "${goals.join(", ")}".
  Responde exclusivamente en JSON con: title, description, strengthFrequency y cardioFrequency. Idioma: Español.`;

  try {
    const response = await withRetry(() => getAI('workout').models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            strengthFrequency: { type: Type.NUMBER },
            cardioFrequency: { type: Type.NUMBER }
          },
          required: ["title", "description", "strengthFrequency", "cardioFrequency"]
        }
      }
    }));

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Error generating workout plan:", error);
    return {
      title: "Plan de Iniciación Pro",
      description: "Basado en tus objetivos de fuerza y salud básica.",
      strengthFrequency: 3,
      cardioFrequency: 2
    };
  }
};

export const getWorkoutTip = async (exerciseName) => {
  const prompt = `Dame un consejo profesional rápido (máx 15 palabras) para: "${exerciseName}". Enfócate en la técnica. En español.`;

  try {
    const response = await withRetry(() => getAI('workout').models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    }));
    return response.text;
  } catch (error) {
    return "Mantén siempre el core activado y la espalda neutra.";
  }
};

export const getAdminInsights = async (stats) => {
  const prompt = `Analiza estos datos de gimnasio: Usuarios Activos: ${stats.active}, Churn: ${stats.churn}%, Adherencia: ${stats.adherence}%. Da una recomendación de negocio de 2 frases en español.`;

  try {
    const response = await withRetry(() => getAI('workout').models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    }));
    return response.text;
  } catch (error) {
    return "La retención es buena. Se recomienda implementar un programa de referidos para potenciar el crecimiento orgánico.";
  }
};

export const generateAnnualWorkoutPlan = async (userProfile) => {
  const { activity_level, fitness_goals, biometrics } = userProfile;
  
  const prompt = `Actúa como un entrenador personal certificado con 15 años de experiencia. Crea un plan de entrenamiento anual COMPLETO (12 meses) para un usuario con:

PERFIL DEL USUARIO:
- Edad: ${biometrics?.age || 'No especificada'}
- Nivel de actividad: ${activity_level}
- Objetivos fitness: ${fitness_goals?.join(', ')}
- Peso Actual: ${biometrics?.weight_kg || 'No especificado'} kg
- Peso Objetivo: ${biometrics?.target_weight_kg || 'No especificado'} kg
- Sexo: ${biometrics?.sex || 'No especificado'}

INSTRUCCIONES CRÍTICAS:
1. Analiza el perfil y determina cuántos días por semana debe entrenar (4-6 días)
2. ${biometrics?.age > 60 ? 'PRIORIDAD ADULTO MAYOR: El usuario tiene más de 60 años. Prioriza ejercicios de bajo impacto, estabilidad, equilibrio y movilidad. Evita pliometría de alto impacto.' : 'Crea un plan progresivo de 12 meses dividido en fases (ej: Adaptación, Hipertrofia, Fuerza, Definición)'}
3. Para CADA MES, genera un plan SEMANAL tipo con ejercicios específicos
4. Incluye días de descanso estratégicos
5. Progresa la intensidad gradualmente mes a mes
6. Cada ejercicio debe tener: nombre, sets, reps, descanso en segundos, y notas de técnica

ESTRUCTURA REQUERIDA:
- Mes 1-3: Fase de Adaptación (técnica y hábitos)
- Mes 4-6: Fase de Construcción (volumen e hipertrofia)
- Mes 7-9: Fase de Fuerza (intensidad)
- Mes 10-12: Fase de Refinamiento (definición y mantenimiento)

Responde EXCLUSIVAMENTE en JSON con esta estructura exacta:
{
  "title": "Nombre del plan",
  "description": "Descripción breve",
  "training_days_per_week": 5,
  "months": [
    {
      "month": 1,
      "name": "Enero - Adaptación",
      "focus": "Construcción de hábitos",
      "weekly_template": [
        {
          "day_of_week": 1,
          "type": "strength",
          "title": "Tren Superior Push",
          "description": "Enfoque en pecho, hombros y tríceps",
          "duration_min": 45,
          "difficulty": "easy",
          "exercises": [
            {
              "name": "Press de Banca con Barra",
              "sets": 3,
              "reps": 12,
              "rest_sec": 90,
              "notes": "Controla el descenso, explosivo en subida"
            }
          ]
        }
      ]
    }
  ]
}`;

  try {
    const response = await withRetry(() => getAI('workout').models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.7
      }
    }), 2); // Annual plan is heavy, maybe just 2 retries to avoid very long waits

    const plan = JSON.parse(response.text);
    return plan;
  } catch (error) {
    console.error("Error generating annual workout plan:", error);
    // Fallback plan
    return {
      title: "Plan Anual de Transformación",
      description: "Plan personalizado basado en tus objetivos",
      training_days_per_week: 5,
      months: generateFallbackPlan(activity_level, fitness_goals)
    };
  }
};

// Fallback plan generator
function generateFallbackPlan(activityLevel, goals) {
  const months = [];
  const phases = [
    { name: "Adaptación", focus: "Técnica y hábitos", difficulty: "easy" },
    { name: "Construcción", focus: "Volumen e hipertrofia", difficulty: "medium" },
    { name: "Fuerza", focus: "Intensidad", difficulty: "hard" },
    { name: "Refinamiento", focus: "Definición", difficulty: "medium" }
  ];

  for (let month = 1; month <= 12; month++) {
    const phaseIndex = Math.floor((month - 1) / 3);
    const phase = phases[phaseIndex];
    
    months.push({
      month,
      name: `Mes ${month} - ${phase.name}`,
      focus: phase.focus,
      weekly_template: [
        {
          day_of_week: 1,
          type: "strength",
          title: "Tren Superior",
          description: "Pecho, hombros, tríceps",
          duration_min: 45,
          difficulty: phase.difficulty,
          exercises: [
            { name: "Press de Banca", sets: 3, reps: 12, rest_sec: 90, notes: "Controla el movimiento" },
            { name: "Press Militar", sets: 3, reps: 10, rest_sec: 90, notes: "Core activado" },
            { name: "Fondos", sets: 3, reps: 10, rest_sec: 60, notes: "Hasta fallo" }
          ]
        },
        {
          day_of_week: 2,
          type: "cardio",
          title: "Cardio HIIT",
          description: "Intervalos de alta intensidad",
          duration_min: 30,
          difficulty: phase.difficulty,
          exercises: [
            { name: "Sprints", sets: 8, reps: 30, rest_sec: 60, notes: "Máxima intensidad" }
          ]
        },
        {
          day_of_week: 3,
          type: "strength",
          title: "Tren Inferior",
          description: "Piernas y glúteos",
          duration_min: 50,
          difficulty: phase.difficulty,
          exercises: [
            { name: "Sentadillas", sets: 4, reps: 12, rest_sec: 120, notes: "Profundidad completa" },
            { name: "Peso Muerto", sets: 3, reps: 10, rest_sec: 120, notes: "Espalda neutra" }
          ]
        },
        {
          day_of_week: 4,
          type: "rest",
          title: "Descanso Activo",
          description: "Recuperación",
          duration_min: 0,
          difficulty: "easy",
          exercises: []
        },
        {
          day_of_week: 5,
          type: "strength",
          title: "Tren Superior Pull",
          description: "Espalda y bíceps",
          duration_min: 45,
          difficulty: phase.difficulty,
          exercises: [
            { name: "Dominadas", sets: 3, reps: 8, rest_sec: 90, notes: "Rango completo" },
            { name: "Remo con Barra", sets: 3, reps: 12, rest_sec: 90, notes: "Aprieta escápulas" }
          ]
        }
      ]
    });
  }

  return months;
}

/**
 * Generates an annual nutrition goal summary
 */
export const generateNutritionPlanGoal = async (userProfile) => {
  const { biometrics, fitness_goals } = userProfile;
  const prompt = `Actúa como un Nutricionista Deportivo de Élite. 
  Crea una Meta Nutricional Anual para un usuario con:
  - Edad: ${biometrics.age}
  - Peso Actual: ${biometrics.weight_kg} kg
  - Peso Objetivo: ${biometrics.target_weight_kg} kg
  - Objetivos: ${fitness_goals.join(', ')}
  
  Define una estrategia macro a largo plazo (ej: Recomposición corporal, Volumen limpio, Déficit agresivo inicial).
  Responde con un texto breve y motivador (máx 50 palabras) en español.`;

  try {
    const response = await withRetry(() => getAI('nutrition').models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    }));
    return response.text;
  } catch (error) {
    return "Optimizar la ingesta de macronutrientes para alcanzar un peso saludable de forma sostenible.";
  }
};

/**
 * Generates a weekly nutrition plan with specific rules
 */
export const generateWeeklyNutritionPlan = async (userProfile, weekNumber) => {
  const { biometrics, fitness_goals } = userProfile;
  const isColombia = biometrics.location?.toLowerCase().includes('colombia');
  const isOver60 = biometrics.age > 60;
  
  const weightGoal = biometrics.target_weight_kg < biometrics.weight_kg ? 'Déficit Calórico' : 'Superávit Calórico';

  const prompt = `Actúa como un Nutricionista experto especializado en nutrición de precisión.
  Crea un plan nutricional para la SEMANA ${weekNumber} del año.
  
  CONTEXTO DEL USUARIO:
  - Edad: ${biometrics.age}
  - Peso: ${biometrics.weight_kg} kg -> Objetivo: ${biometrics.target_weight_kg} kg
  - Ubicación: ${biometrics.location}
  - Adicciones/Hábitos: ${biometrics.habits?.join(', ') || 'Ninguno'}
  - Estrategia: ${weightGoal}
  
  REGLAS DE ORO:
  1. VARIEDAD TOTAL: Genera 7 días COMPLETAMENTE DIFERENTES entre sí. No repitas el mismo plato principal dos días seguidos.
  2. ${isColombia ? 'CULTURA COLOMBIANA: Usa ingredientes locales auténticos (arepas de maíz, yuca, plátano, frutas de la región, frijoles, pescado, pollo, carne magra). Las preparaciones deben ser saludables (asado, cocido, sudado) pero con el sabor local.' : 'Usa ingredientes comunes y saludables de su región.'}
  3. ${biometrics.habits?.includes('Azúcar') ? 'MANEJO DE ADICCIÓN AL AZÚCAR: Propón sustitutos naturales. Reduce gradualmente el dulce. IMPORTANTE: Incluye la nota: "Consulta a tu médico para un seguimiento profesional sobre tu consumo de azúcar".' : ''}
  4. ${isOver60 ? 'DENSIDAD ÓSEA Y PROTEÍNA: Prioriza Calcio, Vitamina D y 1.6g-2g de proteína por kg para evitar pérdida muscular.' : ''}
  5. ESTRUCTURA DIARIA: Varía las fuentes de proteína (huevo, pollo, res, pescado, granos) y carbohidratos complejos.
  
  ESTRUCTURA REQUERIDA (JSON):
  {
    "daily_meals": [
      {
        "day": 1,
        "meals": {
          "desayuno": "Descripción con ingredientes",
          "almuerzo": "Descripción con ingredientes",
          "cena": "Descripción con ingredientes",
          "snacks": ["Opción 1", "Opción 2"]
        }
      }
    ],
    "recommendations": "Consejos específicos de la semana y notas médicas si aplica"
  }
  
  Genera los 7 días de la semana. Responde solo JSON.`;

  try {
    const response = await withRetry(() => getAI('nutrition').models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.8
      }
    }));

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Error generating weekly nutrition plan:", error);
    // Return fallback plan for resilience vs Quota limits
    return generateNutritionFallback(isColombia, weekNumber);
  }
};

/**
 * Fallback nutrition plan when AI quota is exceeded
 */
function generateNutritionFallback(isColombia, weekNumber) {
  const variations = [
    {
      carb: isColombia ? "arepa de maíz con queso" : "tostadas integrales",
      protein: "huevos pericos",
      lunch: isColombia ? "bandeja saludable (frijoles, arroz, pollo, aguacate)" : "pollo con quinua y vegetales",
      dinner: "sopa de vegetales con pollo desmechado"
    },
    {
      carb: isColombia ? "yuca cocida o plátano" : "avena con frutos secos",
      protein: "tortilla de claras",
      lunch: isColombia ? "pescado blanco con arroz de coco y ensalada" : "salmón con batata",
      dinner: "ensalada de atún con huevo cocido"
    },
    {
      carb: isColombia ? "patacón asado" : "pan de centeno",
      protein: "carne molida magra",
      lunch: isColombia ? "sancocho ligero de pollo (sin exceso de papa)" : "pavo con arroz integral",
      dinner: "pechuga a la plancha con espárragos"
    }
  ];

  const dailyMeals = [];
  for (let day = 1; day <= 7; day++) {
    const v = variations[(day - 1) % variations.length];
    dailyMeals.push({
      day,
      meals: {
        desayuno: `${v.protein}, ${v.carb}, café o té sin azúcar.`,
        almuerzo: `${v.lunch}, porción de fruta local.`,
        cena: `${v.dinner}, infusión caliente.`,
        snacks: ["Fruta de temporada", "Puñado de frutos secos"]
      }
    });
  }

  return {
    daily_meals: dailyMeals,
    recommendations: `Semana ${weekNumber}: Plan de Variedad Local. Mantén la hidratación y prioriza alimentos frescos.`
  };
}
