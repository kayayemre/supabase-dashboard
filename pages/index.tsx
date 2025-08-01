import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

export default function Home() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = localStorage.getItem("user");
    if (user) {
      router.push("/dashboard");
    } else {
      setLoading(false); // login ekranını göster
    }
  }, []);

  const handleLogin = async (e: any) => {
    e.preventDefault();
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .single();

    if (!data || data.password_hash !== password) {
      alert("Hatalı kullanıcı adı veya şifre");
      return;
    }

    localStorage.setItem("user", JSON.stringify(data));
    router.push("/dashboard");
  };

  if (loading) return null;

  return (
    <div style={{ padding: "50px", fontFamily: "Arial" }}>
      <h2>Giriş Yap</h2>
      <form onSubmit={handleLogin}>
        <input
          placeholder="Kullanıcı Adı"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ display: "block", marginBottom: "10px" }}
        />
        <input
          type="password"
          placeholder="Şifre"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ display: "block", marginBottom: "10px" }}
        />
        <button type="submit">Giriş</button>
      </form>
    </div>
  );
}
