import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import Stripe from "stripe";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";

dotenv.config(); // 載入 .env 檔案中的環境變數

// 從環境變數中獲取機器人 Token
const TOKEN = process.env.BOT_TOKEN_TEST;
const stripeSecretKeyTest = process.env.STRIPE_SECRET_KEY_TEST;
const stripePublishableKeyTest = process.env.STRIPE_PUBLISHABLE_KEY_TEST;

// 🎛️ 混合模式控制變數
const SIMULATION_ONLY = process.env.SIMULATION_ONLY === "true"; // 純模擬模式
const ENABLE_REAL_PAYMENTS = process.env.ENABLE_REAL_PAYMENTS === "true"; // 啟用真實支付

// 環境檢查
const isTestEnvironment = stripeSecretKeyTest?.startsWith("sk_test_");
const isProductionEnvironment = stripeSecretKeyTest?.startsWith("sk_live_");

if (!TOKEN) {
  console.error("❌ BOT_TOKEN is not defined in .env file");
  process.exit(1);
}

// 初始化機器人
const bot = new TelegramBot(TOKEN, {
  polling: true,
  testEnvironment: true,
});

// 🎯 模式狀態顯示
console.log("🤖 Bot is running...");
console.log(
  `🔧 環境模式：${
    isTestEnvironment
      ? "Stripe 測試"
      : isProductionEnvironment
      ? "Stripe 正式"
      : "未知"
  }`
);
console.log(
  `🎛️ 支付模式：${
    SIMULATION_ONLY ? "純模擬" : ENABLE_REAL_PAYMENTS ? "真實支付" : "測試支付"
  }`
);
console.log(`💳 Stripe 金鑰前綴：${stripeSecretKeyTest?.substring(0, 7)}...`);

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
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  // 根據模式顯示不同的歡迎訊息
  let modeIndicator = "";
  if (SIMULATION_ONLY) {
    modeIndicator = "🧪 **模擬模式** - 無真實扣款\n\n";
  } else if (isTestEnvironment) {
    modeIndicator = "🧪 **測試模式** - 使用 Stripe 測試金鑰\n\n";
  } else {
    modeIndicator = "💰 **正式模式** - 真實支付\n\n";
  }

  let welcomeMessage = `🚀 歡迎來到我們的 Telegram Stars 商店！\n\n${modeIndicator}您可以購買以下精選商品：\n\n`;

  // const inlineKeyboard = products.map((product) => [
  //   {
  //     text: `🛒 購買 ${product.title}`,
  //     callback_data: `buy_${product.id}`,
  //   },
  // ]);

  // bot.sendMessage(chatId, welcomeMessage, {
  //   parse_mode: "Markdown",
  //   reply_markup: {
  //     inline_keyboard: inlineKeyboard,
  //   },
  // });
});

// bot.onText(/\/start(?:\s+(.+))?/, (msg, match) => {
//   const chatId = msg.chat.id;
//   const payload = match && match[1] ? match[1] : null;

//   // 根據模式顯示不同的歡迎訊息
//   let modeIndicator = "";
//   if (SIMULATION_ONLY) {
//     modeIndicator = "🧪 **模擬模式** - 無真實扣款\n\n";
//   } else if (isTestEnvironment) {
//     modeIndicator = "🧪 **測試模式** - 使用 Stripe 測試金鑰\n\n";
//   } else {
//     modeIndicator = "💰 **正式模式** - 真實支付\n\n";
//   }

//   let welcomeMessage = `🚀 歡迎來到我們的 Telegram Stars 商店！\n\n${modeIndicator}您可以購買以下精選商品：\n\n`;

//   const inlineKeyboard = products.map((product) => [
//     {
//       text: `🛒 購買 ${product.title}`,
//       callback_data: `buy_${product.id}`,
//     },
//   ]);

//   // 如果有 deep link payload，且格式正確，直接觸發購買流程
//   if (payload && payload.startsWith("buy_")) {
//     const productId = payload.replace("buy_", "");
//     const product = products.find((p) => p.id === productId);
//     if (product && msg.from) {
//       // 加上 msg.from 檢查
//       // 直接呼叫購買流程
//       if (SIMULATION_ONLY) {
//         handleSimulationMode(chatId, product, msg.from.id);
//       } else if (ENABLE_REAL_PAYMENTS && isProductionEnvironment) {
//         handleRealPaymentMode(chatId, product, msg.from.id);
//       } else {
//         handleTestPaymentMode(chatId, product, msg.from.id);
//       }
//       return; // 不再顯示商品列表
//     }
//   }

