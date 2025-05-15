// /shared/formatDate.js (backend)
function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
  }
  
  module.exports = { formatDate };
  