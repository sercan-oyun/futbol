# Futbol

Reklamsız, sade bir futbol takip uygulaması: fikstür, haftanın maçları, puan durumları ve gol krallığı.

Takip edilen yarışmalar: Süper Lig, Şampiyonlar Ligi, Avrupa Ligi, Premier Lig, La Liga, Serie A, Bundesliga, Ligue 1.

## Nasıl çalışıyor?

Site tamamen statiktir ve GitHub Pages üzerinde durur. Veriyi tarayıcı değil, GitHub Actions çeker:
`.github/workflows/update.yml` üç saatte bir `scripts/fetch.mjs` dosyasını çalıştırır, sonucu `data/all.json` içine yazar.
Böylece API anahtarları tarayıcıya hiç inmez ve kaç kişi siteyi açarsa açsın API'ye giden istek sayısı değişmez.

Veri kaynakları:
- [football-data.org](https://www.football-data.org) — Premier Lig, La Liga, Bundesliga, Serie A, Ligue 1, Şampiyonlar Ligi
- [api-football](https://www.api-football.com) — Süper Lig, Avrupa Ligi

## Kurulum

1. Bu depoyu kendi hesabınıza kopyalayın.
2. Settings > Secrets and variables > Actions altına iki gizli değer ekleyin: `FD_TOKEN` ve `AF_KEY`.
3. Settings > Pages bölümünde yayını `main` dalından açın.
4. Actions sekmesinden "Verileri güncelle" iş akışını bir kez elle çalıştırın.

Telefonda: adresi Safari ile açın, Paylaş > Ana Ekrana Ekle deyin. Uygulama gibi açılır, internet yokken son çekilen veriyi gösterir.

## Lisans

MIT
