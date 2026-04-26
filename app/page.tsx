"use client";
import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

import AuthContainer from "../components/auth/authContainer";
import ServerList from "../components/Sidebar/ServerList";
import ChannelList from "../components/Sidebar/ChannelList";
import ControlBar from "../components/Voice/ControlBar";
import ChatArea from "../components/Chat/ChatArea";
import ProfileModal from "../components/Profile/ProfileModal";
import SelectedUserCard from "../components/Overlays/SelectedUserCard";
import UserAudioMenu from "../components/Overlays/UserAudioMenu";
import DialogModal from "../components/Overlays/DialogModal";

const socketServerUrl =
  process.env.NEXT_PUBLIC_SOCKET_SERVER_URL ||
  "https://communication-app-production.up.railway.app";
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
  status?: ProfileStatus | "offline";
};
type ChatMessage = {
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
type SignalPayload = {
  from: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};
type ProfileStatus = "online" | "idle" | "dnd";
type ProfileState = {
  name: string;
  bio: string;
  avatarUrl?: string | null;
  status: ProfileStatus;
};
type DialogState =
  | { type: "create-server" }
  | { type: "create-room" }
  | { type: "delete-server"; serverId: string; serverName: string }
  | { type: "delete-room"; roomName: string }
  | { type: "clear-all" }
  | null;

export default function Home() {
  const [isJoined, setIsJoined] = useState(false);
  const [userName, setUserName] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileState>({
    name: "",
    bio: "",
    avatarUrl: null,
    status: "online",
  });
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
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dialogInput, setDialogInput] = useState("");
  const [pinnedByRoom, setPinnedByRoom] = useState<Record<string, ChatMessage[]>>({});
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [audioMenu, setAudioMenu] = useState<{
    userId: string;
    userName: string;
    x: number;
    y: number;
  } | null>(null);
  const [userVolumes, setUserVolumes] = useState<Record<string, number>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [reactionsByMessage, setReactionsByMessage] = useState<Record<string, number>>({});
  const [likedByMe, setLikedByMe] = useState<Record<string, boolean>>({});
  const [unreadByRoom, setUnreadByRoom] = useState<Record<string, number>>({});
  const [toasts, setToasts] = useState<Array<{ id: number; text: string }>>([]);
  const [isPinnedPanelOpen, setIsPinnedPanelOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") {
      return "dark";
    }
    const storedTheme = window.localStorage.getItem("theme-mode");
    return storedTheme === "light" ? "light" : "dark";
  });

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
        audio.volume = userVolumes[peerId] ?? 1;
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
      if (message.sender !== userName && currentRoom) {
        if (document.hidden) {
          setUnreadByRoom((prev) => ({ ...prev, [currentRoom]: (prev[currentRoom] || 0) + 1 }));
        }
        if (message.text?.toLowerCase().includes(`@${userName.toLowerCase()}`)) {
          const id = Date.now();
          setToasts((prev) => [...prev, { id, text: `${message.sender} senden bahsetti` }]);
          window.setTimeout(() => {
            setToasts((prev) => prev.filter((item) => item.id !== id));
          }, 3500);
        }
      }
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
    const handleForcedMuted = () => {
      setIsMuted(true);
      if (localStream.current) {
        localStream.current.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
    };
    const handleKicked = () => {
      alert("Odadan atıldın.");
      setCurrentRoom("");
      setMessages([]);
      setUsers([]);
    };
    const handleBanned = () => {
      alert("Sunucudan banlandın.");
      setCurrentRoom("");
      setCurrentServer("default");
      setMessages([]);
      setUsers([]);
    };

    socket.on("server-list", handleServerList);
    socket.on("room-list", handleRoomList);
    socket.on("user-list", handleUserList);
    socket.on("message-history", handleMessageHistory);
    socket.on("receive-message", handleReceiveMessage);
    socket.on("typing-status", handleTypingStatus);
    socket.on("room-deleted", handleRoomDeleted);
    socket.on("forced-muted", handleForcedMuted);
    socket.on("kicked", handleKicked);
    socket.on("banned", handleBanned);
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
      socket.off("forced-muted", handleForcedMuted);
      socket.off("kicked", handleKicked);
      socket.off("banned", handleBanned);
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
    if (!currentRoom || !localStream.current) {
      return;
    }
    users
      .filter((user) => user.id !== socket.id && user.roomName === currentRoom)
      .forEach(async (user) => {
        if (peerConnections.current[user.id]) return;
        const pc = createPeerConnection(user.id);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { offer, to: user.id });
      });
    // createPeerConnection is stable for this socket lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, currentRoom]);

  useEffect(() => {
    Object.values(remoteAudios.current).forEach((audio) => {
      audio.muted = isDeafened;
    });
  }, [isDeafened]);

  useEffect(() => {
    Object.entries(remoteAudios.current).forEach(([peerId, audio]) => {
      audio.volume = userVolumes[peerId] ?? 1;
    });
  }, [userVolumes]);

  useEffect(() => {
    const handleWindowClick = () => setAudioMenu(null);
    window.addEventListener("click", handleWindowClick);
    return () => window.removeEventListener("click", handleWindowClick);
  }, []);

  const selectedUser = selectedUserId ? users.find((u) => u.id === selectedUserId) || null : null;
  const selectedUserStatus =
    selectedUser?.id === socket.id ? profile.status : selectedUser?.status;

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
        socket.emit("presence-status", profile.status || "online");
        setUnreadByRoom((prev) => ({ ...prev, [roomName]: 0 }));
      }
    });
  };

  const leaveCurrentRoom = () => {
    if (!currentRoom) return;
    const lastRoom = currentRoom;
    setCurrentRoom("");
    setTypingUsers([]);
    setMessages([]);
    setSelectedUserId(null);
    setAudioMenu(null);
    setSearchTerm("");
    resetVoiceConnections();
    socket.emit("typing-status", { roomId: lastRoom, serverId: currentServer, userName, isTyping: false });
    socket.emit("leave-room", {});
  };

  const submitCreateRoom = (roomName: string) => {
    socket.emit("create-room", { serverId: currentServer, roomName: roomName.trim(), userName }, (res: { ok?: boolean; error?: string }) => {
      if (!res?.ok) {
        alert(res?.error || "Kanal oluşturulamadı.");
        return;
      }
      setDialog(null);
      setDialogInput("");
    });
  };

  const submitDeleteRoom = (roomName: string) => {
    socket.emit("delete-room", { serverId: currentServer, roomName, userName }, (res: { ok?: boolean; error?: string }) => {
      if (!res?.ok) {
        alert(res?.error || "Kanal silinemedi.");
        return;
      }
      if (currentRoom === roomName) {
        setCurrentRoom("");
      }
      setDialog(null);
    });
  };

  const submitCreateServer = (serverName: string) => {
    socket.emit(
      "create-server",
      { serverName: serverName.trim(), userName },
      (res: { ok?: boolean; error?: string; serverId?: string }) => {
        if (!res?.ok) {
          alert(res?.error || "Sunucu oluşturulamadı.");
          return;
        }
        if (res.serverId) {
          setCurrentServer(res.serverId);
        }
        setDialog(null);
        setDialogInput("");
      }
    );
  };

  const submitDeleteServer = (serverId: string) => {
    socket.emit(
      "delete-server",
      { serverId, actorUserName: userName },
      (res: { ok?: boolean; error?: string }) => {
        if (!res?.ok) {
          alert(res?.error || "Sunucu silinemedi.");
          return;
        }
        if (currentServer === serverId) {
          setCurrentServer("default");
          setCurrentRoom("");
        }
        setDialog(null);
      }
    );
  };

  const submitClearAll = () => {
    const allRooms = activeRooms.filter((room) => room.name !== "genel");
    const nonDefaultServers = servers.filter((server) => server.id !== "default");

    allRooms.forEach((room) => {
      socket.emit("delete-room", { serverId: room.serverId || "default", roomName: room.name, userName });
    });
    nonDefaultServers.forEach((server) => {
      socket.emit("delete-server", { serverId: server.id, actorUserName: userName });
    });

    setCurrentServer("default");
    setCurrentRoom("");
    setDialog(null);
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
    } else {
      setIsMuted(false);
      if (localStream.current) {
        localStream.current.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
      }
      socket.emit("mute-status", false);
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

  const handleFilePick = (file: File) => {
    if (!currentRoom) {
      return;
    }
    if (file.size > 1024 * 1024) {
      alert("Dosya boyutu en fazla 1 MB olabilir.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) {
        alert("Dosya okunamadı.");
        return;
      }
      socket.emit(
        "send-message",
        {
          text: `[Dosya] ${file.name}`,
          attachment: {
            name: file.name,
            type: file.type || "application/octet-stream",
            dataUrl,
            size: file.size,
          },
        },
        (res: { ok?: boolean; error?: string }) => {
          if (!res?.ok) {
            alert(res?.error || "Dosya gönderilemedi.");
          }
        }
      );
    };
    reader.readAsDataURL(file);
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
    setSearchTerm("");
    setIsPinnedPanelOpen(false);
    resetVoiceConnections();
    setSelectedUserId(null);
    setAudioMenu(null);
  };

  const togglePinMessage = (message: ChatMessage) => {
    if (!currentRoom) {
      return;
    }
    setPinnedByRoom((prev) => {
      const current = prev[currentRoom] || [];
      const alreadyPinned = current.some((item) => item.id === message.id);
      return {
        ...prev,
        [currentRoom]: alreadyPinned
          ? current.filter((item) => item.id !== message.id)
          : [...current, message],
      };
    });
  };

  const isPinned = (messageId: number | string) => {
    if (!currentRoom) {
      return false;
    }
    return (pinnedByRoom[currentRoom] || []).some((item) => item.id === messageId);
  };

  const toggleReaction = (messageId: number | string) => {
    const key = String(messageId);
    setLikedByMe((prevLiked) => {
      const liked = Boolean(prevLiked[key]);
      setReactionsByMessage((prevCounts) => {
        const current = prevCounts[key] || 0;
        return {
          ...prevCounts,
          [key]: liked ? Math.max(0, current - 1) : current + 1,
        };
      });
      return {
        ...prevLiked,
        [key]: !liked,
      };
    });
  };

  const handleDeleteMessage = (message: ChatMessage) => {
    setMessages((prev) => prev.filter((item) => item.id !== message.id));
    socket.emit("delete-message", { messageId: message.id }, (res: { ok?: boolean; error?: string }) => {
      if (!res?.ok) {
        alert(res?.error || "Mesaj silinemedi.");
      }
    });
  };

  const handleModerateUser = (action: "mute" | "kick" | "ban") => {
    if (!audioMenu) return;
    socket.emit(
      "moderate-user",
      {
        action,
        targetSocketId: audioMenu.userId,
        targetUserName: audioMenu.userName,
        serverId: currentServer,
        actorUserName: userName,
      },
      (res: { ok?: boolean; error?: string }) => {
        if (!res?.ok) {
          alert(res?.error || "Moderasyon işlemi başarısız.");
          return;
        }
        setAudioMenu(null);
      }
    );
  };

  const typingLabel = typingUsers.length
    ? `${typingUsers.slice(0, 2).join(", ")} yazıyor${typingUsers.length > 2 ? "..." : ""}`
    : "";

  const handleProfileSave = async (newData: {
    name: string;
    bio: string;
    status?: ProfileStatus;
    avatarUrl?: string | null;
  }) => {
    try {
      const response = await fetch(`${socketServerUrl}/auth/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          userName: newData.name,
          bio: newData.bio,
          status: newData.status || "online",
          avatarUrl: newData.avatarUrl || "",
        }),
        credentials: "include",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Profil güncellenemedi.");
      }
      const updated = payload.user;
      setUserName(updated.userName);
      setProfile({
        name: updated.userName,
        bio: updated.bio || "",
        avatarUrl: updated.avatarUrl || null,
        status: (updated.status || "online") as ProfileStatus,
      });
      socket.emit("presence-status", (updated.status || "online") as ProfileStatus);
      setIsProfileOpen(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Profil güncellenemedi.");
    }
  };

  if (!isJoined) {
    return (
      <AuthContainer
        onJoin={(
          _email: string,
          n: string,
          token?: string,
          avatarUrl?: string | null,
          bio?: string,
          status?: ProfileStatus
        ) => {
          setUserName(n);
          setAuthToken(token || "");
          setProfile({
            name: n,
            bio: bio || "",
            avatarUrl: avatarUrl || null,
            status: status || "online",
          });
          setIsJoined(true);
        }}
      />
    );
  }

  return (
    <div
      className={`flex h-screen max-h-screen font-sans overflow-hidden ${
        themeMode === "dark" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-950"
      }`}
    >
      <ProfileModal
        key={`${isProfileOpen}-${profile.name}-${profile.status}-${profile.avatarUrl || ""}`}
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        userData={{
          name: profile.name || userName,
          bio: profile.bio,
          avatarUrl: profile.avatarUrl,
          status: profile.status,
        }}
        onSave={handleProfileSave}
      />

      <ServerList
        servers={servers}
        currentServer={currentServer}
        setCurrentServer={handleServerChange}
        onRequestCreateServer={() => {
          setDialogInput("");
          setDialog({ type: "create-server" });
        }}
        onRequestDeleteServer={(serverId: string, serverName: string) =>
          setDialog({ type: "delete-server", serverId, serverName })
        }
        onRequestClearAll={() => setDialog({ type: "clear-all" })}
      />

      <div className="w-72 min-w-72 h-full flex flex-col border-r border-slate-800">
        <ChannelList
          rooms={activeRooms.filter((r) => (r.serverId || "default") === currentServer)}
          currentRoom={currentRoom}
          handleJoinRoom={handleJoinRoom}
          handleCreateRoom={() => {
            setDialogInput("");
            setDialog({ type: "create-room" });
          }}
          handleDeleteRoom={(roomName: string) => setDialog({ type: "delete-room", roomName })}
          currentUserId={socket.id || ""}
          users={users}
          userName={userName}
          userStatus={profile.status}
          setIsJoined={setIsJoined}
          onOpenProfile={() => setIsProfileOpen(true)}
          onLeaveRoom={leaveCurrentRoom}
          onSelectUser={(selected) => setSelectedUserId(selected.id)}
          onOpenUserAudioMenu={(selected, x, y) =>
            setAudioMenu({ userId: selected.id, userName: selected.name, x, y })
          }
          unreadByRoom={unreadByRoom}
          isMuted={isMuted}
          isDeafened={isDeafened}
        />

        <ControlBar isMuted={isMuted} isDeafened={isDeafened} toggleMute={toggleMute} toggleDeafen={toggleDeafen} />
      </div>

      <div className={`flex-1 flex p-4 md:p-8 overflow-y-auto min-w-0 ${themeMode === "dark" ? "bg-slate-950" : "bg-slate-100"}`}>
        <ChatArea
          messages={messages}
          newMessage={newMessage}
          setNewMessage={handleMessageInput}
          sendMessage={sendMessage}
          userName={userName}
          currentRoom={currentRoom}
          typingLabel={typingLabel}
          pinnedMessages={currentRoom ? pinnedByRoom[currentRoom] || [] : []}
          onTogglePinMessage={togglePinMessage}
          isPinned={isPinned}
          onPickFile={handleFilePick}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          reactionsByMessage={reactionsByMessage}
          onToggleReaction={toggleReaction}
          likedByMe={likedByMe}
          onDeleteMessage={handleDeleteMessage}
          isPinnedPanelOpen={isPinnedPanelOpen}
          onTogglePinnedPanel={() => setIsPinnedPanelOpen((prev) => !prev)}
          themeMode={themeMode}
          onToggleThemeMode={() => {
            const nextTheme = themeMode === "dark" ? "light" : "dark";
            setThemeMode(nextTheme);
            window.localStorage.setItem("theme-mode", nextTheme);
          }}
        />
      </div>

      {selectedUser ? (
        <SelectedUserCard
          user={{ name: selectedUser.name, status: selectedUserStatus }}
          onClose={() => setSelectedUserId(null)}
        />
      ) : null}

      {audioMenu ? (
        <UserAudioMenu
          userName={audioMenu.userName}
          x={audioMenu.x}
          y={audioMenu.y}
          volume={userVolumes[audioMenu.userId] ?? 1}
          onVolumeChange={(volume) => {
            setUserVolumes((prev) => ({ ...prev, [audioMenu.userId]: volume }));
          }}
          onModerate={audioMenu.userId !== socket.id ? handleModerateUser : undefined}
        />
      ) : null}

      <DialogModal
        dialog={dialog}
        value={dialogInput}
        onValueChange={setDialogInput}
        onClose={() => setDialog(null)}
        onSubmitCreate={() => {
          const value = dialogInput.trim();
          if (!value || !dialog) {
            return;
          }
          if (dialog.type === "create-server") {
            submitCreateServer(value);
            return;
          }
          submitCreateRoom(value);
        }}
        onSubmitDelete={() => {
          if (!dialog) return;
          if (dialog.type === "delete-server") {
            submitDeleteServer(dialog.serverId);
            return;
          }
          if (dialog.type === "delete-room") {
            submitDeleteRoom(dialog.roomName);
            return;
          }
          submitClearAll();
        }}
      />

      <div className="fixed right-6 bottom-6 z-[110] space-y-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="rounded-xl bg-slate-800 text-slate-100 px-4 py-2 text-xs shadow-xl">
            {toast.text}
          </div>
        ))}
      </div>
    </div>
  );
}