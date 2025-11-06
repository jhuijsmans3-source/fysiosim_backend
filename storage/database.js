import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATA_DIR = path.join(__dirname, '../../data')
const PATIENTS_FILE = path.join(DATA_DIR, 'patients.json')
const CHAT_SESSIONS_FILE = path.join(DATA_DIR, 'chatSessions.json')

// In-memory database als fallback (voor Render.com ephemeral filesystem)
let inMemoryPatients = []
let inMemoryChatSessions = []
let useInMemory = false

// Detecteer of we in een ephemeral environment zitten (zoals Render.com)
const isEphemeral = process.env.RENDER || process.env.NODE_ENV === 'production'

/**
 * Probeer bestand te lezen, retourneer null als het niet bestaat
 */
function tryReadFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.warn(`Kon bestand niet lezen ${filePath}:`, error.message)
  }
  return null
}

/**
 * Probeer bestand te schrijven
 */
function tryWriteFile(filePath, data) {
  try {
    // Zorg dat directory bestaat
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
    return true
  } catch (error) {
    console.warn(`Kon bestand niet schrijven ${filePath}:`, error.message)
    return false
  }
}

/**
 * Initialiseer database - probeer eerst file system, anders in-memory
 */
function initDatabase() {
  if (isEphemeral) {
    console.log('[database] Ephemeral environment gedetecteerd, gebruik in-memory storage')
    useInMemory = true
    inMemoryPatients = []
    inMemoryChatSessions = []
    return
  }

  // Probeer file system te gebruiken
  const patientsData = tryReadFile(PATIENTS_FILE)
  const sessionsData = tryReadFile(CHAT_SESSIONS_FILE)

  if (patientsData === null) {
    tryWriteFile(PATIENTS_FILE, [])
  }
  if (sessionsData === null) {
    tryWriteFile(CHAT_SESSIONS_FILE, [])
  }

  // Als schrijven niet lukt, gebruik in-memory
  if (!tryWriteFile(PATIENTS_FILE, patientsData || [])) {
    console.log('[database] File system niet beschikbaar, gebruik in-memory storage')
    useInMemory = true
  }
}

initDatabase()

/**
 * Lees patiënten uit database (optioneel gefilterd op praktijk)
 * @param {number|null} praktijk - Praktijk nummer om te filteren (1-6), of null voor alle
 */
export function getPatients(praktijk = null) {
  try {
    let patients = []
    
    if (useInMemory) {
      patients = [...inMemoryPatients]
    } else {
      const data = tryReadFile(PATIENTS_FILE)
      patients = data || []
    }
    
    // Filter op praktijk als opgegeven
    if (praktijk !== null) {
      return patients.filter(p => p.praktijk === praktijk)
    }
    
    return patients
  } catch (error) {
    console.error('Fout bij lezen patiënten:', error)
    return []
  }
}

/**
 * Sla patiënten op in database
 */
export function savePatients(patients) {
  try {
    if (useInMemory) {
      inMemoryPatients = [...patients]
      console.log(`[database] ${patients.length} patiënten opgeslagen in-memory`)
      return true
    } else {
      if (tryWriteFile(PATIENTS_FILE, patients)) {
        return true
      } else {
        // Fallback naar in-memory als schrijven faalt
        console.log('[database] Fallback naar in-memory storage')
        useInMemory = true
        inMemoryPatients = [...patients]
        return true
      }
    }
  } catch (error) {
    console.error('Fout bij opslaan patiënten:', error)
    // Fallback naar in-memory
    useInMemory = true
    inMemoryPatients = [...patients]
    return true
  }
}

/**
 * Voeg nieuwe patiënten toe
 */
export function addPatients(newPatients) {
  const patients = getPatients()
  const updatedPatients = [...patients, ...newPatients]
  savePatients(updatedPatients)
  return updatedPatients
}

/**
 * Haal patiënt op basis van ID
 */
export function getPatientById(patientId) {
  const patients = getPatients()
  return patients.find(p => p.id === patientId)
}

/**
 * Update patiënt status
 */
export function updatePatientStatus(patientId, status) {
  const patients = getPatients()
  const patient = patients.find(p => p.id === patientId)
  if (patient) {
    patient.status = status
    patient.updatedAt = new Date().toISOString()
    savePatients(patients)
    return patient
  }
  return null
}

/**
 * Genereer unieke ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

/**
 * Lees chat sessies uit database
 */
export function getChatSessions() {
  try {
    if (useInMemory) {
      return [...inMemoryChatSessions]
    } else {
      const data = tryReadFile(CHAT_SESSIONS_FILE)
      return data || []
    }
  } catch (error) {
    console.error('Fout bij lezen chat sessies:', error)
    return []
  }
}

/**
 * Sla chat sessie op
 */
export function saveChatSession(session) {
  try {
    const sessions = getChatSessions()
    const existingIndex = sessions.findIndex(s => s.chatSessionId === session.chatSessionId)
    
    if (existingIndex >= 0) {
      sessions[existingIndex] = session
    } else {
      sessions.push(session)
    }
    
    if (useInMemory) {
      inMemoryChatSessions = [...sessions]
      return session
    } else {
      if (tryWriteFile(CHAT_SESSIONS_FILE, sessions)) {
        return session
      } else {
        // Fallback naar in-memory
        useInMemory = true
        inMemoryChatSessions = [...sessions]
        return session
      }
    }
  } catch (error) {
    console.error('Fout bij opslaan chat sessie:', error)
    // Fallback naar in-memory
    useInMemory = true
    const sessions = getChatSessions()
    sessions.push(session)
    inMemoryChatSessions = [...sessions]
    return session
  }
}

/**
 * Haal chat sessie op basis van ID
 */
export function getChatSessionById(chatSessionId) {
  const sessions = getChatSessions()
  return sessions.find(s => s.chatSessionId === chatSessionId)
}

/**
 * Help functie om ID toe te voegen aan patiënten
 */
export function addIdsToPatients(patients, praktijk = null) {
  return patients.map(patient => ({
    ...patient,
    id: patient.id || generateId(),
    praktijk: patient.praktijk || praktijk || 1 // Standaard praktijk 1 als niet opgegeven
  }))
}

