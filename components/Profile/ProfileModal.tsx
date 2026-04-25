"use client";
import React, { useState } from "react";

type ProfileData = {
  name: string;
  bio: string;
  status?: "online" | "idle" | "dnd";
};

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userData: ProfileData;
  onSave: (data: ProfileData) => void;
}

export default function ProfileModal({ isOpen, onClose, userData, onSave }: ProfileModalProps) {
  const [bio, setBio] = useState(userData.bio || "");
  const [name, setName] = useState(userData.name || "");
  const [status, setStatus] = useState<ProfileData["status"]>("online");
  const statuses: Array<NonNullable<ProfileData["status"]>> = ["online", "idle", "dnd"];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-[32px] overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
        {/* Üst Banner Kısmı */}
        <div className="h-24 bg-gradient-to-r from-rose-600 to-rose-900 relative">
          <button onClick={onClose} className="absolute top-4 right-4 bg-black/20 hover:bg-black/40 text-white w-8 h-8 rounded-full flex items-center justify-center transition-all">✕</button>
        </div>

        <div className="px-6 pb-8 -mt-12 relative">
          {/* Avatar Düzenleme */}
          <div className="relative inline-block group">
            <div className="w-24 h-24 rounded-3xl bg-slate-800 border-4 border-slate-900 flex items-center justify-center text-4xl font-black text-white shadow-xl overflow-hidden">
              {name[0]?.toUpperCase()}
            </div>
            <div className="absolute inset-0 bg-black/40 rounded-3xl opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-all">
              <span className="text-[10px] font-black uppercase">Değiştir</span>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            {/* İsim Düzenleme */}
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Kullanıcı Adı</label>
              <input 
                type="text" 
                value={name} 
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 mt-1 text-sm text-white focus:border-rose-500 outline-none transition-all"
              />
            </div>

            {/* Bio Düzenleme */}
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Hakkında (Bio)</label>
              <textarea 
                value={bio} 
                onChange={(e) => setBio(e.target.value)}
                placeholder="Kendinden bahset..."
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 mt-1 text-sm text-white focus:border-rose-500 outline-none transition-all h-24 resize-none"
              />
            </div>

            {/* Durum Seçimi */}
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Durum</label>
              <div className="flex gap-2 mt-1">
                {statuses.map((s) => (
                  <button 
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`flex-1 p-2 rounded-xl border text-[10px] font-black uppercase transition-all ${
                      status === s ? 'bg-rose-600 border-rose-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500 hover:bg-slate-800'
                    }`}
                  >
                    {s === 'online' ? 'Çevrimiçi' : s === 'idle' ? 'Boşta' : 'Rahatsız Etmeyin'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Kaydet Butonu */}
          <div className="mt-8 flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 p-4 rounded-2xl text-[12px] font-black uppercase text-slate-400 hover:bg-slate-800 transition-all"
            >
              İptal
            </button>
            <button 
              onClick={() => onSave({ name, bio, status })}
              className="flex-[2] p-4 rounded-2xl text-[12px] font-black uppercase bg-sky-600 text-white shadow-lg hover:scale-105 active:scale-95 transition-all"
            >
              Değişiklikleri Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}