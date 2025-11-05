/**
 * Patient Schema - Validatie schema voor patiënt data
 * Equivalent van Zod schema in TypeScript
 */

/**
 * Valideert patiënt data structuur
 * @param {Object} patientData - De patiënt data om te valideren
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
export function validatePatientData(patientData) {
  const errors = []
  
  // Verplichte velden
  const requiredFields = ['naam', 'leeftijd', 'geslacht', 'klacht', 'domein']
  for (const field of requiredFields) {
    if (!patientData[field]) {
      errors.push(`Veld '${field}' is verplicht`)
    }
  }
  
  // Type validatie
  if (patientData.leeftijd && (typeof patientData.leeftijd !== 'number' || patientData.leeftijd < 0 || patientData.leeftijd > 120)) {
    errors.push('Leeftijd moet een getal zijn tussen 0 en 120')
  }
  
  if (patientData.geslacht && !['Man', 'Vrouw', 'Anders'].includes(patientData.geslacht)) {
    errors.push('Geslacht moet Man, Vrouw of Anders zijn')
  }
  
  if (patientData.domein && typeof patientData.domein !== 'string') {
    errors.push('Domein moet een string zijn')
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Default patient schema structuur
 */
export const patientSchema = {
  naam: '',
  leeftijd: 0,
  geslacht: 'Man', // Man, Vrouw, Anders
  klacht: '',
  domein: '', // Bijv. 'Acute Knie', 'Schouder', 'Lage Rug'
  mechanisme: '',
  momentVanTrauma: '',
  hoofdklachten: [],
  medischeHistorie: '',
  status: 'Nieuw', // Nieuw, InBehandeling, Afgerond
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}

