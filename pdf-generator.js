const PDFDocument = require('pdfkit');
const fs = require('fs').promises;

/**
 * Модуль для генерации PDF из заполненной формы
 * @module pdf-generator
 */

class PDFGenerator {
  /**
   * Генерирует PDF документ из данных формы
   * @param {Object} formData - Данные формы
   * @param {Array} signatures - Массив подписей с данными
   * @param {string} outputPath - Путь для сохранения PDF
   * @returns {Promise<string>} Путь к сохраненному PDF
   */
  static async generate(formData, signatures = {}, outputPath = null) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const fileName = outputPath || `generated/form_${Date.now()}.pdf`;
        
        // Создаем директорию если не существует
        fs.mkdir('generated', { recursive: true }).then(() => {
          const stream = fs.createWriteStream(fileName);
          doc.pipe(stream);

          // Заголовок документа
          doc.fontSize(20)
             .fillColor('#667eea')
             .text('PDF Generator', { align: 'center' })
             .moveDown();

          // Дата и время создания
          doc.fontSize(10)
             .fillColor('#64748b')
             .text(`Дата создания: ${new Date().toLocaleString('ru-RU')}`, { align: 'center' })
             .moveDown(2);

          // Содержимое формы
          doc.fontSize(14)
             .fillColor('#000000')
             .text('Содержимое формы:', { underline: true })
             .moveDown();

          // Обрабатываем поля формы
          for (const [key, value] of Object.entries(formData)) {
            if (key.startsWith('signature_')) continue;
            
            const fieldLabel = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            
            doc.fontSize(12)
               .fillColor('#334155')
               .text(fieldLabel + ':', { continued: true })
               .fillColor('#1e293b')
               .text(JSON.stringify(value));
            
            doc.moveDown(0.5);
          }

          // Добавляем подписи
          if (signatures && Object.keys(signatures).length > 0) {
            doc.moveDown(2);
            doc.fontSize(14)
               .fillColor('#000000')
               .text('Подписи:', { underline: true })
               .moveDown();

            const signatureTime = new Date().toLocaleString('ru-RU');
            
            for (const [signer, signatureData] of Object.entries(signatures)) {
              doc.fontSize(12)
                 .fillColor('#334155')
                 .text(`${signer}:`)
                 .moveDown(0.3);

              // Вставляем изображение подписи если есть
              if (signatureData && signatureData.startsWith('data:image')) {
                try {
                  const base64Data = signatureData.split(',')[1];
                  const buffer = Buffer.from(base64Data, 'base64');
                  doc.image(buffer, {
                    fit: [200, 80],
                    align: 'left'
                  });
                } catch (err) {
                  console.error('Ошибка вставки изображения подписи:', err);
                }
              }

              doc.fontSize(10)
                 .fillColor('#94a3b8')
                 .text(`Время подписания: ${signatureTime}`);
              
              doc.moveDown(2);
            }
          }

          // Финализируем PDF
          doc.end();

          stream.on('finish', () => {
            resolve(fileName);
          });

          stream.on('error', (err) => {
            reject(err);
          });
        }).catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Проверяет, что PDF файл корректно создан
   * @param {string} filePath - Путь к PDF файлу
   * @returns {Promise<boolean>}
   */
  static async validatePDF(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return stats.size > 0;
    } catch (error) {
      return false;
    }
  }
}

module.exports = PDFGenerator;

