import React from 'react';
import { useApp } from '../context/AppContext';

export default function Toast() {
  const { toast } = useApp();

  if (!toast) return null;

  const bgClass =
    toast.type === 'success'
      ? 'bg-green-700'
      : toast.type === 'error'
      ? 'bg-red-700'
      : 'bg-blue-700';

  return (
    <div className={`toast ${bgClass} text-white shadow-xl flex items-center gap-2`}>
      {toast.type === 'success' && <i className="fas fa-check-circle"></i>}
      {toast.type === 'error' && <i className="fas fa-exclamation-circle"></i>}
      {toast.type === 'info' && <i className="fas fa-info-circle"></i>}
      <span>{toast.message}</span>
    </div>
  );
}
