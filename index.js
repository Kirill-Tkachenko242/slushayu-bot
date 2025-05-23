require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('✅ MongoDB подключена')).catch(err => console.error('❌ MongoDB:', err));

const Message = mongoose.model('Message', {
  userId: Number,
  text: String,
  date: { type: Date, default: Date.now }
});

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Привет! Напиши свою мысль — я её сохраню. Анонимно.');
});

bot.on('message', async (msg) => {
  const { chat, text } = msg;
  if (text.startsWith('/start')) return;

  await new Message({ userId: chat.id, text }).save();
  bot.sendMessage(chat.id, 'Спасибо. Я сохранил твою мысль.');

  bot.sendMessage(process.env.OWNER_ID, `💬 Новое сообщение:\n\n${text}`);
});
