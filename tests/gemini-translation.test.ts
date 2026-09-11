import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractGeminiResponseText,
  geminiResponseUsage,
  translatePageImage,
} from "../src/translation/gemini-translation";
import { translationModel, translationProvider } from "../src/translation/translation-providers";

describe("Gemini translation responses", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("offers the curated Gemini models with 3.8 Flash as the default", () => {
    const provider = translationProvider("gemini");

    expect(provider.defaultModelId).toBe("gemini-3.8-flash");
    expect(provider.models.map(({ id }) => id)).toEqual([
      "gemini-3.8-flash",
      "gemini-3.1-flash-lite",
    ]);
    expect(translationModel(provider, "gemini-3.1-flash-lite").displayName).toBe(
      "Gemini 3.1 Flash-Lite",
    );
  });

  it("joins visible text parts and ignores thought parts", () => {
    expect(
      extractGeminiResponseText({
        candidates: [
          {
            content: {
              parts: [
                { text: "숨은 생각", thought: true },
                { text: "  첫 문단  " },
                { text: "둘째 문단" },
              ],
            },
          },
        ],
      }),
    ).toBe("첫 문단\n둘째 문단");
  });

  it("returns null when candidates contain no visible text", () => {
    expect(extractGeminiResponseText({ candidates: [] })).toBeNull();
  });

  it("reports billed output as candidate plus thought tokens", () => {
    expect(
      geminiResponseUsage({
        usageMetadata: {
          promptTokenCount: 1_200,
          candidatesTokenCount: 800,
          thoughtsTokenCount: 125,
        },
      }),
    ).toEqual({ inputTokens: 1_200, outputTokens: 925 });
  });

  it("sends a PNG with low thinking through the Gemini REST API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "번역 결과" }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await translatePageImage(
      "gemini-3.8-flash",
      "AIza-test-key-long-enough-for-unit-test",
      new Blob(["png"], { type: "image/png" }),
      7,
    );

    expect(result.text).toBe("번역 결과");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/models/gemini-3.8-flash:generateContent");
    expect(options.headers).toMatchObject({
      "Content-Type": "application/json",
      "x-goog-api-key": "AIza-test-key-long-enough-for-unit-test",
    });
    if (typeof options.body !== "string") throw new Error("Expected a JSON request body");
    const body = JSON.parse(options.body) as {
      contents: { parts: Record<string, unknown>[] }[];
      generationConfig: { thinkingConfig: { thinkingLevel: string } };
    };
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe("low");
    expect(body.contents[0]?.parts[1]).toMatchObject({
      inline_data: { mime_type: "image/png", data: "cG5n" },
    });
  });

  it("turns a temporary high-demand response into an actionable message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 503,
              message: "This model is currently experiencing high demand.",
            },
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(
      translatePageImage(
        "gemini-3.8-flash",
        "AIza-test-key-long-enough-for-unit-test",
        new Blob(["png"], { type: "image/png" }),
        1,
      ),
    ).rejects.toThrow(
      "현재 Gemini 모델 사용량이 많습니다. 잠시 후 다시 시도하거나 설정에서 다른 모델을 선택하세요.",
    );
  });
});
