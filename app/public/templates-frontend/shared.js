// Example helper for frontend

export function formatDate(date) {
    // Just format date to YYYY-MM-DD (or adapt)
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  }
  