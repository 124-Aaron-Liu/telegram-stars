import TelegramBot from "node-telegram-bot-api";
import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";

// 載入環境變數
dotenv.config();

// 環境變數檢查
const TOKEN = process.env.BOT_TOKEN_TEST;

if (!TOKEN) {
  console.error("❌ BOT_TOKEN is not defined in .env file");
  process.exit(1);
}

// 初始化機器人 - Webhook 模式
const bot = new TelegramBot(TOKEN, {
  polling: false, // 關閉輪詢，使用 Webhook
  testEnvironment: true,
});

// ----------------------------------------------------
// 定義商品介面和商品列表
interface Product {
  id: string;
  title: string;
  description: string;
  priceStars: number;
  photoUrl?: string;
  secretContent: string;
}

const products: Product[] = [
  {
    id: "gold_100",
    title: "10金幣",
    description: "儲值100金幣",
    priceStars: 200,
    secretContent: "恭喜！您的金幣是: 100",
    photoUrl: "https://www.silubr.com.tw/data/editor/files/Gold.jpg",
  },
  {
    id: "gold_200",
    title: "20金幣",
    description: "儲值200金幣",
    priceStars: 400,
    secretContent: "恭喜！您的金幣是: 200",
    photoUrl: "https://www.silubr.com.tw/data/editor/files/Gold.jpg",
  },
  {
    id: "gold_500",
    title: "50金幣",
    description: "儲值500金幣",
    priceStars: 1000,
    secretContent: "恭喜！您的金幣是: 500",
    photoUrl: "https://www.silubr.com.tw/data/editor/files/Gold.jpg",
  },
];

// ----------------------------------------------------
// 處理 /start 命令：顯示商品列表和購買按鈕
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  let welcomeMessage = `🚀 歡迎來到我們的 Telegram Stars 商店！\n\n您可以購買以下精選商品：\n\n`;

  const inlineKeyboard = products.map((product) => [
    {
      text: `🛒 購買 ${product.title}`,
      callback_data: `buy_${product.id}`,
    },
  ]);

  await bot.sendMessage(chatId, welcomeMessage, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: inlineKeyboard,
    },
  });
});

// ----------------------------------------------------
// 處理回調查詢 (Callback Query)
bot.on("callback_query", async (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data;
  const chatId = msg?.chat.id;
  const fromId = callbackQuery.from.id;

  await bot.answerCallbackQuery(callbackQuery.id);

  if (!chatId) {
    console.error("❌ Chat ID is undefined for callback query.");
    return;
  }

  console.log("🔧 收到 callback_query 事件");
  console.log("用戶 ID:", fromId);
  console.log("data:", data);

  if (data && data.startsWith("buy_")) {
    const productId = data.replace("buy_", "");
    const product = products.find((p) => p.id === productId);

    if (product) {
      await handlePayment(chatId, product, fromId);
    } else {
      await bot.sendMessage(chatId, "❌ 抱歉，找不到您選擇的商品。");
    }
  }
});

// ----------------------------------------------------
// 模式處理函數
async function handlePayment(chatId: number, product: Product, userId: number) {
  console.log(`🧪 Stripe 測試模式：用戶 ${userId} 購買 ${product.title}`);

  try {
    // 使用測試 Stripe 金鑰
    const invoiceUrl = await bot.createInvoiceLink(
      product.title,
      product.description,
      product.id,
      TOKEN as string,
      "XTR",
      [{ label: product.title, amount: product.priceStars }],
      {
        photo_url: product.photoUrl,
        is_flexible: false,
        need_name: false,
        need_phone_number: false,
        need_email: false,
        need_shipping_address: false,
      }
    );

    await bot.sendMessage(
      chatId,
      `🧪 **您選擇購買：${product.title}\n價格：${product.priceStars} Stars\n\n⚠️ ：`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🧪 支付", url: invoiceUrl }],
            [{ text: "❌ 取消", callback_data: "cancel" }],
          ],
        },
      }
    );

    console.log(`✅ 支付連結已發送給用戶 ${userId}`);
  } catch (error) {
    console.error("❌ 建立支付連結失敗:", error);
    await bot.sendMessage(
      chatId,
      "❌ 抱歉，支付系統暫時無法使用。請稍後再試。"
    );
  }
}

// ----------------------------------------------------
// 處理預結帳查詢 (pre_checkout_query)
async function handlePreCheckoutQuery(query: any) {
  const productId = query.invoice_payload;
  const product = products.find((p) => p.id === productId);

  console.log(`🔍 收到預結帳查詢：${query.id}`);
  console.log(`商品 ID：${productId}`);
  console.log(`請求金額：${query.total_amount} ${query.currency}`);

  if (product && query.total_amount === product.priceStars) {
    await bot.answerPreCheckoutQuery(query.id, true);
    console.log(`✅ 預結帳查詢通過：${query.id}`);
  } else {
    await bot.answerPreCheckoutQuery(query.id, false, {
      error_message:
        "❌ 您的訂單無效，商品資訊可能已更新或庫存不足。請重新嘗試。",
    });
    console.warn(`❌ 預結帳查詢失敗：${query.id} - 無效訂單`);
  }
}

