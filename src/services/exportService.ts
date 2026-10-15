import {boliviaDate} from '../utils/boliviaDate.js';
import { DrawHistoryRecord, ParticipantRecord } from '../database/db.js';

// En CommonJS, require está disponible en tiempo de ejecución
declare const require: any;
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

/**
 * 1. Generador de Exportación en CSV (UTF-8 con BOM para compatibilidad total con Excel)
 */
export function generateCsvExport(draw: DrawHistoryRecord): string {
  const winners = draw.winners;
  const specialCases = draw.specialCases || [];

  const headers = [
    'SECCION',
    'PUESTO',
    'CARNET_CI',
    'NOMBRE_COMPLETO',
    'ESPECIALIDAD',
    'UNIVERSIDAD',
    'MATRICULA',
    'HOSPITAL_ASIGNADO',
    'MOTIVO_ESPECIAL',
    'ID_SORTEO',
    'FECHA_HORA', 'ID_HABILITACION', 'ID_ESTUDIANTE', 'ID_PERSONA', 'ID_ESTABLECIMIENTO', 'ID_CUPO'
  ];

  const escapeCsv = (val: string | number | undefined | null) => {
    if (val === undefined || val === null) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows: string[] = [];
  rows.push(headers.join(','));

  // 1. Médicos Habilitados (Orden de Prelación por Sorteo)
  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    rows.push([
      escapeCsv('SORTEO_HABILITADOS'),
      escapeCsv(w.rankPosition || i + 1),
      escapeCsv(w.documentId),
      escapeCsv(w.fullName),
      escapeCsv(w.career || 'MEDICINA'),
      escapeCsv(w.university || 'UAGRM'),
      escapeCsv(w.studentCode || ''),
      escapeCsv(w.assignedHospital || 'Hospital Asignado'),
      escapeCsv(''),
      escapeCsv(draw.id),
      escapeCsv(boliviaDate(draw.createdAt)), escapeCsv(w.id), escapeCsv(w.studentId), escapeCsv(w.personId), escapeCsv(w.hospitalId), escapeCsv(w.quotaId)
    ].join(','));
  }

  // 2. Casos Especiales (Preseleccionados Fijos)
  for (let i = 0; i < specialCases.length; i++) {
    const s = specialCases[i];
    rows.push([
      escapeCsv('CASO_ESPECIAL'),
      escapeCsv(`E${i + 1}`),
      escapeCsv(s.documentId),
      escapeCsv(s.fullName),
      escapeCsv(s.career || 'MEDICINA'),
      escapeCsv(s.university || 'UAGRM'),
      escapeCsv(s.studentCode || ''),
      escapeCsv(s.specialHospital || s.assignedHospital || 'Hospital Preasignado'),
      escapeCsv(s.specialReason || 'Asignación Directa'),
      escapeCsv(draw.id),
      escapeCsv(boliviaDate(draw.createdAt)), escapeCsv(s.id), escapeCsv(s.studentId), escapeCsv(s.personId), escapeCsv(s.hospitalId), escapeCsv(s.quotaId)
    ].join(','));
  }

  // Anteponer BOM UTF-8 (\uFEFF) para que Excel abra acentos y ñ sin problemas
  return '\uFEFF' + rows.join('\r\n');
}

/**
 * 2. Generador de Exportación en Excel (.xlsx nativo multi-hoja)
 */
