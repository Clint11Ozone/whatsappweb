const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');


// Record app start time (seconds since epoch) to ignore old messages
const appStartTimestampSec = Math.floor(Date.now() / 1000);

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "main" // optional, useful if you want multiple sessions
    }),
     puppeteer: {
        headless: true,       // Render needs headless mode
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // important for Render
            '--disable-gpu'
        ]
    }
});


client.on('ready', () => {
    console.log('Client is ready!');
});

client.on('qr', qr => {
    qrcode.generate(qr, {small: true});
});

// Listening to all incoming messages
client.on('message', async message => {
    // Ignore any message created before the app started
    if (typeof message.timestamp === 'number' && message.timestamp < appStartTimestampSec) {
        return;
    }

	console.log(message.body);
    if (message.body === '!ping') {
		// send back "pong" to the chat the message was sent in
		client.sendMessage(message.from, 'pong');
	}
    // Send webhook only for messages sent by you to avoid duplicates
    const webhookUrl = "https://n8n-host-o8oa.onrender.com/webhook/whatsapp";
    // if (webhookUrl && message.body && message.from) {
    //     try {
    //         const chat = await message.getChat();
    //         const contact = await message.getContact();
    //         const payload = {
    //             direction: 'inbound',
    //             messageId: message.id,
    //             body: message.body,
    //             message: message,
    //             contact: contact,
    //             chat: chat,
    //             from: message.from
    //         };
    //         await axios.post(webhookUrl, payload, {
    //             headers: {
    //                 'Content-Type': 'application/json',
    //                 ...(process.env.WEBHOOK_SECRET ? { 'X-Webhook-Secret': process.env.WEBHOOK_SECRET } : {})
    //             },
    //             timeout: 5000
    //         });
    //         console.log(`Webhook (outbound) sent for message ${payload.from}`);
    //     } catch (err) {
    //         console.error('Failed to send outbound webhook:', err.message);
    //     }
    // }
});

client.initialize();
