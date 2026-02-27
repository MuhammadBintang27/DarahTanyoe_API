import axios from "axios";

// Signature untuk semua pesan WhatsApp
const WHATSAPP_SIGNATURE = "\n\n*DarahTanyoe*\nTransparan, Terhubung, Terselamatkan";

// Fungsi untuk menambahkan signature ke pesan
const addSignature = (message) => {
  return `${message}${WHATSAPP_SIGNATURE}`;
};

// Fungsi untuk mengirim pesan WhatsApp menggunakan Facebook WhatsApp API
const sendWhatsAppMessage = async (phone, message) => {
  try {
    // Format nomor telepon (pastikan dalam format internasional tanpa +)
    const formattedPhone = phone.replace(/^\+/, '');

    const url = `https://graph.facebook.com/${process.env.FACEBOOK_MESSAGE_VERSION}/${process.env.FACEBOOK_PHONE_NUMBER_ID}/messages`;

    // Tambahkan signature ke pesan
    const messageWithSignature = addSignature(message);

    const payload = {
      messaging_product: "whatsapp",
      to: formattedPhone,
      type: "text",
      text: {
        body: messageWithSignature
      }
    };

    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${process.env.FACEBOOK_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log("WhatsApp message sent via Facebook API:", response.data);

    return { success: true, data: response.data, message: messageWithSignature };
  } catch (error) {
    console.error("Error sending WhatsApp message via Facebook API:", error.response?.data || error.message);
    throw new Error("Failed to send message via WhatsApp");
  }
};

// Fungsi khusus untuk mengirim OTP menggunakan Wablas API
const sendWhatsAppOTP = async (phone, otp) => {
  try {
    // Format nomor telepon (pastikan dalam format internasional tanpa +)
    const formattedPhone = phone.replace(/^\+/, '');

    const token = process.env.WABLAS_TOKEN;
    const secretKey = process.env.WABLAS_SECRET_KEY;

    console.log("WABLAS_TOKEN:", token ? "SET" : "NOT SET");
    console.log("WABLAS_SECRET_KEY:", secretKey ? "SET" : "NOT SET");

    const message = `Kode OTP Anda adalah: ${otp}. Kode ini berlaku selama 5 menit.`;
    
    // Tambahkan signature ke pesan OTP
    const messageWithSignature = addSignature(message);
    const flag = "instant";

    const url = `https://bdg.wablas.com/api/send-message?token=${token}.${secretKey}&phone=${formattedPhone}&message=${encodeURIComponent(messageWithSignature)}&flag=${flag}`;

    console.log("Wablas URL:", url); // Debug URL

    const response = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });

    console.log("OTP sent via Wablas API:", response.data);

    return { success: true, data: response.data, message: messageWithSignature };
  } catch (error) {
    console.error("Error sending OTP via Wablas API:");
    console.error("Status:", error.response?.status);
    console.error("Data:", error.response?.data);
    console.error("Message:", error.message);
    throw new Error("Failed to send OTP via WhatsApp: " + (error.response?.data?.message || error.message));
  }
};

// Fungsi khusus untuk mengirim notifikasi menggunakan Wablas API
const sendWhatsAppNotification = async (phone, message) => {
  try {
    // Format nomor telepon (pastikan dalam format internasional tanpa +)
    const formattedPhone = phone.replace(/^\+/, '');

    const token = process.env.WABLAS_TOKEN;
    const secretKey = process.env.WABLAS_SECRET_KEY;

    // Tambahkan signature ke pesan notifikasi
    const messageWithSignature = addSignature(message);

    // Sesuai dokumentasi Wablas: POST dengan Authorization header
    const response = await axios.post(
      'https://bdg.wablas.com/api/send-message',
      new URLSearchParams({
        phone: formattedPhone,
        message: messageWithSignature,
        flag: 'instant'
      }),
      {
        headers: {
          'Authorization': `${token}.${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000 // 10 second timeout
      }
    );

    console.log("Notification sent via Wablas API:", response.data);

    return { success: true, data: response.data, message: messageWithSignature };
  } catch (error) {
    console.error("Error sending notification via Wablas API:");
    console.error("Status:", error.response?.status);
    console.error("Data:", error.response?.data);
    console.error("Message:", error.message);
    throw new Error("Failed to send notification via WhatsApp: " + (error.response?.data?.message || error.message));
  }
};

export {
  sendWhatsAppMessage,
  sendWhatsAppOTP,
  sendWhatsAppNotification
};