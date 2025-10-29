const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const fsp = fs.promises;

const DEFAULT_OUTPUT_DIR = 'generated';
const MM_PER_POINT = 25.4 / 72;
const CANVAS_WIDTH_PX = 795;
const CANVAS_HEIGHT_PX = Math.round(CANVAS_WIDTH_PX * Math.sqrt(2));
const CANVAS_MM = {
  width: CANVAS_WIDTH_PX / 3.7795275591, // convert px (96dpi) to mm
  height: CANVAS_HEIGHT_PX / 3.7795275591
};
const PDF_MARGIN_MM = 15;

const formatBoolean = (value) => (value ? 'Yes' : 'No');
const formatArray = (arr) =>
  arr
    .filter(Boolean)
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        return item.originalname || item.name || item.path || JSON.stringify(item);
      }
      return String(item);
    })
    .join(', ');

const normaliseValue = (field, raw) => {
  if (raw === undefined || raw === null || raw === '') {
    return '—';
  }

  switch (field.type) {
    case 'checkbox':
      return formatBoolean(Boolean(raw));
    case 'photo':
      return Array.isArray(raw) ? formatArray(raw) : String(raw);
    case 'signature':
      return '[embedded signature]';
    default:
      if (typeof raw === 'string') return raw;
      if (Array.isArray(raw)) return formatArray(raw);
      if (typeof raw === 'object') return JSON.stringify(raw, null, 2);
      return String(raw);
  }
};

/**
 * Module for generating PDFs from submitted forms.
 */
