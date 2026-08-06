export function formatDate(d) {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCurrency(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN');
}
