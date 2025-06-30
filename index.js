/**
 * index.js (เวอร์ชันสำหรับ AWS Lambda)
 * * โค้ดนี้เป็น LINE Bot Webhook ที่ใช้ Express.js และถูกปรับให้ทำงานบน AWS Lambda
 * โดยใช้ `serverless-http` เป็นตัวกลางในการรับ Event จาก API Gateway
 * * **ข้อควรจำ:**
 * 1. ไม่มีการใช้ `app.listen()` เพราะ Lambda ไม่ได้ทำงานโดยการเปิด Port
 * 2. ต้องตั้งค่า Environment Variables ชื่อ `CHANNEL_SECRET` และ `CHANNEL_ACCESS_TOKEN`
 * ในหน้า Configuration ของ Lambda Function บน AWS Console
 */

const serverless = require('serverless-http'); // << ใช้สำหรับแปลง Express app ให้เป็น Lambda handler
const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');

// --- การตั้งค่า (Configuration) ---

// ดึงค่า Configuration จาก Environment Variables ของ Lambda
const lineConfig = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

// ตรวจสอบว่ามี Environment Variables ครบถ้วนหรือไม่
if (!lineConfig.channelSecret || !lineConfig.channelAccessToken) {
  console.error('กรุณาตั้งค่า Environment Variables: CHANNEL_SECRET และ CHANNEL_ACCESS_TOKEN บน Lambda');
  throw new Error('Missing required environment variables');
}

// แสดง Log เพื่อตรวจสอบว่าค่าถูกโหลดมาถูกต้อง (แสดงแค่บางส่วนเพื่อความปลอดภัย)
console.log('Channel Secret (first 10 chars):', lineConfig.channelSecret?.substring(0, 10) + '...');
console.log('Access Token (first 10 chars):', lineConfig.channelAccessToken?.substring(0, 10) + '...');

// สร้าง Express App และ LINE Client
const app = express();
const client = new Client(lineConfig);


// --- Middleware ---

const lineMiddleware = middleware(lineConfig);
app.use((req, res, next) => {
  lineMiddleware(req, res, (err) => {
    if (err) {
      console.error('LINE Middleware Error:', err.message);
      return res.status(401).json({
        message: 'Unauthorized',
        error: err.message,
      });
    }
    next();
  });
});


// --- Routes (เส้นทาง) ---

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'LINE Bot is running on AWS Lambda! 🤖',
    timestamp: new Date().toISOString(),
    config: {
      channelSecret: lineConfig.channelSecret ? 'Set' : 'Not set',
      channelAccessToken: lineConfig.channelAccessToken ? 'Set' : 'Not set'
    }
  });
});

app.post('/default/webhook', (req, res) => {
  console.log('Webhook received:', JSON.stringify(req.body, null, 2));

  if (!req.body.events || req.body.events.length === 0) {
    console.log('Request body does not contain events.');
    return res.status(200).send('OK');
  }
  
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => {
      console.log('All events processed successfully.');
      res.status(200).json({ status: 'success', result });
    })
    .catch((err) => {
      console.error('Error processing events:', err);
      res.status(200).json({ status: 'error' });
    });
});


// --- Logic การจัดการ Event ---

async function handleEvent(event) {
  console.log('Processing event:', event);

  // เราจะจัดการกับ event ที่เป็นประเภท 'message' เท่านั้น
  // Event ประเภทอื่น เช่น follow, unfollow, join, leave จะถูกข้ามไป
  if (event.type !== 'message') {
    console.log(`Skipping event type: ${event.type}`);
    return Promise.resolve(null);
  }

  // ดึงประเภทของข้อความที่ผู้ใช้ส่งมา
  const messageType = event.message.type;
  let replyText = ''; // ตัวแปรสำหรับเก็บข้อความที่จะตอบกลับ

  // ใช้ switch-case เพื่อสร้างข้อความตอบกลับตามประเภทของข้อความ
  switch (messageType) {
    case 'text':
      const userMessage = event.message.text;
      replyText = `คุณได้ส่งข้อความประเภท: ข้อความ (Text)\nข้อความของคุณคือ: "${userMessage}"`;
      break;
    case 'image':
      replyText = 'คุณได้ส่งข้อความประเภท: รูปภาพ (Image)';
      break;
    case 'video':
      replyText = 'คุณได้ส่งข้อความประเภท: วิดีโอ (Video)';
      break;
    case 'audio':
      replyText = 'คุณได้ส่งข้อความประเภท: ไฟล์เสียง (Audio)';
      break;
    case 'file':
      // สำหรับข้อความประเภทไฟล์ เราสามารถดึงชื่อไฟล์มาแสดงได้ด้วย
      replyText = `คุณได้ส่งข้อความประเภท: ไฟล์ (File)\nชื่อไฟล์: ${event.message.fileName}`;
      break;
    case 'location':
      // สำหรับตำแหน่งที่ตั้ง สามารถดึง title และ address มาแสดงได้
      replyText = `คุณได้ส่งข้อความประเภท: ตำแหน่งที่ตั้ง (Location)\nที่อยู่: ${event.message.address}`;
      break;
    case 'sticker':
      // สำหรับสติกเกอร์ เราสามารถดึง ID ของสติกเกอร์มาแสดงเพื่อความสนุกได้
      replyText = `คุณได้ส่งข้อความประเภท: สติกเกอร์ (Sticker)\nPackage ID: ${event.message.packageId}\nSticker ID: ${event.message.stickerId}`;
      break;
    default:
      // กรณีเป็นประเภทข้อความอื่นๆ ที่เรายังไม่รองรับ
      replyText = `คุณได้ส่งข้อความประเภท: "${messageType}" ซึ่งยังไม่รองรับการตอบกลับ`;
      console.log(`Unsupported message type received: ${messageType}`);
      break;
  }

  // เตรียม object ของข้อความสำหรับส่งกลับ (ยังคงเป็น text อยู่)
  const replyMessage = {
    type: 'text',
    text: replyText,
  };

  // ส่งข้อความตอบกลับ (Reply)
  try {
    console.log(`Sending reply to token: ${event.replyToken}: "${replyText}"`);
    return await client.replyMessage(event.replyToken, replyMessage);
  } catch (error) {
    console.error('Error sending reply:', error.message);
    if (error.originalError) {
      console.error('LINE API Error Details:', error.originalError.response?.data);
    }
    // คืนค่า null เพื่อให้ Promise.all ทำงานต่อได้แม้จะมีบาง event ที่ error
    return Promise.resolve(null);
  }
}


// --- Export Handler สำหรับ AWS Lambda ---
module.exports.handler = serverless(app);