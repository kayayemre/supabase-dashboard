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
  const sayfaBoyutu = 50;
  const [toplamKayit, setToplamKayit] = useState(0);
  const [istatistik, setIstatistik] = useState({ toplam: 0, aranan: 0 });
  const [kullaniciIstatistik, setKullaniciIstatistik] = useState<
    Record<string, { arandi: number; satis: number }>
  >({});
  const bugunTR = new Date().toLocaleString("en-CA", { timeZone: "Europe/Istanbul" }).split(",")[0];
  const [seciliTarih, setSeciliTarih] = useState(bugunTR);
  const [modalData, setModalData] = useState<any | null>(null);
  const [kullanici, setKullanici] = useState<any>(null);

  useEffect(() => {
    const u = localStorage.getItem("user");
    if (!u) router.push("/");
    else setKullanici(JSON.parse(u));
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const start = new Date(`${seciliTarih}T00:00:00+03:00`).toISOString();
      const end = new Date(`${seciliTarih}T23:59:59+03:00`).toISOString();
      const baslangic = (sayfa - 1) * sayfaBoyutu;
      const bitis = baslangic + sayfaBoyutu - 1;

      const { data, count } = await supabase
        .from("musteriler")
        .select("*", { count: "exact" })
        .gte("created_at", start)
        .lte("created_at", end)
        .ilike("not", "%whatsapp%")
        .order("created_at", { ascending: false })
        .range(baslangic, bitis);

      if (data) {
        setVeriler(data);
        if (typeof count === "number") setToplamKayit(count);
      }
    };

    fetchData();

    const interval = sayfa === 1 ? setInterval(fetchData, 5000) : null;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [seciliTarih, sayfa]);

  useEffect(() => {
    const fetchIstatistik = async () => {
      const start = new Date(`${seciliTarih}T00:00:00+03:00`).toISOString();
      const end = new Date(`${seciliTarih}T23:59:59+03:00`).toISOString();

      const toplam = await supabase
        .from("musteriler")
        .select("*", { count: "exact", head: true })
        .gte("created_at", start)
        .lte("created_at", end)
        .ilike("not", "%whatsapp%");

      const aranan = await supabase
        .from("musteriler")
        .select("*", { count: "exact", head: true })
        .gte("created_at", start)
        .lte("created_at", end)
        .ilike("not", "%whatsapp%")
        .in("durum", ["ARANDI", "SATIŞ"]);

      setIstatistik({
        toplam: toplam.count || 0,
        aranan: aranan.count || 0,
      });

  
  // 🔥 Kullanıcı bazlı tüm istatistikler  (YENİ)
const { data: tumKayitlar } = await supabase
  .from("musteriler")
  .select("updated_by, durum, updated_at")
  .gte("updated_at", start)
  .lte("updated_at", end)
  .not("updated_at", "is", null) // güvenlik amaçlı
  .ilike("not", "%whatsapp%");


      const kStats: Record<string, { arandi: number; satis: number }> = {};
      for (const k of tumKayitlar || []) {
        const kadi = k.updated_by || "Bilinmiyor";
        if (!kStats[kadi]) kStats[kadi] = { arandi: 0, satis: 0 };
        if (k.durum === "ARANDI") kStats[kadi].arandi += 1;
        if (k.durum === "SATIŞ") kStats[kadi].satis += 1;
      }

      setKullaniciIstatistik(kStats);
    };

    fetchIstatistik();
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

  const toplamSayfa = Math.ceil(toplamKayit / sayfaBoyutu);
  const siraliKullanicilar = Object.entries(kullaniciIstatistik).sort(
    (a, b) => b[1].arandi + b[1].satis - (a[1].arandi + a[1].satis)
  );

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h2>🧾 Genel İstatistikler</h2>
      <input type="date" value={seciliTarih} onChange={(e) => setSeciliTarih(e.target.value)} />
      <p>Toplam Mesaj: {istatistik.toplam}</p>
      <p>Aranan: {istatistik.aranan}</p>
      <p>Arama Oranı: %{istatistik.toplam ? Math.round((istatistik.aranan / istatistik.toplam) * 100) : 0}</p>

      <hr />

      <h2>👤 Kullanıcı İstatistikleri (Tüm Gün İçin)</h2>
     {siraliKullanicilar.map(([kadi, stat]) => (
  <p key={kadi}>
    {kadi} {stat.arandi} kişiyi aradı
    {stat.satis > 0 ? `, ${stat.satis} satış yaptı` : ""}
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
          {veriler.map((v) => (
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
          <button
            key={i}
            onClick={() => setSayfa(i + 1)}
            style={{
              marginLeft: 5,
              background: sayfa === i + 1 ? "#000" : "#fff",
              color: sayfa === i + 1 ? "#fff" : "#000",
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>

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
