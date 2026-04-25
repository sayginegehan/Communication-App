"use client";
import React from "react";

interface ControlBarProps {
  isMuted: boolean;
  isDeafened: boolean;
  toggleMute: () => void;
  toggleDeafen: () => void;
}

export default function ControlBar({ isMuted, isDeafened, toggleMute, toggleDeafen }: ControlBarProps) {
  return (
    <div className="p-4 bg-slate-800/50 border-t border-slate-800 space-y-3 shrink-0">
      <button onClick={toggleDeafen} className={`w-full p-4 rounded-2xl font-black text-[10px] uppercase shadow-lg transform active:scale-95 transition-all ${isDeafened ? 'bg-amber-500 text-slate-900' : 'bg-slate-700'}`}>
        {isDeafened ? "Kulaklığı Aç" : "Kulaklığı Sustur"}
      </button>
      <button onClick={toggleMute} className={`w-full p-4 rounded-2xl font-black text-[10px] uppercase shadow-lg transform active:scale-95 transition-all ${isMuted ? 'bg-rose-600' : 'bg-sky-600'} ${isDeafened ? 'opacity-50 cursor-not-allowed' : ''}`}>
        {isMuted ? "Mikrofonu Aç" : "Mikrofonu Kapat"}
      </button>
    </div>
  );
}