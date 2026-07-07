import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function getApiKey() {
  const key =
    process.env.YANDEX_GEOCODER_API_KEY ||
    process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY ||
    "";

  return key.trim();
}

export async function GET(request: NextRequest) {
  try {
    const apiKey = getApiKey();
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address")?.trim();

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "Ключ не найден в .env.local",
          need: "YANDEX_GEOCODER_API_KEY=полный_ключ_геокодера",
        },
        { status: 500 }
      );
    }

    if (!address || address.length < 3) {
      return NextResponse.json(
        { ok: false, error: "Адрес слишком короткий" },
        { status: 400 }
      );
    }

    const url = new URL("https://geocode-maps.yandex.ru/1.x/");
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("geocode", address);
    url.searchParams.set("format", "json");
    url.searchParams.set("lang", "ru_RU");
    url.searchParams.set("results", "1");

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
    });

    const text = await response.text();

    let data: any = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "Яндекс вернул не JSON",
          status: response.status,
          details: text.slice(0, 500),
        },
        { status: 500 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Ошибка Яндекс Геокодера",
          status: response.status,
          details:
            data?.message ||
            data?.error ||
            data?.error_description ||
            JSON.stringify(data).slice(0, 500),
        },
        { status: response.status }
      );
    }

    const geoObject =
      data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;

    const pos = geoObject?.Point?.pos;

    if (!pos) {
      return NextResponse.json(
        {
          ok: false,
          error: "Координаты не найдены",
          address,
        },
        { status: 404 }
      );
    }

    // Яндекс возвращает: долгота широта
    const [lngRaw, latRaw] = String(pos).split(" ");

    const lng = Number(lngRaw);
    const lat = Number(latRaw);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Некорректные координаты",
          raw: pos,
        },
        { status: 500 }
      );
    }

    const foundAddress =
      geoObject?.metaDataProperty?.GeocoderMetaData?.text || address;

    return NextResponse.json({
      ok: true,
      lat,
      lng,
      address: foundAddress,
      rawAddress: address,
    });
  } catch (error) {
    console.error("Geocode API error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Внутренняя ошибка /api/geocode",
      },
      { status: 500 }
    );
  }
}
