"use client";
import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

import AuthContainer from "../components/auth/authContainer";
import ServerList from "../components/Sidebar/ServerList";
import ChannelList from "../components/Sidebar/ChannelList";
import ControlBar from "../components/Voice/ControlBar";
import ChatArea from "../components/Chat/ChatArea";
import ProfileModal from "../components/Profile/ProfileModal";

const socketServerUrl = "https://communication-app-production.up.railway.app";
const socketPath = "/socket.io";
const socket = io(socketServerUrl, { path: socketPath, transports: ["websocket", "polling"], withCredentials: true });

type ServerItem = { id: string; name: string };
type RoomItem = { name: string; serverId?: string; count?: number };
type UserItem = {
  id: string;
  name: string;
  roomName?: string;
  isMuted?: boolean;
  isSpeaking?: boolean;
};
type ChatMessage = { id: number | string; sender: string; text: string; time?: string };
type SignalPayload = {
  from: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

export default function Home() {
  const [isJoined, setIsJoined] = useState(false);
  const [userName, setUserName] = useState("");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [currentServer, setCurrentServer] = useState("default");
  const [currentRoom, setCurrentRoom] = useState("");
  const [activeRooms, setActiveRooms] = useState<RoomItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);

  const localStream = useRef<MediaStream | null>(null);
  const peerConnections = useRef<{ [key: string]: RTCPeerConnection }>({});
  const remoteAudios = useRef<{ [key: string]: HTMLAudioElement }>({});
  const speakingIntervalRef = useRef<number | null>(null);
  const isSpeakingRef = useRef(false);

  const closePeerConnection = (peerId: string) => {
    if (remoteAudios.current[peerId]) {
      remoteAudios.current[peerId].pause();
      remoteAudios.current[peerId].srcObject = null;
      delete remoteAudios.current[peerId];
    }
    if (peerConnections.current[peerId]) {
      peerConnections.current[peerId].close();
      delete peerConnections.current[peerId];
    }
  };

  const resetVoiceConnections = () => {
    Object.keys(peerConnections.current).forEach((peerId) => closePeerConnection(peerId));
  };

  const stopSpeakingDetection = () => {
    if (speakingIntervalRef.current) {
      window.clearInterval(speakingIntervalRef.current);
      speakingIntervalRef.current = null;
    }
    if (isSpeakingRef.current) {
      isSpeakingRef.current = false;
      socket.emit("speaking-status", false);
    }
  };

  const startSpeakingDetection = () => {
    if (!localStream.current || speakingIntervalRef.current) {
      return;
    }
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(localStream.current);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const buffer = new Uint8Array(analyser.frequencyBinCount);

    speakingIntervalRef.current = window.setInterval(() => {
      analyser.getByteFrequencyData(buffer);
      const avg = buffer.reduce((sum, value) => sum + value, 0) / buffer.length;
      const speakingNow = avg > 18 && !isMuted && !isDeafened;
      if (speakingNow !== isSpeakingRef.current) {
        isSpeakingRef.current = speakingNow;
        socket.emit("speaking-status", speakingNow);
      }
    }, 250);
  };

  const createPeerConnection = (peerId: string) => {
    if (peerConnections.current[peerId]) {
      return peerConnections.current[peerId];
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStream.current as MediaStream);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", { candidate: event.candidate, to: peerId });
      }
    };

    pc.ontrack = (event) => {
      if (!remoteAudios.current[peerId]) {
        const audio = new Audio();
        audio.autoplay = true;
        remoteAudios.current[peerId] = audio;
      }
      remoteAudios.current[peerId].srcObject = event.streams[0];
    };

    pc.onconnectionstatechange = () => {
      if (["closed", "failed", "disconnected"].includes(pc.connectionState)) {
        closePeerConnection(peerId);
      }
    };

    peerConnections.current[peerId] = pc;
    return pc;
  };

  useEffect(() => {
    const handleServerList = (list: ServerItem[]) => setServers(list);
    const handleRoomList = (rooms: RoomItem[]) => setActiveRooms(rooms);
    const handleUserList = (list: UserItem[]) => setUsers(list);
    const handleMessageHistory = (list: ChatMessage[]) => setMessages(list);
    const handleReceiveMessage = (message: ChatMessage) => {
      setMessages((prev) => [...prev, message]);
    };
    const handleConnect = () => socket.emit("request-state");
    const handleUserJoined = async (peerId: string) => {
      if (!localStream.current || peerId === socket.id) {
        return;
      }
      const pc = createPeerConnection(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", { offer, to: peerId });
    };
    const handleOffer = async ({ offer, from }: SignalPayload) => {
      if (!offer) return;
      const pc = createPeerConnection(from);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { answer, to: from });
    };
    const handleAnswer = async ({ answer, from }: SignalPayload) => {
      if (!answer) return;
      const pc = peerConnections.current[from];
      if (!pc) {
        return;
      }
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    };
    const handleIceCandidate = async ({ candidate, from }: SignalPayload) => {
      if (!candidate) return;
      const pc = peerConnections.current[from] ?? createPeerConnection(from);
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    };
    const handleUserLeft = (peerId: string) => closePeerConnection(peerId);
    const handleTypingStatus = ({ userName: typingUser, isTyping }: { userName: string; isTyping: boolean }) => {
      setTypingUsers((prev) => {
        if (isTyping) {
          if (prev.includes(typingUser)) return prev;
          return [...prev, typingUser];
        }
        return prev.filter((name) => name !== typingUser);
      });
    };
    const handleRoomDeleted = ({ fallbackRoomName }: { fallbackRoomName: string }) => {
      setCurrentRoom(fallbackRoomName);
    };

    socket.on("server-list", handleServerList);
    socket.on("room-list", handleRoomList);
    socket.on("user-list", handleUserList);
    socket.on("message-history", handleMessageHistory);
    socket.on("receive-message", handleReceiveMessage);
    socket.on("typing-status", handleTypingStatus);
    socket.on("room-deleted", handleRoomDeleted);
    socket.on("connect", handleConnect);
    socket.on("user-joined", handleUserJoined);
    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("ice-candidate", handleIceCandidate);
    socket.on("user-left", handleUserLeft);

    return () => {
      socket.off("server-list", handleServerList);
      socket.off("room-list", handleRoomList);
      socket.off("user-list", handleUserList);
      socket.off("message-history", handleMessageHistory);
      socket.off("receive-message", handleReceiveMessage);
      socket.off("typing-status", handleTypingStatus);
      socket.off("room-deleted", handleRoomDeleted);
      socket.off("connect", handleConnect);
      socket.off("user-joined", handleUserJoined);
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("ice-candidate", handleIceCandidate);
      socket.off("user-left", handleUserLeft);
      resetVoiceConnections();
      stopSpeakingDetection();
    };
    // refs keep helper functions stable for this subscription lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Object.values(remoteAudios.current).forEach((audio) => {
      audio.muted = isDeafened;
    });
  }, [isDeafened]);

  const handleJoinRoom = async (roomName: string) => {
    if (!roomName.trim() || roomName === currentRoom) return;
    if (!localStream.current) {
      localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStream.current.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
      startSpeakingDetection();
    }

    resetVoiceConnections();

    socket.emit("join-room", { roomId: roomName, userName, serverId: currentServer }, (res: { ok?: boolean }) => {
      if (res?.ok) {
        setCurrentRoom(roomName);
        setTypingUsers([]);
      }
    });
  };

  const handleCreateRoom = () => {
    const roomName = prompt("Yeni kanal adı:");
    if (!roomName?.trim()) return;
    socket.emit("create-room", { serverId: currentServer, roomName: roomName.trim(), userName }, (res: { ok?: boolean; error?: string }) => {
      if (!res?.ok) {
        alert(res?.error || "Kanal oluşturulamadı.");
      }
    });
  };

  const handleDeleteRoom = (roomName: string) => {
    const ok = confirm(`#${roomName} kanalını silmek istediğine emin misin?`);
    if (!ok) return;
    socket.emit("delete-room", { serverId: currentServer, roomName, userName }, (res: { ok?: boolean; error?: string }) => {
      if (!res?.ok) {
        alert(res?.error || "Kanal silinemedi.");
      }
    });
  };

  const toggleDeafen = () => {
    const status = !isDeafened;
    setIsDeafened(status);
    if (status) {
      setIsMuted(true);
      if (localStream.current) {
        localStream.current.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
      socket.emit("mute-status", true);
      socket.emit("speaking-status", false);
    }
    Object.values(remoteAudios.current).forEach((audio) => {
      audio.muted = status;
    });
  };

  const toggleMute = () => {
    if (isDeafened) return;
    const status = !isMuted;
    setIsMuted(status);
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach((track) => {
        track.enabled = !status;
      });
    }
    socket.emit("mute-status", status);
    if (status) {
      socket.emit("speaking-status", false);
    }
  };

  const sendMessage = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentRoom || !newMessage.trim()) return;
    socket.emit("send-message", { text: newMessage.trim() }, (res: { ok?: boolean }) => {
      if (res?.ok) {
        setNewMessage("");
        socket.emit("typing-status", { roomId: currentRoom, serverId: currentServer, userName, isTyping: false });
      }
    });
  };

  const handleMessageInput = (value: string) => {
    setNewMessage(value);
    if (!currentRoom) return;
    socket.emit("typing-status", { roomId: currentRoom, serverId: currentServer, userName, isTyping: value.trim().length > 0 });
  };

  const handleServerChange = (nextServerId: string) => {
    setCurrentServer(nextServerId);
    setCurrentRoom("");
    setUsers([]);
    setMessages([]);
    setTypingUsers([]);
    resetVoiceConnections();
  };

  const typingLabel = typingUsers.length
    ? `${typingUsers.slice(0, 2).join(", ")} yazıyor${typingUsers.length > 2 ? "..." : ""}`
    : "";

  if (!isJoined) return <AuthContainer onJoin={(_email: string, n: string) => { setUserName(n); setIsJoined(true); }} />;

  return (
    <div className="flex h-screen max-h-screen bg-slate-950 text-white font-sans overflow-hidden">
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        userData={{ name: userName, bio: "" }}
        onSave={(newData: { name: string }) => {
          setUserName(newData.name);
          setIsProfileOpen(false);
        }}
      />

      <ServerList servers={servers} currentServer={currentServer} setCurrentServer={handleServerChange} socket={socket} userName={userName} />

      <div className="w-72 min-w-72 h-full flex flex-col border-r border-slate-800">
        <ChannelList
          rooms={activeRooms.filter((r) => (r.serverId || "default") === currentServer)}
          currentRoom={currentRoom}
          handleJoinRoom={handleJoinRoom}
          handleCreateRoom={handleCreateRoom}
          handleDeleteRoom={handleDeleteRoom}
          currentUserId={socket.id || ""}
          users={users}
          userName={userName}
          setIsJoined={setIsJoined}
          onOpenProfile={() => setIsProfileOpen(true)}
        />

        <ControlBar isMuted={isMuted} isDeafened={isDeafened} toggleMute={toggleMute} toggleDeafen={toggleDeafen} />
      </div>

      <div className="flex-1 flex bg-slate-950 p-4 md:p-8 overflow-y-auto min-w-0">
        <ChatArea
          messages={messages}
          newMessage={newMessage}
          setNewMessage={handleMessageInput}
          sendMessage={sendMessage}
          userName={userName}
          currentRoom={currentRoom}
          typingLabel={typingLabel}
        />
      </div>
    </div>
  );
}