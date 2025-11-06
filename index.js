import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { generateWachtkamer } from './services/patientGenerator.js'
import { 
  getPatients, 
  addPatients, 
  getPatientById, 
  updatePatientStatus,
  addIdsToPatients,
  getChatSessionById
} from './storage/database.js'
import { startConsult, sendQuestion } from './services/consultService.js'

dotenv.config()

const app = express()
const port = process.env.PORT || 3001

app.use(express.json())
// CORS configuratie - flexibeler voor productie
const allowedOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:5176',
      'http://localhost:5177',
      'http://localhost:5178',
      'https://fysiosim.nl',
      'https://www.fysiosim.nl'
    ]

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true)
    
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true)
    } else {
      callback(null, true) // Tijdelijk toestaan voor alle origins - pas aan voor productie
    }
  },
  methods: ['GET', 'POST', 'OPTIONS', 'PUT'],
  credentials: true
}))

// Root endpoint - API info
app.get('/', (_req, res) => {
  res.json({ 
    message: 'Fysiosim Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      patienten: '/api/patienten',
      consult: '/api/consult/start',
      vraag: '/api/consult/vraag',
      generateWachtkamer: '/cron/generate-wachtkamer'
    },
    timestamp: new Date().toISOString()
  })
})

// Healthcheck
app.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() })
})

// GET /api/patienten - Haal alle patiënten op (optioneel gefilterd op praktijk)
app.get('/api/patienten', (req, res) => {
  try {
    const praktijk = req.query.praktijk ? parseInt(req.query.praktijk) : null
    const patients = getPatients(praktijk)
    // Filter alleen patiënten met status 'Nieuw' of 'InBehandeling'
    const activePatients = patients.filter(p => p.status === 'Nieuw' || p.status === 'InBehandeling')
    
    console.log(`[api] GET /api/patienten?praktijk=${praktijk || 'alle'} - ${activePatients.length} actieve patiënten`)
    
    res.json({ 
      patienten: activePatients,
      totaal: activePatients.length,
      praktijk: praktijk || 'alle'
    })
  } catch (error) {
    console.error('[api] Fout bij ophalen patiënten:', error)
    res.status(500).json({ error: 'Server error', details: error.message })
  }
})

// GET /api/patienten/:id - Haal specifieke patiënt op
app.get('/api/patienten/:id', (req, res) => {
  try {
    const patient = getPatientById(req.params.id)
    if (!patient) {
      return res.status(404).json({ error: 'Patiënt niet gevonden' })
    }
    res.json({ patient })
  } catch (error) {
    res.status(500).json({ error: 'Server error', details: error.message })
  }
})

