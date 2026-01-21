import express from "express";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

app.get("/api/hello", async (req, res) => {
  const url = req.query.url;
  res.json({ message: "서버 정상 작동" });
  if (!url) return res.status(400).send("URL 없음");

  try {
    // 1️⃣ HTML 가져오기
    const response = await fetch(url);
    const html = await response.text();

    // 2️⃣ DOM으로 변환
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // 3️⃣ ccfolia 메시지 추출
    const messages = [...document.querySelectorAll(".message-container.main")]
      .map(el => el.outerHTML);

    // 4️⃣ 결과 반환
    res.json({
      count: messages.length,
      messages
    });

  } catch (err) {
    res.status(500).send("가져오기 실패");
  }
});

app.listen(3000, () => {
  console.log("Server running on port", PORT);
});
