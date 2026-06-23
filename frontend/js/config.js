// URL scheme:
//   login:   /{school}          → first segment is the school slug
//   admin:   /admin/{school}    → second segment is the school slug
//   teacher: /teacher/{school}  → second segment is the school slug
//   student: /student/{school}  → second segment is the school slug
const _parts = window.location.pathname.split('/').filter(Boolean);
const _ROLE_PAGES = ['admin', 'teacher', 'student', 'superadmin'];
const SCHOOL_SLUG = _ROLE_PAGES.includes(_parts[0]) ? (_parts[1] ?? null) : (_parts[0] ?? null);
const API_BASE    = '/api';