export function generateExcelExport(draw: DrawHistoryRecord): Buffer {
  const winners = draw.winners;
  const specialCases = draw.specialCases || [];

  const wb = XLSX.utils.book_new();
  const memoRows = [...winners.map(p=>({p,fixed:false})),...specialCases.map(p=>({p,fixed:true}))].map(({p,fixed})=>({
    'ID Habilitación':p.id,'ID Estudiante':p.studentId,'ID Persona':p.personId,
    'Nombre':p.fullName,'Documento':p.documentId,'Carrera':p.career,'Universidad':p.university,
    'ID Establecimiento':p.hospitalId,'Establecimiento':p.assignedHospital,'ID Cupo':p.quotaId,
    'Origen':fixed?'ASIGNACION_PREEXISTENTE':'ASIGNACION_NUEVA',
    'Acción en origen':fixed?'VERIFICAR_SIN_MODIFICAR':'ASIGNAR','Incremento cupo':fixed?0:1,
    'Incluir en memorandos':'Sí'
  }));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(memoRows),'Todos para memorandos');

  // Hoja 1: Médicos Habilitados Asignados por Sorteo
  const habilitadosRows = winners.map((w, idx) => ({
    'ID Habilitación': w.id, 'ID Estudiante': w.studentId, 'ID Persona': w.personId, 'ID Establecimiento': w.hospitalId, 'ID Cupo': w.quotaId,
    'Puesto': w.rankPosition || idx + 1,
    'Carnet / CI': w.documentId,
    'Nombre Completo': w.fullName,
    'Especialidad': w.career || 'MEDICINA',
    'Universidad': w.university || 'UAGRM',
    'Matrícula': w.studentCode || '',
    'Hospital Adjudicado': w.assignedHospital || 'Hospital Asignado',
    'Estado': 'Asignado por Sorteo',
    'Fecha Sorteo': boliviaDate(draw.createdAt)
  }));
  const wsHabilitados = XLSX.utils.json_to_sheet(habilitadosRows);
  XLSX.utils.book_append_sheet(wb, wsHabilitados, 'Asignación Sorteo');

  // Hoja 2: Casos Especiales / Transiciones Preasignadas
  const especialesRows = specialCases.map((s, idx) => ({
    'ID Habilitación': s.id, 'ID Estudiante': s.studentId, 'ID Persona': s.personId, 'ID Establecimiento': s.hospitalId,
    'Nro': `E${idx + 1}`,
    'Carnet / CI': s.documentId,
    'Nombre Completo': s.fullName,
    'Especialidad': s.career || 'MEDICINA',
    'Universidad': s.university || 'UAGRM',
    'Hospital Preasignado': s.specialHospital || s.assignedHospital || 'Hospital Preasignado',
    'Motivo Excepción': s.specialReason || 'Asignación Directa',
    'Estado': 'Preseleccionado Fijo',
    'Fecha': boliviaDate(draw.createdAt)
  }));
  const wsEspeciales = XLSX.utils.json_to_sheet(especialesRows);
  XLSX.utils.book_append_sheet(wb, wsEspeciales, 'Casos Especiales');

  // Hoja 3: Resumen Ejecutivo y Auditoría Criptográfica
  const auditoriaRows = [
    { 'Parámetro': 'ID Sorteo', 'Valor': `#${draw.id}` },
    { 'Parámetro': 'Fecha y Hora (Bolivia, UTC-4)', 'Valor': boliviaDate(draw.createdAt) },
    { 'Parámetro': 'Total Plazas Asignadas', 'Valor': winners.length + specialCases.length },
    { 'Parámetro': 'Estudiantes sorteados', 'Valor': winners.length },
    { 'Parámetro': 'Casos Especiales (Preasignados)', 'Valor': specialCases.length },
    { 'Parámetro': 'Algoritmo', 'Valor': draw.algorithm || '' },
    { 'Parámetro': 'Huella del padrón', 'Valor': draw.inputHash || '' },
    { 'Parámetro': 'Regla', 'Valor': draw.rule || '' },
    { 'Parámetro': 'Responsable', 'Valor': draw.actor || '' },
    { 'Parámetro': 'Palabras de Inicio (Humana)', 'Valor': draw.userWords.join(' ') },
    { 'Parámetro': 'Frase Servidor (CSPRNG)', 'Valor': draw.serverPhrase }
  ];
  const wsAuditoria = XLSX.utils.json_to_sheet(auditoriaRows);
  XLSX.utils.book_append_sheet(wb, wsAuditoria, 'Resumen y Auditoría');

  const excelBuffer: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return excelBuffer;
}

/**
 * 3. Generador de Exportación en SQL (Script DDL + INSERTs transaccionales)
 */
