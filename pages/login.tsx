import { useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

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

  return (
    <div style={{ padding: "50px" }}>
      <h2>Giriş Yap</h2>
      <form onSubmit={handleLogin}>
        <input
          placeholder="Kullanıcı Adı"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <br />
        <input
          type="password"
          placeholder="Şifre"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <br />
        <button type="submit">Giriş</button>
      </form>
    </div>
  );
}
