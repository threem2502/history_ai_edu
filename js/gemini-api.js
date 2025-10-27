// js/gemini-api.js
// Gọi trực tiếp Gemini API từ frontend (không backend)

const GEMINI_API_KEY = "AIzaSyCyiYySkfCmwn3US6C99Csu91ZYAzA3NKo"; // TODO: đặt key AI Studio
const MODEL_NAME = "gemini-2.5-flash"; // model nhẹ, trả lời nhanh, đa nhiệm văn bản. Có thể đổi "gemini-2.5-flash" nếu bạn đã được cấp. :contentReference[oaicite:1]{index=1}

/**
 * Build endpoint URL cho 1 lần generateContent
 * Ví dụ:
 * https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=...
 */
function _endpoint() {
  return `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${encodeURIComponent(
    GEMINI_API_KEY
  )}`;
}

/**
 * Chuẩn hoá câu hỏi kèm hướng dẫn vai trò giáo viên lịch sử
 * để AI trả lời phù hợp học sinh.
 *
 * Bạn có thể chỉnh prompt hệ thống tại đây.
 */
function buildPrompt(questionText) {
  // Prompt "system" kiểu Gemini dùng chung nội dung với user trong 'contents'.
  // Cách đơn giản nhất ở frontend là ghép hướng dẫn + câu hỏi thành 1 chuỗi text.
  const systemInstruction = `
Bạn là trợ giảng Lịch sử cấp THCS/THPT.
Yêu cầu:
- Giải thích dễ hiểu, giọng trung lập, không chính trị hoá.
- Trả lời bằng tiếng Việt.
- Làm rõ mốc thời gian (ngày/tháng/năm).
- Nếu câu hỏi mơ hồ, đưa ngữ cảnh lịch sử chính và hạn chế phỏng đoán ngoài sách giáo khoa.
Câu hỏi của học sinh: ${questionText}
`;
  return systemInstruction.trim();
}

/**
 * Gửi câu hỏi văn bản và nhận câu trả lời thuần text từ Gemini.
 *
 * @param {string} questionText  - câu hỏi của user
 * @param {string} sessionId     - id phiên chat hiện tại (tạm thời không dùng cho Gemini direct, nhưng giữ tham số để tương thích chat-ai.js)
 * @returns {Promise<string>}    - câu trả lời AI
 */
export async function askGemini(questionText, sessionId) {
  try {
    const body = {
      contents: [
        {
          // Vì chưa duy trì history ở client gửi lên,
          // ta coi đây là 1 lượt hỏi độc lập.
          parts: [
            {
              text: buildPrompt(questionText),
            },
          ],
        },
      ],
      // Bạn có thể tinh chỉnh output ở đây:
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
      // safetySettings có thể thêm nếu muốn chặn nội dung nhạy cảm.
    };

    const res = await fetch(_endpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error("askGemini() HTTP error", res.status);
      return "Xin lỗi, AI không phản hồi được (lỗi mạng hoặc quota).";
    }

    const data = await res.json();

    // data.candidates[0].content.parts[0].text là cấu trúc phổ biến hiện tại. :contentReference[oaicite:2]{index=2}
    const answer =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "AI không trả lời.";

    return answer;
  } catch (err) {
    console.error("askGemini() exception", err);
    return "Xin lỗi, đã xảy ra lỗi khi gọi AI.";
  }
}

/**
 * (Future) Hỏi bằng ảnh:
 * Gemini hỗ trợ gửi ảnh (inlineData base64) trong cùng endpoint generateContent. :contentReference[oaicite:3]{index=3}
 * Ta sẽ implement sau.
 */
export async function askGeminiWithImage(imageFile, sessionId) {
  console.warn("askGeminiWithImage() chưa implement (Vision).");
  return "Chức năng phân tích hình ảnh sẽ sớm có.";
}

/**
 * (Future) Hỏi theo PDF:
 * Cũng dùng generateContent, gửi PDF như fileData/fileUri hoặc tách text đã OCR.
 * Sẽ làm sau.
 */
export async function askGeminiWithDoc(questionText, docId, sessionId) {
  console.warn("askGeminiWithDoc() chưa implement (PDF QA).");
  return "Chức năng hỏi theo tài liệu PDF sẽ sớm có.";
}