//   // 沒有 deep link payload，顯示商品列表
//   bot.sendMessage(chatId, welcomeMessage, {
//     parse_mode: "Markdown",
//     reply_markup: {
//       inline_keyboard: inlineKeyboard,
//     },
//   });
// });

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
      console.log(`🛒 用戶 ${fromId} 選擇購買：${product.title}`);

      // 🎛️ 根據模式選擇不同的處理方式
      if (SIMULATION_ONLY) {
        // 模式 1：純模擬模式
        await handleSimulationMode(chatId, product, fromId);
      } else if (ENABLE_REAL_PAYMENTS && isProductionEnvironment) {
        // 模式 2：真實支付模式
        await handleRealPaymentMode(chatId, product, fromId);
      } else {
        // 模式 3：Stripe 測試模式
        await handleTestPaymentMode(chatId, product, fromId);
      }
      // await handleTestPaymentMode(chatId, product, fromId);
    } else {
      bot.sendMessage(chatId, "❌ 抱歉，找不到您選擇的商品。");
    }
  }
});

// ----------------------------------------------------
// 模式 1：純模擬模式處理函數
async function handleSimulationMode(
  chatId: number,
  product: Product,
  userId: number
) {
  console.log(`🧪 純模擬模式：用戶 ${userId} 購買 ${product.title}`);

  // 發送模擬處理訊息
  bot.sendMessage(
    chatId,
    `🧪 **模擬購買處理中...**\n\n商品：${product.title}\n價格：${product.priceStars} Stars\n\n⏳ 正在模擬支付流程...`,
    { parse_mode: "Markdown" }
  );

  // 模擬 2 秒的處理時間
  setTimeout(async () => {
    await simulateCompletePaymentFlow(chatId, product, userId);
  }, 2000);
}

