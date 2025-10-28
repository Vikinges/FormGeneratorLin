const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const fsp = fs.promises;

const DEFAULT_OUTPUT_DIR = 'generated';

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
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(targetPath);
        doc.pipe(stream);

        const title = meta.templateName || 'PDF Generator';

        doc
          .fontSize(20)
          .fillColor('#667eea')
          .text(title, { align: 'center' })
          .moveDown();

        if (meta.templateDescription) {
          doc
            .fontSize(12)
            .fillColor('#64748b')
            .text(meta.templateDescription, { align: 'center' })
            .moveDown();
        }

        doc
          .fontSize(10)
          .fillColor('#64748b')
          .text(`Created: ${new Date().toLocaleString('en-US')}`, {
            align: 'center'
          })
          .moveDown(2);

        doc
          .fontSize(14)
          .fillColor('#000000')
          .text('Form content:', { underline: true })
          .moveDown();

        const templateFields = Array.isArray(template) ? template : [];
        const renderedKeys = new Set();

        templateFields.forEach((field) => {
          const key = String(field.id);
          const value = formData[key];
          if (value === undefined || field.type === 'signature') {
            return;
          }
          renderedKeys.add(key);
          doc
            .fontSize(12)
            .fillColor('#334155')
            .text(field.label || `Field ${key}`, { continued: true })
            .fillColor('#1e293b')
            .text(`: ${normaliseValue(field, value)}`)
            .moveDown(0.7);
        });

        Object.entries(formData || {})
          .filter(([key]) => !renderedKeys.has(key) && !String(key).startsWith('signature_'))
          .forEach(([key, value]) => {
            const label = key
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (letter) => letter.toUpperCase());
            doc
              .fontSize(12)
              .fillColor('#334155')
              .text(label, { continued: true })
              .fillColor('#1e293b')
              .text(`: ${normaliseValue({ type: 'text' }, value)}`)
              .moveDown(0.7);
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
