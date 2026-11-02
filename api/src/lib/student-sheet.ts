import ExcelJS from 'exceljs';
import { StudentDoc } from '../types';

export interface SheetSubject { name: string; en: string; af: string }   // name = stored key, en/af = display names

export interface StudentStats { opened: number; taken: number; passed: number; avg: number | null; last: string | null }
export interface QuizResultRow { student: string; grade: number; subject: string; lesson: string; attempts: number; best: number; last: number; passed: boolean; when: string }
export interface LessonRow { title: string; subject: string; grade: number; term: string; status: string; viewers: number; attempts: number; avg: number | null; passRate: number | null }

const INFO = ' (info only)';
const BLUE = 'FF1A56A0';
const GREY = 'FF7A869A';

const sast = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', hour12: false }).replace(',', '') : '';

function styleHeader(row: ExcelJS.Row, infoFrom: number, totalCols: number) {
  row.height = 30;
  for (let c = 1; c <= totalCols; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c >= infoFrom ? GREY : BLUE } };
    cell.alignment = { vertical: 'middle', horizontal: c > 3 ? 'center' : 'left', wrapText: true };
  }
}

export async function buildStudentSheet(opts: {
  schoolName: string;
  students: StudentDoc[];
  subjects: SheetSubject[];
  stats: Map<string, StudentStats>;
  results: QuizResultRow[];
  lessons: LessonRow[];
  gradeLabel: string;
}): Promise<Buffer> {
  const { students, subjects, stats } = opts;
  const wb = new ExcelJS.Workbook();

  // ── Students (the sheet teachers edit and re-import) ─────────
  const ws = wb.addWorksheet('Students', { views: [{ state: 'frozen', ySplit: 1, xSplit: 3 }] });
  const subjectStart = 4;
  const infoStart = subjectStart + subjects.length;
  const headers = [
    'Student ID', 'Name', 'Grade',
    ...subjects.map((s) => s.en),
    `Lessons opened${INFO}`, `Quizzes taken${INFO}`, `Quizzes passed${INFO}`, `Average score %${INFO}`, `Last active (SAST)${INFO}`,
  ];
  ws.addRow(headers);
  styleHeader(ws.getRow(1), infoStart, headers.length);
  ws.getColumn(1).width = 38; ws.getColumn(2).width = 28; ws.getColumn(3).width = 8;
  subjects.forEach((_, i) => { ws.getColumn(subjectStart + i).width = 14; });
  for (let c = infoStart; c <= headers.length; c++) ws.getColumn(c).width = 16;

  for (const st of students) {
    const sub = new Set(st.subjects ?? []);
    const s = stats.get(st.id);
    ws.addRow([
      st.id, st.name, st.grade,
      ...subjects.map((x) => (sub.has(x.name) ? 'Yes' : '')),
      s?.opened ?? 0, s?.taken ?? 0, s?.passed ?? 0, s?.avg ?? '', sast(s?.last ?? null),
    ]);
  }
  // Spare rows for new students, with the same drop-downs
  const lastDataRow = students.length + 1;
  const spare = 60;
  for (let r = 2; r <= lastDataRow + spare; r++) {
    ws.getCell(r, 3).dataValidation = { type: 'whole', operator: 'between', formulae: [1, 13], allowBlank: true, showErrorMessage: true, errorTitle: 'Grade', error: 'Enter a grade from 1 to 13' };
    for (let i = 0; i < subjects.length; i++) {
      const cell = ws.getCell(r, subjectStart + i);
      cell.dataValidation = { type: 'list', allowBlank: true, formulae: ['"Yes"'] };
      cell.alignment = { horizontal: 'center' };
    }
  }
  for (let r = 2; r <= lastDataRow; r++) {
    ws.getCell(r, 1).font = { color: { argb: GREY }, size: 9 };
    for (let c = infoStart; c <= headers.length; c++) ws.getCell(r, c).font = { color: { argb: GREY } };
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  // ── Quiz results (read only) ────────────────────────────────
  const wr = wb.addWorksheet('Quiz results', { views: [{ state: 'frozen', ySplit: 1 }] });
  wr.addRow(['Student', 'Grade', 'Subject', 'Lesson', 'Attempts', 'Best %', 'Last %', 'Passed (80%+)', 'Last attempt (SAST)']);
  styleHeader(wr.getRow(1), 1, 9);
  [28, 8, 18, 34, 10, 9, 9, 14, 20].forEach((w, i) => { wr.getColumn(i + 1).width = w; });
  opts.results.forEach((r) => wr.addRow([r.student, r.grade, r.subject, r.lesson, r.attempts, r.best, r.last, r.passed ? 'Yes' : 'No', sast(r.when)]));
  wr.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 9 } };

  // ── Lessons (read only) ─────────────────────────────────────
  const wl = wb.addWorksheet('Lessons', { views: [{ state: 'frozen', ySplit: 1 }] });
  wl.addRow(['Lesson', 'Subject', 'Grade', 'Term', 'Status', 'Students opened', 'Quiz attempts', 'Average %', 'Pass rate %']);
  styleHeader(wl.getRow(1), 1, 9);
  [36, 18, 8, 8, 12, 16, 14, 11, 12].forEach((w, i) => { wl.getColumn(i + 1).width = w; });
  opts.lessons.forEach((l) => wl.addRow([l.title, l.subject, l.grade, l.term, l.status, l.viewers, l.attempts, l.avg ?? '', l.passRate ?? '']));
  wl.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 9 } };

  // ── Subjects (reference) ────────────────────────────────────
  const wsub = wb.addWorksheet('Subjects');
  wsub.addRow(['English name', 'Afrikaanse naam']);
  styleHeader(wsub.getRow(1), 99, 2);
  wsub.getColumn(1).width = 26; wsub.getColumn(2).width = 26;
  subjects.forEach((s) => wsub.addRow([s.en, s.af]));

  // ── Read me ─────────────────────────────────────────────────
  const wi = wb.addWorksheet('Read me');
  wi.getColumn(1).width = 110;
  [
    `${opts.schoolName} — students (${opts.gradeLabel})`,
    '',
    'HOW TO UPDATE STUDENTS',
    '1. Edit the "Students" sheet: change names or grades, or tick subjects by typing Yes (use the drop-down).',
    '2. To add a new student, type in a blank row at the bottom: Name, Grade and the subjects. Leave Student ID empty.',
    '3. Save the file as .xlsx and use "Import Excel" on the Students screen. You will see a summary to check before anything is saved.',
    '',
    'SUBJECTS',
    'A student sees only the subjects marked Yes. If no subject is marked, the student sees every subject for their grade.',
    '',
    'WHAT IS IMPORTED',
    'Only Name, Grade and the subject columns. Grey columns, the Quiz results sheet and the Lessons sheet are information only and are ignored.',
    '',
    'GOOD TO KNOW',
    '- Do not change or delete the Student ID of an existing student, and do not rename the subject column headings.',
    '- Removing a row does NOT delete the student. Deactivate or delete students on the Students screen.',
    '- PINs are never in this file. New students get a PIN when you import; it is shown once, so save it then. Use "Reset PIN" for a lost PIN.',
  ].forEach((line, i) => {
    const cell = wi.getCell(i + 1, 1);
    cell.value = line;
    cell.alignment = { wrapText: true, vertical: 'top' };
    if (i === 0 || line === line.toUpperCase() && line.trim()) cell.font = { bold: true, size: i === 0 ? 14 : 11 };
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── Import ────────────────────────────────────────────────────

export interface ParsedRow { row: number; id: string; name: string; grade: number | null; gradeRaw: string; subjects: string[] }
export interface ParsedSheet { rows: ParsedRow[]; warnings: string[]; fatal?: string }

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const o = v as { richText?: Array<{ text: string }>; text?: string; result?: unknown };
    if (o.richText) return o.richText.map((r) => r.text).join('').trim();
    if (o.result !== undefined) return String(o.result).trim();
    if (o.text !== undefined) return String(o.text).trim();
    if (v instanceof Date) return v.toISOString();
    return '';
  }
  return String(v).trim();
}

