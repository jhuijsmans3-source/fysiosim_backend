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
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://fysiosim.nl',
    'https://www.fysiosim.nl'
  ],
  methods: ['GET', 'POST', 'OPTIONS', 'PUT'],
  credentials: true
}))

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
    res.json({ patienten: activePatients })
  } catch (error) {
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

app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`)
  console.log(`[server] GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✓ Ingesteld' : '✗ NIET INGESTELD'}`)
  console.log(`[server] CRON_SECRET_KEY: ${process.env.CRON_SECRET_KEY ? '✓ Ingesteld' : '⚠ Gebruikt default'}`)
})
