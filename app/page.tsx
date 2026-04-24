"use client";
import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

const socketServerUrl =
  process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "http://localhost:3001";
const socketAuthToken = process.env.NEXT_PUBLIC_SOCKET_AUTH_TOKEN || "";
const socketPath = process.env.NEXT_PUBLIC_SOCKET_PATH || "/socket.io";
const socket = io(socketServerUrl, {
  path: socketPath,
  auth: socketAuthToken ? { token: socketAuthToken } : undefined,
});

export default function Home() {
  const [servers, setServers] = useState<any[]>([]);
  const [currentServer, setCurrentServer] = useState("default");
  const [newServerName, setNewServerName] = useState("");
  const [userName, setUserName] = useState("");
  const [currentRoom, setCurrentRoom] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [activeRooms, setActiveRooms] = useState<any[]>([]);
  const [isJoined, setIsJoined] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isNudged, setIsNudged] = useState(false);
  
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, userId: string } | null>(null);
  const [userVolumes, setUserVolumes] = useState<{ [key: string]: number }>({});
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [roomSettingsOpen, setRoomSettingsOpen] = useState(false);
  const [serverSettingsName, setServerSettingsName] = useState("");
  const [serverSettingsDescription, setServerSettingsDescription] = useState("");
  const [roomSettingsTarget, setRoomSettingsTarget] = useState("");
  const [roomSettingsName, setRoomSettingsName] = useState("");
  const [roomSettingsTopic, setRoomSettingsTopic] = useState("");
  const [transferTarget, setTransferTarget] = useState("");
  const [archivedServers, setArchivedServers] = useState<any[]>([]);
  const [archivedRooms, setArchivedRooms] = useState<any[]>([]);

  const peerConnections = useRef<{ [key: string]: RTCPeerConnection }>({});
  const remoteAudios = useRef<{ [key: string]: HTMLAudioElement }>({}); 
  const localStream = useRef<MediaStream | null>(null);
  const screenStream = useRef<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    socket.on("server-list", (serverList) => {
      setServers(serverList);
      if (!currentServer && serverList.length > 0) {
        setCurrentServer(serverList[0].id);
      }
    });
    socket.on("room-list", (rooms) => setActiveRooms(rooms));
    socket.on("archived-server-list", (list) => setArchivedServers(list));
    socket.on("archived-room-list", (list) => setArchivedRooms(list));
    socket.on("user-list", (userList) => setUsers(userList));
    socket.on("receive-message", (msg) => setMessages((prev) => [...prev, msg]));
    socket.on("message-history", (history) => setMessages(history));

    socket.on("receive-nudge", () => {
      setIsNudged(true);
      try { new Audio("https://www.soundjay.com/buttons/beep-01a.mp3").play(); } catch (e) {}
      setTimeout(() => setIsNudged(false), 500);
    });

    socket.on("user-joined", async (userId) => createPeer(userId, true));
    socket.on("user-left", (userId) => {
        if (peerConnections.current[userId]) {
            peerConnections.current[userId].close();
            delete peerConnections.current[userId];
            delete remoteAudios.current[userId];
        }
    });

    socket.on("offer", async ({ offer, from }) => {
      const pc = createPeer(from, false);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { answer, to: from });
    });

    socket.on("answer", async ({ answer, from }) => {
      const pc = peerConnections.current[from];
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on("ice-candidate", async ({ candidate, from }) => {
      const pc = peerConnections.current[from];
      if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    socket.on("connect", () => {
      socket.emit("request-state");
    });

    if (socket.connected) {
      socket.emit("request-state");
    }

    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    return () => { socket.off(); window.removeEventListener("click", closeMenu); };
  }, [currentServer]);

  const createPeer = (targetId: string, isInitiator: boolean) => {
    if (peerConnections.current[targetId]) return peerConnections.current[targetId];
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    
    pc.onicecandidate = (e) => e.candidate && socket.emit("ice-candidate", { candidate: e.candidate, to: targetId });
    pc.ontrack = (e) => {
      if (e.track.kind === "video") {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
      } else {
        const audio = new Audio();
        audio.srcObject = e.streams[0];
        audio.autoplay = true;
        audio.volume = userVolumes[targetId] ?? 1.0;
        remoteAudios.current[targetId] = audio;
        document.body.appendChild(audio);
      }
    };

    pc.onnegotiationneeded = async () => {
        try {
            if (isInitiator) {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit("offer", { offer, to: targetId });
            }
        } catch (err) {}
    };

    localStream.current?.getTracks().forEach(t => pc.addTrack(t, localStream.current!));
    if (screenStream.current) screenStream.current.getTracks().forEach(t => pc.addTrack(t, screenStream.current!));
    
    peerConnections.current[targetId] = pc;
    return pc;
  };

  const handleContextMenu = (e: React.MouseEvent, userId: string) => {
    e.preventDefault();
    if (userId === socket.id) return;
    setContextMenu({ x: e.pageX, y: e.pageY, userId });
  };

  const handleJoinRoom = async (roomName: string) => {
    if (!roomName.trim() || roomName === currentRoom) return;
    setMessages([]);
    Object.values(peerConnections.current).forEach(pc => pc.close());
    peerConnections.current = {};
    try {
      if (!localStream.current) {
        localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(localStream.current);
        const analyser = audioContext.createAnalyser();
        source.connect(analyser);
        const checkVolume = () => {
          const data = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          socket.emit("speaking-status", avg > 12); 
          requestAnimationFrame(checkVolume);
        };
        checkVolume();
      }
      socket.emit(
        "join-room",
        { roomId: roomName, userName, serverId: currentServer },
        (res: any) => {
          if (res?.ok) {
            setCurrentRoom(roomName);
          } else if (res?.error) {
            alert(res.error);
          }
        }
      );
    } catch (err) { alert("Mikrofon hatası!"); }
  };

  const createServer = () => {
    const value = newServerName.trim();
    if (!value) return;
    socket.emit("create-server", { serverName: value, userName }, (res: any) => {
      if (res?.ok && res.serverId) {
        setCurrentServer(res.serverId);
      } else if (res?.error) {
        alert(res.error);
      }
    });
    setNewServerName("");
  };

  const createRoom = async () => {
    const value = newRoomName.trim();
    if (!value) return;
    socket.emit(
      "create-room",
      { serverId: currentServer, roomName: value, userName },
      async (res: any) => {
        if (res?.ok) {
          await handleJoinRoom(value);
          setNewRoomName("");
        } else if (res?.error) {
          alert(res.error);
        }
      }
    );
  };

  const updateServerSettings = () => {
    socket.emit(
      "update-server-settings",
      {
        serverId: currentServer,
        actorUserName: userName,
        name: serverSettingsName || currentServer,
        description: serverSettingsDescription,
      },
      (res: any) => {
        if (res?.ok) {
          setServerSettingsOpen(false);
        } else if (res?.error) {
          alert(res.error);
        }
      }
    );
  };

  const deleteServer = () => {
    if (!confirm("Sunucuyu arşive al (soft delete)?")) return;
    socket.emit(
      "delete-server",
      { serverId: currentServer, actorUserName: userName, targetUserName: userName },
      (res: any) => {
        if (res?.ok) {
          setCurrentServer("default");
          setCurrentRoom("");
        } else if (res?.error) {
          alert(res.error);
        }
      }
    );
  };

  const openRoomSettings = (roomName: string) => {
    setRoomSettingsTarget(roomName);
    setRoomSettingsName(roomName);
    setRoomSettingsTopic("");
    setRoomSettingsOpen(true);
  };

  const updateRoomSettings = () => {
    socket.emit(
      "update-room-settings",
      {
        serverId: currentServer,
        roomName: roomSettingsTarget,
        actorUserName: userName,
        name: roomSettingsName || roomSettingsTarget,
        topic: roomSettingsTopic,
      },
      (res: any) => {
        if (res?.ok) {
          setRoomSettingsOpen(false);
        } else if (res?.error) {
          alert(res.error);
        }
      }
    );
  };

  const transferOwnership = () => {
    if (!transferTarget) return;
    socket.emit(
      "transfer-owner",
      { serverId: currentServer, actorUserName: userName, targetUserName: transferTarget },
      (res: any) => {
        if (res?.ok) {
          setTransferTarget("");
          setServerSettingsOpen(false);
        } else if (res?.error) {
          alert(res.error);
        }
      }
    );
  };

  const deleteRoom = (roomName: string) => {
    if (!confirm(`"${roomName}" odasını arşive al?`)) return;
    socket.emit(
      "delete-room",
      { serverId: currentServer, roomName, actorUserName: userName },
      (res: any) => {
        if (res?.ok && currentRoom === roomName) {
          setCurrentRoom("");
        } else if (!res?.ok && res?.error) {
          alert(res.error);
        }
      }
    );
  };

  const restoreServer = (serverId: string) => {
    socket.emit(
      "restore-server",
      { serverId, actorUserName: userName, targetUserName: userName },
      (res: any) => {
        if (!res?.ok && res?.error) alert(res.error);
      }
    );
  };

  const restoreRoom = (serverId: string, roomName: string) => {
    socket.emit(
      "restore-room",
      { serverId, roomName, actorUserName: userName },
      (res: any) => {
        if (!res?.ok && res?.error) alert(res.error);
      }
    );
  };

  const handleScreenShare = async () => {
    if (!isSharingScreen) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStream.current = stream;
        setIsSharingScreen(true);
        socket.emit("share-screen-status", true);
        Object.values(peerConnections.current).forEach(pc => {
          stream.getVideoTracks().forEach(track => pc.addTrack(track, stream));
        });
        stream.getVideoTracks()[0].onended = () => stopScreenShare();
      } catch (err) {}
    } else { stopScreenShare(); }
  };

  const stopScreenShare = () => {
    screenStream.current?.getTracks().forEach(track => track.stop());
    screenStream.current = null;
    setIsSharingScreen(false);
    socket.emit("share-screen-status", false);
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim()) {
      socket.emit("send-message", { text: newMessage }, (res: any) => {
        if (!res?.ok && res?.error) {
          alert(res.error);
        }
      });
      setNewMessage("");
    }
  };

  const myRole =
    users.find((u) => u.id === socket.id)?.role ||
    users.find((u) => u.name === userName)?.role ||
    "member";
  const filteredRooms = activeRooms.filter(
    (room) => (room.serverId || "default") === currentServer
  );
  const roomsToRender = filteredRooms.length > 0 ? filteredRooms : activeRooms;

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white font-sans">
        <div className="w-full max-w-sm bg-slate-900 p-10 rounded-[40px] shadow-2xl border border-slate-800">
          <h1 className="text-4xl font-black text-rose-500 text-center mb-8 tracking-tighter cursor-default">Dumbasscord</h1>
          <input 
            type="text" placeholder="Takma Adınız" 
            className="w-full p-5 bg-slate-800 border border-slate-700 rounded-3xl outline-none text-center text-lg font-bold text-white focus:border-rose-500 placeholder:text-slate-500 transition-all"
            value={userName} onChange={(e) => setUserName(e.target.value)}
          />
          <button onClick={() => userName.trim() && setIsJoined(true)} className="w-full mt-6 bg-rose-600 text-white p-5 rounded-3xl font-black text-lg hover:bg-rose-700 transform active:scale-95 transition-all shadow-lg">BAĞLAN</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-screen bg-slate-950 text-white font-sans overflow-hidden transition-all duration-100 ${isNudged ? 'translate-x-2 translate-y-2 scale-[1.01]' : ''}`}>
      {/* SIDEBAR */}
      <div className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-2xl font-black text-rose-500 tracking-tighter">Dumbasscord</h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-widest">{userName}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            <h3 className="text-[10px] font-black text-slate-500 mb-3 uppercase px-2 font-mono tracking-widest">Odalar</h3>
            <div className="space-y-1">
              {roomsToRender.map(room => (
                <button key={`${room.serverId || "default"}:${room.name}`} onContextMenu={(e) => { e.preventDefault(); if (myRole === "owner" || myRole === "admin" || myRole === "mod") openRoomSettings(room.name); }} onClick={() => handleJoinRoom(room.name)} className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all font-bold text-sm transform hover:scale-105 active:scale-95 duration-200 ${currentRoom === room.name ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-300 hover:bg-slate-800'}`}>
                  <span># {room.name}</span>
                  <span className="text-[10px] bg-slate-700 px-2 rounded-full">{room.count}</span>
                  {(myRole === "owner" || myRole === "admin") && (
                    <span onClick={(e) => { e.stopPropagation(); deleteRoom(room.name); }} className="text-[9px] ml-2 text-rose-400">sil</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-[10px] font-black text-slate-500 mb-3 uppercase px-2 font-mono tracking-widest">Sunucular</h3>
            <div className="space-y-1">
              {servers.map((server) => (
                <button key={server.id} onClick={() => setCurrentServer(server.id)} className={`w-full text-left p-3 rounded-2xl text-xs font-bold transition-all ${currentServer === server.id ? "bg-rose-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}>
                  {server.name}
                </button>
              ))}
            </div>
            <div className="flex gap-2 px-2 mt-2">
              <input type="text" placeholder="Sunucu adı..." className="w-full p-2 bg-slate-800 border border-slate-700 rounded-xl text-xs outline-none focus:border-rose-500 transition-colors" value={newServerName} onChange={(e) => setNewServerName(e.target.value)} />
              <button onClick={createServer} className="bg-rose-600 text-white px-3 rounded-xl font-bold text-xs transform hover:scale-125 active:scale-90 transition-all shadow-lg">+</button>
            </div>
            {(myRole === "owner" || myRole === "admin") && (
              <div className="flex gap-2 px-2 mt-2">
                <button onClick={() => { const selected = servers.find((s) => s.id === currentServer); setServerSettingsName(selected?.name || currentServer); setServerSettingsDescription(selected?.description || ""); setServerSettingsOpen(true); }} className="flex-1 bg-slate-800 text-xs rounded-xl p-2 font-bold">Sunucu Ayarları</button>
                {myRole === "owner" && (
                  <button onClick={deleteServer} className="bg-rose-700 text-xs rounded-xl p-2 font-bold">Sil</button>
                )}
              </div>
            )}
            {archivedServers.length > 0 && (
              <div className="mt-3 px-2">
                <h4 className="text-[9px] font-black uppercase text-slate-500 mb-2">Arşiv Sunucular</h4>
                <div className="space-y-1">
                  {archivedServers.map((server) => (
                    <button key={`archived:${server.id}`} onClick={() => restoreServer(server.id)} className="w-full text-left p-2 rounded-xl text-[10px] bg-slate-800 hover:bg-slate-700">
                      Geri Al: {server.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div>
            <h3 className="text-[10px] font-black text-slate-500 mb-3 uppercase px-2 font-mono tracking-widest">Yeni Oda</h3>
            <div className="flex gap-2 px-2">
               <input type="text" placeholder="Oda adı..." className="w-full p-2 bg-slate-800 border border-slate-700 rounded-xl text-xs outline-none focus:border-rose-500 transition-colors" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} />
              <button onClick={createRoom} className="bg-rose-600 text-white px-3 rounded-xl font-bold text-xs transform hover:scale-125 active:scale-90 transition-all shadow-lg">+</button>
            </div>
          </div>
          {archivedRooms.filter((room) => room.serverId === currentServer).length > 0 && (
            <div>
              <h3 className="text-[10px] font-black text-slate-500 mb-3 uppercase px-2 font-mono tracking-widest">Arşiv Odalar</h3>
              <div className="space-y-1 px-2">
                {archivedRooms
                  .filter((room) => room.serverId === currentServer)
                  .map((room) => (
                    <button key={`archived-room:${room.serverId}:${room.name}`} onClick={() => restoreRoom(room.serverId, room.name)} className="w-full text-left p-2 rounded-xl text-[10px] bg-slate-800 hover:bg-slate-700">
                      Geri Al: {room.name}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
        <div className="p-4 bg-slate-800/50 border-t border-slate-800 space-y-3">
          <button onClick={() => { const t = localStream.current?.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; socket.emit("mute-status", !t.enabled); } setIsMuted(!isMuted); }} className={`w-full p-4 rounded-2xl font-black text-[10px] uppercase transform hover:scale-105 active:scale-95 transition-all ${isMuted ? 'bg-rose-600' : 'bg-sky-600'}`}>
            {isMuted ? "Mikrofonu Aç" : "Mikrofonu Kapat"}
          </button>
          <button onClick={() => socket.emit("send-nudge")} className="w-full p-4 bg-amber-500 rounded-2xl font-black text-[10px] uppercase hover:bg-amber-600 transform hover:scale-105 active:scale-95 transition-all text-slate-900 shadow-lg">Dürt! (Herkesi)</button>
        </div>
      </div>

      {/* ANA PANEL */}
      <div className="flex-1 flex bg-slate-950">
        {!currentRoom ? (
          <div className="flex-1 flex items-center justify-center text-slate-500 italic">Dumbasscord'a hoş geldin!</div>
        ) : (
          <>
            <div className="flex-1 flex flex-col border-r border-slate-800 relative">
              <div className="p-6 border-b border-slate-800 bg-slate-900/30 flex justify-between items-center">
                <h2 className="font-black text-xl uppercase tracking-tight"># {currentRoom}</h2>
                <button onClick={handleScreenShare} className={`flex items-center gap-2 text-[10px] px-4 py-2 rounded-full font-black uppercase transition-all shadow-lg transform hover:scale-105 active:scale-95 ${isSharingScreen ? 'bg-rose-600 border border-rose-400 animate-pulse' : 'bg-slate-800 border border-slate-700 hover:border-rose-500 text-slate-200'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isSharingScreen ? 'bg-white' : 'bg-rose-500'}`}></span>
                    {isSharingScreen ? "Yayını Durdur" : "Ekran Paylaş"}
                </button>
              </div>
              
              <div className="flex-1 p-8 overflow-y-auto flex flex-col gap-6">
                {users.some(u => u.isSharingScreen) && (
                    <div className="w-full aspect-video bg-black rounded-[40px] overflow-hidden border-4 border-rose-600/20 shadow-2xl relative">
                        <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-contain" />
                        <div className="absolute top-6 left-6 bg-rose-600 px-4 py-2 rounded-full text-[10px] font-black uppercase animate-pulse shadow-xl">CANLI YAYIN</div>
                    </div>
                )}
                
                {/* LİSTE DÜZENİ: SABİT GENİŞLİKLİ KARTLAR */}
                <div className="flex flex-col gap-3">
                  {users.map((u) => (
                    <div 
                      key={u.id} 
                      onContextMenu={(e) => handleContextMenu(e, u.id)} 
                      // w-80 eklenerek kart boyutu sabitlendi
                      className={`p-4 rounded-3xl border-4 flex items-center gap-5 transition-all duration-300 relative cursor-context-menu w-80 ${u.isSpeaking ? 'border-sky-500 bg-sky-950/20' : 'border-slate-800 bg-slate-900'} shadow-lg`}
                    >
                      {u.isMuted && (
                        <div className="absolute top-3 right-4 bg-rose-600/20 p-1.5 rounded-full border border-rose-500/40 shadow-inner z-20">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                        </div>
                      )}

                      <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl font-black shrink-0 transition-all duration-300 ${u.isSpeaking ? 'bg-sky-600 text-white shadow-lg' : 'bg-slate-700 text-slate-400'}`}>
                        {u.name ? u.name[0].toUpperCase() : "?"}
                      </div>

                      <div className="flex flex-col min-w-0">
                        <span className="font-black text-base text-slate-200 tracking-tight leading-none uppercase truncate">
                          {u.name} {u.id === socket.id && <span className="text-sky-500 text-[10px] ml-1">(SEN)</span>}
                        </span>
                        {u.role && <span className="text-[8px] text-amber-400 uppercase font-black">{u.role}</span>}
                        {u.isSharingScreen && <div className="text-[8px] mt-1 bg-rose-600 w-fit px-1.5 py-0.5 rounded-full font-black animate-pulse">YAYINDA</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* CHAT PANELİ */}
            <div className="w-80 flex flex-col bg-slate-900/50 backdrop-blur-md shrink-0">
              <div className="p-4 border-b border-slate-800 font-black text-[10px] uppercase text-slate-500 bg-slate-900/20 tracking-widest">Sohbet</div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex flex-col ${msg.sender === userName ? 'items-end' : 'items-start'}`}>
                    <span className="text-[9px] font-black text-rose-500 uppercase tracking-tighter mb-1 px-1">{msg.sender}</span>
                    <div className={`px-4 py-2 rounded-2xl text-sm max-w-[90%] break-words shadow-sm ${msg.sender === userName ? 'bg-sky-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-300 rounded-tl-none'}`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={sendMessage} className="p-4 border-t border-slate-800 flex gap-2 bg-slate-900/20">
                <input type="text" placeholder="Mesaj yaz..." className="flex-1 bg-slate-800 border border-slate-700 rounded-2xl px-4 py-2 text-xs outline-none focus:border-rose-500 placeholder:text-slate-600 transition-all" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} />
                <button type="submit" className="bg-rose-600 text-white w-10 h-10 rounded-2xl font-bold hover:scale-110 active:scale-90 transition-all shadow-lg flex items-center justify-center">❯</button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* SAĞ TIK MENÜSÜ */}
      {contextMenu && (
        <div className="fixed z-50 bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl p-2 w-48 font-sans" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button onClick={() => { socket.emit("send-nudge", contextMenu.userId); setContextMenu(null); }} className="w-full text-left p-3 hover:bg-amber-500 hover:text-slate-900 rounded-xl text-xs font-black transition-all mb-1">👉 DÜRT!</button>
          {myRole === "owner" && (
            <>
              <button onClick={() => {
                const target = users.find((u) => u.id === contextMenu.userId);
                if (!target) return;
                socket.emit("promote-user", { serverId: currentServer, actorUserName: userName, targetUserName: target.name });
                setContextMenu(null);
              }} className="w-full text-left p-3 hover:bg-emerald-500 hover:text-slate-900 rounded-xl text-xs font-black transition-all mb-1">⬆️ Admin Yap</button>
              <button onClick={() => {
                const target = users.find((u) => u.id === contextMenu.userId);
                if (!target) return;
                socket.emit("demote-user", { serverId: currentServer, actorUserName: userName, targetUserName: target.name });
                setContextMenu(null);
              }} className="w-full text-left p-3 hover:bg-rose-500 hover:text-white rounded-xl text-xs font-black transition-all mb-1">⬇️ Admin Al</button>
              <button onClick={() => {
                const target = users.find((u) => u.id === contextMenu.userId);
                if (!target) return;
                socket.emit("transfer-owner", { serverId: currentServer, actorUserName: userName, targetUserName: target.name });
                setContextMenu(null);
              }} className="w-full text-left p-3 hover:bg-violet-500 hover:text-white rounded-xl text-xs font-black transition-all mb-1">👑 Sahipliği Devret</button>
            </>
          )}
          <div className="p-3 border-t border-slate-800">
            <label className="text-[9px] font-black text-slate-500 uppercase block mb-2">Kullanıcı Sesi</label>
            <input type="range" min="0" max="1" step="0.1" className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500" value={userVolumes[contextMenu.userId] ?? 1} onChange={(e) => {
                const vol = parseFloat(e.target.value);
                setUserVolumes(prev => ({ ...prev, [contextMenu!.userId]: vol }));
                if (remoteAudios.current[contextMenu!.userId]) remoteAudios.current[contextMenu!.userId].volume = vol;
            }} />
          </div>
        </div>
      )}

      {serverSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-black uppercase text-slate-200">Sunucu Ayarları</h3>
            <input value={serverSettingsName} onChange={(e) => setServerSettingsName(e.target.value)} placeholder="Sunucu adı" className="w-full p-2 bg-slate-800 border border-slate-700 rounded-xl text-xs" />
            <textarea value={serverSettingsDescription} onChange={(e) => setServerSettingsDescription(e.target.value)} placeholder="Açıklama" className="w-full p-2 bg-slate-800 border border-slate-700 rounded-xl text-xs min-h-20" />
            <div className="flex gap-2">
              <button onClick={updateServerSettings} className="flex-1 bg-sky-600 rounded-xl p-2 text-xs font-bold">Kaydet</button>
              <button onClick={() => setServerSettingsOpen(false)} className="bg-slate-700 rounded-xl p-2 text-xs font-bold">Kapat</button>
            </div>
            {myRole === "owner" && (
              <div className="border-t border-slate-700 pt-3 space-y-2">
                <label className="text-[10px] uppercase text-slate-400 font-bold">Sahiplik Devri</label>
                <select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)} className="w-full p-2 bg-slate-800 border border-slate-700 rounded-xl text-xs">
                  <option value="">Kullanıcı seç</option>
                  {users
                    .filter((u) => u.id !== socket.id)
                    .map((u) => (
                      <option key={`transfer:${u.id}`} value={u.name}>{u.name}</option>
                    ))}
                </select>
                <button onClick={transferOwnership} className="w-full bg-violet-600 rounded-xl p-2 text-xs font-bold">Sahipliği Devret</button>
              </div>
            )}
          </div>
        </div>
      )}

      {roomSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-black uppercase text-slate-200">Oda Ayarları</h3>
            <input value={roomSettingsName} onChange={(e) => setRoomSettingsName(e.target.value)} placeholder="Oda adı" className="w-full p-2 bg-slate-800 border border-slate-700 rounded-xl text-xs" />
            <textarea value={roomSettingsTopic} onChange={(e) => setRoomSettingsTopic(e.target.value)} placeholder="Konu" className="w-full p-2 bg-slate-800 border border-slate-700 rounded-xl text-xs min-h-20" />
            <div className="flex gap-2">
              <button onClick={updateRoomSettings} className="flex-1 bg-sky-600 rounded-xl p-2 text-xs font-bold">Kaydet</button>
              <button onClick={() => setRoomSettingsOpen(false)} className="bg-slate-700 rounded-xl p-2 text-xs font-bold">Kapat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  ); 
}