const YES = new Set(['yes', 'y', 'x', 'true', '1', '✓', '✔', 'ja']);

export async function parseStudentSheet(buf: Buffer, subjects: SheetSubject[]): Promise<ParsedSheet> {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf as unknown as ArrayBuffer); }
  catch { return { rows: [], warnings: [], fatal: 'That file could not be read. Please upload an .xlsx file exported from this screen.' }; }

  const ws = wb.getWorksheet('Students') ?? wb.worksheets[0];
  if (!ws) return { rows: [], warnings: [], fatal: 'The workbook has no sheets.' };

  const headerCells = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(cellText);
  const colOf = (label: string) => headerCells.findIndex((h) => h.toLowerCase() === label.toLowerCase()) + 1;
  const idCol = colOf('Student ID'), nameCol = colOf('Name'), gradeCol = colOf('Grade');
  if (!nameCol || !gradeCol) return { rows: [], warnings: [], fatal: 'The "Students" sheet needs "Name" and "Grade" columns in row 1. Export a fresh file and edit that.' };

  const byLabel = new Map<string, string>();
  subjects.forEach((s) => { byLabel.set(s.en.toLowerCase(), s.name); byLabel.set(s.af.toLowerCase(), s.name); byLabel.set(s.name.toLowerCase(), s.name); });

  const subjectCols: Array<{ col: number; name: string }> = [];
  const warnings: string[] = [];
  headerCells.forEach((h, i) => {
    const col = i + 1;
    if (!h || col === idCol || col === nameCol || col === gradeCol || h.endsWith(INFO.trim()) || h.includes('(info only)')) return;
    const subject = byLabel.get(h.toLowerCase());
    if (subject) subjectCols.push({ col, name: subject });
    else warnings.push(`Column "${h}" is not a known subject and was ignored.`);
  });

  const rows: ParsedRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const id = idCol ? cellText(row.getCell(idCol).value) : '';
    const name = cellText(row.getCell(nameCol).value);
    const gradeRaw = cellText(row.getCell(gradeCol).value);
    const picked = subjectCols.filter((s) => YES.has(cellText(row.getCell(s.col).value).toLowerCase())).map((s) => s.name);
    if (!id && !name && !gradeRaw && picked.length === 0) continue;   // blank spare row
    const g = Number(gradeRaw);
    rows.push({ row: r, id, name, gradeRaw, grade: gradeRaw !== '' && Number.isInteger(g) ? g : null, subjects: picked });
  }
  return { rows, warnings };
}

