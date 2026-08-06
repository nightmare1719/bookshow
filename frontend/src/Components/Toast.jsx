import React from 'react';
import { useApp } from '../context/AppContext';

export default function Toast() {
  const { toast } = useApp();

  if (!toast) return null;

  const bgColor =
    toast.type === 'error'
      ? 'bg-red-500/25 border-red-400/40 text-red-50'
      : toast.type === 'success'
      ? 'bg-green-500/25 border-green-400/40 text-green-50'
      : 'bg-blue-500/25 border-blue-400/40 text-blue-50';

  return (
    <div className={`toast ${bgColor}`}>
      <i
        className={`fas ${
          toast.type === 'error'
            ? 'fa-exclamation-circle'
            : toast.type === 'success'
            ? 'fa-check-circle'
            : 'fa-info-circle'
        } mr-2`}
      ></i>
      {toast.message}
    </div>
  );
}
