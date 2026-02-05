import React, { useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './screens/Login';
import DashboardAdmin from './screens/DashboardAdmin';
import AccountingAdmin from './screens/AccountingAdmin';
import OnboardingStep1 from './screens/OnboardingStep1';
import OnboardingStep2 from './screens/OnboardingStep2';
import OnboardingStep3 from './screens/OnboardingStep3';
import UserPlan from './screens/UserPlan';
import UserNutrition from './screens/UserNutrition';
import UserProgress from './screens/UserProgress';
import RoutineInProgress from './screens/RoutineInProgress';
import ExerciseLibrary from './screens/ExerciseLibrary';
import UserProfile from './screens/UserProfile';
import Community from './screens/Community';
import BrandSettings from './screens/BrandSettings';
import ChallengesAdmin from './screens/ChallengesAdmin';
import AnalyticsReport from './screens/AnalyticsReport';
import CommunityAdmin from './screens/CommunityAdmin';
import SuperAdmin from './screens/SuperAdmin';
import ResetPassword from './screens/ResetPassword';
import Store from './screens/Store';
import StoreAdmin from './screens/StoreAdmin';
import MobileNav from './components/MobileNav';

const App = () => {
  const [userProfile, setUserProfile] = useState({
    name: 'Alex García',
    activityLevel: 'Moderado',
    goals: ['Fuerza'],
    level: 5,
    xp: 2450,
    streak: 12
  });

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<DashboardAdmin />} />
        <Route path="/accounting-admin" element={<AccountingAdmin />} />
        <Route path="/onboarding-1" element={<OnboardingStep1 />} />
        <Route path="/onboarding-2" element={<OnboardingStep2 />} />
        <Route path="/onboarding-3" element={<OnboardingStep3 />} />
        <Route path="/user-plan" element={<UserPlan />} />
        <Route path="/user-nutrition" element={<UserNutrition />} />
        <Route path="/user-progress" element={<UserProgress />} />
        <Route path="/user-progress" element={<UserProgress />} />
        <Route path="/routine" element={<RoutineInProgress />} />
        <Route path="/library" element={<ExerciseLibrary />} />
        <Route path="/user-profile" element={<UserProfile user={userProfile} />} />
        <Route path="/community" element={<Community />} />
        <Route path="/brand-settings" element={<BrandSettings />} />
        <Route path="/challenges-admin" element={<ChallengesAdmin />} />
        <Route path="/analytics-report" element={<AnalyticsReport />} />
        <Route path="/community-admin" element={<CommunityAdmin />} />
        <Route path="/superadmin" element={<SuperAdmin />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/store" element={<Store />} />
        <Route path="/store-admin" element={<StoreAdmin />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <MobileNav />
    </HashRouter>
  );
};

export default App;