export function generateSqlExport(draw: DrawHistoryRecord): string {
  const winners = draw.winners;
  const specialCases = draw.specialCases || [];

  const escapeSql = (str: string | number | undefined | null) => {
    if (str === undefined || str === null) return "''";
    return "'" + String(str).replace(/'/g, "''") + "'";
  };

  const sqlLines: string[] = [];
  sqlLines.push('-- =================================================================');
  sqlLines.push('-- ACTA OFICIAL DE ASIGNACIÓN DE PLAZAS - RESIDENCIA MÉDICA Q4 2026');
  sqlLines.push(`-- Sorteo ID: #${draw.id}`);
  sqlLines.push(`-- Fecha y Hora: ${draw.createdAt}`);
  sqlLines.push(`-- Clima Meteored Santa Cruz: ${draw.weatherSnapshot}`);
  sqlLines.push(`-- Total Médicos: ${winners.length + specialCases.length} (${winners.length} Sorteados, ${specialCases.length} Casos Especiales)`);
  sqlLines.push('-- =================================================================\n');

  sqlLines.push('CREATE TABLE IF NOT EXISTS asignaciones_residencia_q4_2026 (');
  sqlLines.push('    id INTEGER PRIMARY KEY AUTOINCREMENT,');
  sqlLines.push('    seccion VARCHAR(30) NOT NULL,');
  sqlLines.push('    puesto_orden VARCHAR(20) NOT NULL,');
  sqlLines.push('    carnet_ci VARCHAR(50) NOT NULL,');
  sqlLines.push('    nombre_completo VARCHAR(255) NOT NULL,');
  sqlLines.push('    especialidad VARCHAR(100),');
  sqlLines.push('    universidad VARCHAR(255),');
  sqlLines.push('    matricula VARCHAR(50),');
  sqlLines.push('    hospital_asignado VARCHAR(255) NOT NULL,');
  sqlLines.push('    motivo_especial VARCHAR(255),');
  sqlLines.push('    id_sorteo INTEGER NOT NULL,');
  sqlLines.push('    fecha_sorteo VARCHAR(50) NOT NULL');
  sqlLines.push(');\n');

  sqlLines.push('BEGIN TRANSACTION;\n');

  // 1. Médicos Habilitados
  sqlLines.push('-- 1. ASIGNACIÓN OFICIAL POR SORTEO (MÉDICOS HABILITADOS)');
  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    const puesto = String(w.rankPosition || i + 1);
    sqlLines.push(
      `INSERT INTO asignaciones_residencia_q4_2026 (seccion, puesto_orden, carnet_ci, nombre_completo, especialidad, universidad, matricula, hospital_asignado, motivo_especial, id_sorteo, fecha_sorteo) VALUES ('SORTEO_HABILITADOS', ${escapeSql(puesto)}, ${escapeSql(w.documentId)}, ${escapeSql(w.fullName)}, ${escapeSql(w.career || 'MEDICINA')}, ${escapeSql(w.university || 'UAGRM')}, ${escapeSql(w.studentCode || '')}, ${escapeSql(w.assignedHospital || 'Hospital Asignado')}, NULL, ${draw.id}, ${escapeSql(draw.createdAt)});`
    );
  }

  // 2. Casos Especiales
  sqlLines.push('\n-- 2. CASOS ESPECIALES / TRANSICIONES PREASIGNADAS');
  for (let i = 0; i < specialCases.length; i++) {
    const s = specialCases[i];
    const puesto = `E${i + 1}`;
    sqlLines.push(
      `INSERT INTO asignaciones_residencia_q4_2026 (seccion, puesto_orden, carnet_ci, nombre_completo, especialidad, universidad, matricula, hospital_asignado, motivo_especial, id_sorteo, fecha_sorteo) VALUES ('CASO_ESPECIAL', ${escapeSql(puesto)}, ${escapeSql(s.documentId)}, ${escapeSql(s.fullName)}, ${escapeSql(s.career || 'MEDICINA')}, ${escapeSql(s.university || 'UAGRM')}, ${escapeSql(s.studentCode || '')}, ${escapeSql(s.specialHospital || s.assignedHospital || 'Hospital Preasignado')}, ${escapeSql(s.specialReason || 'Asignación Directa')}, ${draw.id}, ${escapeSql(draw.createdAt)});`
    );
  }

  sqlLines.push('\nCOMMIT;\n');
  return sqlLines.join('\n');
}

