import fetch from 'node-fetch'
import { validatePatientData } from '../schemas/patientSchema.js'

/**
 * Generate Wachtkamer - Genereert 4 unieke patiëntcasussen voor de wachtkamer
 * @param {string[]} domeinen - Array van domeinen (bijv. ['Acute Knie', 'Schouder', 'Lage Rug'])
 * @returns {Promise<Object[]>} - Array van 4 patiënt objecten
 */
export async function generateWachtkamer(domeinen = ['Acute Knie']) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is niet ingesteld in omgevingsvariabelen')
  }

  const prompt = `Je bent een medische AI-assistent die realistische, unieke patiëntcasussen genereert voor fysiotherapiestudenten.

Genereren van 4 verschillende patiëntcasussen voor de volgende domeinen: ${domeinen.join(', ')}.

Elke casus moet een JSON-object zijn met de volgende structuur:
{
  "naam": "Voornaam Achternaam",
  "leeftijd": <getal tussen 16-80>,
  "geslacht": "Man" | "Vrouw" | "Anders",
  "klacht": "Beschrijving van de hoofdklacht (bijv. 'Acute knie na val bij voetbal')",
  "domein": "<een van de opgegeven domeinen>",
  "mechanisme": "Beschrijving van hoe het trauma/letsel is ontstaan",
  "momentVanTrauma": "Bijv. '3 dagen geleden' of 'gisteren tijdens training'",
  "hoofdklachten": ["klacht 1", "klacht 2", "klacht 3"],
  "medischeHistorie": "Relevante medische voorgeschiedenis (kan leeg zijn bij jonge patiënten)"
}

Belangrijk:
- Elke casus moet uniek zijn met verschillende leeftijden, geslachten en mechanismen
- Maak de casussen klinisch relevant en realistisch
- Verdeel de 4 casussen over de verschillende domeinen
- Gebruik alleen Nederlandse namen
- Output alleen een JSON array met 4 objecten, geen extra tekst

Output formaat: [{"naam": "...", "leeftijd": ..., ...}, ...]`

  try {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
    }

    const result = await response.json()
    const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text
    
    if (!generatedText) {
      throw new Error('Geen respons van Gemini API')
    }

    // Parse JSON uit de response (verwijder markdown code blocks indien aanwezig)
    let jsonText = generatedText.trim()
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '')
    }

    const patienten = JSON.parse(jsonText)
    
    // Valideer elk patiënt object
    const validatedPatients = []
    for (const patient of patienten) {
      const validation = validatePatientData(patient)
      if (validation.valid) {
        validatedPatients.push({
          ...patient,
          status: 'Nieuw',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      } else {
        console.warn('Ongeldige patiënt data:', validation.errors, patient)
      }
    }

    if (validatedPatients.length < 4) {
      throw new Error(`Minder dan 4 geldige patiënten gegenereerd: ${validatedPatients.length}`)
    }

    return validatedPatients.slice(0, 4) // Zorg dat we precies 4 hebben
  } catch (error) {
    console.error('Fout bij genereren wachtkamer:', error)
    throw error
  }
}