// ----------------------------------------------------
// 處理成功支付 (successful_payment)
async function handleSuccessfulPayment(msg: any) {
  const chatId = msg.chat.id;
  const payment = msg.successful_payment;

  if (!payment) {
    console.error("❌ 支付資訊不存在！");
    return;
  }

  const productId = payment.invoice_payload;
  const totalPaidStars = payment.total_amount;
  const currency = payment.currency;
  const telegramChargeId = payment.telegram_payment_charge_id;

  console.log(`🎉 支付成功！`);
  console.log(`用戶：${msg.from?.first_name} (ID: ${msg.from?.id})`);
  console.log(`商品：${productId}`);
  console.log(`金額：${totalPaidStars} ${currency}`);
  console.log(`Telegram Charge ID：${telegramChargeId}`);

  const purchasedProduct = products.find((p) => p.id === productId);

  if (purchasedProduct) {
    await bot.sendMessage(
      chatId,
      `🎉 **支付成功！**\n\n您已成功購買：${purchasedProduct.title}\n\n${purchasedProduct.secretContent}\n\n💰 支付金額：${totalPaidStars} ${currency}\n📋 交易 ID：${telegramChargeId}`
    );
    // 記錄交易
    console.log(`📝 交易記錄：用戶 ${msg.from?.id} 購買 ${productId} 成功`);
  } else {
    await bot.sendMessage(
      chatId,
      "❌ 感謝您的購買！但我們無法識別您購買的商品。請聯繫客服。"
    );
    console.error(`❌ 支付成功但商品 ID (${productId}) 無法識別！`);
  }
}

// ----------------------------------------------------
// 通用錯誤處理
bot.on("webhook_error", (error) => {
  console.error("❌ Webhook Error:", (error as any).code, error.message);
});

bot.on("error", (error) => {
  console.error("❌ General Bot Error:", error.message);
});

// ----------------------------------------------------
// Express 應用程式設定
const app = express();

// 其他 API 路由使用 JSON parser
app.use("/api", express.json());

// 加入 CORS 設定
app.use(
  cors({
    origin: "*", // 允許所有來源
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Webhook 端點 - 必須使用 raw body parser
app.post(
  "/api/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      console.log("📥 收到 Webhook 請求");
      console.log(req.body);
      if (req.body?.pre_checkout_query) {
        await handlePreCheckoutQuery(req.body.pre_checkout_query);
      }
      if (req.body?.message?.successful_payment) {
        await handleSuccessfulPayment(req.body.message);
      }
      // 直接回應 200，讓 bot 的事件處理器處理更新
      res.sendStatus(200);
    } catch (error) {
      console.error("❌ Webhook 處理錯誤:", error);
      res.sendStatus(500);
    }
  }
);

app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "success", message: "查詢成功" });
});

// 新增一個 API，讓前端取得 invoice payload
app.post("/api/create-invoice", async (req, res) => {
  const { productId, userId } = req.body;
  const product = products.find((p) => p.id === productId);
  console.log("🔧 產生發票 payload:", product);
  if (!product) {
    return res.status(404).json({ error: "商品不存在" });
  }

  try {
    // 建立 invoice link，而不是發送給用戶
    // 這樣可以在 Mini App 內開啟
    const invoiceUrl = await bot.createInvoiceLink(
      product.title,
      product.description,
      product.id, // payload
      TOKEN as string,
      "XTR", // currency
      [
        {
          label: product.title,
          amount: product.priceStars,
        },
      ],
      {
        photo_url: product.photoUrl,
        is_flexible: false,
        need_name: false,
        need_phone_number: false,
        need_email: false,
        need_shipping_address: false,
      }
    );

    console.log("✅ Invoice Link 建立成功:", invoiceUrl);

    // 回傳 invoice URL 給前端，讓 Mini App 可以開啟
    res.json({
      success: true,
      invoiceUrl: invoiceUrl, // 這是真正的 invoice URL
      message: "Invoice 已產生",
      debug: {
        productId: product.id,
        userId: userId,
      },
    });
  } catch (error) {
    console.error("❌ 建立 Invoice Link 錯誤:", error);
    res.status(500).json({
      success: false,
      error: "建立 Invoice Link 失敗",
      message: error instanceof Error ? error.message : "未知錯誤",
    });
  }
});

// 所有其他路由都返回 index.html (SPA 支援)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// ----------------------------------------------------
// Webhook 設定函數
async function setupWebhook() {
  try {
    // 從環境變數取得 webhook URL，或使用預設值
    const webhookUrl =
      process.env.WEBHOOK_URL ||
      "https://b02d-61-216-4-194.ngrok-free.app/api/webhook";

    console.log("🔄 正在設定 Webhook...");
    console.log("📍 URL:", webhookUrl);

    // 先刪除現有的 webhook
    console.log("🗑️ 刪除現有 webhook...");
    await bot.deleteWebHook();

    // 設定新的 webhook
    console.log("🔧 設定新 webhook...");
    await bot.setWebHook(webhookUrl);

    console.log("✅ Webhook 設定成功！");

    // 取得 webhook 資訊
    const webhookInfo = await bot.getWebHookInfo();
    console.log("📋 Webhook 資訊:");
    console.log("  - URL:", webhookInfo.url);
    console.log("  - 最後錯誤:", webhookInfo.last_error_message || "無");
    console.log("  - 最後錯誤時間:", webhookInfo.last_error_date || "無");
    console.log("  - 待處理更新:", webhookInfo.pending_update_count);
  } catch (error) {
    console.error("❌ Webhook 設定失敗:", error);
    console.log("💡 請確保 WEBHOOK_URL 環境變數已正確設定");
  }
}

// 啟動 express server
app.listen(3001, async () => {
  console.log("🚀 API server running on http://localhost:3001");
  console.log("🌐 Webhook 端點: http://localhost:3001/webhook");
  // 設定 Webhook
  await setupWebhook();
});

console.log("🚀 Webhook 模式測試機器人已啟動！");
console.log("🔧 請確保 WEBHOOK_URL 環境變數已正確設定");
