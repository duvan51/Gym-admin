import React, { useState, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import MobileNav from './components/MobileNav';

// Lazy load screens to reduce initial bundle size
const Login = lazy(() => import('./screens/Login'));
const DashboardAdmin = lazy(() => import('./screens/DashboardAdmin'));
const AccountingAdmin = lazy(() => import('./screens/AccountingAdmin'));
const OnboardingStep1 = lazy(() => import('./screens/OnboardingStep1'));
const OnboardingStep2 = lazy(() => import('./screens/OnboardingStep2'));
const OnboardingStep3 = lazy(() => import('./screens/OnboardingStep3'));
const UserPlan = lazy(() => import('./screens/UserPlan'));
const UserNutrition = lazy(() => import('./screens/UserNutrition'));
const UserProgress = lazy(() => import('./screens/UserProgress'));
const RoutineInProgress = lazy(() => import('./screens/RoutineInProgress'));
const ExerciseLibrary = lazy(() => import('./screens/ExerciseLibrary'));
const UserProfile = lazy(() => import('./screens/UserProfile'));
const Community = lazy(() => import('./screens/Community'));
const BrandSettings = lazy(() => import('./screens/BrandSettings'));
const ChallengesAdmin = lazy(() => import('./screens/ChallengesAdmin'));
const AnalyticsReport = lazy(() => import('./screens/AnalyticsReport'));
const CommunityAdmin = lazy(() => import('./screens/CommunityAdmin'));
const SuperAdmin = lazy(() => import('./screens/SuperAdmin'));
const ResetPassword = lazy(() => import('./screens/ResetPassword'));
const Store = lazy(() => import('./screens/Store'));
const StoreAdmin = lazy(() => import('./screens/StoreAdmin'));

const PageLoader = () => (
  <div className="min-h-screen bg-background-dark flex items-center justify-center">
    <div className="flex flex-col items-center">
      <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4"></div>
      <div className="h-2 w-32 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full bg-primary animate-[shimmer_1.5s_infinite] w-full origin-left"></div>
      </div>
    </div>
  </div>
);

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
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<PageLoader />}>
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
      </Suspense>
      <MobileNav />
    </HashRouter>
  );
};

export default App;