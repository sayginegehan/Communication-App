"use client";
import { useState } from "react";

interface AuthProps {
  onJoin: (email: string, userName: string) => void;
}

const socketServerUrl =
  process.env.NEXT_PUBLIC_SOCKET_SERVER_URL ||
  "https://communication-app-production.up.railway.app";

export default function AuthContainer({ onJoin }: AuthProps) {
  const [isLoginActive, setIsLoginActive] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userName, setUserName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAuthRequest = async (mode: "login" | "register") => {
    setError("");
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedUserName = userName.trim();
    if (!trimmedEmail || !password) {
      setError("Email ve şifre gerekli.");
      return;
    }
    if (mode === "register" && !trimmedUserName) {
      setError("Kayıt için kullanıcı adı gerekli.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload =
        mode === "register"
          ? { email: trimmedEmail, password, userName: trimmedUserName }
          : { email: trimmedEmail, password };
      const response = await fetch(`${socketServerUrl}/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Kimlik doğrulama başarısız.");
      }
      onJoin(result.user.email, result.user.userName);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "İşlem sırasında hata oluştu."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans overflow-hidden">
      <div className="relative w-full max-w-[900px] h-[600px] bg-slate-900 rounded-[60px] overflow-hidden shadow-2xl border border-slate-800 flex">
        {/* Giriş Formu */}
        <div className={`w-1/2 h-full flex flex-col items-center justify-center p-14 transition-all duration-700 ease-in-out z-10 ${!isLoginActive ? 'translate-x-full opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'}`}>
          <h2 className="text-4xl font-black text-rose-500 mb-10 uppercase tracking-tighter">Giriş Yap</h2>
          <div className="w-full space-y-5">
            <input type="email" placeholder="E-posta" className="w-full p-4 bg-slate-800 border border-slate-700 rounded-2xl text-white outline-none focus:border-rose-500 transition-all placeholder:text-slate-500" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="password" placeholder="Şifre" className="w-full p-4 bg-slate-800 border border-slate-700 rounded-2xl text-white outline-none focus:border-rose-500 transition-all placeholder:text-slate-500" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button onClick={() => handleAuthRequest("login")} disabled={isSubmitting} className="w-full bg-rose-600 text-white p-5 rounded-2xl font-black text-lg hover:bg-rose-700 shadow-xl active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed">BAĞLAN</button>
          </div>
        </div>

        {/* Kayıt Formu */}
        <div className={`w-1/2 h-full flex flex-col items-center justify-center p-14 transition-all duration-700 ease-in-out z-10 ${isLoginActive ? '-translate-x-full opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'}`}>
          <h2 className="text-4xl font-black text-sky-500 mb-10 uppercase tracking-tighter">Kayıt Ol</h2>
          <div className="w-full space-y-5">
            <input type="text" placeholder="Takma Ad" className="w-full p-4 bg-slate-800 border border-slate-700 rounded-2xl text-white outline-none focus:border-sky-500 transition-all placeholder:text-slate-500" value={userName} onChange={(e) => setUserName(e.target.value)} />
            <input type="email" placeholder="E-posta" className="w-full p-4 bg-slate-800 border border-slate-700 rounded-2xl text-white outline-none focus:border-sky-500 transition-all placeholder:text-slate-500" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="password" placeholder="Şifre" className="w-full p-4 bg-slate-800 border border-slate-700 rounded-2xl text-white outline-none focus:border-sky-500 transition-all placeholder:text-slate-500" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button onClick={() => handleAuthRequest("register")} disabled={isSubmitting} className="w-full bg-sky-600 text-white p-5 rounded-2xl font-black text-lg hover:bg-sky-700 shadow-xl active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed">HESAP OLUŞTUR</button>
          </div>
        </div>

        {/* Kayan Kırmızı Overlay */}
        <div className={`absolute top-0 w-1/2 h-full bg-gradient-to-br from-rose-600 to-rose-900 z-20 transition-all duration-700 ease-in-out flex flex-col items-center justify-center text-white px-14 text-center ${isLoginActive ? 'left-1/2 rounded-l-[120px]' : 'left-0 rounded-r-[120px]'}`}>
          <h1 className="text-5xl font-black tracking-tighter mb-6 leading-none uppercase">{isLoginActive ? "TEKRAR SELAM!" : "MERHABA DUMBASS!"}</h1>
          <p className="text-rose-100 text-base mb-10 font-medium leading-relaxed">{isLoginActive ? "Zaten bir hesabın varsa giriş yap ve kaldığın yerden devam et." : "Henüz bir hesabın yoksa hemen kayıt ol ve aramıza katıl!"}</p>
          <button onClick={() => setIsLoginActive(!isLoginActive)} className="border-[3px] border-white px-12 py-4 rounded-full font-black uppercase text-sm hover:bg-white hover:text-rose-700 transition-all active:scale-90 shadow-2xl">{isLoginActive ? "Kayıt Olmaya Git" : "Giriş Yapmaya Git"}</button>
        </div>
      </div>
      {error ? (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white px-5 py-3 rounded-xl shadow-xl text-sm">
          {error}
        </div>
      ) : null}
    </div>
  );
}