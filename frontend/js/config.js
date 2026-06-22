// Read school slug from URL: /lincoln-primary/... → "lincoln-primary"
const SCHOOL_SLUG = window.location.pathname.split('/').filter(Boolean)[0] ?? null;
const API_BASE    = '/api';