// ----------------------------------------------------
// 模式 2：真實支付模式處理函數
async function handleRealPaymentMode(
  chatId: number,
  product: Product,
  userId: number
) {
  console.log(`💰 真實支付模式：用戶 ${userId} 購買 ${product.title}`);

  try {
    await bot.sendInvoice(
      chatId,
      product.title,
      product.description,
      product.id,
      stripePublishableKeyTest as string,
      "XTR",
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
    console.log(`✅ 真實發票發送成功：${product.id} 給聊天 ${chatId}`);
  } catch (error: any) {
    console.error("❌ 發送真實發票錯誤:", error.message);
    bot.sendMessage(chatId, "❌ 發送發票時發生錯誤，請稍後再試。");
  }
}

// ----------------------------------------------------
// 模式 3：Stripe 測試模式處理函數
async function handleTestPaymentMode(
  chatId: number,
  product: Product,
  userId: number
) {
  console.log(`🧪 Stripe 測試模式：用戶 ${userId} 購買 ${product.title}`);
  console.log(
    userId,
    chatId,
    product.title,
    product.description,
    product.id,
    // stripePublishableKeyTest as string,
    TOKEN,
    "XTR",
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
  try {
    await bot.sendInvoice(
      chatId,
      product.title,
      product.description,
      product.id,
      // stripePublishableKeyTest as string,
      TOKEN as string,
      "XTR",
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
    console.log(`✅ 測試發票發送成功：${product.id} 給聊天 ${chatId}`);
  } catch (error: any) {
    console.error("❌ 發送測試發票錯誤:", error.message);
    bot.sendMessage(chatId, "❌ 發送發票時發生錯誤，請稍後再試。");
  }
}

// ----------------------------------------------------
// 模擬完整支付流程函數
async function simulateCompletePaymentFlow(
  chatId: number,
  product: Product,
  userId: number
) {
  console.log(`🎉 模擬支付成功！用戶 ${userId} 購買 ${product.title}`);

  // 模擬支付成功訊息
  bot.sendMessage(
    chatId,
    `🎉 **模擬支付成功！**\n\n您已成功購買：${product.title}\n\n${
      product.secretContent
    }\n\n🧪 **模擬模式資訊**\n💰 模擬金額：${
      product.priceStars
    } Stars\n📋 模擬交易 ID：SIM_${Date.now()}\n⏰ 模擬時間：${new Date().toLocaleString(
      "zh-TW"
    )}\n\n⚠️ 這是模擬模式，沒有真實扣款`,
    {
      parse_mode: "Markdown",
    }
  );

  // 模擬記錄交易
  console.log(`📝 模擬交易記錄：用戶 ${userId} 購買 ${product.id}`);
}

// ----------------------------------------------------
// 處理預結帳查詢 (pre_checkout_query)
bot.on("pre_checkout_query", async (query) => {
  const payload = query.invoice_payload;
  const totalAmount = query.total_amount;
  const currency = query.currency;

  console.log("🔧 收到 pre_checkout_query 事件");
  console.log("用戶 ID:", query.from.id);
  console.log("payload:", payload);
  console.log(
    `收到預結帳查詢：Payload: ${payload}, 金額: ${totalAmount} ${currency}`
  );

  const product = products.find((p) => p.id === payload);
  const isOrderValid =
    product && product.priceStars === totalAmount && currency === "XTR";

  if (isOrderValid) {
    await bot.answerPreCheckoutQuery(query.id, true);
    console.log(`✅ 預結帳查詢通過：${query.id}`);
  } else {
    await bot.answerPreCheckoutQuery(query.id, false, {
      error_message:
        "❌ 您的訂單無效，商品資訊可能已更新或庫存不足。請重新嘗試。",
    });
    console.warn(`❌ 預結帳查詢失敗：${query.id} - 無效訂單`);
  }
});

// ----------------------------------------------------
// 處理成功支付 (successful_payment)
bot.on("successful_payment", async (msg) => {
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
    // 根據環境顯示不同的成功訊息
    if (isTestEnvironment) {
      await bot.sendMessage(
        chatId,
        `🎉 **測試支付成功！**\n\n您已成功購買：${purchasedProduct.title}\n\n${purchasedProduct.secretContent}\n\n🧪 **測試環境資訊**\n💰 支付金額：${totalPaidStars} ${currency}\n📋 Telegram Charge ID：${telegramChargeId}\n\n⚠️ 這是測試環境，無真實扣款`,
        {
          // parse_mode: "Markdown",
        }
      );
    } else {
      await bot.sendMessage(
        chatId,
        `🎉 **支付成功！**\n\n您已成功購買：${purchasedProduct.title}\n\n${purchasedProduct.secretContent}\n\n💰 支付金額：${totalPaidStars} ${currency}\n📋 交易 ID：${telegramChargeId}`,
        {
          // parse_mode: "Markdown",
        }
      );
    }

    // 記錄交易
    console.log(`📝 交易記錄：用戶 ${msg.from?.id} 購買 ${productId} 成功`);
  } else {
    bot.sendMessage(
      chatId,
      "❌ 感謝您的購買！但我們無法識別您購買的商品。請聯繫客服。"
    );
    console.error(`❌ 支付成功但商品 ID (${productId}) 無法識別！`);
  }
});

// ----------------------------------------------------
// 通用錯誤處理
bot.on("polling_error", (error) => {
  console.error("❌ Polling Error:", (error as any).code, error.message);
});

bot.on("webhook_error", (error) => {
  console.error("❌ Webhook Error:", (error as any).code, error.message);
});

bot.on("error", (error) => {
  console.error("❌ General Bot Error:", error.message);
});

// ----------------------------------------------------
// 新增測試指令
bot.onText(/\/testmode/, (msg) => {
  const chatId = msg.chat.id;

  const modeInfo = `
🧪 **當前測試模式資訊**

🔧 環境模式：${
    isTestEnvironment
      ? "Stripe 測試"
      : isProductionEnvironment
      ? "Stripe 正式"
      : "未知"
  }
🎛️ 支付模式：${
    SIMULATION_ONLY ? "純模擬" : ENABLE_REAL_PAYMENTS ? "真實支付" : "測試支付"
  }
💳 Stripe 金鑰：${stripeSecretKeyTest?.substring(0, 10)}...

📋 **模式說明**
• 純模擬：完全模擬支付流程，無任何真實扣款
• 測試支付：使用 Stripe 測試金鑰，無真實費用
• 真實支付：使用 Stripe 正式金鑰，會產生真實費用

🔧 **切換模式**
請修改 .env 檔案中的環境變數：
• SIMULATION_ONLY=true/false
• ENABLE_REAL_PAYMENTS=true/false
• TEST_MODE=true/false
`;

  bot.sendMessage(chatId, modeInfo, { parse_mode: "Markdown" });
});

console.log("🚀 混合模式測試機器人已啟動！");
console.log("💡 使用 /testmode 查看當前模式設定");

const app = express();
// 加入 CORS 設定
app.use(
  cors({
    origin: "*", // 允許所有來源
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(bodyParser.json());

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
      // stripePublishableKeyTest as string,
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

// 啟動 express server
app.listen(3001, () => {
  console.log("API server running on http://localhost:3001");
});
