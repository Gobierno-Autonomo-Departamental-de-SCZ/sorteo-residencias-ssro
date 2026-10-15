import { z } from 'zod';

/**
 * Regex para validar que una palabra contiene solo caracteres alfabéticos (incluyendo tildes y ñ)
 * y tenga al menos 4 letras.
 */
const SINGLE_WORD_REGEX = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]{4,}$/;

/**
 * Esquema Zod de validación estricta para las 5 palabras de entropía humana
 */
export const HumanEntropyWordsSchema = z.string({
  required_error: 'Las palabras de entropía humana son obligatorias.',
  invalid_type_error: 'La entrada de entropía debe ser texto plano.',
})
  .trim()
  .refine(val => val.length > 0, {
    message: 'El campo de entropía no puede estar vacío.',
  })
  .refine(val => !/[\x00-\x1F\x7F<>"'`;{}()$%^&*]/.test(val), {
    message: 'Se detectaron caracteres especiales, inyecciones o caracteres de control prohibidos.',
  })
  .transform(val => val.split(/\s+/).filter(Boolean))
  .refine(words => words.length === 5, {
    message: 'Debe ingresar exactamente 5 palabras (separadas por espacios).',
  })
  .refine(words => words.every(w => SINGLE_WORD_REGEX.test(w)), {
    message: 'Cada una de las 5 palabras debe contener exclusivamente letras y un mínimo de 4 caracteres.',
  })
  .transform(words => words.map(w => w.toLowerCase()));

/**
 * Esquema Zod para Login de Administrador
 */
export const AdminLoginSchema = z.object({
  username: z.string().trim().min(3, 'El nombre de usuario debe tener al menos 3 caracteres.').max(50),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
  entropyWords: HumanEntropyWordsSchema,
  turnstileToken: z.string().optional(),
});

/**
 * Validador estricto para el parámetro K de selección de ganadores
 */
export function validateDrawParamK(k: unknown, totalActiveParticipants: number): number {
  if (totalActiveParticipants <= 0) {
    throw new Error('ValidacionFallo: No hay participantes activos disponibles para realizar el sorteo.');
  }

  const kNum = Number(k);
  if (!Number.isInteger(kNum)) {
    throw new Error('ValidacionFallo: El parámetro K debe ser un número entero.');
  }

  if (kNum < 1) {
    throw new Error('ValidacionFallo: Debe seleccionarse al menos 1 ganador (K >= 1).');
  }

  if (kNum > totalActiveParticipants) {
    throw new Error(
      `ValidacionFallo: K (${kNum}) no puede superar el total de participantes activos (${totalActiveParticipants}).`
    );
  }

  return kNum;
}

/**
 * Sanitiza celdas de texto para neutralizar ataques de inyección de fórmulas en CSV / Excel
 * (Previene ataques DDE ante fórmulas que inicien con =, +, -, @, \t, \r)
 */
export function sanitizeCSVCell(cellValue: string): string {
  if (typeof cellValue !== 'string') return '';
  const trimmed = cellValue.trim();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    // Escapar con comilla simple para forzar interpretación como texto literal
    return `'${trimmed}`;
  }
  return trimmed;
}

/**
 * Esquema para un postulante o estudiante de medicina
 */
export const ParticipantInputSchema = z.object({
  fullName: z.string().trim().min(2, 'El nombre completo debe tener al menos 2 caracteres.').max(100),
  email: z.string().trim().email('El formato del correo electrónico es inválido.').or(z.string().trim().max(0)).default(''),
  documentId: z.string().trim().min(3, 'El documento o carnet debe tener al menos 3 caracteres.').max(30),
  university: z.string().trim().max(100).default('UAGRM'),
  studentCode: z.string().trim().max(50).default(''),
  isSpecialCase: z.boolean().or(z.string().transform(v => v === 'true' || v === '1')).default(false),
  specialHospital: z.string().trim().max(150).default(''),
  specialReason: z.string().trim().max(150).default('')
});

/**
 * Esquema para un establecimiento de salud u hospital
 */
export const HospitalInputSchema = z.object({
  code: z.string().trim().min(2, 'Código de hospital requerido').max(30),
  name: z.string().trim().min(3, 'Nombre de hospital requerido').max(150),
  municipality: z.string().trim().max(100).default('Santa Cruz de la Sierra'),
  totalSlots: z.coerce.number().min(1, 'Debe tener al menos 1 cupo').default(10)
});

/**
 * Normaliza número de carnet o documento (elimina espacios, puntos, guiones y convierte a minúsculas)
 */
export function normalizeCarnet(doc: string): string {
  if (typeof doc !== 'string') return '';
  return doc.trim().toLowerCase().replace(/[\s\-_.]/g, '');
}

/**
 * Normaliza nombres exactos (elimina espacios múltiples y espacios al inicio/final)
 */
export function normalizeName(name: string): string {
  if (typeof name !== 'string') return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface DuplicateCheckResult {
  hasDuplicates: boolean;
  duplicateCarnets: Array<{ carnet: string; count: number }>;
  duplicateNames: Array<{ name: string; count: number }>;
}

/**
 * Analiza una lista de participantes y detecta carnets duplicados y nombres exactos duplicados
 */
export function findDuplicates(participants: Array<{ fullName: string; documentId: string }>): DuplicateCheckResult {
  const carnetMap = new Map<string, number>();
  const nameMap = new Map<string, number>();

  for (const p of participants) {
    const normCarnet = normalizeCarnet(p.documentId);
    const normName = normalizeName(p.fullName);

    if (normCarnet) {
      carnetMap.set(normCarnet, (carnetMap.get(normCarnet) || 0) + 1);
    }
    if (normName) {
      nameMap.set(normName, (nameMap.get(normName) || 0) + 1);
    }
  }

  const duplicateCarnets: Array<{ carnet: string; count: number }> = [];
  for (const [carnet, count] of carnetMap.entries()) {
    if (count > 1) {
      duplicateCarnets.push({ carnet, count });
    }
  }

  const duplicateNames: Array<{ name: string; count: number }> = [];
  for (const [name, count] of nameMap.entries()) {
    if (count > 1) {
      duplicateNames.push({ name, count });
    }
  }

  return {
    hasDuplicates: duplicateCarnets.length > 0 || duplicateNames.length > 0,
    duplicateCarnets,
    duplicateNames,
  };
}

/**
 * Deduplica una lista de participantes asegurando carnet único y nombre único
 */
export function deduplicateParticipants<T extends { fullName: string; documentId: string }>(participants: T[]): T[] {
  const seenCarnets = new Set<string>();
  const seenNames = new Set<string>();
  const uniqueList: T[] = [];

  for (const p of participants) {
    const normCarnet = normalizeCarnet(p.documentId);
    const normName = normalizeName(p.fullName);

    if (seenCarnets.has(normCarnet) || seenNames.has(normName)) {
      continue; // Omitir duplicado
    }

    seenCarnets.add(normCarnet);
    seenNames.add(normName);
    uniqueList.push(p);
  }

  return uniqueList;
}
