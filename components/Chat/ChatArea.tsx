"use client";
import React from "react";

type MessageItem = {
  id: number | string;
  sender: string;
  text: string;
  time?: string;
  attachment?: {
    name: string;
    type: string;
    dataUrl: string;
    size: number;
  };
};

interface ChatAreaProps {
  messages: MessageItem[];
  newMessage: string;
  setNewMessage: (value: string) => void;
  sendMessage: (e: React.FormEvent<HTMLFormElement>) => void;
  userName: string;
  currentRoom: string;
  typingLabel: string;
  pinnedMessages: MessageItem[];
  onTogglePinMessage: (message: MessageItem) => void;
  isPinned: (messageId: number | string) => boolean;
  onPickFile: (file: File) => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  reactionsByMessage: Record<string, number>;
  onToggleReaction: (messageId: number | string) => void;
  likedByMe: Record<string, boolean>;
  onDeleteMessage: (message: MessageItem) => void;
  isPinnedPanelOpen: boolean;
  onTogglePinnedPanel: () => void;
  themeMode: "dark" | "light";
  onToggleThemeMode: () => void;
}

export default function ChatArea({
  messages,
  newMessage,
  setNewMessage,
  sendMessage,
  userName,
  currentRoom,
  typingLabel,
  pinnedMessages,
  onTogglePinMessage,
  isPinned,
  onPickFile,
  searchTerm,
  onSearchTermChange,
  reactionsByMessage,
  onToggleReaction,
  likedByMe,
  onDeleteMessage,
  isPinnedPanelOpen,
  onTogglePinnedPanel,
  themeMode,
  onToggleThemeMode,
}: ChatAreaProps) {
  const visibleMessages = searchTerm.trim()
    ? messages.filter(
        (message) =>
          message.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
          message.sender.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : messages;

  return (
    <div className={`flex-1 flex flex-col ${themeMode === "dark" ? "bg-slate-950" : "bg-slate-100"}`}>
      <div className={`p-4 border-b flex justify-between items-center shadow-sm ${themeMode === "dark" ? "border-slate-900 bg-slate-900/20" : "border-slate-200 bg-white"}`}>
        <h2 className="font-black text-sm uppercase tracking-widest"># {currentRoom || "Kanal Seçilmedi"}</h2>
        <div className="flex gap-4 text-slate-500 text-xs font-bold uppercase">
          <span className="hover:text-white cursor-pointer">Duyurular</span>
          <button type="button" onClick={onTogglePinnedPanel} className="hover:text-white">
            Sabitlenenler ({pinnedMessages.length})
          </button>
          <button type="button" onClick={onToggleThemeMode} className="hover:text-white normal-case">
            {themeMode === "dark" ? "Açık Tema" : "Koyu Tema"}
          </button>
        </div>
      </div>
      <div className="px-4 py-2 border-b border-slate-900">
        <input
          type="text"
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          placeholder="Mesajlarda ara..."
          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-sky-500"
        />
      </div>

      {isPinnedPanelOpen && pinnedMessages.length > 0 ? (
        <div className="px-6 py-3 border-b border-slate-900 bg-slate-900/40 space-y-2 max-h-28 overflow-y-auto">
          {pinnedMessages.slice(-3).map((m) => (
            <div key={`pinned-${m.id}`} className="text-xs text-slate-300 truncate">
              <span className="text-amber-300 mr-1">📌</span>
              <span className="font-bold mr-1">{m.sender}:</span>
              <span>{m.text || (m.attachment ? `${m.attachment.name} dosyasını paylaştı` : "")}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {visibleMessages.map((m) => (
          <div key={m.id} className="group flex flex-col hover:bg-slate-900/30 p-2 rounded-2xl transition-all relative">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-black uppercase ${m.sender === userName ? 'text-sky-500' : 'text-rose-500'}`}>
                {m.sender}
              </span>
              <span className="text-[8px] text-slate-600 font-bold uppercase">{m.time || "şimdi"}</span>
            </div>
            <div className="text-sm text-slate-300 leading-relaxed pr-20">
              {m.text}
            </div>
            {m.attachment ? (
              <a
                href={m.attachment.dataUrl}
                download={m.attachment.name}
                className="mt-2 inline-flex items-center gap-2 text-xs text-sky-300 hover:text-sky-200 underline underline-offset-2"
              >
                📎 {m.attachment.name}
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => onTogglePinMessage(m)}
              className={`absolute right-2 top-2 text-xs px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-all ${
                isPinned(m.id) ? "bg-amber-500 text-slate-900" : "bg-slate-700 text-slate-200"
              }`}
              title="Mesajı sabitle"
            >
              📌
            </button>
            <button
              type="button"
              onClick={() => onToggleReaction(m.id)}
              className={`absolute right-14 top-2 text-xs px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-all ${
                likedByMe[String(m.id)] ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-200"
              }`}
            >
              👍 {reactionsByMessage[String(m.id)] || 0}
            </button>
            {m.sender === userName ? (
              <button
                type="button"
                onClick={() => onDeleteMessage(m)}
                className="absolute right-28 top-2 text-xs px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-all bg-rose-700 text-white"
              >
                Sil
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="px-6 py-1 text-[10px] text-slate-500 italic font-medium h-4">
        {typingLabel}
      </div>

      <div className="p-4 bg-slate-950">
        <form onSubmit={sendMessage} className="bg-slate-900 rounded-2xl flex items-center p-2 border border-slate-800 focus-within:border-sky-500 transition-all shadow-2xl">
          <label className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-sky-500 text-2xl cursor-pointer">
            +
            <input
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onPickFile(file);
                }
                event.currentTarget.value = "";
              }}
              disabled={!currentRoom}
            />
          </label>
          <input 
            type="text" 
            placeholder={`#${currentRoom} kanalına mesaj gönder`} 
            className="flex-1 bg-transparent border-none outline-none text-sm px-2 py-3 text-white placeholder:text-slate-600"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={!currentRoom}
          />
          <button type="submit" disabled={!currentRoom} className="bg-sky-600 text-white w-10 h-10 rounded-xl font-bold hover:scale-110 active:scale-95 transition-all shadow-lg disabled:opacity-50 disabled:hover:scale-100">❯</button>
        </form>
      </div>
    </div>
  );
}