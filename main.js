const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());
const port = process.env.PORT || 3000;

// Record app start time (seconds since epoch) to ignore old messages
const appStartTimestampSec = Math.floor(Date.now() / 1000);

let qrCodeData = null;
let clientReady = false;

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "main" // optional, useful if you want multiple sessions
    }),
    puppeteer: {
        headless: true, // or false if you want to see the browser
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});


client.on('ready', () => {
    console.log('Client is ready!');
    clientReady = true;
    qrCodeData = null;
});

client.on('qr', qr => {
    console.log('QR Code received');
    qrcode.toDataURL(qr, (err, url) => {
        if (err) {
            console.error('Error generating QR code', err);
            return;
        }
        qrCodeData = url;
        clientReady = false;
    });
});

client.on('authenticated', () => {
    console.log('Authenticated');
    clientReady = true;
    qrCodeData = null;
});

client.on('disconnected', (reason) => {
    console.log('Client was disconnected', reason);
    clientReady = false;
    qrCodeData = null;
    // Re-initialize to allow new connection
    client.initialize();
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
    if (webhookUrl && message.body && message.from) {
        try {
            const chat = await message.getChat();
            const contact = await message.getContact();
            const payload = {
                direction: 'inbound',
                messageId: message.id,
                body: message.body,
                message: message,
                contact: contact,
                chat: chat,
                from: message.from
            };
            await axios.post(webhookUrl, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(process.env.WEBHOOK_SECRET ? { 'X-Webhook-Secret': process.env.WEBHOOK_SECRET } : {})
                },
                timeout: 5000
            });
            console.log(`Webhook (outbound) sent for message ${payload.from}`);
        } catch (err) {
            console.error('Failed to send outbound webhook:', err.message);
        }
    }
});

// Web Server Routes
app.get('/', (req, res) => {
    if (clientReady) {
        res.send(`
            <html>
                <head>
                    <title>WhatsApp Client</title>
                    <meta http-equiv="refresh" content="60">
                    <style>body { font-family: sans-serif; text-align: center; padding: 50px; }</style>
                </head>
                <body>
                    <h1>Client is Ready!</h1>
                    <p>WhatsApp is connected.</p>
                    <form action="/restart" method="POST">
                        <button type="submit">Restart Client</button>
                    </form>
                </body>
            </html>
        `);
    } else if (qrCodeData) {
        res.send(`
            <html>
                <head>
                    <title>WhatsApp Client</title>
                    <meta http-equiv="refresh" content="5">
                    <style>body { font-family: sans-serif; text-align: center; padding: 50px; }</style>
                </head>
                <body>
                    <h1>Scan QR Code</h1>
                    <img src="${qrCodeData}" alt="QR Code" />
                    <p>Scan this with your WhatsApp app.</p>
                </body>
            </html>
        `);
    } else {
        res.send(`
            <html>
                <head>
                    <title>WhatsApp Client</title>
                    <meta http-equiv="refresh" content="2">
                    <style>body { font-family: sans-serif; text-align: center; padding: 50px; }</style>
                </head>
                <body>
                    <h1>Loading...</h1>
                    <p>Waiting for QR code or client initialization...</p>
                </body>
            </html>
        `);
    }
});

app.post('/restart', async (req, res) => {
    try {
        await client.destroy();
        await client.initialize();
        res.send('Client restarting... <a href="/">Go back</a>');
    } catch (error) {
        res.status(500).send('Error restarting client: ' + error.message);
    }
});

app.post('/send-message', async (req, res) => {
    if (!clientReady) {
        return res.status(503).json({ error: 'Client not ready' });
    }

    const { number, message } = req.body;

    if (!number || !message) {
        return res.status(400).json({ error: 'Missing number or message' });
    }

    try {
        // Format the number: append @c.us if it's just digits and doesn't contain @
        let chatId = number;
        if (!chatId.includes('@')) {
            chatId = `${chatId}@c.us`;
        }

        const response = await client.sendMessage(chatId, message);
        res.json({ success: true, response });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message', details: error.message });
    }
});

client.initialize();

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
