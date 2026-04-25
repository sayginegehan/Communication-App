"use client";
import React from "react";

interface ServerListProps {
  servers: { id: string; name: string }[];
  currentServer: string;
  setCurrentServer: (id: string) => void;
  userName: string;
  socket: {
    emit: (event: string, payload?: unknown, ack?: (response: { ok?: boolean; error?: string; serverId?: string }) => void) => void;
  };
}

export default function ServerList({ servers, currentServer, setCurrentServer, userName, socket }: ServerListProps) {
  const createServer = () => {
    const value = prompt("Sunucu adı girin:");
    if (value) socket.emit("create-server", { serverName: value, userName });
  };

  return (
    <div className="w-20 bg-slate-950 border-r border-slate-900 flex flex-col items-center py-4 gap-3 shrink-0">
      {servers.map((s) => (
        <button
          key={s.id}
          onClick={() => setCurrentServer(s.id)}
          className={`w-12 h-12 rounded-[24px] hover:rounded-2xl transition-all duration-300 flex items-center justify-center font-black text-lg ${
            currentServer === s.id ? "bg-rose-600 text-white" : "bg-slate-800 text-slate-400"
          }`}
        >
          {s.name[0].toUpperCase()}
        </button>
      ))}
      <button onClick={createServer} className="w-12 h-12 rounded-[24px] hover:rounded-2xl transition-all bg-emerald-600 text-white font-black text-2xl shadow-lg">+</button>
    </div>
  );
}