// POST /cron/generate-wachtkamer - Genereer wekelijkse wachtkamer (beveiligd)
app.post('/cron/generate-wachtkamer', async (req, res) => {
  try {
    // Beveiliging: controleer secret key
    const secretKey = req.headers['x-cron-secret'] || req.body.secret
    const expectedSecret = process.env.CRON_SECRET_KEY || 'default-secret-change-in-production'
    
    if (secretKey !== expectedSecret) {
      return res.status(401).json({ error: 'Unauthorized: Invalid secret key' })
    }

    // Haal domeinen en praktijk uit request body
    const domeinen = req.body.domeinen || ['Acute Knie', 'Schouder', 'Lage Rug']
    const praktijk = req.body.praktijk || null // Als niet opgegeven, genereer voor alle praktijken
    
    // Als praktijk is opgegeven, genereer alleen voor die praktijk
    if (praktijk) {
      const nieuwePatienten = await generateWachtkamer(domeinen)
      const patientsWithIds = addIdsToPatients(nieuwePatienten, praktijk)
      addPatients(patientsWithIds)
      
      return res.json({ 
        success: true, 
        message: `${patientsWithIds.length} patiënten gegenereerd voor praktijk ${praktijk}`,
        patienten: patientsWithIds,
        praktijk: praktijk,
        timestamp: new Date().toISOString()
      })
    }
    
    // Genereer voor alle 6 praktijken (standaard gedrag)
    const allePatienten = []
    for (let praktijkNum = 1; praktijkNum <= 6; praktijkNum++) {
      const nieuwePatienten = await generateWachtkamer(domeinen)
      const patientsWithIds = addIdsToPatients(nieuwePatienten, praktijkNum)
      addPatients(patientsWithIds)
      allePatienten.push(...patientsWithIds)
    }
    
    res.json({ 
      success: true, 
      message: `${allePatienten.length} patiënten gegenereerd voor alle praktijken`,
      patienten: allePatienten,
      praktijk: 'alle',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Fout bij genereren wachtkamer:', error)
    res.status(500).json({ error: 'Fout bij genereren wachtkamer', details: error.message })
  }
})

// POST /api/consult/start - Start een nieuw consult
app.post('/api/consult/start', async (req, res) => {
  try {
    const { patientId, studentId, praktijk } = req.body
    
    if (!patientId) {
      return res.status(400).json({ error: 'patientId is verplicht' })
    }

    // Haal patiënt op
    const patient = getPatientById(patientId)
    if (!patient) {
      return res.status(404).json({ error: 'Patiënt niet gevonden' })
    }

    // Controleer dat patiënt bij juiste praktijk hoort (als praktijk is meegegeven)
    if (praktijk && patient.praktijk && patient.praktijk !== praktijk) {
      return res.status(403).json({ error: 'Patiënt hoort niet bij deze praktijk' })
    }

    // Start consult
    const { chatSessionId, firstMessage } = await startConsult(
      patientId, 
      studentId || 'anoniem', 
      patient,
      praktijk || patient.praktijk || 1
    )

    // Update patiënt status naar 'InBehandeling'
    updatePatientStatus(patientId, 'InBehandeling')

    res.json({
      chatSessionId,
      firstMessage,
      patient: patient
    })
  } catch (error) {
    console.error('Fout bij starten consult:', error)
    res.status(500).json({ error: 'Fout bij starten consult', details: error.message })
  }
})

// POST /api/consult/vraag - Verstuur vraag naar chatbot
app.post('/api/consult/vraag', async (req, res) => {
  try {
    const { chatSessionId, vraag } = req.body
    
    if (!chatSessionId || !vraag) {
      return res.status(400).json({ error: 'chatSessionId en vraag zijn verplicht' })
    }

    const { response, updatedSession } = await sendQuestion(chatSessionId, vraag)

    res.json({
      response,
      session: {
        chatSessionId: updatedSession.chatSessionId,
        currentStep: updatedSession.currentStep,
        score: updatedSession.score,
        hintCount: updatedSession.hintCount
      }
    })
  } catch (error) {
    console.error('Fout bij versturen vraag:', error)
    res.status(500).json({ error: 'Fout bij versturen vraag', details: error.message })
  }
})

// GET /api/consult/:chatSessionId - Haal chat sessie op
app.get('/api/consult/:chatSessionId', (req, res) => {
  try {
    const session = getChatSessionById(req.params.chatSessionId)
    
    if (!session) {
      return res.status(404).json({ error: 'Chat sessie niet gevonden' })
    }

    res.json({ session })
  } catch (error) {
    res.status(500).json({ error: 'Server error', details: error.message })
  }
})

// POST /api/patienten/test - Voeg handmatig een test patiënt toe (voor testing)
app.post('/api/patienten/test', (req, res) => {
  try {
    const { praktijk = 1 } = req.body
    
    // Test patiënt object
    const testPatient = {
      id: 'test_' + Date.now(),
      naam: 'Test Patiënt',
      leeftijd: 45,
      geslacht: 'Man',
      klacht: 'Acute kniepijn na val tijdens hardlopen',
      domein: 'Acute Knie',
      mechanisme: 'Tijdens hardlopen in het park uitgegleden op nat gras, direct pijn in rechter knie',
      momentVanTrauma: '2 dagen geleden',
      hoofdklachten: [
        'Pijn in rechter knie bij belasting',
        'Beperkte buiging en strekking',
        'Zwelling rondom de knie'
      ],
      medischeHistorie: 'Geen relevante medische voorgeschiedenis',
      status: 'Nieuw',
      praktijk: praktijk,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    
    // Voeg toe aan database
    addPatients([testPatient])
    
    const allPatients = getPatients(praktijk)
    console.log(`[test] Test patiënt toegevoegd aan praktijk ${praktijk}. Totaal patiënten: ${allPatients.length}`)
    
    res.json({
      success: true,
      message: 'Test patiënt toegevoegd',
      patient: testPatient,
      totalPatients: allPatients.length
    })
  } catch (error) {
    console.error('Fout bij toevoegen test patiënt:', error)
    res.status(500).json({ error: 'Fout bij toevoegen test patiënt', details: error.message })
  }
})

// POST /api/patienten/generate - Genereer patiënten zonder secret key (voor testing)
app.post('/api/patienten/generate', async (req, res) => {
  try {
    const { praktijk = 1, aantal = 4 } = req.body
    const domeinen = req.body.domeinen || ['Acute Knie', 'Schouder', 'Lage Rug']
    
    console.log(`[generate] Genereren van ${aantal} patiënten voor praktijk ${praktijk}`)
    
    // Genereer patiënten
    const nieuwePatienten = await generateWachtkamer(domeinen)
    const patientsWithIds = addIdsToPatients(nieuwePatienten.slice(0, aantal), praktijk)
    addPatients(patientsWithIds)
    
    const allPatients = getPatients(praktijk)
    console.log(`[generate] ${patientsWithIds.length} patiënten gegenereerd. Totaal: ${allPatients.length}`)
    
    res.json({
      success: true,
      message: `${patientsWithIds.length} patiënten gegenereerd voor praktijk ${praktijk}`,
      patienten: patientsWithIds,
      praktijk: praktijk,
      totalPatients: allPatients.length,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Fout bij genereren patiënten:', error)
    res.status(500).json({ error: 'Fout bij genereren patiënten', details: error.message })
  }
})

// Initialiseer met test patiënten als database leeg is (alleen in productie)
async function initializeWithTestPatients() {
  if (process.env.RENDER || process.env.NODE_ENV === 'production') {
    const allPatients = getPatients()
    if (allPatients.length === 0) {
      console.log('[init] Database is leeg, genereer test patiënten voor alle praktijken...')
      try {
        const domeinen = ['Acute Knie', 'Schouder', 'Lage Rug']
        for (let praktijkNum = 1; praktijkNum <= 6; praktijkNum++) {
          const nieuwePatienten = await generateWachtkamer(domeinen)
          const patientsWithIds = addIdsToPatients(nieuwePatienten, praktijkNum)
          addPatients(patientsWithIds)
          console.log(`[init] ${patientsWithIds.length} patiënten gegenereerd voor praktijk ${praktijkNum}`)
        }
        console.log('[init] Initialisatie voltooid')
      } catch (error) {
        console.error('[init] Fout bij initialiseren test patiënten:', error.message)
      }
    } else {
      console.log(`[init] Database bevat al ${allPatients.length} patiënten`)
    }
  }
}

app.listen(port, async () => {
  console.log(`[server] listening on http://localhost:${port}`)
  console.log(`[server] GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✓ Ingesteld' : '✗ NIET INGESTELD'}`)
  console.log(`[server] CRON_SECRET_KEY: ${process.env.CRON_SECRET_KEY ? '✓ Ingesteld' : '⚠ Gebruikt default'}`)
  console.log(`[server] Environment: ${process.env.RENDER ? 'Render.com' : process.env.NODE_ENV || 'development'}`)
  
  // Initialiseer test patiënten bij start (alleen als database leeg is)
  await initializeWithTestPatients()
})
