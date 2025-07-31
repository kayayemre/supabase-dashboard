import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

// UTC → Türkiye saati dönüşümü
function toTRString(isoStr: string) {
  const d = new Date(isoStr);
  return d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
}

export default function Dashboard() {
  const router = useRouter();
  const [veriler, setVeriler] = useState<any[]>([]);
  const [sayfa, setSayfa] = useState(1);
  const bugunTR = new Date().toLocaleString("en-CA", { timeZone: "Europe/Istanbul" }).split(",")[0];
  const [seciliTarih, setSeciliTarih] = useState(bugunTR);
  const [modalData, setModalData] = useState<any | null>(null);
  const [kullanici, setKullanici] = useState<any>(null);
  const sayfaBoyutu = 50;

  useEffect(() => {
    const u = localStorage.getItem("user");
    if (!u) router.push("/login");
    else setKullanici(JSON.parse(u));
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const start = new Date(`${seciliTarih}T00:00:00+03:00`).toISOString();
      const end = new Date(`${seciliTarih}T23:59:59+03:00`).toISOString();

      const { data } = await supabase
        .from("musteriler")
        .select("*")
        .gte("created_at", start)
        .lte("created_at", end)
        .ilike("not", "%whatsapp%")
        .order("created_at", { ascending: false });

      if (data) setVeriler(data);
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [seciliTarih]);

  const durumDegistir = async (id: string, yeniDurum: string) => {
    await supabase
      .from("musteriler")
      .update({
        durum: yeniDurum,
        updated_by: kullanici.username,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
  };

  const mesajSayisi = veriler.length;
  const aranan = veriler.filter((v) => v.durum === "ARANDI" || v.durum === "SATIŞ").length;
  const aramaOrani = mesajSayisi ? Math.round((aranan / mesajSayisi) * 100) : 0;

  const kullaniciStats = veriler.reduce((acc, v) => {
    const k = v.updated_by || "Bilinmiyor";
    acc[k] = acc[k] || { arandi: 0, satis: 0 };
    if (v.durum === "ARANDI") acc[k].arandi += 1;
    if (v.durum === "SATIŞ") acc[k].satis += 1;
    return acc;
  }, {} as Record<string, { arandi: number; satis: number }>);

  const kullaniciListesi = Object.entries(kullaniciStats).sort(
    (a, b) => b[1].arandi + b[1].satis - (a[1].arandi + a[1].satis)
  );

  const baslangic = (sayfa - 1) * sayfaBoyutu;
  const gosterilen = veriler.slice(baslangic, baslangic + sayfaBoyutu);
  const toplamSayfa = Math.ceil(veriler.length / sayfaBoyutu);

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h2>🧾 Genel İstatistikler</h2>
      <input
        type="date"
        value={seciliTarih}
        onChange={(e) => setSeciliTarih(e.target.value)}
      />
      <p>Toplam Mesaj: {mesajSayisi}</p>
      <p>Aranan: {aranan}</p>
      <p>Arama Oranı: %{aramaOrani}</p>

      <hr />

      <h2>👤 Kullanıcı İstatistikleri</h2>
      {kullaniciListesi.map(([kadi, stat]) => (
        <p key={kadi}>
          {kadi}: Arandı = {stat.arandi}, Satış = {stat.satis}
        </p>
      ))}

      <hr />

      <h2>📋 Müşteri Listesi</h2>
      <table border={1} cellPadding={5} style={{ fontSize: "12px", width: "100%" }}>
        <thead>
          <tr>
            <th>Oluşma</th>
            <th>Ad Soyad</th>
            <th>Telefon</th>
            <th>Otel</th>
            <th>Mesaj</th>
            <th>Fiyat</th>
            <th>Durum</th>
            <th>Değiştiren</th>
            <th>Değişme Tarihi</th>
            <th>İşlem</th>
          </tr>
        </thead>
        <tbody>
          {gosterilen.map((v) => (
            <tr key={v.id}>
              <td>{toTRString(v.created_at)}</td>
              <td>
                <span onClick={() => setModalData({ title: "Ad Soyad", value: v.ad_soyad })}>
                  {v.ad_soyad?.slice(0, 10)}...
                </span>
              </td>
              <td>{v.telefon}</td>
              <td>{v.otel_adi}</td>
              <td>
                <span onClick={() => setModalData({ title: "Mesaj", value: v.mesaj })}>
                  {v.mesaj?.slice(0, 40)}...
                </span>
              </td>
              <td>{v.fiyat}</td>
              <td>{v.durum}</td>
              <td>{v.updated_by}</td>
              <td>{v.updated_at ? toTRString(v.updated_at) : ""}</td>
              <td>
                <select defaultValue={v.durum} onChange={(e) => durumDegistir(v.id, e.target.value)}>
                  <option>ARANMADI</option>
                  <option>ARANDI</option>
                  <option>SATIŞ</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: "10px" }}>
        Sayfa:
        {Array.from({ length: toplamSayfa }).map((_, i) => (
          <button key={i} onClick={() => setSayfa(i + 1)} style={{ marginLeft: 5 }}>
            {i + 1}
          </button>
        ))}
      </div>

      {/* Modal */}
      {modalData && (
        <div
          style={{
            position: "fixed",
            top: "30%",
            left: "30%",
            background: "#fff",
            border: "1px solid #000",
            padding: "20px",
            zIndex: 100,
          }}
        >
          <h3>{modalData.title}</h3>
          <p>{modalData.value}</p>
          <button onClick={() => setModalData(null)}>Kapat</button>
        </div>
      )}
    </div>
  );
}
