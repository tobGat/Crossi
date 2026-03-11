interface Props {
  onTeacher: () => void;
  onStudent: () => void;
}

export default function LandingView({ onTeacher, onStudent }: Props) {
  return (
    <div className="landing">
      <div className="landing-hero">
        <img src="/logo_crossi.png" alt="Crossi" className="landing-logo" />
        <h1>Crossi</h1>
        <p className="landing-subtitle">Kreuzworträtsel für den Unterricht</p>
      </div>
      <div className="landing-cards">
        <button className="role-card teacher-card" onClick={onTeacher}>
          <span className="role-icon">👩‍🏫</span>
          <span className="role-title">Lehrkraft</span>
          <span className="role-desc">Rätsel erstellen und Ergebnisse verwalten</span>
        </button>
        <button className="role-card student-card" onClick={onStudent}>
          <span className="role-icon">🎒</span>
          <span className="role-title">Schüler:in</span>
          <span className="role-desc">Einem Raum beitreten und mitspielen</span>
        </button>
      </div>
    </div>
  );
}
