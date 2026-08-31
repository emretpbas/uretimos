// ════════════════════════════════════════════════════════════════════════════
// DOLAP 3D GÖRÜNÜM (WebGL / three.js)
// ────────────────────────────────────────────────────────────────────────────
// Mevcut izometrik SVG çizimini (dolap_cizim.js → ucBoyut) DEĞİŞTİRMEZ; onun
// yanında, fareyle/parmakla döndürülüp yakınlaştırılabilen gerçek bir katı
// model sunar. Aynı hesap verisini (geo bilgisi) kullanır — tek doğruluk
// kaynağı yine dolap_hesap.js'tir.
//
// three.min.js (UMD, global THREE) index.html'de bu dosyadan ÖNCE yüklenir.
// OrbitControls kütüphanesi dahil edilmedi; döndürme/zoom pointer olaylarıyla
// elle yazıldı (ek bağımlılık olmasın diye).
//
// Sınır: Bu fotogerçekçi bir render değil. Basit ışık + düz renkli paneller;
// kapak/gövde rengi tasarımdan alınır ama doku/yansıma yoktur. Amaç, ölçü ve
// yapıyı 3B görmek — pazarlama görseli üretmek değil.
// ════════════════════════════════════════════════════════════════════════════
const Dolap3D = (() => {
  let renderer = null, scene = null, camera = null, kok = null;
  let animId = null, hedefKap = null;
  // Yörünge (orbit) durumu
  let aci = { theta: Math.PI * 0.15, phi: Math.PI * 0.35 }, uzaklik = 3;
  let surukluyor = false, sonX = 0, sonY = 0;

  const mm = (v) => (+v || 0) / 1000;   // mm → metre (three birimleri)

  // Hesap sonucundan 3D için gereken boyutları çıkarır (geo ile aynı mantık).
  function boyutlar(h) {
    const c = h.yapilandirma, t = +c.panelKalinlik || 18;
    return {
      c, t,
      W: +c.genislik, D: +c.derinlik,
      govdeH: h.ozet.govdeYukseklik,
      tacY: c.ustTac ? ((+c.ustTacKalinlik > 0) ? +c.ustTacKalinlik : (+c.ustTacYukseklik || 0)) : 0,
      bazaY: c.bazaTipi === 'baza' ? +c.bazaYukseklik : 0,
      ayakY: c.bazaTipi === 'ayak' ? (+c.ayakYukseklik || 0) : 0,
      arkaT: +c.arkalikKalinlik || 8,
      bolmeler: h.bolmeler || []
    };
  }

  // Bir kutu (panel) ekler. Ölçüler mm; three metre kullandığı için mm()'lenir.
  // x,y,z paneli MERKEZLER (three BoxGeometry merkez-hizalı).
  function kutu(g, en, yuk, der, x, y, z, renk, opasite) {
    const geo = new THREE.BoxGeometry(mm(en), mm(yuk), mm(der));
    const mat = new THREE.MeshLambertMaterial({
      color: renk, transparent: opasite < 1, opacity: opasite == null ? 1 : opasite
    });
    const kutu = new THREE.Mesh(geo, mat);
    kutu.position.set(mm(x), mm(y), mm(z));
    g.add(kutu);
    // İnce kenar çizgisi (okunabilirlik)
    const kenar = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x33322e, transparent: true, opacity: 0.35 })
    );
    kenar.position.copy(kutu.position);
    g.add(kenar);
    return kutu;
  }

  // Dolabı three grubu olarak inşa eder. Koordinat: X=genişlik, Y=yükseklik
  // (0 = zemin), Z=derinlik. Dolap X ve Z'de ortalanır.
  function dolabiKur(h, dekor) {
    const b = boyutlar(h);
    const grup = new THREE.Group();
    const t = b.t;
    const govdeRenk = (dekor && dekor.govde) || 0xcdbb9a;   // gövde
    const kapakRenk = (dekor && dekor.kapak) || 0xd8c8a8;   // kapak
    const arkaRenk = 0xb8a888;

    const altY = b.bazaY + b.ayakY;         // gövde bu yükseklikte başlar
    const govdeUst = altY + b.govdeH;

    // ── Baza veya ayak ──
    if (b.bazaY > 0) {
      kutu(grup, b.W, b.bazaY, b.D * 0.85, 0, b.bazaY / 2, 0, 0x6b5d48, 1);
    } else if (b.ayakY > 0) {
      [-b.W / 2 + 40, b.W / 2 - 40].forEach(ax => {
        [-b.D / 2 + 40, b.D / 2 - 40].forEach(az => {
          kutu(grup, 40, b.ayakY, 40, ax, b.ayakY / 2, az, 0x4a4038, 1);
        });
      });
    }

    // ── Gövde: iki yan, alt, üst, arkalık ──
    const yanCy = altY + b.govdeH / 2;
    kutu(grup, t, b.govdeH, b.D, -b.W / 2 + t / 2, yanCy, 0, govdeRenk, 1);   // sol yan
    kutu(grup, t, b.govdeH, b.D, b.W / 2 - t / 2, yanCy, 0, govdeRenk, 1);    // sağ yan
    kutu(grup, b.W - 2 * t, t, b.D, 0, altY + t / 2, 0, govdeRenk, 1);        // alt
    kutu(grup, b.W - 2 * t, t, b.D, 0, govdeUst - t / 2, 0, govdeRenk, 1);    // üst
    // arkalık
    kutu(grup, b.W - 2 * t, b.govdeH - 2 * t, b.arkaT, 0, yanCy, -b.D / 2 + b.arkaT / 2, arkaRenk, 1);

    // ── Taç ──
    if (b.tacY > 0) kutu(grup, b.W, b.tacY, b.D * 0.4, 0, govdeUst + b.tacY / 2, -b.D * 0.28, govdeRenk, 1);

    // ── Bölmeler: dikey ayraç, raflar, kapaklar, çekmeceler ──
    const icAltY = altY + t;                // iç taban
    b.bolmeler.forEach((bl, i) => {
      const bx = -b.W / 2 + bl.x + bl.genislik / 2;   // bölme merkez X (gövde X=0 ortalı)
      const bxMerkez = -b.W / 2 + bl.x + bl.genislik / 2;
      // Dikey ayraç (son bölme hariç)
      if (i < b.bolmeler.length - 1) {
        const ayracX = -b.W / 2 + bl.x + bl.genislik + t / 2;
        kutu(grup, t, b.govdeH - 2 * t, b.D - 20, ayracX, yanCy, 10, govdeRenk, 1);
      }
      // Raflar (sabit + hareketli), bölme yüksekliğine eşit dağıt
      const rafTop = (bl.rafSabit || 0) + (bl.rafHareketli || 0);
      const cekH = (bl.cekmeceSayisi || 0) * (bl.cekmeceYukseklik || 0);
      const kapakAlanY = bl.yukseklik - cekH;
      for (let r = 1; r <= rafTop; r++) {
        const ry = icAltY + (kapakAlanY * r) / (rafTop + 1);
        kutu(grup, bl.genislik - 4, t, b.D - 40, bxMerkez, ry, 10, govdeRenk, 1);
      }
      // Çekmeceler (alttan yukarı)
      for (let k = 0; k < (bl.cekmeceSayisi || 0); k++) {
        const cy = icAltY + k * bl.cekmeceYukseklik + bl.cekmeceYukseklik / 2;
        kutu(grup, bl.genislik - 6, bl.cekmeceYukseklik - 6, t, bxMerkez, cy, b.D / 2 - t / 2, kapakRenk, 1);
      }
      // Kapaklar (çekmecelerin üstündeki alanı kaplar) — hafif saydam ki iç görünsün
      // Kapak tipi (tam bini/yarım bini/içerlek), bölme boşluğuna göre kapağın
      // KONUM ve BOYUTUNU değiştirir — dolap_hesap.js/dolap_render.js ile aynı
      // mantık: içerlek panel+fuga kadar içeri çekilir, tam/yarım bini panel
      // kalınlığı kadar (yarımda yarısı) dışa taşar.
      if (bl.kapakSayisi > 0) {
        const kapAltY = icAltY + cekH;
        const fuga = +b.c.fuga || 3;
        let kapXBase, kapW, kapYAlt, kapHTotal;
        if (b.c.kapakTipi === 'icerlek') {
          kapXBase = -b.W / 2 + bl.x + t + fuga; kapW = bl.genislik - 2 * (t + fuga);
          kapYAlt = kapAltY + t + fuga; kapHTotal = kapakAlanY - 2 * (t + fuga);
        } else {
          const tasma = b.c.kapakTipi === 'yarim_bini' ? t / 2 : t;
          kapXBase = -b.W / 2 + bl.x - tasma; kapW = bl.genislik + 2 * tasma;
          kapYAlt = kapAltY - tasma; kapHTotal = kapakAlanY + 2 * tasma;
        }
        const adet = bl.kapakSayisi;
        const kw = (kapW - (adet - 1) * fuga) / adet;
        for (let k = 0; k < adet; k++) {
          const kx = kapXBase + k * (kw + fuga) + kw / 2;
          kutu(grup, kw, kapHTotal, t, kx, kapYAlt + kapHTotal / 2, b.D / 2 - t / 2, kapakRenk, 0.82);
        }
      }
    });

    // Modeli X-Z merkezine al, tabanı y=0'a otur (zaten öyle). Kamera hedefi orta.
    const merkezY = (altY + b.govdeH + b.tacY) / 2;
    grup.userData.merkezY = mm(merkezY);
    grup.userData.capMetre = mm(Math.max(b.W, b.govdeH, b.D));
    return grup;
  }

  function kamerayiYerlestir() {
    if (!camera || !scene) return;
    const hedef = scene.userData.merkezY || 0.8;
    const r = uzaklik;
    camera.position.set(
      r * Math.sin(aci.phi) * Math.sin(aci.theta),
      hedef + r * Math.cos(aci.phi),
      r * Math.sin(aci.phi) * Math.cos(aci.theta)
    );
    camera.lookAt(0, hedef, 0);
  }

  function render3D(h, dekor) {
    if (!hedefKap) return;
    // Önceki sahneyi temizle
    temizle();

    const W = hedefKap.clientWidth || 380, H = 360;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf2efe9);

    camera = new THREE.PerspectiveCamera(42, W / H, 0.05, 100);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    hedefKap.innerHTML = '';
    hedefKap.appendChild(renderer.domElement);

    // Işıklar
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const yon = new THREE.DirectionalLight(0xffffff, 0.7);
    yon.position.set(1.2, 2.0, 1.6);
    scene.add(yon);
    const yon2 = new THREE.DirectionalLight(0xffffff, 0.25);
    yon2.position.set(-1.5, 0.8, -1.0);
    scene.add(yon2);

    // Zemin (hafif)
    const zemin = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshBasicMaterial({ color: 0xe6e1d8 })
    );
    zemin.rotation.x = -Math.PI / 2;
    zemin.position.y = 0;
    scene.add(zemin);

    const grup = dolabiKur(h, dekor);
    scene.add(grup);
    scene.userData.merkezY = grup.userData.merkezY;
    uzaklik = Math.max(1.4, grup.userData.capMetre * 2.4);

    kamerayiYerlestir();
    olaylariBagla();

    const dongu = () => {
      animId = requestAnimationFrame(dongu);
      renderer.render(scene, camera);
    };
    dongu();
  }

  // Fare/dokunmatik yörünge + zoom
  function olaylariBagla() {
    const el = renderer.domElement;
    el.style.touchAction = 'none';
    el.style.cursor = 'grab';
    el.onpointerdown = (e) => { surukluyor = true; sonX = e.clientX; sonY = e.clientY; el.style.cursor = 'grabbing'; el.setPointerCapture(e.pointerId); };
    el.onpointermove = (e) => {
      if (!surukluyor) return;
      const dx = e.clientX - sonX, dy = e.clientY - sonY;
      sonX = e.clientX; sonY = e.clientY;
      aci.theta -= dx * 0.01;
      aci.phi = Math.max(0.15, Math.min(Math.PI - 0.15, aci.phi - dy * 0.01));
      kamerayiYerlestir();
    };
    const bitir = (e) => { surukluyor = false; el.style.cursor = 'grab'; };
    el.onpointerup = bitir; el.onpointercancel = bitir;
    el.onwheel = (e) => {
      e.preventDefault();
      uzaklik = Math.max(0.8, Math.min(12, uzaklik + (e.deltaY > 0 ? 0.25 : -0.25)));
      kamerayiYerlestir();
    };
  }

  function temizle() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode)
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      renderer = null;
    }
    scene = null; camera = null;
  }

  // Dış API: bir kaba 3D görünümü çizer. hedefKap bir DOM elemanı.
  function ciz(kap, h, dekor) {
    hedefKap = kap;
    if (!window.THREE) {
      kap.innerHTML = `<div class="fhint" style="padding:16px">3D kütüphanesi (three.js) yüklenemedi. Sayfayı yenileyin; sorun sürerse tarayıcınız WebGL desteklemiyor olabilir.</div>`;
      return;
    }
    if (!h || !h.paneller || !h.paneller.length) {
      kap.innerHTML = `<div class="fhint" style="padding:16px">Önce geçerli ölçü girin.</div>`;
      return;
    }
    try {
      render3D(h, dekor);
    } catch (e) {
      kap.innerHTML = `<div class="fhint" style="padding:16px">3D görünüm oluşturulamadı: ${App.escapeHtml(String(e.message || e))}</div>`;
    }
  }

  return { ciz, temizle };
})();
