# Fysiosim Backend Server

Backend server voor de Fysiosim applicatie, inclusief wachtkamer functionaliteit en consult simulaties.

## 🚀 Quick Start

### Lokale Setup

1. **Installeer dependencies:**
   ```bash
   npm install
   ```

2. **Maak `.env` bestand:**
   Kopieer `.env.example` naar `.env` en vul de waarden in:
   ```bash
   cp .env.example .env
   ```
   
   Vul in `.env`:
   - `GEMINI_API_KEY`: Je Google Gemini API key
   - `CRON_SECRET_KEY`: Een willekeurige secret key voor beveiliging

3. **Start de server:**
   ```bash
   npm start
   ```
   
   Server draait op: `http://localhost:3001`

## 📋 API Endpoints

- `GET /api/patienten?praktijk=1` - Haal patiënten op voor een specifieke praktijk
- `POST /api/consult/start` - Start een nieuw consult
- `POST /api/consult/vraag` - Stel een vraag in een consult
- `POST /cron/generate-wachtkamer` - Genereer nieuwe patiënten (beveiligd met secret key)

Zie `index.js` voor volledige API documentatie.

## 🔒 Environment Variables

| Variabele | Verplicht | Beschrijving |
|-----------|-----------|--------------|
| `GEMINI_API_KEY` | ✅ Ja | Google Gemini API key voor AI functionaliteit |
| `CRON_SECRET_KEY` | ✅ Ja | Secret key voor beveiliging van cron endpoints |
| `PORT` | ❌ Nee | Poort waarop server draait (default: 3001) |

## 📦 Dependencies

- `express` - Web framework
- `cors` - Cross-Origin Resource Sharing
- `dotenv` - Environment variable management
- `node-fetch` - HTTP client voor Gemini API calls

## 🚀 Deployment

Zie `GITHUB_UPLOAD_GUIDE.md` in de hoofdmap voor instructies over:
- GitHub upload (met veiligheid)
- Deployment naar Render.com, Railway.app, etc.

## 📁 Project Structuur

```
server/
├── index.js              # Main server file
├── package.json          # Dependencies
├── .env                  # Environment variables (NIET in Git!)
├── .env.example          # Environment template (WEL in Git)
├── .gitignore           # Git ignore rules
├── services/            # Business logic
│   ├── consultService.js # Consult/chat logic
│   └── systemPrompt.js   # AI prompt templates
├── storage/             # Data storage
│   └── database.js      # JSON file database
└── schemas/             # Data schemas
```

## ⚠️ Security Notes

- **NOOIT** commit `.env` naar Git
- Gebruik `.env.example` als template
- Bewaar `CRON_SECRET_KEY` geheim
- Rotate API keys regelmatig

## 📚 Meer Documentatie

- **GitHub Upload:** `../../GITHUB_UPLOAD_GUIDE.md`
- **Backend Setup:** `../../BACKEND_SETUP_GUIDE.md`
- **Quick Start:** `../../BACKEND_QUICK_START.md`
