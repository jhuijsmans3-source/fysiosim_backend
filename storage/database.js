import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATA_DIR = path.join(__dirname, '../../data')
const PATIENTS_FILE = path.join(DATA_DIR, 'patients.json')
const CHAT_SESSIONS_FILE = path.join(DATA_DIR, 'chatSessions.json')

// Zorg dat data directory bestaat
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

/**
 * Initialiseer database files als ze niet bestaan
 */
function initDatabase() {
  if (!fs.existsSync(PATIENTS_FILE)) {
    fs.writeFileSync(PATIENTS_FILE, JSON.stringify([], null, 2))
  }
  if (!fs.existsSync(CHAT_SESSIONS_FILE)) {
    fs.writeFileSync(CHAT_SESSIONS_FILE, JSON.stringify([], null, 2))
  }
}

initDatabase()

/**
 * Lees patiënten uit database (optioneel gefilterd op praktijk)
 * @param {number|null} praktijk - Praktijk nummer om te filteren (1-6), of null voor alle
 */
export function getPatients(praktijk = null) {
  try {
    const data = fs.readFileSync(PATIENTS_FILE, 'utf8')
    const patients = JSON.parse(data)
    
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
    fs.writeFileSync(PATIENTS_FILE, JSON.stringify(patients, null, 2))
    return true
  } catch (error) {
    console.error('Fout bij opslaan patiënten:', error)
    return false
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
    const data = fs.readFileSync(CHAT_SESSIONS_FILE, 'utf8')
    return JSON.parse(data)
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
    
    fs.writeFileSync(CHAT_SESSIONS_FILE, JSON.stringify(sessions, null, 2))
    return session
  } catch (error) {
    console.error('Fout bij opslaan chat sessie:', error)
    return null
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

