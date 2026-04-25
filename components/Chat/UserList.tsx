"use client";
import type React from "react";

type UserItem = { id: string; name: string };

interface UserListProps {
  users: UserItem[];
  handleContextMenu: (e: React.MouseEvent, userId: string) => void;
}

export default function UserList({ users, handleContextMenu }: UserListProps) {
  return (
    <div className="w-64 bg-slate-950 border-l border-slate-900 p-4 space-y-6 shrink-0">
      <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest px-2">Çevrimiçi — {users.length}</h3>
      
      <div className="space-y-3">
        {users.map((u) => (
          <div 
            key={u.id} 
            onContextMenu={(e) => handleContextMenu(e, u.id)}
            className="group flex items-center gap-3 p-2 rounded-xl hover:bg-slate-900/50 cursor-pointer transition-all"
          >
            <div className="relative">
              <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center font-black text-xs border-2 border-transparent group-hover:border-rose-500 transition-all">
                {u.name[0].toUpperCase()}
              </div>
              {/* Online Durum Işığı */}
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-950 rounded-full shadow-sm"></div>
            </div>
            
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-xs font-black text-slate-300 truncate group-hover:text-white uppercase">{u.name}</span>
              </div>
              <span className="text-[8px] text-slate-600 font-bold uppercase truncate italic">&quot;Playing Cyberpunk 2077&quot;</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}