export interface ImportPlan {
  creates: Array<{ row: number; name: string; grade: number; subjects: string[] }>;
  updates: Array<{ row: number; id: string; name: string; grade: number; subjects: string[]; changes: string[] }>;
  unchanged: number;
  errors: Array<{ row: number; message: string }>;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Decide what an import would do. Pure: no database access, so a dry run and the real run always agree. */
export function planImport(rows: ParsedRow[], existing: StudentDoc[], opts: { teacherGrade: number | null }): ImportPlan {
  const plan: ImportPlan = { creates: [], updates: [], unchanged: 0, errors: [] };
  const byId = new Map(existing.map((s) => [s.id, s]));
  const byKey = new Map<string, StudentDoc[]>();
  existing.forEach((s) => { const k = `${s.name.toLowerCase()}|${s.grade}`; byKey.set(k, [...(byKey.get(k) ?? []), s]); });
  const touched = new Set<string>();
  const newKeys = new Set<string>();
  const err = (row: number, message: string) => plan.errors.push({ row, message });

  for (const r of rows) {
    const name = r.name.replace(/\s+/g, ' ').trim();
    if (!name) { err(r.row, 'Name is missing.'); continue; }
    if (name.length > 80) { err(r.row, 'Name is too long (80 characters at most).'); continue; }
    if (r.grade === null || r.grade < 1 || r.grade > 13) { err(r.row, `Grade must be a number from 1 to 13${r.gradeRaw ? ` (found "${r.gradeRaw}")` : ''}.`); continue; }
    if (opts.teacherGrade !== null && r.grade !== opts.teacherGrade) { err(r.row, `You can only manage Grade ${opts.teacherGrade}. This row says Grade ${r.grade}.`); continue; }

    let match: StudentDoc | undefined;
    if (r.id) {
      match = byId.get(r.id);
      if (!match) { err(r.row, 'Student ID not found. Export a fresh file, or clear the ID to add a new student.'); continue; }
    } else {
      const found = byKey.get(`${name.toLowerCase()}|${r.grade}`) ?? [];
      if (found.length > 1) { err(r.row, `More than one student is called "${name}" in Grade ${r.grade}. Use the Student ID.`); continue; }
      match = found[0];
    }

    if (match) {
      if (opts.teacherGrade !== null && match.grade !== opts.teacherGrade) { err(r.row, 'That student is not in your grade.'); continue; }
      if (touched.has(match.id)) { err(r.row, `"${match.name}" appears more than once in the sheet.`); continue; }
      touched.add(match.id);
      const changes: string[] = [];
      if (match.name !== name) changes.push(`name → ${name}`);
      if (match.grade !== r.grade) changes.push(`grade ${match.grade} → ${r.grade}`);
      if (!sameSet(match.subjects ?? [], r.subjects)) changes.push('subjects');
      if (changes.length) plan.updates.push({ row: r.row, id: match.id, name, grade: r.grade, subjects: r.subjects, changes });
      else plan.unchanged++;
    } else {
      const key = `${name.toLowerCase()}|${r.grade}`;
      if (newKeys.has(key)) { err(r.row, `"${name}" appears more than once as a new student.`); continue; }
      newKeys.add(key);
      plan.creates.push({ row: r.row, name, grade: r.grade, subjects: r.subjects });
    }
  }
  return plan;
}
