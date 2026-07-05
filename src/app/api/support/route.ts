import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type SupportBody = {
  name?: string;
  email?: string;
  topic?: string;
  priority?: string;
  message?: string;
  userId?: string;
  userEmail?: string;
  pageUrl?: string;
  userAgent?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function textLine(label: string, value?: string) {
  return `${label}: ${value || "—"}`;
}

function htmlRow(label: string, value?: string) {
  return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:700;width:180px;">${escapeHtml(label)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;font-weight:700;">${escapeHtml(value || "—")}</td>
    </tr>
  `;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/support",
    smtpHost: process.env.SMTP_HOST ? "set" : "missing",
    smtpUser: process.env.SMTP_USER ? "set" : "missing",
    smtpPass: process.env.SMTP_PASS ? "set" : "missing",
    supportEmailTo: process.env.SUPPORT_EMAIL_TO ? "set" : "missing",
    supportEmailFrom: process.env.SUPPORT_EMAIL_FROM ? "set" : "missing",
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SupportBody;

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const topic = String(body.topic || "Обращение в поддержку").trim();
    const priority = String(body.priority || "Обычный вопрос").trim();
    const message = String(body.message || "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "Укажите имя." },
        { status: 400 }
      );
    }

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { error: "Укажите корректный email для ответа." },
        { status: 400 }
      );
    }

    if (message.length < 10) {
      return NextResponse.json(
        { error: "Опишите проблему подробнее. Минимум 10 символов." },
        { status: 400 }
      );
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT || 465);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const supportEmailTo = process.env.SUPPORT_EMAIL_TO;
    const supportEmailFrom = process.env.SUPPORT_EMAIL_FROM || smtpUser;

    if (!smtpHost || !smtpUser || !smtpPass || !supportEmailTo || !supportEmailFrom) {
      return NextResponse.json(
        {
          error:
            "Почта поддержки не настроена. Добавь SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SUPPORT_EMAIL_TO и SUPPORT_EMAIL_FROM в .env.local / .env.production.",
        },
        { status: 500 }
      );
    }

    const nodemailer = await import("nodemailer");

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure:
        process.env.SMTP_SECURE === "true" ||
        (!process.env.SMTP_SECURE && smtpPort === 465),
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const requestId = `SUP-${Date.now()}`;
    const subject = `[Стройка.ру] ${priority}: ${topic}`;

    const text = [
      `Новое обращение в поддержку Стройка.ру`,
      ``,
      textLine("Номер", requestId),
      textLine("Имя", name),
      textLine("Email", email),
      textLine("Тема", topic),
      textLine("Срочность", priority),
      textLine("ID пользователя", body.userId),
      textLine("Email аккаунта", body.userEmail),
      textLine("Страница", body.pageUrl),
      textLine("Браузер", body.userAgent),
      ``,
      `Сообщение:`,
      message,
    ].join("\n");

    const html = `
      <div style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,sans-serif;">
        <div style="max-width:720px;margin:0 auto;padding:32px 16px;">
          <div style="background:#0057ff;color:white;border-radius:28px;padding:28px;">
            <div style="display:inline-block;background:#ffde3d;color:#0057ff;border-radius:14px;padding:10px 14px;font-weight:900;">
              Стройка.ру
            </div>
            <h1 style="margin:22px 0 0;font-size:28px;line-height:1.2;">Новое обращение в поддержку</h1>
            <p style="margin:10px 0 0;color:rgba(255,255,255,.82);font-weight:700;">${escapeHtml(requestId)}</p>
          </div>

          <div style="margin-top:18px;background:white;border-radius:28px;padding:22px;box-shadow:0 10px 30px rgba(0,0,0,.06);">
            <table style="width:100%;border-collapse:collapse;">
              ${htmlRow("Номер", requestId)}
              ${htmlRow("Имя", name)}
              ${htmlRow("Email", email)}
              ${htmlRow("Тема", topic)}
              ${htmlRow("Срочность", priority)}
              ${htmlRow("ID пользователя", body.userId)}
              ${htmlRow("Email аккаунта", body.userEmail)}
              ${htmlRow("Страница", body.pageUrl)}
              ${htmlRow("Браузер", body.userAgent)}
            </table>

            <div style="margin-top:22px;">
              <div style="color:#6b7280;font-weight:900;margin-bottom:10px;">Сообщение</div>
              <div style="white-space:pre-wrap;background:#f5f7fb;border-radius:20px;padding:18px;color:#111827;font-size:16px;line-height:1.6;font-weight:600;">${escapeHtml(message)}</div>
            </div>
          </div>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"Стройка.ру Поддержка" <${supportEmailFrom}>`,
      to: supportEmailTo,
      replyTo: email,
      subject,
      text,
      html,
    });

    return NextResponse.json({
      ok: true,
      requestId,
      message: "Обращение отправлено. Мы ответим на указанную почту.",
    });
  } catch (error) {
    console.error("Support request error:", error);

    return NextResponse.json(
      { error: "Не получилось отправить обращение в поддержку." },
      { status: 500 }
    );
  }
}