/**
 * 4. Generador de Exportación en PDF Oficial (Documento Formal Notarial / SEDES)
 */
export async function generatePdfExport(draw: DrawHistoryRecord): Promise<Buffer> {
  const winners = draw.winners;
  const specialCases = draw.specialCases || [];

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 36,
        size: 'LETTER',
        bufferPages: true
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      // ENCABEZADO INSTITUCIONAL
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#00733B').text('GOBIERNO AUTÓNOMO DEPARTAMENTAL DE SANTA CRUZ', { align: 'center' });
      doc.fontSize(9).fillColor('#4A6251').text('SERVICIO DEPARTAMENTAL DE SALUD (SEDES) - COMISIÓN DE RESIDENCIA MÉDICA', { align: 'center' });
      doc.fontSize(8).fillColor('#85BB42').text('UNA GESTIÓN PARA TODOS.', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(12).fillColor('#112316').text('ACTA OFICIAL DE ASIGNACIÓN DE PLAZAS - PERÍODO Q4 2026', { align: 'center' });
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(8).fillColor('#4A6251').text(
        `Sorteo Hiper-Entrópico ID #${draw.id}  |  Fecha: ${boliviaDate(draw.createdAt)}  |  Total Plazas: ${winners.length + specialCases.length}`,
        { align: 'center' }
      );
      doc.fontSize(7.5).fillColor('#4A6251').text(
        `Algoritmo: ${draw.algorithm || ''} | Padrón SHA-256: ${draw.inputHash || ''}`,
        { align: 'center', stroke: false }
      );
      doc.moveDown(0.8);

      // LÍNEA DIVISORIA BICOLOR
      doc.moveTo(36, doc.y).lineTo(576, doc.y).stroke('#85BB42');
      doc.moveDown(0.6);

      // SECCIÓN 1: ASIGNACIÓN OFICIAL POR SORTEO (HABILITADOS)
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#00733B').text(
        `1. ASIGNACIÓN OFICIAL POR SORTEO HIPER-ENTRÓPICO (${winners.length} MÉDICOS HABILITADOS)`,
        { underline: false }
      );
      doc.font('Helvetica').fontSize(7.5).fillColor('#4A6251').text(
        'Orden de prelación determinista y establecimiento hospitalario adjudicado por algoritmo imparcial.'
      );
      doc.moveDown(0.4);

      // Measure every cell before drawing: no column controls the next row.
      const columns = [
        { x: 40, width: 32 }, { x: 78, width: 60 },
        { x: 143, width: 164 }, { x: 313, width: 89 },
        { x: 408, width: 164 }
      ];
      const pageBottom = 730;
      const printTableHeader = (titles: string[]) => {
        const y = doc.y;
        doc.font('Helvetica-Bold').fontSize(7.5);
        const height = Math.max(...titles.map((t, i) =>
          doc.heightOfString(t, { width: columns[i].width, lineGap: 1 }))) + 10;
        doc.rect(36, y, 540, height).fill('#F0F6EC');
        titles.forEach((t, i) => {
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#00733B')
            .text(t, columns[i].x, y + 5, { width: columns[i].width, lineGap: 1 });
        });
        doc.x = 36; doc.y = y + height;
      };
      const printRows = (records: ParticipantRecord[], special: boolean) => {
        const titles = [special ? 'CASO' : 'PUESTO', 'CARNET/CI', 'MÉDICO POSTULANTE',
          special ? 'MOTIVO EXCEPCIÓN' : 'UNIVERSIDAD',
          special ? 'HOSPITAL PREASIGNADO' : 'HOSPITAL ADJUDICADO'];
        printTableHeader(titles);
        records.forEach((p, i) => {
          const cells = [
            special ? 'E' + (i + 1) : String(p.rankPosition || i + 1) + 'º',
            p.documentId, p.fullName,
            special ? p.specialReason || 'Asignación Directa' : p.university || 'UAGRM',
            special ? p.specialHospital || p.assignedHospital || 'Hospital Preasignado'
              : p.assignedHospital || 'Hospital Asignado'
          ].map(v => String(v ?? ''));
          const fonts = ['Helvetica-Bold', 'Helvetica', 'Helvetica-Bold',
            special ? 'Helvetica-Oblique' : 'Helvetica', 'Helvetica-Bold'];
          const sizes = [7, 7, 7, 6.5, 7];
          const height = Math.max(12, ...cells.map((t, j) => {
            doc.font(fonts[j]).fontSize(sizes[j]);
            return doc.heightOfString(t, { width: columns[j].width, lineGap: 1 });
          })) + 8;
          if (doc.y + height > pageBottom) {
            doc.addPage(); printTableHeader(titles);
          }
          const y = doc.y;
          if (i % 2 === 1) doc.rect(36, y, 540, height).fill(special ? '#FEF3C7' : '#FBFDF9');
          cells.forEach((t, j) => {
            doc.font(fonts[j]).fontSize(sizes[j])
              .fillColor(j === 4 ? (special ? '#B45309' : '#00733B') : '#112316')
              .text(t, columns[j].x, y + 4, { width: columns[j].width, lineGap: 1 });
          });
          doc.x = 36; doc.y = y + height;
        });
      };
      printRows(winners, false);
      doc.y += 14;

      if (specialCases.length > 0) {
        if (doc.y > 640) doc.addPage();
        doc.x = 36;
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#B45309').text(
          `2. CASOS ESPECIALES / TRANSICIONES ASIGNADAS (${specialCases.length} PRESELECCIONADOS)`,
          { width: 540 });
        doc.font('Helvetica').fontSize(7.5).fillColor('#475569').text(
          'Postulantes con hospital preasignado garantizado por normativa médica y excepciones legales.',
          { width: 540 });
        doc.moveDown(0.4);
        printRows(specialCases, true);
      }

      // FIRMAS Y CIERRE NOTARIAL
      if (doc.y > 660) {
        doc.addPage();
      }
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#0F172A').text('CONFORMIDAD Y CIERRE DEL ACTA OFICIAL', { align: 'center' });
      doc.moveDown(1.8);

      const signY = doc.y;
      // 3 Columnas de firmas
      doc.moveTo(50, signY).lineTo(190, signY).stroke('#94A3B8');
      doc.moveTo(235, signY).lineTo(375, signY).stroke('#94A3B8');
      doc.moveTo(420, signY).lineTo(560, signY).stroke('#94A3B8');

      doc.font('Helvetica').fontSize(7).fillColor('#475569');
      doc.text('Dra. / Dr. Veedor SEDES\nComisión Médica Santa Cruz', 50, signY + 4, { width: 140, align: 'center' });
      doc.text('Delegado Colegio Médico\nDepartamento de Santa Cruz', 235, signY + 4, { width: 140, align: 'center' });
      doc.text('Notario de Fe Pública\nCertificación Notarial del Sorteo', 420, signY + 4, { width: 140, align: 'center' });

      // Pie de página con numeración
      const totalPages = doc.bufferedPageRange().count;
      for (let p = 0; p < totalPages; p++) {
        doc.switchToPage(p);
        const savedBottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.font('Helvetica').fontSize(6.5).fillColor('#94A3B8').text(
          `Acta Oficial Q4 2026 - ID #${draw.id} | Página ${p + 1} de ${totalPages} | Gobierno Autónomo Departamental de Santa Cruz • SEDES`,
          36,
          756,
          { align: 'center', width: 540, lineBreak: false }
        );
        doc.page.margins.bottom = savedBottomMargin;
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
