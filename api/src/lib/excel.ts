import ExcelJS from 'exceljs';
import { PostDoc, ActivityDoc, QuizAttemptDoc, SchoolDoc } from '../types';

function headerStyle(school: Pick<SchoolDoc, 'primary_colour'>): Partial<ExcelJS.Style> {
  const hex = school.primary_colour.replace('#', '');
  return {
    fill:   { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex}` } },
    font:   { bold: true, color: { argb: 'FFFFFFFF' } },
    border: { bottom: { style: 'thin' } },
  };
}

function addHeader(ws: ExcelJS.Worksheet, school: Pick<SchoolDoc, 'name' | 'primary_colour'>, exportType: string) {
  ws.mergeCells('A1:N1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `${school.name} — ${exportType} — ${new Date().toLocaleDateString('en-ZA')}`;
  titleCell.style = {
    font: { bold: true, size: 13 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } },
  };
  ws.getRow(1).height = 24;
}

export async function buildPostsExport(
  posts: PostDoc[],
  attemptsByPost: Map<string, QuizAttemptDoc[]>,
  school: Pick<SchoolDoc, 'name' | 'primary_colour'>
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Posts');

  addHeader(ws, school, 'Posts Export');

  const cols: Partial<ExcelJS.Column>[] = [
    { header: 'Title',           key: 'title',             width: 30 },
    { header: 'Grade',           key: 'grade',             width: 8  },
    { header: 'Subject',         key: 'subject',           width: 18 },
    { header: 'Term',            key: 'term',              width: 12 },
    { header: 'Status',          key: 'status',            width: 12 },
    { header: 'Has Quiz',        key: 'has_quiz',          width: 10 },
    { header: 'Quiz Questions',  key: 'quiz_questions',    width: 14 },
    { header: 'Total Attempts',  key: 'total_attempts',    width: 14 },
    { header: 'Avg Score (%)',   key: 'avg_score',         width: 14 },
    { header: 'Pass Rate (%)',   key: 'pass_rate',         width: 14 },
    { header: 'Created By',      key: 'created_by',        width: 20 },
    { header: 'Created At',      key: 'created_at',        width: 20 },
    { header: 'Last Edited By',  key: 'last_edited_by',    width: 20 },
    { header: 'Last Edited At',  key: 'last_edited_at',    width: 20 },
    { header: 'Published By',    key: 'published_by',      width: 20 },
    { header: 'Published At',    key: 'published_at',      width: 20 },
  ];
  ws.columns = cols;

  const hStyle = headerStyle(school);
  ws.getRow(2).eachCell((cell) => { cell.style = hStyle; });

  posts.forEach((p) => {
    let quizQuestions = 0;
    try { quizQuestions = JSON.parse(p.quiz_json || '[]').length; } catch { /**/ }

    const attempts = attemptsByPost.get(p.id) ?? [];
    const avgScore = attempts.length > 0
      ? Math.round(attempts.reduce((s, a) => s + a.percentage, 0) / attempts.length)
      : null;
    const passRate = attempts.length > 0
      ? Math.round((attempts.filter((a) => a.passed).length / attempts.length) * 100)
      : null;

    const lastEdit = [...p.audit].reverse().find((e) => e.action === 'updated');
    const published = p.audit.find((e) => e.action === 'status_changed' && e.to === 'published');

    ws.addRow({
      title:          p.title,
      grade:          `Grade ${p.grade}`,
      subject:        p.subject,
      term:           p.term,
      status:         p.status,
      has_quiz:       quizQuestions > 0 ? 'Yes' : 'No',
      quiz_questions: quizQuestions > 0 ? quizQuestions : '',
      total_attempts: attempts.length || '',
      avg_score:      avgScore ?? '',
      pass_rate:      passRate ?? '',
      created_by:     p.author_name,
      created_at:     new Date(p.created_at).toLocaleString('en-ZA'),
      last_edited_by: lastEdit?.user_name ?? '',
      last_edited_at: lastEdit ? new Date(lastEdit.timestamp).toLocaleString('en-ZA') : '',
      published_by:   published?.user_name ?? '',
      published_at:   p.published_at ? new Date(p.published_at).toLocaleString('en-ZA') : '',
    });
  });

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

export async function buildViewersExport(
  post: PostDoc,
  activities: ActivityDoc[],
  school: Pick<SchoolDoc, 'name' | 'primary_colour'>
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Viewers');

  addHeader(ws, school, `Viewers — ${post.title}`);

  ws.columns = [
    { header: 'Student',       key: 'student',       width: 24 },
    { header: 'Grade',         key: 'grade',         width: 8  },
    { header: 'First Opened',  key: 'first_opened',  width: 22 },
    { header: 'Last Opened',   key: 'last_opened',   width: 22 },
    { header: 'Times Opened',  key: 'times_opened',  width: 14 },
  ] as Partial<ExcelJS.Column>[];

  const hStyle = headerStyle(school);
  ws.getRow(2).eachCell((cell) => { cell.style = hStyle; });

  const byStudent = new Map<string, ActivityDoc[]>();
  activities.forEach((a) => {
    if (!byStudent.has(a.student_id)) byStudent.set(a.student_id, []);
    byStudent.get(a.student_id)!.push(a);
  });

  byStudent.forEach((events) => {
    const sorted = events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    ws.addRow({
      student:      sorted[0].student_name,
      grade:        `Grade ${sorted[0].grade}`,
      first_opened: new Date(sorted[0].timestamp).toLocaleString('en-ZA'),
      last_opened:  new Date(sorted[sorted.length - 1].timestamp).toLocaleString('en-ZA'),
      times_opened: sorted.length,
    });
  });

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

export async function buildQuizExport(
  post: PostDoc,
  attempts: QuizAttemptDoc[],
  school: Pick<SchoolDoc, 'name' | 'primary_colour'>
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Quiz Results');

  addHeader(ws, school, `Quiz Results — ${post.title}`);

  ws.columns = [
    { header: 'Student',     key: 'student',    width: 24 },
    { header: 'Grade',       key: 'grade',      width: 8  },
    { header: 'Attempt #',   key: 'attempt',    width: 10 },
    { header: 'Score',       key: 'score',      width: 10 },
    { header: 'Total',       key: 'total',      width: 8  },
    { header: '%',           key: 'pct',        width: 8  },
    { header: 'Passed',      key: 'passed',     width: 8  },
    { header: 'Time (sec)',  key: 'time',       width: 12 },
    { header: 'Date',        key: 'date',       width: 22 },
  ] as Partial<ExcelJS.Column>[];

  const hStyle = headerStyle(school);
  ws.getRow(2).eachCell((cell) => { cell.style = hStyle; });

  attempts
    .sort((a, b) => a.student_name.localeCompare(b.student_name) || a.attempt_number - b.attempt_number)
    .forEach((a) => {
      ws.addRow({
        student: a.student_name,
        grade:   `Grade ${a.grade}`,
        attempt: a.attempt_number,
        score:   a.score,
        total:   a.total,
        pct:     a.percentage,
        passed:  a.passed ? 'Yes' : 'No',
        time:    a.time_taken_seconds ?? '',
        date:    new Date(a.timestamp).toLocaleString('en-ZA'),
      });
    });

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}
