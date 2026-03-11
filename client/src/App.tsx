import { useState } from 'react';
import LandingView from './views/LandingView';
import TeacherView from './views/TeacherView';
import StudentView from './views/StudentView';

type AppView = 'landing' | 'teacher' | 'student';

export default function App() {
  const [view, setView] = useState<AppView>('landing');

  if (view === 'teacher') return <TeacherView onBack={() => setView('landing')} />;
  if (view === 'student') return <StudentView onBack={() => setView('landing')} />;
  return <LandingView onTeacher={() => setView('teacher')} onStudent={() => setView('student')} />;
}
