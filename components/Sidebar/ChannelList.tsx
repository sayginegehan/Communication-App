"use client";
import React from "react";

type RoomItem = { name: string; serverId?: string };
type ChannelUser = {
  id: string;
  name: string;
  roomName?: string;
  isMuted?: boolean;
  isSpeaking?: boolean;
};

interface ChannelListProps {
  rooms: RoomItem[];
  currentRoom: string;
  handleJoinRoom: (roomName: string) => void;
  handleCreateRoom: () => void;
  handleDeleteRoom: (roomName: string) => void;
  currentUserId: string;
  users: ChannelUser[];
  userName: string;
  setIsJoined: (isJoined: boolean) => void;
  onOpenProfile: () => void;
}

export default function ChannelList({
  rooms,
  currentRoom,
  handleJoinRoom,
  handleCreateRoom,
  handleDeleteRoom,
  currentUserId,
  users,
  userName,
  setIsJoined,
  onOpenProfile,
}: ChannelListProps) {
  return (
    <div className="h-full bg-slate-900 flex flex-col min-h-0">
      <div className="p-6 border-b border-slate-800 flex justify-between items-center shadow-md">
        <h1 className="text-xl font-black text-rose-500 tracking-tighter italic">Dumbasscord</h1>
        <button onClick={() => setIsJoined(false)} className="text-[9px] text-rose-400 hover:underline font-black">ÇIKIŞ</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-6 min-h-0">
        <div 
          onClick={onOpenProfile}
          className="bg-slate-800/40 p-3 rounded-2xl border border-slate-700/50 mb-4 cursor-pointer hover:bg-slate-800 transition-all group"
        >
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1 group-hover:text-rose-500 transition-all">Profilini Düzenle</p>
          <p className="text-sm font-black text-slate-200 truncate">{userName}</p>
        </div>

        <div className="bg-slate-800/20 p-3 rounded-xl border border-slate-800/50 mb-2">
          <p className="text-[8px] text-slate-500 font-bold uppercase mb-1">Davet Kodu</p>
          <p className="text-xs font-black text-sky-400">dumbass.link/A78B</p>
        </div>

        <div className="space-y-1">
          <h3 className="text-[10px] font-black text-slate-500 mb-2 uppercase px-2 tracking-widest flex justify-between items-center">
            Kanallar{" "}
            <button
              onClick={handleCreateRoom}
              className="cursor-pointer hover:text-white text-lg leading-none"
              title="Kanal oluştur"
            >
              +
            </button>
          </h3>

          {rooms.map((room) => (
            <div key={`${room.serverId || "default"}-${room.name}`} className="group">
              <div className={`flex items-center gap-2 p-1 rounded-xl ${currentRoom === room.name ? "bg-sky-600/20" : ""}`}>
                <button
                  onClick={() => handleJoinRoom(room.name)}
                  className={`flex-1 flex items-center justify-between p-2.5 rounded-xl transition-all font-bold text-sm ${
                    currentRoom === room.name ? "bg-sky-600 text-white shadow-lg" : "text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-slate-500 font-black">#</span>
                    <span className="truncate">{room.name}</span>
                  </div>
                </button>
                <button
                  onClick={() => handleDeleteRoom(room.name)}
                  className="text-xs text-rose-400 hover:text-rose-300 px-2 py-1 rounded-md hover:bg-slate-900"
                  title="Kanalı sil"
                >
                  ✕
                </button>
              </div>

              <div className="pl-8 pr-2 py-1 space-y-1">
                {users
                  .filter((u) => u.roomName === room.name)
                  .map((u) => (
                    <div key={u.id} className="flex items-center justify-between text-[11px] text-slate-400">
                      <div className={`truncate ${u.isSpeaking && !u.isMuted ? "text-emerald-300 drop-shadow-[0_0_6px_rgba(52,211,153,0.7)]" : ""}`}>
                        {u.name}
                      </div>
                      <div className="text-[10px]">
                        {u.id === currentUserId && u.isMuted ? "🔇" : ""}
                        {u.id !== currentUserId && u.isMuted ? "🔕" : ""}
                        {u.isSpeaking && !u.isMuted ? "🟢" : ""}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}