class PDFGenerator {
  /**
   * Generates a PDF document from form data.
   * @param {Object} formData - Submitted form data.
   * @param {Array|Object} signatures - Signatures metadata.
   * @param {Object} options
   * @param {string} [options.outputPath]
   * @param {Array} [options.template]
   * @param {Object} [options.meta]
   * @returns {Promise<string>} Path to the generated PDF file.
   */
  static async generate(formData, signatures = {}, options = {}) {
    const {
      outputPath = null,
      template = [],
      meta = {}
    } = options || {};

    const targetPath =
      outputPath ||
      path.join(DEFAULT_OUTPUT_DIR, `form_${Date.now()}.pdf`);
    const outputDir = path.dirname(targetPath);

    await fsp.mkdir(outputDir, { recursive: true });

    return new Promise((resolve, reject) => {
      try {
        const pageWidthMm = CANVAS_MM.width + PDF_MARGIN_MM * 2;
        const pageHeightMm = CANVAS_MM.height + PDF_MARGIN_MM * 2;
        const doc = new PDFDocument({
          size: [pageWidthMm / MM_PER_POINT, pageHeightMm / MM_PER_POINT],
          margin: PDF_MARGIN_MM / MM_PER_POINT
        });
        const stream = fs.createWriteStream(targetPath);
        doc.pipe(stream);

        const title = meta.templateName || 'PDF Generator';

        const templateFields = Array.isArray(template) ? template : [];
        const renderedKeys = new Set();

        const toPdf = (px) => (px / 3.7795275591) / MM_PER_POINT; // px -> mm -> pt

        const safeText = (value) => {
          if (value === undefined || value === null) {
            return '';
          }
          if (typeof value === 'string') {
            return value;
          }
          if (Array.isArray(value)) {
            return formatArray(value);
          }
          if (typeof value === 'object') {
            return JSON.stringify(value);
          }
          return String(value);
        };

        doc.save();

        if (meta.templateDescription || meta.templateName) {
          doc
            .fontSize(16)
            .fillColor('#1e293b')
            .text(meta.templateName || 'Form', toPdf(0), toPdf(-30), { width: toPdf(CANVAS_WIDTH_PX), align: 'center' });
          if (meta.templateDescription) {
            doc
              .fontSize(9)
              .fillColor('#475569')
              .text(meta.templateDescription, { align: 'center' });
          }
        }

        doc.restore();

        templateFields.forEach((field) => {
          const key = String(field.id);
          const value = formData[key];
          if (value === undefined) {
            return;
          }

          renderedKeys.add(key);

          const fieldX = toPdf(field.position?.x || 0);
          const fieldY = toPdf(field.position?.y || 0);
          const fieldWidth = toPdf(field.size?.width || 240);
          const fieldHeight = toPdf(field.size?.height || 60);

          if (field.type === 'checkbox') {
            const boxSize = Math.min(fieldHeight, toPdf(20));
            doc
              .rect(fieldX, fieldY, boxSize, boxSize)
              .stroke('#0f172a');
            if (value) {
              doc
                .moveTo(fieldX + 2, fieldY + boxSize / 2)
                .lineTo(fieldX + boxSize / 3, fieldY + boxSize - 2)
                .lineTo(fieldX + boxSize - 2, fieldY + 2)
                .stroke('#0f172a');
            }
            doc
              .fontSize(9)
              .fillColor('#1f2937')
              .text(field.checkboxLabel || 'Yes', fieldX + boxSize + toPdf(6), fieldY + boxSize / 4, {
                width: fieldWidth - boxSize - toPdf(6)
              });
            return;
          }

          if (field.type === 'signature') {
            const signatureData = signatures[key];
            doc
              .rect(fieldX, fieldY, fieldWidth, fieldHeight)
              .stroke('#94a3b8');
            if (signatureData && signatureData.startsWith('data:image')) {
              try {
                const base64Data = signatureData.split(',')[1];
                const buffer = Buffer.from(base64Data, 'base64');
                doc.image(buffer, fieldX, fieldY, {
                  fit: [fieldWidth, fieldHeight]
                });
              } catch (err) {
                console.error('Failed to embed signature image:', err);
              }
            }
            return;
          }

          doc
            .fontSize(9)
            .fillColor('#1e293b')
            .text(safeText(value), fieldX + toPdf(6), fieldY + toPdf(6), {
              width: fieldWidth - toPdf(12),
              height: fieldHeight - toPdf(12)
            });
        });

        Object.entries(formData || {})
          .filter(([key]) => !renderedKeys.has(key) && !String(key).startsWith('signature_'))
          .forEach(([key, value], index) => {
            const label = key
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (letter) => letter.toUpperCase());
            const textY = toPdf(CANVAS_HEIGHT_PX + 40 + index * 20);
            doc
              .fontSize(10)
              .fillColor('#334155')
              .text(`${label}: ${safeText(value)}`, toPdf(0), textY, { width: toPdf(CANVAS_WIDTH_PX) });
          });

        const signatureLabels = new Map(
          templateFields
            .filter((field) => field.type === 'signature')
            .map((field) => [String(field.id), field.label || `Signature ${field.id}`])
        );

        if (signatures && Object.keys(signatures).length > 0) {
          doc.moveDown(1.5);
          doc
            .fontSize(14)
            .fillColor('#000000')
            .text('Signatures:', { underline: true })
            .moveDown();

          const signatureTime = new Date().toLocaleString('en-US');

          Object.entries(signatures).forEach(([signer, signatureData]) => {
            const label = signatureLabels.get(String(signer)) || signer;

            doc
              .fontSize(12)
              .fillColor('#334155')
              .text(`${label}:`)
              .moveDown(0.3);

            if (signatureData && signatureData.startsWith('data:image')) {
              try {
                const base64Data = signatureData.split(',')[1];
                const buffer = Buffer.from(base64Data, 'base64');
                doc.image(buffer, {
                  fit: [320, 120],
                  align: 'left'
                });
              } catch (err) {
                console.error('Failed to embed signature image:', err);
              }
            }

            doc
              .fontSize(10)
              .fillColor('#94a3b8')
              .text(`Signed at: ${signatureTime}`)
              .moveDown(1.5);
          });
        }

        doc.end();

        stream.on('finish', () => resolve(targetPath));
        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Checks that the generated PDF file exists and is not empty.
   * @param {string} filePath - Path to the PDF file.
   * @returns {Promise<boolean>}
   */
  static async validatePDF(filePath) {
    try {
      const stats = await fsp.stat(filePath);
      return stats.size > 0;
    } catch (error) {
      return false;
    }
  }
}

module.exports = PDFGenerator;
