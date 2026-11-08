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
  subjects?: string[];   // teachers: subjects they may access (empty/absent = all in their grade)
  active: boolean;
}

// ---- Students (individual PIN login) ----

export interface StudentDoc extends BaseDoc {
  type: 'student';
  name: string;
  grade: number;
  pin_lookup: string;   // HMAC of the PIN with a server secret; the PIN itself is never stored
  lang?: Lang;          // preferred interface language, follows the student across devices
  subjects?: string[];  // subjects the student is enrolled for (stored names). Empty/absent = every subject for their grade
  active: boolean;
}

// ---- PINs ----

export interface PinDoc extends BaseDoc {
  type: 'pin';
  role: Role;
  grade?: number;
  pin_hash: string;
  label: string;
  subjects?: string[];
}

// ---- Posts ----

export type Lang = 'en' | 'af';

/** Text-only translation of a post. Grading data (correct_index) always comes from the original quiz. */
export interface Translation {
  title: string;
  content_html: string;
  quiz: Array<{ question: string; options: string[] }>;
  status: 'draft' | 'verified';
  ai_generated: boolean;
  stale: boolean;            // original changed after this was written/verified -> hidden from students
  source_hash: string;       // hash of original title/content/quiz text when this was saved
  generated_at?: string;
  updated_at: string;
  verified_by_id?: string;
  verified_by_name?: string;
  verified_at?: string;
}

export interface AuditEntry {
  action: 'created' | 'updated' | 'status_changed' | 'deleted' | 'translated' | 'translation_verified';
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
  quiz_hide_content?: boolean;
  lang?: Lang;                                   // original language (absent on legacy posts = 'en')
  translations?: Partial<Record<Lang, Translation>>;
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
  name: string;                       // the key posts store in `subject`; never renamed
  names?: { en?: string; af?: string }; // display names per language
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
  lang?: Lang;
  score: number;
  total: number;
  percentage: number;
  passed: boolean;
  answers: Array<{
    question_index: number;
    chosen: number;
    correct: number;
    is_right: boolean;
    question?: string;
    selected_text?: string;
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

// ---- Channels ----

export interface ChannelDoc extends BaseDoc {
  type: 'channel';
  name: string;
  name_af?: string;
  parent_id: string | null;   // null = top-level channel
  order: number;
  created_by_id: string;
  created_by_name: string;
}

/** Translation of a channel post (title + content only, no quiz). */
export interface ChannelPostTranslation {
  title: string;
  content_html: string;
  status: 'draft' | 'verified';
  stale: boolean;
  source_hash: string;
  updated_at: string;
  verified_by_id?: string;
  verified_by_name?: string;
  verified_at?: string;
}

export interface ChannelPostDoc extends BaseDoc {
  type: 'channel_post';
  channel_id: string;
  title: string;
  content_html: string;
  attachments_json: string;   // JSON array of Attachment
  event_id?: string | null;   // optional linked CalendarEventDoc
  lang: Lang;
  translations?: Partial<Record<Lang, ChannelPostTranslation>>;
  status: 'draft' | 'published';
  author_id: string;
  author_name: string;
  updated_at: string;
}

// ---- Calendar events ----

export interface CalendarEventDoc extends BaseDoc {
  type: 'calendar_event';
  title: string;
  title_af?: string;
  description: string;
  description_af?: string;
  location?: string;
  start_date: string;    // ISO date string
  end_date?: string;     // ISO date string; absent = same day as start_date
  created_by_id: string;
  created_by_name: string;
  updated_at: string;
}
