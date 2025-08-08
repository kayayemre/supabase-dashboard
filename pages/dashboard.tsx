import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import * as XLSX from "xlsx"; // XLSX paketi

// --- Yardımcılar ---
// UTC → Türkiye saati dönüşümü
function toTRString(isoStr: string) {
  const d = new Date(isoStr);
  return d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
}

// datetime-local → ISO (+03:00) dönüşümü
function dtLocalToISO(dtLocal: string) {
  return new Date(`${dtLocal}:00+03:00`).toISOString();
}

// Bugünün TR tarih aralığı [00:00, 23:59]
function todayTRRange() {
  const now = new Date();
  const trNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" })
  );
  const y = trNow.getFullYear();
  const m = trNow.getMonth();
  const d = trNow.getDate();

  const startTR = new Date(Date.UTC(y, m, d, 0, 0, 0));
  const endTR = new Date(Date.UTC(y, m, d, 23, 59, 59));

  return {
    startISO: startTR.toISOString(),
    endISO: endTR.toISOString(),
    startLocalInput: trNow.toLocaleDateString("en-CA") + "T00:00",
    endLocalInput: trNow.toLocaleDateString("en-CA") + "T23:59",
  };
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

  // Kullanıcı & rol
  const [kullanici, setKullanici] = useState<any>(null);
  const adminUsers = useMemo(() => ["admin", "yönetici"], []);
  const isAdmin = useMemo(() => {
    const roleOK = kullanici?.role && String(kullanici.role).toLowerCase() === "admin";
    const wlOK = kullanici?.username && adminUsers.includes(String(kullanici.username).toLowerCase());
    return !!(roleOK || wlOK);
  }, [kullanici, adminUsers]);

  // Tarih alanları (admin görür/ayarlar, non-admin için bugüne zorlanır)
  const { startLocalInput, endLocalInput } = todayTRRange();
  const [seciliBasDT, setSeciliBasDT] = useState(startLocalInput);
  const [seciliBitDT, setSeciliBitDT] = useState(endLocalInput);

  // Toplu işlem UI durumları (yalnız admin)
  const [yeniDurumToplu, setYeniDurumToplu] = useState<string>("ARANMADI");
  const [topluLoading, setTopluLoading] = useState<boolean>(false);

  useEffect(() => {
    const u = localStorage.getItem("user");
    if (!u) {
      router.push("/");
    } else {
      setKullanici(JSON.parse(u));
    }
  }, []);

  // Sorgu aralığı: admin seçili tarihi kullanır; non-admin bugüne kilitlenir
  const queryRange = useMemo(() => {
    if (isAdmin) {
      return {
        start: dtLocalToISO(seciliBasDT),
        end: dtLocalToISO(seciliBitDT),
      };
    }
    // non-admin => bugünün TR aralığı
    const { startISO, endISO } = todayTRRange();
    return { start: startISO, end: endISO };
  }, [isAdmin, seciliBasDT, seciliBitDT]);

  const reloadList = useCallback(async () => {
    const { start, end } = queryRange;
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
  }, [queryRange, sayfa]);

  const reloadStats = useCallback(async () => {
    const { start, end } = queryRange;

    // Genel
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

    // Kullanıcı (updated_at)
    const { data: tumKayitlar } = await supabase
      .from("musteriler")
      .select("updated_by, durum, updated_at")
      .gte("updated_at", start)
      .lte("updated_at", end)
      .not("updated_at", "is", null)
      .ilike("not", "%whatsapp%");

    const kStats: Record<string, { arandi: number; satis: number }> = {};
    for (const k of tumKayitlar || []) {
      const kadi = k.updated_by || "Bilinmiyor";
      if (!kStats[kadi]) kStats[kadi] = { arandi: 0, satis: 0 };
      if (k.durum === "ARANDI") kStats[kadi].arandi += 1;
      if (k.durum === "SATIŞ") kStats[kadi].satis += 1;
    }
    setKullaniciIstatistik(kStats);
  }, [queryRange]);

  // Liste verisi (otomatik yenileme sadece 1. sayfada)
  useEffect(() => {
    reloadList();
    const interval = sayfa === 1 ? setInterval(reloadList, 5000) : null;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [reloadList, sayfa]);

  // İstatistikler
  useEffect(() => {
    reloadStats();
  }, [reloadStats]);

  // Tekil durum değişikliği (herkes kullanabilir — talebiniz böyle)
  const durumDegistir = async (id: string, yeniDurum: string) => {
    await supabase
      .from("musteriler")
      .update({
        durum: yeniDurum,
        updated_by: kullanici?.username,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    await reloadList();
    await reloadStats();
  };

  // CSV export (admin değilse bugüne göre export)
  async function exportCSV() {
    const { start, end } = queryRange;

    const { data } = await supabase
      .from("musteriler")
      .select("*")
      .gte("created_at", start)
      .lte("created_at", end)
      .ilike("not", "%whatsapp%")
      .order("created_at", { ascending: false });

    const headers = [
      "Oluşma",
      "Ad Soyad",
      "Telefon",
      "Otel",
      "Mesaj",
      "Fiyat",
      "Durum",
      "Değiştiren",
      "Değişme Tarihi",
    ];

    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return "";
      const s = String(val);
      if (/[",\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const rows = (data || []).map((v) => [
      toTRString(v.created_at),
      v.ad_soyad,
      v.telefon,
      v.otel_adi,
      v.mesaj,
      v.fiyat,
      v.durum,
      v.updated_by,
      v.updated_at ? toTRString(v.updated_at) : "",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.map(escapeCSV).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `musteriler_${start}_to_${end}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // XLSX export (admin değilse bugüne göre export)
  async function exportXLSX() {
    const { start, end } = queryRange;

    const { data } = await supabase
      .from("musteriler")
      .select("*")
      .gte("created_at", start)
      .lte("created_at", end)
      .ilike("not", "%whatsapp%")
      .order("created_at", { ascending: false });

    const rows = (data || []).map((v) => ({
      "Oluşma": toTRString(v.created_at),
      "Ad Soyad": v.ad_soyad,
      "Telefon": v.telefon,
      "Otel": v.otel_adi,
      "Mesaj": v.mesaj,
      "Fiyat": v.fiyat,
      "Durum": v.durum,
      "Değiştiren": v.updated_by,
      "Değişme Tarihi": v.updated_at ? toTRString(v.updated_at) : "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Müşteriler");
    XLSX.writeFile(wb, `musteriler_${start}_to_${end}.xlsx`);
  }

  // --- TOPLU DURUM DEĞİŞTİRME (yalnız admin) ---
  async function topluDurumDegistir(tumFiltre: boolean) {
    if (!isAdmin) {
      alert("Bu işlem sadece adminler içindir.");
      return;
    }

    const { start, end } = queryRange;
    const hedefMetin = tumFiltre
      ? `Seçili tarih aralığındaki TÜM kayıtların`
      : `Bu sayfadaki ${veriler.length} kaydın`;

    const onay = window.confirm(
      `${hedefMetin} durumunu "${yeniDurumToplu}" olarak değiştirmek istediğinize emin misiniz?`
    );
    if (!onay) return;

    try {
      setTopluLoading(true);

      let q = supabase
        .from("musteriler")
        .update({
          durum: yeniDurumToplu,
          updated_by: kullanici?.username,
          updated_at: new Date().toISOString(),
        });

      if (tumFiltre) {
        q = q
          .gte("created_at", start)
          .lte("created_at", end)
          .ilike("not", "%whatsapp%");
      } else {
        const ids = veriler.map((v) => v.id);
        if (ids.length === 0) {
          alert("Bu sayfada güncellenecek kayıt yok.");
          setTopluLoading(false);
          return;
        }
        q = q.in("id", ids);
      }

      const { data, error } = await q.select("id");
      if (error) throw error;

      const adet = data?.length || 0;
      alert(`${adet} kayıt güncellendi.`);

      await reloadList();
      await reloadStats();
    } catch (e: any) {
      console.error(e);
      alert(`Toplu güncelleme hatası: ${e?.message || e}`);
    } finally {
      setTopluLoading(false);
    }
  }

  const toplamSayfa = Math.ceil(toplamKayit / sayfaBoyutu);
  const siraliKullanicilar = Object.entries(kullaniciIstatistik).sort(
    (a, b) => b[1].arandi + b[1].satis - (a[1].arandi + a[1].satis)
  );

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h2>🧾 Genel İstatistikler</h2>

      {/* Tarih filtreleri ve export butonları -> yalnız admin görünür */}
      {isAdmin ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label>Başlangıç</label>
          <input
            type="datetime-local"
            value={seciliBasDT}
            onChange={(e) => { setSayfa(1); setSeciliBasDT(e.target.value); }}
          />
          <label>Bitiş</label>
          <input
            type="datetime-local"
            value={seciliBitDT}
            onChange={(e) => { setSayfa(1); setSeciliBitDT(e.target.value); }}
          />
          <button onClick={exportCSV}>Excel (CSV)</button>
          <button onClick={exportXLSX}>Excel (XLSX)</button>
        </div>
      ) : (
        <div style={{ margin: "8px 0", fontSize: 12, opacity: 0.8 }}>
          Bugün için veriler gösteriliyor. Detaylı filtreleme sadece adminlere açıktır.
        </div>
      )}

      {/* Toplu durum değiştirme -> yalnız admin görünür */}
      {isAdmin && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label>Toplu durum:</label>
          <select
            value={yeniDurumToplu}
            onChange={(e) => setYeniDurumToplu(e.target.value)}
            disabled={topluLoading}
          >
            <option value="ARANMADI">ARANMADI</option>
            <option value="ARANDI">ARANDI</option>
            <option value="SATIŞ">SATIŞ</option>
          </select>

          <button
            onClick={() => topluDurumDegistir(true)}
            disabled={topluLoading}
            title="Tarih filtresine uyan tüm kayıtları günceller"
          >
            {topluLoading ? "Güncelleniyor..." : "Filtrelenen TÜM kayıtların durumunu değiştir"}
          </button>

          <button
            onClick={() => topluDurumDegistir(false)}
            disabled={topluLoading}
            title="Sadece bu sayfadaki kayıtları günceller"
          >
            {topluLoading ? "Güncelleniyor..." : "SADECE BU SAYFADAKİ kayıtların durumunu değiştir"}
          </button>
        </div>
      )}

      <p>Toplam Mesaj: {istatistik.toplam}</p>
      <p>Aranan: {istatistik.aranan}</p>
      <p>Arama Oranı: %{istatistik.toplam ? Math.round((istatistik.aranan / istatistik.toplam) * 100) : 0}</p>

      <hr />
      <h2>👤 Kullanıcı İstatistikleri</h2>
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
              <td>{v.ad_soyad}</td>
              <td>{v.telefon}</td>
              <td>{v.otel_adi}</td>
              <td>{v.mesaj}</td>
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
        {Array.from({ length: Math.ceil(toplamKayit / sayfaBoyutu) }).map((_, i) => (
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
    </div>
  );
}
