"use client";
import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

// CANLI BAĞLANTI AYARI
const socketServerUrl =
  process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "https://communication-app-production.up.railway.app";
const socketAuthToken = process.env.NEXT_PUBLIC_SOCKET_AUTH_TOKEN || "";
const socketPath = process.env.NEXT_PUBLIC_SOCKET_PATH || "/socket.io";

const socket = io(socketServerUrl, {
  path: socketPath,
  auth: socketAuthToken ? { token: socketAuthToken } : undefined,
  transports: ["websocket", "polling"],
  withCredentials: true
});

export default function Home() {
  // AUTH DURUMLARI
  const [isLoginActive, setIsLoginActive] = useState(true); 
  const [isJoined, setIsJoined] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userName, setUserName] = useState("");

  // CHAT DURUMLARI
  const [servers, setServers] = useState<any[]>([]);
  const [currentServer, setCurrentServer] = useState("default");
  const [newServerName, setNewServerName] = useState("");
  const [currentRoom, setCurrentRoom] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [activeRooms, setActiveRooms] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false); 
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isNudged, setIsNudged] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, userId: string } | null>(null);
  const [userVolumes, setUserVolumes] = useState<{ [key: string]: number }>({});

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
      if (!currentServer && serverList.length > 0) setCurrentServer(serverList[0].id);
    });
    socket.on("room-list", (rooms) => setActiveRooms(rooms));
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

    socket.on("connect", () => socket.emit("request-state"));
    if (socket.connected) socket.emit("request-state");

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
        if (isDeafened) audio.muted = true;
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
      socket.emit("join-room", { roomId: roomName, userName, serverId: currentServer }, (res: any) => {
          if (res?.ok) setCurrentRoom(roomName);
          else if (res?.error) alert(res.error);
      });
    } catch (err) { alert("Mikrofon hatası!"); }
  };

  const createServer = () => {
    const value = newServerName.trim();
    if (!value) return;
    socket.emit("create-server", { serverName: value, userName }, (res: any) => {
      if (res?.ok && res.serverId) {
        setCurrentServer(res.serverId);
        setNewServerName("");
      } else if (res?.error) alert("Sunucu Hatası: " + res.error);
    });
  };

  const createRoom = async () => {
    const value = newRoomName.trim();
    if (!value) return;
    socket.emit("create-room", { serverId: currentServer, roomName: value, userName }, async (res: any) => {
        if (res?.ok) {
          await handleJoinRoom(value);
          setNewRoomName("");
        } else if (res?.error) alert("Oda Hatası: " + res.error);
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
        if (!res?.ok && res?.error) alert(res.error);
      });
      setNewMessage("");
    }
  };

  const toggleDeafen = () => {
    const newDeafenStatus = !isDeafened;
    setIsDeafened(newDeafenStatus);
    socket.emit("deafen-status", newDeafenStatus); // Backend'e bildir
    Object.values(remoteAudios.current).forEach(audio => {
        audio.muted = newDeafenStatus;
    });
  };

  const myRole = users.find((u) => u.id === socket.id)?.role || users.find((u) => u.name === userName)?.role || "member";
  const filteredRooms = activeRooms.filter((room) => (room.serverId || "default") === currentServer);
  const roomsToRender = filteredRooms.length > 0 ? filteredRooms : activeRooms;

  // --- AUTH EKRANI ---
  if (!isJoined) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans overflow-hidden">
        <div className="relative w-full max-w-[900px] h-[600px] bg-slate-900 rounded-[60px] overflow-hidden shadow-2xl border border-slate-800 flex">
          <div className={`w-1/2 h-full flex flex-col items-center justify-center p-14 transition-all duration-700 ease-in-out z-10 ${!isLoginActive ? 'translate-x-full opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'}`}>
            <h2 className="text-4xl font-black text-rose-500 mb-10 uppercase tracking-tighter">Giriş Yap</h2>
            <div className="w-full space-y-5">
              <input type="email" placeholder="E-posta" className="w-full p-4 bg-slate-800 border border-slate-700 rounded-2xl text-white outline-none focus:border-rose-500 transition-all placeholder:text-slate-500" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input type="password" placeholder="Şifre" className="w-full p-4 bg-slate-800 border border-slate-700 rounded-2xl text-white outline-none focus:border-rose-500 transition-all placeholder:text-slate-500" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button onClick={() => { if(email && password) { setUserName(email.split('@')[0]); setIsJoined(true); }}} className="w-full bg-rose-600 text-white p-5 rounded-2xl font-black text-lg hover:bg-rose-700 shadow-xl active:scale-95 transition-all">BAĞLAN</button>
            </div>
          </div>
          <div className={`w-1/2 h-full flex flex-col items-center justify-center p-14 transition-all duration-700 ease-in-out z-10 ${isLoginActive ? '-translate-x-full opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'}`}>
            <h2 className="text-4xl font-black text-sky-500 mb-10 uppercase tracking-tighter">Kayıt Ol</h2>
            <div className="w-full space-y-5">
              <input type="text" placeholder="Takma Ad" className="w-full p-4 bg-slate-800 border border-slate-700 rounded-2xl text-white outline-none focus:border-sky-500 transition-all placeholder:text-slate-500" value={userName} onChange={(e) => setUserName(e.target.value)} />
              <input type="email" placeholder="E-posta" className="w-full p-4 bg-slate-800 border border-slate-700 rounded-2xl text-white outline-none focus:border-sky-500 transition-all placeholder:text-slate-500" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input type="password" placeholder="Şifre" className="w-full p-4 bg-slate-800 border border-slate-700 rounded-2xl text-white outline-none focus:border-sky-500 transition-all placeholder:text-slate-500" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button onClick={() => { if(userName && email && password) setIsLoginActive(true); }} className="w-full bg-sky-600 text-white p-5 rounded-2xl font-black text-lg hover:bg-sky-700 shadow-xl active:scale-95 transition-all">HESAP OLUŞTUR</button>
            </div>
          </div>
          <div className={`absolute top-0 w-1/2 h-full bg-gradient-to-br from-rose-600 to-rose-900 z-20 transition-all duration-700 ease-in-out flex flex-col items-center justify-center text-white px-14 text-center ${isLoginActive ? 'left-1/2 rounded-l-[120px]' : 'left-0 rounded-r-[120px]'}`}>
            <h1 className="text-5xl font-black tracking-tighter mb-10 leading-none uppercase">{isLoginActive ? "TEKRAR\nSELAM!" : "MERHABA,\nDUMBASS!"}</h1>
            <p className="text-rose-100 text-base mb-10 font-medium leading-relaxed">{isLoginActive ? "Zaten bu çılgın topluluğun bir parçasıysan, hemen giriş yap ve kaldığın yerden devam et." : "Henüz bir hesabın yoksa, kaosun ve eğlencenin merkezine katılmak için hemen kayıt ol!"}</p>
            <button onClick={() => setIsLoginActive(!isLoginActive)} className="border-[3px] border-white px-12 py-4 rounded-full font-black uppercase text-sm hover:bg-white hover:text-rose-700 transition-all active:scale-90 shadow-2xl">{isLoginActive ? "Kayıt Olmaya Git" : "Giriş Yapmaya Git"}</button>
          </div>
        </div>
      </div>
    );
  }

  // --- CHAT EKRANI ---
  return (
    <div className={`flex h-screen bg-slate-950 text-white font-sans overflow-hidden transition-all duration-100 ${isNudged ? 'translate-x-2 translate-y-2 scale-[1.01]' : ''}`}>
      <div className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-2xl font-black text-rose-500 tracking-tighter">Dumbasscord</h1>
          <div className="flex items-center justify-between mt-1">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest truncate max-w-[150px]">{userName}</p>
            <button onClick={() => setIsJoined(false)} className="text-[9px] text-rose-400 hover:underline font-black">ÇIKIŞ</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            <h3 className="text-[10px] font-black text-slate-500 mb-3 uppercase px-2 tracking-widest">Odalar</h3>
            <div className="space-y-1">
              {roomsToRender.map(room => (
                <div key={room.name} className="flex items-center gap-2 pr-2">
                  <button onClick={() => handleJoinRoom(room.name)} className={`flex-1 flex items-center justify-between p-3 rounded-2xl transition-all font-bold text-sm transform hover:scale-105 active:scale-95 duration-200 ${currentRoom === room.name ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-300 hover:bg-slate-800'}`}>
                    <span className="truncate pr-1"># {room.name}</span>
                    <span className="text-[10px] bg-slate-700 px-2 rounded-full shrink-0">{room.count}</span>
                  </button>
                  <button onClick={() => confirm(`${room.name} odasını silmek istediğine emin misin?`) && socket.emit("delete-room", { serverId: currentServer, roomName: room.name, userName })} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-[10px] font-black text-slate-500 mb-3 uppercase px-2 tracking-widest">Sunucular</h3>
            <div className="space-y-1">
              {servers.map((server) => (
                <div key={server.id} className="flex items-center gap-2 pr-2">
                  <button onClick={() => setCurrentServer(server.id)} className={`flex-1 text-left p-3 rounded-2xl text-xs font-bold transition-all ${currentServer === server.id ? "bg-rose-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}><span className="truncate">{server.name}</span></button>
                  {server.id !== "default" && (
                    <button onClick={() => confirm(`${server.name} sunucusunu silmek istediğine emin misin?`) && socket.emit("delete-server", { serverId: server.id, userName })} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2 px-2 mt-2">
              <input type="text" placeholder="Sunucu adı..." className="w-full p-2 bg-slate-800 border border-slate-700 rounded-xl text-xs outline-none focus:border-rose-500 transition-colors" value={newServerName} onChange={(e) => setNewServerName(e.target.value)} />
              <button onClick={createServer} className="bg-rose-600 text-white px-3 rounded-xl font-bold text-xs transform hover:scale-125 active:scale-90 transition-all shadow-lg">+</button>
            </div>
          </div>
          <div>
            <h3 className="text-[10px] font-black text-slate-500 mb-3 uppercase px-2 tracking-widest">Yeni Oda</h3>
            <div className="flex gap-2 px-2">
               <input type="text" placeholder="Oda adı..." className="w-full p-2 bg-slate-800 border border-slate-700 rounded-xl text-xs outline-none focus:border-rose-500 transition-colors" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} />
              <button onClick={createRoom} className="bg-rose-600 text-white px-3 rounded-xl font-bold text-xs transform hover:scale-125 active:scale-90 transition-all shadow-lg">+</button>
            </div>
          </div>
        </div>
        
        <div className="p-4 bg-slate-800/50 border-t border-slate-800 space-y-3">
          <button onClick={toggleDeafen} className={`w-full p-4 rounded-2xl font-black text-[10px] uppercase transition-all shadow-lg transform hover:scale-105 active:scale-95 ${isDeafened ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-white'}`}>
            {isDeafened ? "Kulaklığı Aç" : "Kulaklığı Sustur"}
          </button>
          <button onClick={() => { const t = localStream.current?.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; socket.emit("mute-status", !t.enabled); } setIsMuted(!isMuted); }} className={`w-full p-4 rounded-2xl font-black text-[10px] uppercase transition-all shadow-lg transform hover:scale-105 active:scale-95 ${isMuted ? 'bg-rose-600' : 'bg-sky-600'}`}>
            {isMuted ? "Mikrofonu Aç" : "Mikrofonu Kapat"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex bg-slate-950">
        {!currentRoom ? (
          <div className="flex-1 flex items-center justify-center text-slate-500 italic">Dumbasscord'a hoş geldin!</div>
        ) : (
          <>
            <div className="flex-1 flex flex-col border-r border-slate-800 relative">
              <div className="p-6 border-b border-slate-800 bg-slate-900/30 flex justify-between items-center">
                <h2 className="font-black text-xl uppercase tracking-tight"># {currentRoom}</h2>
                <button onClick={handleScreenShare} className={`flex items-center gap-2 text-[10px] px-4 py-2 rounded-full font-black uppercase transition-all shadow-lg ${isSharingScreen ? 'bg-rose-600 border border-rose-400 animate-pulse' : 'bg-slate-800 border border-slate-700 hover:border-rose-500 text-slate-200'}`}>
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
                <div className="flex flex-col gap-3">
                  {users.map((u) => (
                    <div key={u.id} onContextMenu={(e) => handleContextMenu(e, u.id)} className={`p-4 rounded-3xl border-4 flex items-center gap-5 transition-all duration-300 relative cursor-context-menu w-80 ${u.isSpeaking ? 'border-sky-500 bg-sky-950/20' : 'border-slate-800 bg-slate-900'} shadow-lg`}>
                      
                      {/* DURUM SİMGELERİ (ÜST SAĞ) */}
                      <div className="absolute top-3 right-4 flex gap-2 z-20">
                          {u.isDeafened && (
                            <div className="bg-amber-500/20 p-1.5 rounded-full border border-amber-500/40 shadow-inner">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm13 0h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-5Z" />
                                  <path d="M21 11V7a9 9 0 0 0-18 0v4" />
                                  <line x1="2" y1="2" x2="22" y2="22" />
                                </svg>
                            </div>
                          )}
                          {u.isMuted && (
                            <div className="bg-rose-600/20 p-1.5 rounded-full border border-rose-500/40 shadow-inner">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                                  <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                                  <line x1="12" y1="19" x2="12" y2="22" />
                                  <line x1="2" y1="2" x2="22" y2="22" />
                                </svg>
                            </div>
                          )}
                      </div>

                      <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl font-black shrink-0 transition-all duration-300 ${u.isSpeaking ? 'bg-sky-600 text-white shadow-lg' : 'bg-slate-700 text-slate-400'}`}>{u.name ? u.name[0].toUpperCase() : "?"}</div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-black text-base text-slate-200 tracking-tight leading-none uppercase truncate">{u.name} {u.id === socket.id && <span className="text-sky-500 text-[10px] ml-1">(SEN)</span>}</span>
                        {u.role && <span className="text-[8px] text-amber-400 uppercase font-black">{u.role}</span>}
                        {u.isSharingScreen && <div className="text-[8px] mt-1 bg-rose-600 w-fit px-1.5 py-0.5 rounded-full font-black animate-pulse">YAYINDA</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="w-80 flex flex-col bg-slate-900/50 backdrop-blur-md shrink-0">
              <div className="p-4 border-b border-slate-800 font-black text-[10px] uppercase text-slate-500 bg-slate-900/20 tracking-widest">Sohbet</div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex flex-col ${msg.sender === userName ? 'items-end' : 'items-start'}`}>
                    <span className="text-[9px] font-black text-rose-500 uppercase tracking-tighter mb-1 px-1">{msg.sender}</span>
                    <div className={`px-4 py-2 rounded-2xl text-sm max-w-[90%] break-words shadow-sm ${msg.sender === userName ? 'bg-sky-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-300 rounded-tl-none'}`}>{msg.text}</div>
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
    </div>
  );
}