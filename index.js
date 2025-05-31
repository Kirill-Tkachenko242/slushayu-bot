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
  date: { type: Date, default: Date.now },
  status: { type: String, default: 'pending' } // новое поле
});


bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Привет! Напиши свою мысль — я её сохраню. Анонимно.');
});

bot.on('message', async (msg) => {
  const { chat, text } = msg;
  if (text.startsWith('/start')) return;

  // сохраняем сообщение
  const saved = await new Message({
    userId: chat.id,
    text
  }).save();

  // отвечаем отправителю
  bot.sendMessage(chat.id, 'Спасибо. Я сохранил твою мысль.');

  // отправляем админу + кнопки
  bot.sendMessage(process.env.OWNER_ID, `💬 Новое сообщение:\n\n${text}`, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Опубликовать', callback_data: `publish_${saved._id}` },
          { text: '❌ Отклонить', callback_data: `reject_${saved._id}` }
        ]
      ]
    }
  });
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const [action, id] = query.data.split('_');

  const found = await Message.findById(id);
  if (!found) {
    return bot.answerCallbackQuery(query.id, { text: 'Сообщение не найдено' });
  }

  if (action === 'publish' && found.status !== 'published') {
    found.status = 'published';
    await found.save();

    // уведомляем автора
    bot.sendMessage(found.userId, '✅ Ваше сообщение было опубликовано.');

    // обновляем сообщение админу
    await bot.editMessageText(`✅ Опубликовано:\n\n${found.text}`, {
      chat_id: chatId,
      message_id: messageId
    });
  }

  if (action === 'reject' && found.status !== 'rejected') {
    found.status = 'rejected';
    await found.save();

    await bot.editMessageText(`❌ Отклонено:\n\n${found.text}`, {
      chat_id: chatId,
      message_id: messageId
    });
  }

  // безопасно убираем кнопки
  try {
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
      chat_id: chatId,
      message_id: messageId
    });
  } catch (err) {
    if (!err.message.includes('message is not modified')) {
      console.error(err);
    }
  }

  bot.answerCallbackQuery(query.id);
});


bot.onText(/\/list/, async (msg) => {
  if (msg.chat.id.toString() !== process.env.OWNER_ID) return;

  const pending = await Message.find({ status: 'pending' }).sort({ date: -1 }).limit(5);
  if (pending.length === 0) {
    return bot.sendMessage(msg.chat.id, 'Нет непроверенных сообщений.');
  }

  for (const m of pending) {
    await bot.sendMessage(msg.chat.id, `💬 Ожидает модерации:\n\n${m.text}`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Опубликовать', callback_data: `publish_${m._id}` },
            { text: '❌ Отклонить', callback_data: `reject_${m._id}` }
          ]
        ]
      }
    });
  }
});

bot.onText(/\/stats/, async (msg) => {
  if (msg.chat.id.toString() !== process.env.OWNER_ID) return;

  const total = await Message.countDocuments();
  const published = await Message.countDocuments({ status: 'published' });
  const rejected = await Message.countDocuments({ status: 'rejected' });
  const pending = await Message.countDocuments({ status: 'pending' });

  const text = `
📊 Статистика сообщений:

— Всего: ${total}
— Опубликовано: ${published}
— Отклонено: ${rejected}
— В ожидании: ${pending}
`;

  bot.sendMessage(msg.chat.id, text);
});
