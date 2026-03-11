export interface WordDef {
  word: string;
  clue: string;
}

export interface PlacedWord {
  id: number;
  word: string;
  clue: string;
  row: number;
  col: number;
  direction: 'across' | 'down';
  number: number;
}

export interface GridCell {
  letter: string | null;
  number: number | null;
}

export interface Crossword {
  grid: GridCell[][];
  words: PlacedWord[];
  rows: number;
  cols: number;
  unplacedCount: number;
  solutionWordId: number;
  solutionPath: Array<{ row: number; col: number }>;
}

export interface StudentInfo {
  id: string;
  name: string;
  correctCount: number;
  totalWords: number;
  submitted: boolean;
}
