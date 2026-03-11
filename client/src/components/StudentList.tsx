import type { StudentInfo } from '../types';

interface Props {
  students: StudentInfo[];
  totalWords: number;
}

export default function StudentList({ students, totalWords }: Props) {
  const sorted = [...students].sort((a, b) => {
    if (a.submitted !== b.submitted) return a.submitted ? -1 : 1;
    return b.correctCount - a.correctCount;
  });

  return (
    <div className="student-list">
      <h3 className="student-list-title">
        Schüler:innen
        <span className="student-count">{students.length}</span>
      </h3>
      {students.length === 0 ? (
        <div className="student-empty">
          <p>Noch niemand beigetreten.</p>
          <p>Teile den Raumcode mit den Schüler:innen!</p>
        </div>
      ) : (
        <div className="student-rows">
          {sorted.map(s => (
            <div key={s.id} className={`student-row ${s.submitted ? 'submitted' : 'active'}`}>
              <div className="student-info">
                <span className="student-status">{s.submitted ? '✅' : '⏳'}</span>
                <span className="student-name">{s.name}</span>
              </div>
              {s.submitted && (
                <div className="student-score">
                  <span className={`score-badge ${s.correctCount === totalWords ? 'perfect' : s.correctCount >= totalWords / 2 ? 'good' : 'low'}`}>
                    {s.correctCount}/{totalWords}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
