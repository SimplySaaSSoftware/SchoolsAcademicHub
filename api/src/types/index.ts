// ================================================================
// Shared TypeScript types for HPS Hub SaaS
// ================================================================

export type Role = 'super_admin' | 'admin' | 'teacher' | 'student';
export type AuthMode = 'pin' | 'email';
export type StudentAuth = 'grade_pin' | 'student_pin' | 'student_email';

// ---- Cosmos DB base ----

export interface BaseDoc {
  id: string;
  school_id: string;
  type: string;
  created_at: string;
}

// ---- School / Tenant ----

export interface SchoolDoc extends BaseDoc {
  type: 'school';
  slug: string;
  name: string;
  logo_url: string;
  primary_colour: string;
  auth_mode: AuthMode;
  student_auth: StudentAuth;
  grades: number[];
  active: boolean;
}

// ---- Users (email/password auth) ----

export interface UserDoc extends BaseDoc {
  type: 'user';
  role: Role;
  email: string;
  password_hash: string;
  name: string;
  grade?: number;
  active: boolean;
}

// ---- PINs ----

export interface PinDoc extends BaseDoc {
  type: 'pin';
  role: Role;
  grade?: number;
  pin_hash: string;
  label: string;
}

// ---- Posts ----

export interface AuditEntry {
  action: 'created' | 'updated' | 'status_changed' | 'deleted';
  user_id: string;
  user_name: string;
  user_role: Role;
  timestamp: string;
  changes?: string[];
  from?: string;
  to?: string;
}

export interface Attachment {
  filename: string;
  driveId: string;
}

export interface QuizOption {
  text: string;
}

export interface QuizQuestion {
  type: 'mc' | 'tf';
  q: string;
  options?: string[];
  correct: number;
}

export interface PostDoc extends BaseDoc {
  type: 'post';
  title: string;
  grade: number;
  subject: string;
  term: string;
  content_html: string;
  attachments_json: string;
  quiz_json: string;
  status: 'draft' | 'published';
  author_id: string;
  author_name: string;
  updated_at: string;
  updated_by_id?: string;
  updated_by_name?: string;
  published_at?: string;
  published_by_id?: string;
  published_by_name?: string;
  audit: AuditEntry[];
}

// ---- Subjects / Terms ----

export interface SubjectDoc extends BaseDoc {
  type: 'subject';
  name: string;
}

export interface TermDoc extends BaseDoc {
  type: 'term';
  name: string;
}

// ---- Activity tracking ----

export interface ActivityDoc extends BaseDoc {
  type: 'activity';
  event: 'post_opened';
  student_id: string;
  student_name: string;
  grade: number;
  post_id: string;
  post_title: string;
  subject: string;
  term: string;
  timestamp: string;
  ttl?: number;
}

export interface QuizAttemptDoc extends BaseDoc {
  type: 'quiz_attempt';
  student_id: string;
  student_name: string;
  grade: number;
  post_id: string;
  post_title: string;
  subject: string;
  term: string;
  attempt_number: number;
  score: number;
  total: number;
  percentage: number;
  passed: boolean;
  answers: Array<{
    question_index: number;
    chosen: number;
    correct: number;
    is_right: boolean;
  }>;
  time_taken_seconds?: number;
  timestamp: string;
  ttl?: number;
}

// ---- Password reset ----

export interface ResetTokenDoc extends BaseDoc {
  type: 'reset_token';
  user_id: string;
  token: string;
  expires_at: string;
  ttl: number;
}

// ---- JWT ----

export interface JwtPayload {
  school_id: string;
  user_id: string;
  role: Role;
  grade?: number;
  name?: string;
  iat?: number;
  exp?: number;
}

// ---- API response shapes ----

export interface LoginResponse {
  token: string;
  role: Role;
  grade?: number;
  name?: string;
  school: {
    slug: string;
    name: string;
    logo_url: string;
    primary_colour: string;
    auth_mode: AuthMode;
    student_auth: StudentAuth;
    grades: number[];
  };
}

export interface PostStats {
  unique_viewers: number;
  total_students: number;
  quiz_attempts: number;
  avg_score: number | null;
  pass_rate: number | null;
}

export interface DashboardSummary {
  published_posts: number;
  avg_engagement: number;
  total_students: number;
  active_quizzes: number;
  avg_quiz_score: number | null;
}
