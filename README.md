# Multiplayer Game System

Node.js, Socket.io ve WebRTC kullanarak geliştirilmiş gerçek zamanlı multiplayer oyun sistemi.

## Özellikler

- 🎮 Oyun oluşturma ve katılma sistemi
- 🔗 Oyun kodu ile kolay katılım
- 👥 Lobi sistemi (maksimum 8 oyuncu)
- ✅ Hazır durumu belirtme
- 🎨 Şekil seçimi (daire, kare, üçgen, dikdörtgen)
- ⚡ Gerçek zamanlı oyun deneyimi
- 🎯 Eş zamanlı oyun başlatma

## Kurulum

1. Bağımlılıkları yükleyin:
```bash
npm install
```

2. Environment dosyasını oluşturun:
```bash
cp env.example .env
```

3. MongoDB bağlantısını yapılandırın:
   - Yerel MongoDB için: `MONGODB_URI=mongodb://localhost:27017/multiplayer-game`
   - MongoDB Atlas için: `MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/multiplayer-game`

4. Sunucuyu başlatın:
```bash
npm start
```

Geliştirme modu için:
```bash
npm run dev
```

## Kullanım

1. Tarayıcıda `http://localhost:3000` adresine gidin
2. "Oyun Oluştur" butonuna tıklayın ve nickname girin
3. Oluşturulan oyun kodunu arkadaşlarınızla paylaşın
4. Arkadaşlarınız "Oyuna Katıl" ile koda katılabilir
5. Lobi ekranında şekil seçin ve hazır durumunu belirtin
6. Host oyuncu "Oyunu Başlat" ile oyunu başlatabilir
7. Oyun ekranında mouse ile hareket edin

## Teknolojiler

- **Backend**: Node.js, Express.js
- **Real-time**: Socket.io
- **Database**: MongoDB (Mongoose)
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Canvas**: HTML5 Canvas API

## API Endpoints

- `POST /api/create-game` - Yeni oyun oluştur
- `GET /api/game/:gameId` - Oyun bilgilerini getir

## Socket Events

### Client → Server
- `join-game` - Oyuna katıl
- `toggle-ready` - Hazır durumunu değiştir
- `change-shape` - Şekil değiştir
- `start-game` - Oyunu başlat (sadece host)
- `player-move` - Oyuncu hareketi

### Server → Client
- `player-joined` - Oyuncu katıldı
- `player-left` - Oyuncu ayrıldı
- `player-ready-changed` - Hazır durumu değişti
- `player-shape-changed` - Şekil değişti
- `game-started` - Oyun başladı
- `player-moved` - Oyuncu hareket etti
- `error` - Hata mesajı

## Geliştirme

Sistem modüler yapıda tasarlanmıştır ve kolayca genişletilebilir:

- Oyun mekanikleri `public/game.js` dosyasında
- Server logic `server.js` dosyasında
- UI/UX `public/style.css` ve `public/index.html` dosyalarında

## Lisans

MIT License
# multigame
