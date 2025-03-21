const express = require('express');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Инициализация Firebase
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
	credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Настройка почтового сервиса
const transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: process.env.EMAIL_USER,
		pass: process.env.EMAIL_PASS
	}
});

// Простой маршрут для проверки работы сервера
app.get('/', (req, res) => {
	res.send('Сервер уведомлений о визах работает!');
});

// Запланированная задача - проверка виз каждый день в 9:00
cron.schedule('0 9 * * *', async () => {
	console.log('Запуск ежедневной проверки виз...');
	await checkVisaExpirations();
});

// Функция для проверки срока действия виз
async function checkVisaExpirations () {
	try {
		const now = new Date();
		const oneWeekLater = new Date();
		oneWeekLater.setDate(oneWeekLater.getDate() + 7);

		// Получаем визы, которые истекают через неделю
		const snapshot = await db.collection('visaData')
			.where('visaExpiryDate', '>=', now)
			.where('visaExpiryDate', '<=', oneWeekLater)
			.get();

		if (snapshot.empty) {
			console.log('Нет виз, истекающих в ближайшую неделю');
			return;
		}

		const emailPromises = [];

		snapshot.forEach(doc => {
			const visaData = doc.data();
			const expiryDate = visaData.visaExpiryDate.toDate();

			// Форматируем дату истечения визы
			const formattedDate = expiryDate.toLocaleDateString('ru-RU');

			// Создаем текст и HTML-версию электронного письма
			const mailOptions = {
				from: `Система уведомлений о визах <${process.env.EMAIL_USER}>`,
				to: visaData.email,
				subject: 'Уведомление об истечении срока визы',
				text: `Уважаемый(ая) ${visaData.firstName} ${visaData.lastName},\n\nНапоминаем вам, что срок действия вашей визы №${visaData.visaNumber} истекает ${formattedDate}.\n\nПожалуйста, примите необходимые меры.\n\nС уважением,\nСистема уведомлений о визах`,
				html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h2 style="color: #333;">Уведомление об истечении срока визы</h2>
            <p>Уважаемый(ая) <strong>${visaData.firstName} ${visaData.lastName}</strong>,</p>
            <p>Напоминаем вам, что срок действия вашей визы <strong>№${visaData.visaNumber}</strong> истекает <strong>${formattedDate}</strong>.</p>
            <p>Пожалуйста, примите необходимые меры.</p>
            <p style="margin-top: 30px;">С уважением,<br>Система уведомлений о визах</p>
          </div>
        `
			};

			// Добавляем промис на отправку email в массив
			emailPromises.push(transporter.sendMail(mailOptions));
		});

		// Ждем отправки всех email
		await Promise.all(emailPromises);
		console.log(`Отправлено ${emailPromises.length} уведомлений`);

	} catch (error) {
		console.error('Ошибка при отправке уведомлений:', error);
	}
}

// Маршрут для ручного запуска проверки (полезно для тестирования)
app.get('/check-visas', async (req, res) => {
	try {
		await checkVisaExpirations();
		res.send('Проверка визовых сроков выполнена успешно');
	} catch (error) {
		res.status(500).send(`Ошибка при проверке виз: ${error.message}`);
	}
});

// Запуск сервера
app.listen(PORT, () => {
	console.log(`Сервер запущен на порту ${PORT}`);
	console.log('Запланирована ежедневная проверка виз в 9:00');
});