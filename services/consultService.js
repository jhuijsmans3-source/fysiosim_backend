import fetch from 'node-fetch'
import { generateSystemPrompt } from './systemPrompt.js'
import { getChatSessionById, saveChatSession } from '../storage/database.js'

/**
 * Start een nieuw consult met een patiënt
 * @param {string} patientId - ID van de patiënt
 * @param {string} studentId - ID van de student (kan anoniem zijn)
 * @param {Object} patientData - De volledige patiënt data
 * @param {number} praktijk - Praktijk nummer (1-6)
 * @returns {Promise<Object>} - { chatSessionId, firstMessage }
 */
export async function startConsult(patientId, studentId, patientData, praktijk = 1) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is niet ingesteld in omgevingsvariabelen')
  }

  // Genereer systeemrol prompt met patiënt details
  const systemInstruction = generateSystemPrompt(patientData)

  // Genereer unieke chat session ID
  const chatSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  // Start bericht om de eerste vraag te triggeren
  const startPrompt = "Start de simulatie volgens het protocol. Genereer de casus en stel de eerste vraag."

  try {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{
            text: startPrompt
          }]
        }],
        systemInstruction: {
          parts: [{
            text: systemInstruction
          }]
        }
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
    }

    const result = await response.json()
    const firstMessage = result.candidates?.[0]?.content?.parts?.[0]?.text

    if (!firstMessage) {
      throw new Error('Geen eerste bericht ontvangen van Gemini API')
    }

    // Sla chat sessie op
    const chatSession = {
      chatSessionId,
      patientId,
      studentId,
      praktijk: praktijk || patientData.praktijk || 1,
      systemInstruction,
      messages: [
        {
          role: 'user',
          text: startPrompt,
          timestamp: new Date().toISOString()
        },
        {
          role: 'model',
          text: firstMessage,
          timestamp: new Date().toISOString()
        }
      ],
      currentStep: 1,
      score: 10,
      hintCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    saveChatSession(chatSession)

    return {
      chatSessionId,
      firstMessage
    }
  } catch (error) {
    console.error('Fout bij starten consult:', error)
    throw error
  }
}

/**
 * Verstuur een vraag naar de chatbot en krijg antwoord
 * @param {string} chatSessionId - ID van de chat sessie
 * @param {string} studentQuestion - De vraag van de student
 * @returns {Promise<Object>} - { response, updatedSession }
 */
export async function sendQuestion(chatSessionId, studentQuestion) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is niet ingesteld in omgevingsvariabelen')
  }

  // Haal chat sessie op
  const session = getChatSessionById(chatSessionId)
  if (!session) {
    throw new Error('Chat sessie niet gevonden')
  }

  // Voeg student vraag toe aan messages
  const updatedMessages = [
    ...session.messages,
    {
      role: 'user',
      text: studentQuestion,
      timestamp: new Date().toISOString()
    }
  ]

  try {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`

    // Converteer messages naar Gemini formaat
    const contents = updatedMessages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }))

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents,
        systemInstruction: {
          parts: [{
            text: session.systemInstruction
          }]
        }
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
    }

    const result = await response.json()
    const modelResponse = result.candidates?.[0]?.content?.parts?.[0]?.text

    if (!modelResponse) {
      throw new Error('Geen antwoord ontvangen van Gemini API')
    }

    // Update hint count als er "/hint" in de vraag zat
    let hintCount = session.hintCount
    if (studentQuestion.trim().toLowerCase() === '/hint') {
      hintCount += 1
    }

    // Update session
    const updatedSession = {
      ...session,
      messages: [
        ...updatedMessages,
        {
          role: 'model',
          text: modelResponse,
          timestamp: new Date().toISOString()
        }
      ],
      hintCount,
      score: Math.max(0, 10 - hintCount),
      updatedAt: new Date().toISOString()
    }

    saveChatSession(updatedSession)

    return {
      response: modelResponse,
      updatedSession
    }
  } catch (error) {
    console.error('Fout bij versturen vraag:', error)
    throw error
  }
}

